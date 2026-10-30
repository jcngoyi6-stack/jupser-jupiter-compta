import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { convert, pickRate, revalue, type FxRate } from '@jupiter/fx';
import { decimalsOf } from '@jupiter/ledger';
import { corporateTax, monthlyDeadlines, RuleSet, RuleTrace, vatReturn, vatSettlementLines, type TaxRule } from '@jupiter/tax-engine';
import { bccProvider, fetchWithFallback, FixedPegProvider, HttpJsonFxProvider, type FxRateProvider } from '@jupiter/connectors';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { ACCOUNTING_WRITE, CurrentUser, JupserStaff, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError, parse, zAmount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { ReportsService } from '../reports/reports.service';

export async function loadRules(db: PrismaService | Tx): Promise<RuleSet> {
  const client = 'client' in db ? db.client : db;
  const rows = await client.taxRule.findMany();
  return new RuleSet(rows.map((r) => ({ ...r, value: r.value as unknown, status: r.status }) as TaxRule));
}

@ApiTags('Fiscalité et devises')
@Controller()
export class TaxController {
  constructor(
    private readonly db: PrismaService,
    private readonly entries: EntriesService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get('tax-rules')
  rules(@Query('country') country = 'CD') {
    return this.db.client.taxRule.findMany({ where: { country }, orderBy: [{ tax: 'asc' }, { param: 'asc' }, { effectiveFrom: 'desc' }] });
  }

  /** Validation d'une règle par un fiscaliste désigné par JUPSER (console). */
  @JupserStaff()
  @Post('tax-rules/:id/validate')
  @HttpCode(200)
  async validateRule(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.client.taxRule.update({ where: { id }, data: { status: 'VALIDE', validatedBy: u.email, validatedAt: new Date() } });
  }

  @JupserStaff()
  @Post('tax-rules')
  async createRule(@Body() body: unknown) {
    const b = parse(
      z.object({ country: z.string().length(2), tax: z.string(), param: z.string(), value: z.unknown(), effectiveFrom: zDate, effectiveTo: zDate.optional(), legalRef: z.string().min(3) }),
      body,
    );
    return this.db.client.taxRule.create({ data: { ...b, value: b.value as never, status: 'A_VALIDER' } });
  }

  @RequiresModule('FISCALITE')
  @Get('companies/:companyId/tax/vat-return')
  vat(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const r = await this.vatData(tx, companyId, from, to);
      return { ...r, banner: r.trace.banner, rules: r.trace.used };
    });
  }

  private async vatData(tx: Tx, companyId: string, from: string, to: string) {
    parse(zDate, from);
    parse(zDate, to);
    const lines = await tx.entryLine.findMany({
      where: { entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] }, date: { gte: from, lte: to }, origin: { not: 'TVA' } }, account: { startsWith: '44' } },
    });
    const byAccount = (prefix: string, sign: 1n | -1n) => {
      const m: Record<string, bigint> = {};
      for (const l of lines.filter((x) => x.account.startsWith(prefix))) m[l.account] = (m[l.account] ?? 0n) + sign * (l.credit - l.debit);
      return m;
    };
    const collectedByAccount = byAccount('443', 1n);
    const deductibleByAccount = byAccount('445', -1n);
    const collected = Object.values(collectedByAccount).reduce((s, v) => s + v, 0n);
    const deductible = Object.values(deductibleByAccount).reduce((s, v) => s + v, 0n);
    const creditLines = await tx.entryLine.findMany({ where: { account: '444900', entry: { companyId, status: 'VALIDE', date: { lt: from } } } });
    const previousCredit = creditLines.reduce((s, l) => s + l.debit - l.credit, 0n);
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const trace = new RuleTrace();
    const rules = await loadRules(tx);
    trace.use(rules.find(company.country, 'TVA', 'taux_normal', to));
    return { from, to, ...vatReturn({ collected, deductible, previousCredit: previousCredit > 0n ? previousCredit : 0n, collectedByAccount, deductibleByAccount }), trace };
  }

  /** Écriture de liquidation de TVA proposée en brouillon (validation humaine). */
  @RequiresModule('FISCALITE')
  @Roles(...ACCOUNTING_WRITE, 'FISCALITE')
  @Post('companies/:companyId/tax/vat-settlement')
  vatSettlement(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ from: zDate, to: zDate }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const r = await this.vatData(tx, companyId, b.from, b.to);
      const lines = vatSettlementLines(r);
      if (lines.length < 2) throw domainError('TVA_NULLE', 'Aucune TVA à liquider sur la période.');
      return this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: b.to, pieceRef: `TVA-${b.to.slice(0, 7)}`, label: `Liquidation TVA ${b.to.slice(0, 7)}`, lines }, 'TVA');
    });
  }

  @RequiresModule('FISCALITE')
  @Get('companies/:companyId/tax/corporate')
  corporate(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId?: string, @Query('adjustments') adj = '0') {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const st = await this.reports.statements(tx, companyId, fyId);
      const dec = decimalsOf(st.company.currency);
      const v = st.current.incomeStatement.values;
      const preTax = v.XI! - v.RS!; // résultat avant impôt (RS est négatif)
      const taxable = preTax + parse(zAmount(dec), adj);
      const turnover = v.XB!;
      const r = corporateTax(await loadRules(tx), { country: (await tx.company.findUniqueOrThrow({ where: { id: companyId } })).country, date: st.fiscalYear.endDate, taxableProfit: taxable, turnover });
      return { preTaxResult: preTax, taxableProfit: taxable, turnover, ...r };
    });
  }

  @RequiresModule('FISCALITE')
  @Get('companies/:companyId/tax/calendar')
  calendar(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('year') year?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const c = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const y = Number(year ?? new Date().getUTCFullYear());
      const rules = await loadRules(tx);
      const trace = new RuleTrace();
      const day = trace.use(rules.find<number>(c.country, 'TVA', 'jour_echeance', `${y}-01-01`));
      return {
        banner: trace.banner,
        events: [
          ...monthlyDeadlines('TVA', y, day, 'Déclaration et paiement de la TVA'),
          ...monthlyDeadlines('IRPP_SALAIRES', y, day, 'Retenues IRPP sur rémunérations (IS-IRPP)'),
          ...monthlyDeadlines('CNSS', y, day, 'Cotisations CNSS'),
        ].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      };
    });
  }

  // ---------- Devises ----------
  @Get('fx-rates')
  rates(@CurrentUser() u: SessionUser, @Query('currency') currency?: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.fxRate.findMany({ where: currency ? { currency } : {}, orderBy: { date: 'desc' }, take: 200 }));
  }

  /** Saisie d'un cours (source et type tracés) ; les fournisseurs automatiques (BCC…) passeront par FxRateProvider. */
  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Post('fx-rates')
  addRate(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(
      z.object({ currency: z.string().length(3), quote: z.string().length(3), rate: z.string().regex(/^\d+([.,]\d+)?$/), date: zDate, source: z.string().min(2), type: z.enum(['OFFICIEL', 'MARCHE', 'MANUEL']) }),
      body,
    );
    return this.db.forTenant(u.tenantId, async (tx) => {
      const r = await tx.fxRate.create({ data: { ...b, rate: b.rate.replace(',', '.'), tenantId: u.tenantId } });
      await this.audit.log(tx, u.tenantId, u.userId, 'COURS_SAISI', `fx:${b.currency}/${b.quote}`, b);
      return r;
    });
  }

  /** Récupération automatique des cours : parités fixes, BCC (RDC), source de secours ; échecs signalés. */
  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Post('fx-rates/fetch')
  @HttpCode(200)
  async fetchRates(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ quote: z.string().length(3), date: zDate }), body);
    const providers: FxRateProvider[] = [new FixedPegProvider()];
    if (process.env.FX_BCC_URL) providers.push(bccProvider(process.env.FX_BCC_URL));
    if (process.env.FX_FALLBACK_URL) {
      const url = process.env.FX_FALLBACK_URL;
      providers.push(new HttpJsonFxProvider('SECOURS', { url: (q, d) => `${url}${url.includes('?') ? '&' : '?'}base=${q}&date=${d}`, extract: (j) => j?.rates ?? {}, source: 'Fournisseur commercial (secours)', quotes: ['CDF', 'XOF', 'XAF', 'GNF', 'KMF'], type: 'MARCHE' }));
    }
    const { rates, errors } = await fetchWithFallback(providers, b.quote, b.date);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const saved = [];
      for (const r of rates) {
        const exists = await tx.fxRate.findFirst({ where: { currency: r.currency, quote: r.quote, date: r.date, source: r.source } });
        if (!exists) saved.push(await tx.fxRate.create({ data: { ...r, tenantId: u.tenantId } }));
      }
      await this.audit.log(tx, u.tenantId, u.userId, 'COURS_RECUPERES', `fx:${b.quote}`, { count: saved.length, errors });
      return { saved, errors, manualNeeded: rates.length === 0 };
    });
  }

  @Post('fx-rates/convert')
  @HttpCode(200)
  convertAmount(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ currency: z.string().length(3), quote: z.string().length(3), amount: z.string(), date: zDate }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const rates = (await tx.fxRate.findMany({ where: { currency: b.currency, quote: b.quote } })) as unknown as FxRate[];
      const r = pickRate(rates, b.currency, b.quote, b.date);
      if (!r) throw domainError('COURS_ABSENT', `Aucun cours ${b.currency}/${b.quote} au ${b.date}.`);
      const from = decimalsOf(b.currency);
      const to = decimalsOf(b.quote);
      return { rate: r, result: convert(parse(zAmount(from), b.amount), r.rate, from, to) };
    });
  }

  /** Réévaluation de clôture des créances et dettes en devises : brouillons à valider (478/479, provision). */
  @Roles(...ACCOUNTING_WRITE)
  @Post('companies/:companyId/fx/revaluation')
  revaluation(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ date: zDate }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const lines = await tx.entryLine.findMany({
        where: { currency: { not: null }, letter: null, account: { startsWith: '4' }, entry: { companyId, status: 'VALIDE', date: { lte: b.date } } },
      });
      const groups = new Map<string, { account: string; tp: string | null; currency: string; foreign: bigint; local: bigint }>();
      for (const l of lines) {
        const k = `${l.account}|${l.thirdPartyId}|${l.currency}`;
        const g = groups.get(k) ?? { account: l.account, tp: l.thirdPartyId, currency: l.currency!, foreign: 0n, local: 0n };
        const sign = l.debit > 0n ? 1n : -1n;
        g.foreign += sign * (l.foreignAmount ?? 0n);
        g.local += l.debit - l.credit;
        groups.set(k, g);
      }
      const rates = (await tx.fxRate.findMany()) as unknown as FxRate[];
      const created = [];
      for (const g of groups.values()) {
        if (g.foreign === 0n) continue;
        const r = pickRate(rates, g.currency, company.currency, b.date);
        if (!r) throw domainError('COURS_ABSENT', `Cours de clôture ${g.currency}/${company.currency} manquant.`);
        const kind = g.local > 0n ? 'CREANCE' : 'DETTE';
        const abs = (x: bigint) => (x < 0n ? -x : x);
        const res = revalue(
          { account: g.account, thirdPartyId: g.tp, kind, currency: g.currency, foreignOutstanding: abs(g.foreign), bookedLocal: abs(g.local), currencyDecimals: decimalsOf(g.currency) },
          r.rate,
          decimalsOf(company.currency),
        );
        if (res.lines.length === 0) continue;
        const all = [...res.lines, ...res.provisionLines];
        created.push(
          await this.entries.createDraft(
            tx,
            u,
            companyId,
            { journalCode: 'OD', date: b.date, pieceRef: `REEVAL-${b.date}`, label: `Écart de conversion ${g.currency} ${g.account} (cours ${r.rate}, ${r.source})`, lines: all },
            'FX',
          ),
        );
      }
      return { drafts: created };
    });
  }

  /** Balance âgée clients / fournisseurs (relances, provisions pour créances douteuses). */
  @Get('companies/:companyId/aged-balance')
  aged(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('account') account = '411', @Query('asOf') asOf?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const { agedBalance } = await import('@jupiter/ledger');
      const lines = await tx.entryLine.findMany({
        where: { account: { startsWith: account }, letter: null, entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] } } },
        include: { entry: { select: { date: true, pieceRef: true } } },
      });
      const day = asOf ?? new Date().toISOString().slice(0, 10);
      const m = agedBalance(lines.map((l) => ({ id: l.id, thirdPartyId: l.thirdPartyId, account: l.account, date: l.entry.date, reference: l.entry.pieceRef, debit: l.debit, credit: l.credit })), day);
      const tps = await tx.thirdParty.findMany({ where: { companyId, id: { in: [...m.keys()].filter(Boolean) } } });
      return [...m.entries()].map(([id, buckets]) => ({ thirdParty: tps.find((t) => t.id === id) ?? null, buckets, total: buckets.reduce((s, x) => s + x, 0n) }));
    });
  }
}

