import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  accrualLines, appropriationLines, provisionLines, reversalLines,
  budgetReport, componentSchedule, decimalsOf, derogatoryLines, disposalLines, impairmentLines, mirrorAccounts, dotationLines, monthlyForecast, netByAccount, parseBalance, parseBankStatement,
  parseJournal, proposeMatches, reconciliationStatement, suggestMapping, weeklyForecast, addDays,
  type AssetDef, type CashItem,
} from '@jupiter/ledger';
import {
  buildBalanceSheet, buildIncomeStatement, buildSmtStatements, consolidate, detailNote, isTreasury, movementNote, NOTE_NUMBERS, textNoteTemplates,
  type Entity,
} from '@jupiter/statements';
import type { Response } from 'express';
import { z } from 'zod';
import { ACCOUNTING_WRITE, CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { readData } from '../common/data';
import { domainError, parse, zAccount, zAmount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { buildWorkbook, readRows } from '../common/spreadsheet';
import { adHocControl, combinedAccounts, groupPercentages, INTERCOMPANY_ACCOUNT_PREFIXES, intercompanyEliminations, toJson, type CombinedEntity, type IntercompanyInvoiceLine } from '@jupiter/special-ops';
import { RuleSet, RuleTrace, type TaxRule } from '@jupiter/tax-engine';
import { ReportsService } from '../reports/reports.service';
import { ClosingService } from './closing.service';
import { EntriesService } from './entries.service';

const zFile = z.object({ content: z.string().max(20_000_000).optional(), base64: z.string().max(28_000_000).optional(), fileName: z.string().optional() });

async function dec(tx: Tx, companyId: string) {
  return decimalsOf((await tx.company.findUniqueOrThrow({ where: { id: companyId } })).currency);
}

@ApiTags('Comptabilité — compléments')
@RequiresModule('COMPTABILITE')
@Controller('companies/:companyId')
export class ComplementsController {
  constructor(
    private readonly db: PrismaService,
    private readonly entries: EntriesService,
    private readonly closing: ClosingService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  // ================= Immobilisations =================
  private async chart(tx: Tx, companyId: string) {
    return new Set((await tx.account.findMany({ where: { companyId }, select: { number: true } })).map((x) => x.number));
  }

  private assetDef(a: { account: string; inServiceDate: string; components: unknown }, chart?: ReadonlySet<string>): AssetDef {
    const comps = (a.components as { label: string; cost: string; residualValue?: string; method: string; years: number; degressiveCoefficient?: string; totalUnits?: number; unitsByYear?: Record<string, number>; fiscal?: AssetDef['components'][number]['fiscal']; valueTests?: { year: number; actualValue: string }[] }[]).map((c) => ({
      ...c,
      valueTests: c.valueTests?.map((t) => ({ year: t.year, actualValue: BigInt(t.actualValue) })),
      cost: BigInt(c.cost),
      residualValue: c.residualValue ? BigInt(c.residualValue) : 0n,
      // Fiches antérieures : « DEGRESSIF » avec coefficient désignait le dégressif fiscal à coefficient.
      method: (c.method === 'DEGRESSIF' && c.degressiveCoefficient ? 'DEGRESSIF_COEFFICIENT' : c.method) as AssetDef['components'][number]['method'],
    }));
    // Comptes 28/29 : compte miroir de l'entité s'il existe dans son plan, sinon compte officiel.
    const m = mirrorAccounts(a.account);
    const pick = (cands: string[]) => (chart ? cands.find((c) => chart.has(c)) : undefined);
    return { account: a.account, inServiceDate: a.inServiceDate, components: comps, amortAccount: pick(m.amort), impairmentAccount: pick(m.impairment) };
  }

  @Get('assets')
  assets(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const rows = await tx.fixedAsset.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
      return rows.map((a) => {
        const def = this.assetDef(a);
        const schedule = def.components.map((c) => ({ label: c.label, rows: componentSchedule(c, def.inServiceDate) }));
        const cost = def.components.reduce((s, c) => s + c.cost, 0n);
        return { ...a, cost, schedule };
      });
    });
  }

  @Roles(...ACCOUNTING_WRITE)
  @Post('assets')
  createAsset(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(
        z.object({
          code: z.string().min(1),
          label: z.string().min(2),
          account: zAccount.refine((a) => /^2[1-4]/.test(a), 'Compte d’immobilisation (21 à 24) attendu'),
          acquisitionDate: zDate,
          inServiceDate: zDate,
          components: z.array(z.object({
            label: z.string().min(1),
            cost: zAmount(d),
            residualValue: zAmount(d).optional(),
            method: z.enum(['LINEAIRE', 'DEGRESSIF', 'DEGRESSIF_COEFFICIENT', 'UNITES_OEUVRE', 'NON_AMORTISSABLE']),
            years: z.number().int().min(0).max(100),
            degressiveCoefficient: z.string().optional(),
            totalUnits: z.number().positive().optional(),
            unitsByYear: z.record(z.number()).optional(),
            /** Plan fiscal différent (amortissements dérogatoires, application 18 du guide). */
            fiscal: z.object({ method: z.enum(['LINEAIRE', 'DEGRESSIF_COEFFICIENT']), years: z.number().int().min(1).max(100), degressiveCoefficient: z.string().optional() }).optional(),
          })).min(1),
        }),
        body,
      );
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const methods = company.methods as { depreciation?: string };
      // permanence des méthodes (docs/12) : un mode différent de la méthode déclarée doit être justifié
      const deviating = b.components.filter((c) => c.method !== 'NON_AMORTISSABLE' && c.method !== methods.depreciation);
      const a = await tx.fixedAsset.create({
        data: { tenantId: u.tenantId, companyId, code: b.code, label: b.label, account: b.account, acquisitionDate: b.acquisitionDate, inServiceDate: b.inServiceDate, components: JSON.parse(JSON.stringify(b.components, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'IMMOBILISATION_CREEE', `asset:${a.id}`, { deviating: deviating.map((c) => c.method) });
      return { ...a, warning: deviating.length ? `Méthode différente de la méthode déclarée (${methods.depreciation}) : à justifier en note annexe.` : null };
    });
  }

  /** Dotations de l'exercice : écriture d'inventaire proposée en brouillon (journal OD). */
  @Roles(...ACCOUNTING_WRITE)
  @Post('assets/depreciation')
  depreciation(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ year: z.number().int(), date: zDate }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const assets = (await tx.fixedAsset.findMany({ where: { companyId, status: 'EN_SERVICE' } })).filter((a) => !(a.bookedYears as Record<string, string>)[b.year]);
      const chart = await this.chart(tx, companyId);
      const defs = assets.map((a) => this.assetDef(a, chart));
      // Dotations (681/28) et amortissements dérogatoires (851/151 ou 151/861).
      const lines = [...dotationLines(defs, b.year), ...impairmentLines(defs, b.year), ...derogatoryLines(defs, b.year)];
      if (lines.length < 2) throw domainError('AUCUNE_DOTATION', 'Aucune dotation à comptabiliser pour cet exercice.');
      const draft = await this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: b.date, pieceRef: `AMORT-${b.year}`, label: `Dotations aux amortissements ${b.year}`, lines });
      for (const a of assets) {
        const def = this.assetDef(a);
        const amount = def.components.reduce((s, c) => s + (componentSchedule(c, def.inServiceDate).find((r) => r.year === b.year)?.dotation ?? 0n), 0n);
        await tx.fixedAsset.update({ where: { id: a.id }, data: { bookedYears: { ...(a.bookedYears as object), [b.year]: amount.toString() } } });
      }
      return draft;
    });
  }

  @Roles(...ACCOUNTING_WRITE)
  @Post('assets/:id/dispose')
  dispose(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({ date: zDate, price: zAmount(d), counterpart: zAccount.optional(), componentIndex: z.number().int().min(0).optional() }), body);
      const a = await tx.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
      if (a.status !== 'EN_SERVICE') throw domainError('DEJA_CEDEE', 'Immobilisation déjà cédée.');
      const def = this.assetDef(a, await this.chart(tx, companyId));
      const bookedYears = a.bookedYears as Record<string, string>;
      // Sortie d'un seul composant (renouvellement, application 33 du guide) : l'immobilisation reste en service.
      const partial = b.componentIndex !== undefined && def.components.length > 1;
      if (b.componentIndex !== undefined && !def.components[b.componentIndex]) throw domainError('COMPOSANT_INCONNU', 'Composant introuvable.');
      const booked = partial
        ? Object.keys(bookedYears).reduce((s, y) => s + (componentSchedule(def.components[b.componentIndex!]!, def.inServiceDate).find((r) => r.year === Number(y))?.dotation ?? 0n), 0n)
        : Object.values(bookedYears).reduce((s, v) => s + BigInt(v), 0n);
      const r = disposalLines(def, b.date, b.price, b.counterpart, booked, partial ? b.componentIndex : undefined);
      const label = partial ? `Sortie du composant « ${def.components[b.componentIndex!]!.label} » — ${a.label}` : `Cession ${a.label}`;
      const draft = await this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: b.date, pieceRef: `CESSION-${a.code}`, label, lines: r.lines });
      if (partial) {
        const components = (a.components as unknown[]).filter((_, i) => i !== b.componentIndex);
        await tx.fixedAsset.update({ where: { id }, data: { components: components as never } });
      } else {
        await tx.fixedAsset.update({ where: { id }, data: { status: 'CEDE', disposalDate: b.date, disposalPrice: b.price } });
      }
      await this.audit.log(tx, u.tenantId, u.userId, partial ? 'COMPOSANT_SORTI' : 'IMMOBILISATION_CEDEE', `asset:${id}`, { vnc: r.vnc, price: b.price, component: b.componentIndex });
      return { draft, vnc: r.vnc, gainOrLoss: r.gainOrLoss };
    });
  }

  /**
   * Test de dépréciation à la clôture (application 44 du guide) : valeur actuelle estimée d'un composant.
   * La dépréciation ou la reprise et la révision du plan sont reprises dans l'écriture des dotations.
   */
  @Roles(...ACCOUNTING_WRITE)
  @Post('assets/:id/value-test')
  valueTest(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({ year: z.number().int(), componentIndex: z.number().int().min(0).default(0), actualValue: zAmount(d) }), body);
      const a = await tx.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
      if ((a.bookedYears as Record<string, string>)[b.year]) throw domainError('EXERCICE_DEJA_DOTE', 'Les dotations de cet exercice sont déjà comptabilisées.');
      const comps = a.components as { method: string; valueTests?: { year: number; actualValue: string }[] }[];
      const comp = comps[b.componentIndex];
      if (!comp) throw domainError('COMPOSANT_INCONNU', 'Composant introuvable.');
      if (comp.method !== 'LINEAIRE') throw domainError('METHODE_NON_GEREE', 'Test de dépréciation disponible pour les composants amortis en linéaire.');
      comp.valueTests = [...(comp.valueTests ?? []).filter((t) => t.year !== b.year), { year: b.year, actualValue: b.actualValue.toString() }];
      await this.audit.log(tx, u.tenantId, u.userId, 'TEST_DEPRECIATION', `asset:${id}`, { year: b.year, actualValue: b.actualValue });
      await tx.fixedAsset.update({ where: { id }, data: { components: comps as never } });
      const def = this.assetDef({ ...a, components: comps });
      return { schedule: def.components.map((c) => ({ label: c.label, rows: componentSchedule(c, def.inServiceDate) })) };
    });
  }

  /** Ajout d'un composant (renouvellement ou dépense ultérieure immobilisée). */
  @Roles(...ACCOUNTING_WRITE)
  @Post('assets/:id/components')
  addComponent(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({
        label: z.string().min(1), cost: zAmount(d), method: z.enum(['LINEAIRE', 'DEGRESSIF', 'DEGRESSIF_COEFFICIENT', 'UNITES_OEUVRE', 'NON_AMORTISSABLE']),
        years: z.number().int().min(0).max(100), degressiveCoefficient: z.string().optional(),
      }), body);
      const a = await tx.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
      if (a.status !== 'EN_SERVICE') throw domainError('DEJA_CEDEE', 'Immobilisation cédée.');
      const components = [...(a.components as unknown[]), { ...b, cost: b.cost.toString() }];
      await this.audit.log(tx, u.tenantId, u.userId, 'COMPOSANT_AJOUTE', `asset:${id}`, { label: b.label });
      return tx.fixedAsset.update({ where: { id }, data: { components: components as never } });
    });
  }

  // ================= Régularisations, provisions, affectation (guide d'application) =================
  /**
   * Régularisations de fin d'exercice (applications 21 à 24) : écriture en brouillon à la clôture et,
   * si l'exercice suivant est ouvert, sa contre-passation au premier jour (contre-passation immédiate).
   */
  @Roles(...ACCOUNTING_WRITE)
  @Post('closing/accruals')
  accruals(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({
        date: zDate,
        items: z.array(z.object({
          kind: z.enum(['CHARGE_CONSTATEE_AVANCE', 'PRODUIT_CONSTATE_AVANCE', 'CHARGE_A_PAYER', 'PRODUIT_A_RECEVOIR']),
          account: zAccount, amount: zAmount(d), vat: zAmount(d).optional(), label: z.string().max(200).optional(), thirdPartyId: z.string().uuid().optional(),
          counterparty: z.enum(['FOURNISSEUR', 'FOURNISSEUR_INVESTISSEMENT', 'FOURNISSEUR_INTERETS', 'CLIENT', 'PERSONNEL', 'PERSONNEL_CONGES', 'ORGANISMES_SOCIAUX', 'ORGANISMES_SOCIAUX_CONGES', 'ETAT', 'ETAT_SUBVENTION', 'BANQUE_INTERETS']).optional(),
        })).min(1),
      }), body);
      let lines;
      try {
        lines = accrualLines(b.items);
      } catch (e) {
        throw domainError((e as Error).message, (e as Error).message === 'TIERS_INADAPTE' ? 'Contrepartie inadaptée à ce type de régularisation.' : 'Montant invalide.');
      }
      const entry = await this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: b.date, pieceRef: `REGUL-${b.date}`, label: 'Régularisations de fin d’exercice', lines });
      const next = new Date(`${b.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const reverseOn = next.toISOString().slice(0, 10);
      const nextFy = await tx.fiscalYear.findFirst({ where: { companyId, startDate: { lte: reverseOn }, endDate: { gte: reverseOn }, closed: false } });
      const reversal = nextFy
        ? await this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: reverseOn, pieceRef: `EXT-REGUL-${b.date}`, label: 'Contre-passation des régularisations', lines: reversalLines(lines) })
        : null;
      await this.audit.log(tx, u.tenantId, u.userId, 'REGULARISATIONS', `company:${companyId}`, { items: b.items.length, reversal: !!reversal });
      return { entry, reversal, message: reversal ? null : `Exercice suivant non ouvert : la contre-passation au ${reverseOn} sera à générer à son ouverture.` };
    });
  }

  /** Provisions pour risques et charges (applications 71 à 75) : ajustement du compte 19x au montant requis. */
  @Roles(...ACCOUNTING_WRITE)
  @Post('closing/provisions')
  provisions(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({ date: zDate, items: z.array(z.object({ account: zAccount, nature: z.enum(['EXPLOITATION', 'FINANCIERE', 'HAO']).default('EXPLOITATION'), required: zAmount(d), label: z.string().optional() })).min(1) }), body);
      const lines = [];
      for (const it of b.items) {
        const agg = await tx.entryLine.aggregate({ where: { account: it.account, entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] }, date: { lte: b.date } } }, _sum: { debit: true, credit: true } });
        const booked = (agg._sum.credit ?? 0n) - (agg._sum.debit ?? 0n);
        try {
          lines.push(...provisionLines(it.nature, it.account, it.required, booked));
        } catch {
          throw domainError('COMPTE_PROVISION_19_ATTENDU', `${it.account} : compte de provision pour risques et charges (19x) attendu.`);
        }
      }
      if (!lines.length) return { entry: null, message: 'Provisions déjà au niveau requis.' };
      const entry = await this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: b.date, pieceRef: `PROV-${b.date}`, label: 'Provisions pour risques et charges', lines });
      return { entry };
    });
  }

  /** Affectation du résultat selon la décision de l'assemblée (application 65). */
  @Roles('CHEF_COMPTABLE', 'EXPERT_EXTERNE')
  @Post('closing/appropriation')
  appropriation(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({
        date: zDate, decision: z.string().min(3).max(200),
        legalReserve: zAmount(d).default('0'), statutoryReserve: zAmount(d).default('0'), optionalReserves: zAmount(d).default('0'),
        dividends: zAmount(d).default('0'), carryForward: z.union([z.string(), z.number()]).default('0'),
      }), body);
      const carry = parse(z.object({ v: z.union([z.string(), z.number()]).transform((v) => { const t = String(v).trim(); const neg = t.startsWith('-'); const a = parse(zAmount(d), neg ? t.slice(1) : t); return neg ? -a : a; }) }), { v: b.carryForward }).v;
      const sums = await tx.entryLine.groupBy({ by: ['account'], where: { account: { in: ['130100', '130900'] }, entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] }, date: { lte: b.date } } }, _sum: { debit: true, credit: true } });
      const bal = (a: string) => { const x = sums.find((y) => y.account === a); return (x?._sum.credit ?? 0n) - (x?._sum.debit ?? 0n); };
      const result = bal('130100') + bal('130900');
      if (result === 0n) throw domainError('AUCUN_RESULTAT_EN_INSTANCE', 'Aucun résultat en instance d’affectation (1301 / 1309).');
      let lines;
      try {
        lines = appropriationLines(result, { legalReserve: b.legalReserve, statutoryReserve: b.statutoryReserve, optionalReserves: b.optionalReserves, dividends: b.dividends, carryForward: carry });
      } catch {
        throw domainError('AFFECTATION_DESEQUILIBREE', `La répartition doit être égale au résultat en instance d’affectation (${result}).`);
      }
      const entry = await this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: b.date, pieceRef: `AGO-${b.date}`, label: `Affectation du résultat — ${b.decision}`, lines });
      await this.audit.log(tx, u.tenantId, u.userId, 'AFFECTATION_RESULTAT', `company:${companyId}`, { decision: b.decision });
      return { entry, result };
    });
  }

  // ================= Imports =================
  @Roles(...ACCOUNTING_WRITE)
  @Post('imports/balance/preview')
  @HttpCode(200)
  async previewBalance(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const f = parse(zFile, body);
    const rows = await readRows(f);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const r = parseBalance(rows, await dec(tx, companyId));
      const chart = await tx.account.findMany({ where: { companyId } });
      const memory = Object.fromEntries((await tx.accountMapping.findMany({ where: { companyId } })).map((m) => [m.source, m.target]));
      return { layout: r.cols.layout, errors: r.errors, lines: r.lines.map((l) => ({ ...l, suggestion: suggestMapping(l, chart, memory) })) };
    });
  }

  /** Reprise de la balance d'ouverture (société existante) : à-nouveaux générés, contrôlés et validés. */
  @Roles('CHEF_COMPTABLE', 'EXPERT_EXTERNE')
  @Post('imports/balance/commit')
  commitBalance(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({ date: zDate, lines: z.array(z.object({ source: z.string(), target: zAccount, debit: zAmount(d), credit: zAmount(d) })).min(2) }), body);
      const fy = await this.entries.fiscalYearFor(tx, companyId, b.date);
      if (b.date !== fy.startDate) throw domainError('DATE_OUVERTURE', `La balance d'ouverture se reprend au ${fy.startDate}.`);
      const an = await tx.journal.findUniqueOrThrow({ where: { companyId_code: { companyId, code: 'AN' } } });
      if (await tx.entry.count({ where: { companyId, fiscalYearId: fy.id, journalId: an.id } })) throw domainError('AN_EXISTANTS', 'Des à-nouveaux existent déjà pour cet exercice.');
      for (const l of b.lines) {
        await tx.accountMapping.upsert({ where: { companyId_source: { companyId, source: l.source } }, create: { tenantId: u.tenantId, companyId, source: l.source, target: l.target }, update: { target: l.target } });
      }
      // comptes collectifs : un tiers « reprise de solde » par compte, à détailler ensuite
      const tps = new Map<string, string>();
      const lines = [];
      for (const l of b.lines.filter((x) => /^[1-5]/.test(x.target) && x.debit !== x.credit)) {
        let thirdPartyId: string | null = null;
        if (/^4[012]/.test(l.target)) {
          if (!tps.has(l.target)) {
            const tp = await tx.thirdParty.upsert({
              where: { companyId_code: { companyId, code: `REPRISE-${l.target}` } },
              create: { tenantId: u.tenantId, companyId, type: l.target.startsWith('41') ? 'CLIENT' : l.target.startsWith('40') ? 'FOURNISSEUR' : 'SALARIE', code: `REPRISE-${l.target}`, name: `Reprise de solde ${l.target}`, account: l.target },
              update: {},
            });
            tps.set(l.target, tp.id);
          }
          thirdPartyId = tps.get(l.target)!;
        }
        const net = l.debit - l.credit;
        lines.push({ account: l.target, thirdPartyId, debit: net > 0n ? net : 0n, credit: net < 0n ? -net : 0n });
      }
      const ignored = b.lines.filter((x) => /^[6-8]/.test(x.target));
      const draft = await this.entries.createDraft(tx, u, companyId, { journalCode: 'AN', date: b.date, pieceRef: `REPRISE-${fy.label}`, label: `Reprise de la balance d'ouverture ${fy.label}`, lines }, 'AN');
      const v = await this.entries.validate(tx, u, companyId, draft.id, { systemGenerated: true });
      return { entry: v.entry, ignoredManagementAccounts: ignored.map((x) => x.source) };
    });
  }

  @Roles(...ACCOUNTING_WRITE)
  @Post('imports/journal')
  importJournal(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const f = parse(zFile, body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const groups = parseJournal(await readRows(f), await dec(tx, companyId));
      const created = [];
      for (const g of groups) {
        const first = g[0]!;
        // les écritures importées sont des brouillons : mêmes contrôles qu'en saisie lors de la validation
        created.push(
          await this.entries.createDraft(tx, u, companyId, { journalCode: first.journal, date: first.date, pieceRef: first.piece, label: first.label || `Import ${first.piece}`, lines: g.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, label: l.label })) }, 'IMPORT'),
        );
      }
      return { drafts: created.length };
    });
  }

  @Roles('CHEF_COMPTABLE', 'EXPERT_EXTERNE')
  @Post('imports/chart')
  importChart(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const f = parse(zFile, body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const rows = await readRows(f);
      const chart = await tx.account.findMany({ where: { companyId } });
      return rows.slice(1).filter((r) => r[0]).map((r) => suggestMapping({ account: r[0]!, label: r[1] ?? '' }, chart));
    });
  }

  // ================= Banque : relevés et rapprochement =================
  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Post('bank/:account/statement')
  importStatement(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('account') account: string, @Body() body: unknown) {
    const f = parse(zFile, body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const lines = parseBankStatement(await readRows(f), await dec(tx, companyId));
      await tx.bankStatementLine.createMany({ data: lines.map((l) => ({ tenantId: u.tenantId, companyId, account, date: l.date, label: l.label, amount: l.amount, reference: l.reference ?? null })) });
      await this.audit.log(tx, u.tenantId, u.userId, 'RELEVE_IMPORTE', `bank:${account}`, { lines: lines.length });
      return { imported: lines.length };
    });
  }

  @Get('bank/:account/reconciliation')
  reconciliation(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('account') account: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const st = await tx.bankStatementLine.findMany({ where: { companyId, account }, orderBy: { date: 'asc' } });
      const bookLines = await tx.entryLine.findMany({ where: { account, entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] } } }, include: { entry: { select: { date: true, pieceRef: true, label: true } } } });
      const matchedIds = new Set(st.map((s) => s.matchedLineId).filter(Boolean));
      const openSt = st.filter((s) => !s.matchedLineId);
      const openBook = bookLines.filter((l) => !matchedIds.has(l.id)).map((l) => ({ id: l.id, date: l.entry.date, label: l.label ?? l.entry.label, pieceRef: l.entry.pieceRef, amount: l.debit - l.credit }));
      const proposals = proposeMatches(openSt.map((s) => ({ date: s.date, label: s.label, amount: s.amount, reference: s.reference ?? undefined })), openBook).map((m) => ({ ...m, statementLineId: openSt[m.statementIndex]!.id }));
      const bookBalance = bookLines.reduce((s, l) => s + l.debit - l.credit, 0n);
      const statementBalance = st.reduce((s, l) => s + l.amount, 0n);
      return {
        statement: st,
        openBook,
        proposals,
        state: reconciliationStatement(bookBalance, statementBalance, openBook, openSt.map((s) => ({ date: s.date, label: s.label, amount: s.amount }))),
      };
    });
  }

  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Post('bank/match')
  @HttpCode(200)
  match(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ pairs: z.array(z.object({ statementLineId: z.string().uuid(), entryLineId: z.string().uuid() })).min(1) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      for (const p of b.pairs) {
        const s = await tx.bankStatementLine.findFirstOrThrow({ where: { id: p.statementLineId, companyId } });
        const l = await tx.entryLine.findFirstOrThrow({ where: { id: p.entryLineId, account: s.account, entry: { companyId } } });
        if (l.debit - l.credit !== s.amount) throw domainError('MONTANTS_DIFFERENTS', 'Montants différents : rapprochement refusé.');
        await tx.bankStatementLine.update({ where: { id: s.id }, data: { matchedLineId: l.id } });
      }
      await this.audit.log(tx, u.tenantId, u.userId, 'RAPPROCHEMENT', `bank`, { pairs: b.pairs.length });
      return { matched: b.pairs.length };
    });
  }

  /** Écritures de régularisation (frais bancaires, agios, virements non comptabilisés) en brouillon. */
  @Roles(...ACCOUNTING_WRITE)
  @Post('bank/:account/regularize')
  regularize(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('account') account: string, @Body() body: unknown) {
    const b = parse(z.object({ statementLineIds: z.array(z.string().uuid()).min(1), counterpartAccount: zAccount, journalCode: z.string().default('BQ1') }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const out = [];
      for (const id of b.statementLineIds) {
        const s = await tx.bankStatementLine.findFirstOrThrow({ where: { id, companyId, account } });
        const abs = s.amount < 0n ? -s.amount : s.amount;
        out.push(
          await this.entries.createDraft(tx, u, companyId, {
            journalCode: b.journalCode,
            date: s.date,
            pieceRef: s.reference ?? `RELEVE-${s.date}`,
            label: s.label,
            lines: s.amount < 0n
              ? [{ account: b.counterpartAccount, debit: abs, credit: 0n }, { account, debit: 0n, credit: abs }]
              : [{ account, debit: abs, credit: 0n }, { account: b.counterpartAccount, debit: 0n, credit: abs }],
          }),
        );
      }
      return { drafts: out };
    });
  }

  // ================= Budget =================
  @Get('budget')
  budget(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId?: string, @Query('version') version = 'INITIAL') {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const fy = await this.reports.fiscalYear(tx, companyId, fyId);
      const lines = await tx.budgetLine.findMany({ where: { companyId, fiscalYearId: fy.id, version } });
      const actual = await tx.entryLine.findMany({ where: { entry: { companyId, fiscalYearId: fy.id, status: { in: ['VALIDE', 'CONTREPASSE'] } }, account: { startsWith: '' } }, select: { account: true, analytic: true, debit: true, credit: true } });
      const report = budgetReport(
        lines.map((l) => ({ prefix: l.prefix, analytic: l.analytic || null, amount: l.amount })),
        actual.filter((a) => /^[267]/.test(a.account)).map((a) => ({ account: a.account, analytic: a.analytic, net: a.debit - a.credit })),
        await this.commitments(tx, companyId),
      );
      return { fiscalYear: fy, version, report: report.map((r, i) => ({ ...r, id: lines[i]!.id, label: lines[i]!.label })) };
    });
  }

  /** Engagements : bons de commande fournisseurs validés non encore facturés. */
  private async commitments(tx: Tx, companyId: string) {
    const pos = await tx.purchaseOrder.findMany({ where: { companyId, status: 'VALIDE' } }).catch(() => []);
    return pos.map((p) => ({ prefix: p.expenseAccount, analytic: p.analytic, amount: p.totalNet }));
  }

  @Roles('CHEF_COMPTABLE', 'DIRECTION')
  @Put('budget')
  setBudget(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({ fiscalYearId: z.string().uuid(), version: z.enum(['INITIAL', 'REVISE']).default('INITIAL'), mode: z.enum(['ALERTE', 'BLOQUANT']).optional(), lines: z.array(z.object({ prefix: z.string().regex(/^\d{2,6}$/), analytic: z.string().default(''), label: z.string().default(''), amount: zAmount(d) })) }), body);
      await tx.budgetLine.deleteMany({ where: { companyId, fiscalYearId: b.fiscalYearId, version: b.version } });
      await tx.budgetLine.createMany({ data: b.lines.map((l) => ({ ...l, tenantId: u.tenantId, companyId, fiscalYearId: b.fiscalYearId, version: b.version })) });
      if (b.mode) await tx.company.update({ where: { id: companyId }, data: { budgetMode: b.mode } });
      await this.audit.log(tx, u.tenantId, u.userId, 'BUDGET_ENREGISTRE', `company:${companyId}`, { version: b.version, lines: b.lines.length });
      return { saved: b.lines.length };
    });
  }

  // ================= Prévision de trésorerie =================
  @Get('treasury/forecast')
  forecast(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('start') start?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const from = start ?? new Date().toISOString().slice(0, 10);
      const all = await tx.entryLine.findMany({ where: { entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] } } }, include: { entry: { select: { date: true, pieceRef: true } } } });
      const opening = all.filter((l) => isTreasury(l.account)).reduce((s, l) => s + l.debit - l.credit, 0n);
      const tps = new Map((await tx.thirdParty.findMany({ where: { companyId } })).map((t) => [t.id, t]));
      const items: CashItem[] = [];
      for (const l of all.filter((x) => !x.letter && /^(40|41)/.test(x.account))) {
        const terms = tps.get(l.thirdPartyId ?? '')?.paymentTermsDays ?? 30;
        // créance (débit) = encaissement attendu ; dette (crédit) = décaissement
        items.push({ date: addDays(l.entry.date, terms), amount: l.debit - l.credit, category: l.account.startsWith('41') ? 'CLIENTS' : 'FOURNISSEURS', label: `${tps.get(l.thirdPartyId ?? '')?.name ?? ''} ${l.entry.pieceRef}` });
      }
      for (const l of all.filter((x) => /^(42|43|44)/.test(x.account))) {
        items.push({ date: addDays(l.entry.date.slice(0, 8) + '15', 30), amount: l.debit - l.credit, category: l.account.startsWith('42') ? 'PAIE' : 'FISCAL_SOCIAL', label: l.account });
      }
      const manual = await tx.cashForecastItem.findMany({ where: { companyId } });
      items.push(...manual.map((m) => ({ date: m.date, amount: m.amount, category: m.category, label: m.label })));
      return { opening, weeks: weeklyForecast(opening, items, from, 13), months: monthlyForecast(opening, items, from.slice(0, 7), 12), manual };
    });
  }

  @Roles(...ACCOUNTING_WRITE, 'DIRECTION', 'CAISSIER')
  @Post('treasury/forecast/items')
  addForecastItem(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(z.object({ date: zDate, amount: zAmount(await dec(tx, companyId)), category: z.string().default('AUTRE'), label: z.string().min(2) }), body);
      return tx.cashForecastItem.create({ data: { ...b, tenantId: u.tenantId, companyId } });
    });
  }

  // ================= Notes annexes, SMT, livre d'inventaire, DSF =================
  private async balancesFor(tx: Tx, companyId: string, fyId: string) {
    const lines = (await this.closing.postedLines(tx, companyId, fyId)).filter((l) => l.origin !== 'CLOTURE');
    return { lines, balances: [...netByAccount(lines).entries()].map(([account, net]) => ({ account, net })) };
  }

  @RequiresModule('ETATS_FINANCIERS')
  @Get('reports/notes')
  notes(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const fy = await this.reports.fiscalYear(tx, companyId, fyId);
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const prev = await tx.fiscalYear.findFirst({ where: { companyId, endDate: { lt: fy.startDate } }, orderBy: { endDate: 'desc' } });
      const cur = await this.balancesFor(tx, companyId, fy.id);
      const prv = prev ? await this.balancesFor(tx, companyId, prev.id) : { balances: [], lines: [] };
      const labels = Object.fromEntries((await tx.account.findMany({ where: { companyId }, select: { number: true, label: true } })).map((a) => [a.number, a.label]));
      const mv = cur.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, journalType: l.journalType }));
      const tables = [...NOTE_NUMBERS.movements.map((n) => movementNote(mv, n)), ...NOTE_NUMBERS.details.map((n) => detailNote(n, cur.balances, prv.balances, labels))];
      const saved = await tx.noteText.findMany({ where: { companyId, fiscalYearId: fy.id } });
      const methods = company.methods as { depreciation: string; stocks: string };
      const texts = textNoteTemplates({ companyName: company.name, system: company.system, depreciation: methods.depreciation, stockMethod: methods.stocks, currency: company.currency, fiscalYear: fy.label }).map((t) => {
        const s = saved.find((x) => x.number === t.number);
        return s ? { number: s.number, title: s.title, text: s.text, status: s.status, validatedAt: s.validatedAt } : { ...t, status: 'PROPOSITION' };
      });
      return { fiscalYear: fy, tables, texts };
    });
  }

  @Roles('CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE')
  @Put('reports/notes/:number')
  saveNote(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('number') number: string, @Body() body: unknown) {
    const b = parse(z.object({ fiscalYearId: z.string().uuid(), title: z.string().min(2), text: z.string().min(2).max(20000), validate: z.boolean().default(false) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const existing = await tx.noteText.findUnique({ where: { fiscalYearId_number: { fiscalYearId: b.fiscalYearId, number } } });
      if (existing?.status === 'VALIDE') throw domainError('NOTE_FIGEE', 'Note validée : version figée.');
      const data = { title: b.title, text: b.text, status: b.validate ? 'VALIDE' : 'BROUILLON', validatedBy: b.validate ? u.userId : null, validatedAt: b.validate ? new Date() : null };
      const n = await tx.noteText.upsert({ where: { fiscalYearId_number: { fiscalYearId: b.fiscalYearId, number } }, create: { ...data, tenantId: u.tenantId, companyId, fiscalYearId: b.fiscalYearId, number }, update: data });
      await this.audit.log(tx, u.tenantId, u.userId, b.validate ? 'NOTE_VALIDEE' : 'NOTE_MODIFIEE', `note:${number}`);
      return n;
    });
  }

  @RequiresModule('ETATS_FINANCIERS')
  @Get('reports/smt')
  smt(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const fy = await this.reports.fiscalYear(tx, companyId, fyId);
      const { balances, lines } = await this.balancesFor(tx, companyId, fy.id);
      const opening = [...netByAccount(lines.filter((l) => l.journalType === 'AN')).entries()].map(([account, net]) => ({ account, net }));
      const byEntry = new Map<string, typeof lines>();
      for (const l of lines.filter((x) => x.journalType !== 'AN')) byEntry.set(l.entryNumber, [...(byEntry.get(l.entryNumber) ?? []), l]);
      const cash = [...byEntry.values()]
        .filter((ls) => ls.some((l) => isTreasury(l.account)))
        .map((ls) => ({ counterparts: ls.filter((l) => !isTreasury(l.account)).map((l) => ({ account: l.account, amount: l.credit - l.debit })) }));
      const treasury = lines.filter((l) => isTreasury(l.account) && l.journalType !== 'AN');
      return { fiscalYear: fy, ...buildSmtStatements(balances, cash, opening), treasuryJournal: treasury.sort((a, b) => a.date.localeCompare(b.date)) };
    });
  }

  /** Livre d'inventaire : bilan, compte de résultat, TFT, balance, registre des immobilisations. */
  @Get('reports/inventory-book')
  inventoryBook(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const st = await this.reports.statements(tx, companyId, fyId);
      const tb = await this.reports.trialBalance(tx, companyId, st.fiscalYear.id);
      const assets = await tx.fixedAsset.findMany({ where: { companyId } });
      const stock = await tx.stockItem.findMany({ where: { companyId } }).catch(() => []);
      return { ...st, trialBalance: tb, assets, stock };
    });
  }

  /** Tableau de passage du résultat comptable au résultat fiscal. */
  @Get('tax/adjustments')
  adjustments(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const fy = await this.reports.fiscalYear(tx, companyId, fyId);
      return tx.taxAdjustment.findMany({ where: { companyId, fiscalYearId: fy.id } });
    });
  }

  @Roles('CHEF_COMPTABLE', 'FISCALITE', 'EXPERT_EXTERNE')
  @Post('tax/adjustments')
  addAdjustment(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(z.object({ fiscalYearId: z.string().uuid(), kind: z.enum(['REINTEGRATION', 'DEDUCTION']), label: z.string().min(2), amount: zAmount(await dec(tx, companyId)) }), body);
      return tx.taxAdjustment.create({ data: { ...b, tenantId: u.tenantId, companyId } });
    });
  }

  /** DSF / liasse : socle SYSCOHADA (bilan, résultat, TFT, notes) + tableau de passage, en Excel. */
  @RequiresModule('ETATS_FINANCIERS')
  @Get('reports/dsf.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async dsf(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId: string | undefined, @Res({ passthrough: true }) res: Response) {
    const buf = await this.db.forTenant(u.tenantId, async (tx) => {
      const st = await this.reports.statements(tx, companyId, fyId);
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const country = (JSON.parse(readData('pays_ohada_referentiel.json')) as { pays: { code: string; nom: string }[] }).pays.find((p) => p.code === company.country);
      const adj = await tx.taxAdjustment.findMany({ where: { companyId, fiscalYearId: st.fiscalYear.id } });
      const xi = st.current.incomeStatement.values.XI!;
      const re = adj.filter((a) => a.kind === 'REINTEGRATION').reduce((s, a) => s + a.amount, 0n);
      const de = adj.filter((a) => a.kind === 'DEDUCTION').reduce((s, a) => s + a.amount, 0n);
      const prevIs = (ref: string) => st.previous?.incomeStatement.values[ref] ?? null;
      return buildWorkbook(
        [
          {
            name: 'Identification', title: `Déclaration statistique et fiscale — ${country?.nom ?? company.country} — exercice ${st.fiscalYear.label}`,
            columns: [{ header: 'Rubrique' }, { header: 'Valeur', width: 50 }],
            rows: [['Dénomination', company.name], ['Forme juridique', company.legalForm], ['RCCM', company.rccm], ['NIF', company.taxId], ['Identification nationale', company.nationalId], ['Adresse', company.address], ['Système comptable', company.system], ['Exercice', `${st.fiscalYear.startDate} au ${st.fiscalYear.endDate}`], ['Devise', company.currency], ['Annexes fiscales nationales', `TODO(fiscaliste) : gabarit officiel ${company.country}`]],
          },
          { name: 'Bilan actif', title: 'Bilan — actif', columns: [{ header: 'Réf', width: 6 }, { header: 'Libellé', width: 50 }, { header: 'Brut', money: true }, { header: 'Amort./Dépréc.', money: true }, { header: 'Net N', money: true }, { header: 'Net N-1', money: true }], rows: st.current.balanceSheet.assets.map((r) => [r.ref, r.label, r.gross, r.depreciation, r.net, st.previous?.balanceSheet.assets.find((p) => p.ref === r.ref)?.net ?? null]) },
          { name: 'Bilan passif', title: 'Bilan — passif', columns: [{ header: 'Réf', width: 6 }, { header: 'Libellé', width: 50 }, { header: 'Net N', money: true }, { header: 'Net N-1', money: true }], rows: st.current.balanceSheet.liabilities.map((r) => [r.ref, r.label, r.value, st.previous?.balanceSheet.liabilities.find((p) => p.ref === r.ref)?.value ?? null]) },
          { name: 'Compte de résultat', title: 'Compte de résultat', columns: [{ header: 'Réf', width: 6 }, { header: 'Libellé', width: 50 }, { header: 'N', money: true }, { header: 'N-1', money: true }], rows: st.current.incomeStatement.rows.map((r) => [r.ref, r.label, r.value, prevIs(r.ref)]) },
          { name: 'TFT', title: 'Tableau des flux de trésorerie', columns: [{ header: 'Réf', width: 6 }, { header: 'Libellé', width: 60 }, { header: 'N', money: true }], rows: st.current.cashFlow.rows.map((r) => [r.ref, r.label, r.value]) },
          {
            name: 'Résultat fiscal', title: 'Tableau de passage du résultat comptable au résultat fiscal',
            columns: [{ header: 'Libellé', width: 60 }, { header: 'Montant', money: true }],
            rows: [['Résultat net comptable (XI)', xi], ['Impôt sur le résultat comptabilisé (RS)', -st.current.incomeStatement.values.RS!], ...adj.map((a) => [`${a.kind === 'REINTEGRATION' ? '+' : '–'} ${a.label}`, a.kind === 'REINTEGRATION' ? a.amount : -a.amount] as [string, bigint]), ['Résultat fiscal', xi - st.current.incomeStatement.values.RS! + re - de]],
          },
          { name: 'Contrôles', columns: [{ header: 'Contrôle', width: 70 }, { header: 'Résultat' }], rows: st.controls.map((c) => [c.label, c.ok ? 'OK' : 'ÉCHEC']) },
        ],
        decimalsOf(company.currency),
        { company: `${company.name} — NIF ${company.taxId ?? '—'}` },
      );
    });
    res.setHeader('Content-Disposition', `attachment; filename="DSF.xlsx"`);
    return new StreamableFile(buf);
  }

  // ================= Analytique =================
  @Get('reports/analytic')
  analytic(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('fiscalYearId') fyId?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const fy = await this.reports.fiscalYear(tx, companyId, fyId);
      const lines = await tx.entryLine.findMany({ where: { analytic: { not: null }, entry: { companyId, fiscalYearId: fy.id, status: { in: ['VALIDE', 'CONTREPASSE'] } } }, select: { analytic: true, account: true, debit: true, credit: true } });
      const m = new Map<string, { charges: bigint; produits: bigint }>();
      for (const l of lines) {
        const g = m.get(l.analytic!) ?? { charges: 0n, produits: 0n };
        if (l.account.startsWith('6')) g.charges += l.debit - l.credit;
        if (l.account.startsWith('7')) g.produits += l.credit - l.debit;
        m.set(l.analytic!, g);
      }
      return [...m].map(([axis, v]) => ({ axis, ...v, resultat: v.produits - v.charges }));
    });
  }
}

/** Consolidation (édition Entreprise) — niveau locataire. */
@ApiTags('Consolidation')
@RequiresModule('CONSOLIDATION')
@Controller('consolidation')
export class ConsolidationController {
  constructor(
    private readonly db: PrismaService,
    private readonly closing: ClosingService,
    private readonly reports: ReportsService,
  ) {}

  @Get('groups')
  groups(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) => tx.consolidationGroup.findMany());
  }

  @Roles('CHEF_COMPTABLE', 'DIRECTION')
  @Post('groups')
  create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: z.string().min(2),
        currency: z.string().length(3),
        members: z.array(z.object({ companyId: z.string().uuid(), parent: z.boolean().default(false), method: z.enum(['IG', 'IP', 'MEE']), ownershipPct: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/), investmentCost: z.string().optional(), investmentAccount: zAccount.optional(), equityAtAcquisition: z.string().regex(/^\d+$/).optional(), closingRate: z.string().optional(), averageRate: z.string().optional() })).min(1),
      }),
      body,
    );
    return this.db.forTenant(u.tenantId, (tx) => tx.consolidationGroup.create({ data: { tenantId: u.tenantId, name: b.name, currency: b.currency, members: b.members } }));
  }

  @Get('groups/:id/statements')
  statements(@CurrentUser() u: SessionUser, @Param('id') id: string, @Query('year') year?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const g = await tx.consolidationGroup.findUniqueOrThrow({ where: { id } });
      const members = g.members as { companyId: string; parent: boolean; method: 'IG' | 'IP' | 'MEE'; ownershipPct: string; investmentCost?: string; investmentAccount?: string; equityAtAcquisition?: string; closingRate?: string; averageRate?: string }[];
      const entities: Entity[] = [];
      for (const m of members) {
        const c = await tx.company.findUniqueOrThrow({ where: { id: m.companyId } });
        const fy = year ? await tx.fiscalYear.findFirst({ where: { companyId: c.id, label: year } }) : await this.reports.fiscalYear(tx, c.id);
        if (!fy) throw domainError('EXERCICE_INCONNU', `Exercice ${year} absent pour ${c.name}.`);
        // Produits et charges intragroupe entre membres du groupe : éliminés (les deux côtés se compensent en résultat)
        const memberPrefixes = members.filter((x) => x.companyId !== c.id).map((x) => `IG-${x.companyId.slice(0, 8)}-`);
        const lines = (await this.closing.postedLines(tx, c.id, fy.id)).filter((l) => l.origin !== 'CLOTURE'
          && !(l.origin === 'INTRAGROUPE' && /^[67]/.test(l.account) && memberPrefixes.some((pr) => l.pieceRef?.startsWith(pr))));
        const [i, f = ''] = m.ownershipPct.split('.');
        entities.push({
          id: c.id, name: c.name, parent: m.parent, method: m.method,
          ownershipPpm: BigInt(i! + f.padEnd(4, '0')), // « 60 » → 600 000 ppm
          balances: [...netByAccount(lines).entries()].map(([account, net]) => ({ account, net })),
          closingRate: c.currency === g.currency ? undefined : m.closingRate,
          averageRate: c.currency === g.currency ? undefined : m.averageRate,
          investmentCost: m.investmentCost ? BigInt(m.investmentCost) : undefined,
          investmentAccount: m.investmentAccount,
          equityAtAcquisition: m.equityAtAcquisition ? BigInt(m.equityAtAcquisition) : undefined,
        });
      }
      const intercompany = await this.intercompanyAdjustments(tx, members, entities);
      const r = consolidate(entities, ['181', '185', '186', '187', '188', '463', ...INTERCOMPANY_ACCOUNT_PREFIXES]);
      const bs = buildBalanceSheet(r.balances);
      const is = buildIncomeStatement(r.balances);
      return { group: g, ...r, balanceSheet: bs, incomeStatement: is, groupResult: r.summary.groupResult, intercompany };
    });
  }

  /**
   * Factures intragroupe acceptées entre membres (écriture d'achat validée chez l'acheteur, exercice du vendeur) :
   * élimination du chiffre d'affaires du vendeur et de la marge interne restant en stock chez l'acheteur (ou
   * immobilisée), rattachées au vendeur ; impôt différé actif calculé au taux d'IS du pays de la mère.
   */
  private async intercompanyAdjustments(tx: Tx, members: { companyId: string; parent: boolean }[], entities: Entity[]) {
    const ids = members.map((m) => m.companyId);
    const parent = await tx.company.findUniqueOrThrow({ where: { id: (members.find((m) => m.parent) ?? members[0]!).companyId } });
    const rules = new RuleSet((await tx.taxRule.findMany()).map((x) => ({ ...x, value: x.value }) as TaxRule));
    const dayBefore = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
    const details = [];
    for (const e of entities) {
      const fy = await this.reports.fiscalYear(tx, e.id);
      if (!fy) continue;
      // Factures acceptées de l'exercice et des exercices antérieurs (stock d'ouverture, immobilisations)
      const invoices = await tx.intercompanyInvoice.findMany({ where: { sellerCompanyId: e.id, buyerCompanyId: { in: ids }, status: 'ACCEPTEE', date: { lte: fy.endDate } }, orderBy: { date: 'desc' } });
      type Row = IntercompanyInvoiceLine & { buyer: string; itemId?: string };
      const rows: Row[] = [];
      for (const inv of invoices) {
        const entry = inv.buyerEntryId ? await tx.entry.findUnique({ where: { id: inv.buyerEntryId } }) : null;
        if (!entry || entry.status !== 'VALIDE') continue; // achat non encore validé chez l'acheteur : rien à éliminer
        const decision = (inv.decision ?? {}) as { lines?: { account: string; itemId?: string; usefulLifeYears?: number }[] };
        for (const [i, l] of (inv.lines as unknown as { quantity: number; net: string; account: string; cost: string | null }[]).entries()) {
          const d = decision.lines?.[i];
          const item = d?.itemId ? await tx.stockItem.findUnique({ where: { id: d.itemId } }) : null;
          rows.push({
            buyer: inv.buyerCompanyId, itemId: d?.itemId, invoiceDate: inv.date, net: BigInt(l.net), quantity: l.quantity, cost: l.cost === null ? null : BigInt(l.cost),
            sellerAccount: l.account, buyerAccount: d?.account, buyerStockAccount: item?.stockAccount ?? null, usefulLifeYears: d?.usefulLifeYears,
          });
        }
      }
      // Stock de l'acheteur à l'ouverture et à la clôture, réparti sur les factures les plus récentes (sorties PEPS)
      const stockAt = async (buyer: string, itemId: string, date: string) =>
        Number((await tx.stockMove.findMany({ where: { companyId: buyer, itemId, date: { lte: date } } })).reduce((s, m) => s + m.qtyMilli, 0n)) / 1000;
      for (const [key, date] of [['remainingQuantity', fy.endDate], ['openingRemainingQuantity', dayBefore(fy.startDate)]] as const) {
        const groups = new Map<string, Row[]>();
        for (const r of rows.filter((x) => x.itemId && x.invoiceDate! <= date)) groups.set(`${r.buyer}:${r.itemId}`, [...(groups.get(`${r.buyer}:${r.itemId}`) ?? []), r]);
        for (const [k, list] of groups) {
          const [buyer, itemId] = k.split(':') as [string, string];
          let left = await stockAt(buyer, itemId, date);
          for (const r of list) { const q = Math.max(0, Math.min(r.quantity, left)); r[key] = q; left -= q; }
        }
      }
      if (!rows.length) continue;
      let taxRate = 0;
      try { taxRate = Number(new RuleTrace().use(rules.find<string>(parent.country, 'IS', 'taux', fy.endDate)) ?? 0); } catch { taxRate = 0; }
      const adj = intercompanyEliminations({ lines: rows, taxRate, period: { start: fy.startDate, end: fy.endDate } });
      for (const l of adj.entries[0]?.lines ?? []) e.balances.push({ account: l.account, net: l.debit - l.credit });
      details.push({ seller: e.name, ...(toJson(adj.values) as object), notes: adj.notes });
    }
    return details;
  }

  private members(g: { members: unknown }) {
    return g.members as { companyId: string; parent: boolean; method: 'IG' | 'IP' | 'MEE'; ownershipPct: string }[];
  }

  /**
   * Périmètre (applications 128 à 131) : pourcentages de contrôle et d'intérêt calculés depuis l'organigramme des
   * détentions (chaînes, participations circulaires), qualification des entités ad hoc, méthode proposée comparée à
   * celle paramétrée pour chaque membre.
   */
  @Post('groups/:id/perimeter')
  perimeter(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({
      holdings: z.array(z.object({ owner: z.string().min(1), owned: z.string().min(1), capital: z.number().min(0).max(1), votes: z.number().min(0).max(1).optional() })).min(1),
      jointControl: z.array(z.string()).optional(),
      adHoc: z.record(z.string(), z.object({ decisionPowers: z.boolean(), majorityBenefits: z.boolean(), majorityRisks: z.boolean(), receivablesVehicle: z.boolean().optional() })).optional(),
    }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const g = await tx.consolidationGroup.findUniqueOrThrow({ where: { id } });
      const members = this.members(g);
      const parent = members.find((m) => m.parent);
      if (!parent) throw domainError('MERE_ABSENTE', 'Désignez l’entité consolidante du groupe.');
      const pcts = groupPercentages({ parent: parent.companyId, holdings: b.holdings, jointControl: b.jointControl });
      const CODE = { INTEGRATION_GLOBALE: 'IG', INTEGRATION_PROPORTIONNELLE: 'IP', MISE_EN_EQUIVALENCE: 'MEE', NON_CONSOLIDEE: 'HORS' } as const;
      const names = new Map((await tx.company.findMany({ where: { id: { in: Object.keys(pcts) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
      return Object.entries(pcts).map(([entity, v]) => {
        const adHoc = b.adHoc?.[entity] ? adHocControl(b.adHoc[entity]!) : null;
        const proposed = adHoc?.controlled ? 'IG' : CODE[v.method];
        const configured = members.find((m) => m.companyId === entity);
        return {
          entity, name: names.get(entity) ?? entity, control: v.control, interest: v.interest, proposedMethod: proposed, adHoc: adHoc?.reason ?? null,
          configuredMethod: configured?.method ?? null, configuredPct: configured?.ownershipPct ?? null,
          divergence: configured ? configured.method !== proposed || Math.abs(Number(configured.ownershipPct) / 100 - v.interest) > 0.0001 : proposed !== 'HORS',
        };
      });
    });
  }

  /**
   * Comptes combinés (application 142) : agrégation des membres situés dans l'espace OHADA, partage entre ayants droit
   * (pourcentage détenu par l'entité combinante extérieure) et minoritaires, impôts différés de retraitement.
   */
  @Post('groups/:id/combined')
  combined(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ year: z.string().optional(), deferredTax: z.record(z.string(), z.string().regex(/^-?\d+$/)).optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const g = await tx.consolidationGroup.findUniqueOrThrow({ where: { id } });
      const entities: CombinedEntity[] = [];
      for (const m of this.members(g)) {
        const c = await tx.company.findUniqueOrThrow({ where: { id: m.companyId } });
        const fy = b.year ? await tx.fiscalYear.findFirst({ where: { companyId: c.id, label: b.year } }) : await this.reports.fiscalYear(tx, c.id);
        if (!fy) throw domainError('EXERCICE_INCONNU', `Exercice ${b.year} absent pour ${c.name}.`);
        const net = netByAccount((await this.closing.postedLines(tx, c.id, fy.id)).filter((l) => l.origin !== 'CLOTURE'));
        const sum = (pred: (a: string) => boolean, sign = 1n) => [...net.entries()].filter(([a]) => pred(a)).reduce((s, [, v]) => s + v * sign, 0n);
        const pos = (pred: (a: string) => boolean) => [...net.entries()].filter(([a, v]) => pred(a) && v > 0n).reduce((s, [, v]) => s + v, 0n);
        const neg = (pred: (a: string) => boolean) => [...net.entries()].filter(([a, v]) => pred(a) && v < 0n).reduce((s, [, v]) => s - v, 0n);
        const has = (...p: string[]) => (a: string) => p.some((x) => a.startsWith(x));
        const revenue = sum(has('70'), -1n);
        const otherIncome = sum(has('71', '72', '73', '75', '77', '78', '79', '82', '84', '86', '88'), -1n);
        const charges = sum(has('6', '81', '83', '85', '87'));
        const incomeTax = sum(has('89'));
        entities.push({
          code: c.name, interest: Number(m.ownershipPct) / 100,
          fixedAssets: sum(has('2')), otherAssets: pos(has('3', '4', '5')), liabilities: neg(has('16', '17', '18', '19', '4', '5')),
          capitalAndReserves: sum(has('10', '11', '12', '13', '14', '15'), -1n), result: revenue + otherIncome - charges - incomeTax,
          revenue, otherIncome, charges, incomeTax, deferredTax: b.deferredTax?.[c.id] ? BigInt(b.deferredTax[c.id]!) : 0n,
        });
      }
      return { group: g, entities: toJson(entities), ...(toJson(combinedAccounts({ entities })) as object) };
    });
  }
}

