import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AUDIT_PROGRAMMES, CYCLE_ACCOUNTS, MISSION_TYPES, adjustedNetAssets, analyticalReview, confirmationLetter, dcfValuation, documentRequest,
  earningsValue, engagementLetter, generateProceduresManual, goodwillValue, materiality, misstatementSummary, missionProfitability,
  monetaryUnitSample, multiplesValuation, representationLetter, restructuringScenario, reviewTransition, riskAssessment, staffUtilisation,
  unusualEntries, valuationSynthesis, emptyReview, workpaperRef, type Cycle, type GeneratedDoc, type ReviewState, type Sector,
} from '@jupiter/advisory';
import { abnormalBalances, decimalsOf, formatAmount, netByAccount, trialBalance } from '@jupiter/ledger';
import { buildBalanceSheet, buildIncomeStatement, financialAnalysis } from '@jupiter/statements';
import { z } from 'zod';
import { CurrentUser, RequiresModule, Roles, type Role, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError, parse, zAccount, zAmount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { buildWord, type WordSection } from '../common/word';
import { ReportsService } from '../reports/reports.service';

const CABINET_ROLES: Role[] = ['CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE', 'AUDITEUR', 'FISCALITE', 'DIRECTION'];
const CYCLES = Object.keys(CYCLE_ACCOUNTS) as Cycle[];
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface AuditFile {
  planning?: { benchmarks: { name: string; base: number; rate: number }[]; selected: string; performanceRatio: number; trivialRatio: number; result: ReturnType<typeof materiality> };
  risks?: ReturnType<typeof riskAssessment>;
  independence?: { answers: Record<string, boolean>; accepted: boolean; by: string; at: string };
  workpapers?: Record<string, { status: 'A_FAIRE' | 'EN_COURS' | 'TERMINE'; conclusion?: string; evidence?: string[]; preparedBy?: string; reviewedBy?: string }>;
  misstatements?: { ref: string; description: string; amount: number; adjusted: boolean }[];
}

const toDoc = (d: GeneratedDoc): WordSection[] => d.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs }));
const major = (v: bigint, d: number) => Number(v) / 10 ** d;

@ApiTags('Espace Cabinet')
@RequiresModule('CABINET')
@Roles(...CABINET_ROLES)
@Controller('cabinet')
export class CabinetController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly reports: ReportsService,
  ) {}

  private async mission(tx: Tx, id: string) {
    return tx.mission.findUniqueOrThrow({ where: { id } });
  }

  // ---------------------------------------------------------------- Portefeuille et missions
  @Get('portfolio')
  portfolio(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const [companies, missions, times] = await Promise.all([
        tx.company.findMany({ orderBy: { name: 'asc' } }),
        tx.mission.findMany({ orderBy: { deadline: 'asc' } }),
        tx.timeEntry.findMany(),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const prof = missionProfitability(missions, times);
      return companies.map((c) => {
        const ms = missions.filter((m) => m.companyId === c.id);
        return {
          company: { id: c.id, name: c.name, country: c.country, currency: c.currency },
          missions: ms.map((m) => {
            const p = prof.find((x) => x.missionId === m.id)!;
            const alerts: string[] = [];
            if (m.deadline && m.deadline < today && m.status !== 'TERMINEE') alerts.push('ECHEANCE_DEPASSEE');
            if (p.overBudget) alerts.push('BUDGET_HEURES_DEPASSE');
            return { ...m, stage: (m.review as unknown as ReviewState).stage ?? 'PREPARATION', minutes: p.minutes, budgetUsedPct: p.budgetUsedPct, alerts };
          }),
        };
      });
    });
  }

  @Get('missions')
  missions(@CurrentUser() u: SessionUser, @Query('companyId') companyId?: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.mission.findMany({ where: companyId ? { companyId } : {}, orderBy: { createdAt: 'desc' } }));
  }

  @Post('missions')
  createMission(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({
      companyId: z.string().uuid(), type: z.enum(MISSION_TYPES as [string, ...string[]]), title: z.string().min(3).max(200),
      responsibleId: z.string().uuid().optional(), budgetHours: z.number().min(0).max(100000).default(0),
      feeAmount: z.union([z.string(), z.number()]).default('0'), hourlyRate: z.union([z.string(), z.number()]).default('0'), deadline: zDate.optional(),
    }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const c = await tx.company.findUniqueOrThrow({ where: { id: b.companyId } });
      const d = decimalsOf(c.currency);
      const amt = (v: string | number) => parse(zAmount(d), v);
      const m = await tx.mission.create({ data: {
        tenantId: u.tenantId, companyId: b.companyId, type: b.type, title: b.title, responsibleId: b.responsibleId ?? u.userId,
        budgetMinutes: Math.round(b.budgetHours * 60), feeAmount: amt(b.feeAmount), hourlyRate: amt(b.hourlyRate), deadline: b.deadline,
        review: emptyReview() as never, audit: {},
      } });
      await this.audit.log(tx, u.tenantId, u.userId, 'MISSION_CREEE', `mission:${m.id}`, { type: b.type, title: b.title });
      return m;
    });
  }

  @Put('missions/:id')
  updateMission(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(['EN_COURS', 'SUSPENDUE', 'TERMINEE']).optional(), deadline: zDate.nullable().optional(), title: z.string().min(3).optional(), budgetHours: z.number().min(0).optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      if ((m.review as unknown as ReviewState).stage === 'VERROUILLE' && b.status !== 'TERMINEE') throw domainError('DOSSIER_VERROUILLE', 'Dossier signé et verrouillé.');
      return tx.mission.update({ where: { id }, data: { status: b.status, deadline: b.deadline, title: b.title, budgetMinutes: b.budgetHours === undefined ? undefined : Math.round(b.budgetHours * 60) } });
    });
  }

  /** Circuit préparateur → réviseur → associé (séparation des rôles contrôlée). */
  @Post('missions/:id/review')
  @HttpCode(200)
  review(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ action: z.enum(['SOUMETTRE', 'APPROUVER', 'RENVOYER', 'SIGNER']) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      let next: ReviewState;
      try {
        next = reviewTransition({ ...emptyReview(), ...(m.review as object) } as ReviewState, b.action, u.userId, new Date().toISOString());
      } catch (e) {
        throw domainError((e as Error).message, 'Transition refusée par le circuit de revue.');
      }
      await this.audit.log(tx, u.tenantId, u.userId, `REVUE_${b.action}`, `mission:${id}`, { stage: next.stage });
      return tx.mission.update({ where: { id }, data: { review: next as never, status: next.stage === 'VERROUILLE' ? 'TERMINEE' : m.status } });
    });
  }

  @Post('missions/:id/review/points')
  addPoint(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ text: z.string().min(3).max(2000) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      const r = { ...emptyReview(), ...(m.review as object) } as ReviewState;
      if (r.stage === 'VERROUILLE') throw domainError('DOSSIER_VERROUILLE', 'Dossier verrouillé.');
      r.points = [...r.points, { id: crypto.randomUUID(), text: b.text, by: u.userId, at: new Date().toISOString(), resolved: false }];
      return tx.mission.update({ where: { id }, data: { review: r as never } });
    });
  }

  @Post('missions/:id/review/points/:pointId/resolve')
  @HttpCode(200)
  resolvePoint(@CurrentUser() u: SessionUser, @Param('id') id: string, @Param('pointId') pointId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      const r = { ...emptyReview(), ...(m.review as object) } as ReviewState;
      r.points = r.points.map((p) => (p.id === pointId ? { ...p, resolved: true } : p));
      return tx.mission.update({ where: { id }, data: { review: r as never } });
    });
  }

  // ---------------------------------------------------------------- Temps et honoraires
  @Get('missions/:id/time')
  time(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.timeEntry.findMany({ where: { missionId: id }, orderBy: { date: 'desc' } }));
  }

  @Post('missions/:id/time')
  addTime(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ date: zDate, minutes: z.number().int().min(1).max(24 * 60), description: z.string().min(2).max(500), billable: z.boolean().default(true) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      await this.mission(tx, id);
      return tx.timeEntry.create({ data: { tenantId: u.tenantId, missionId: id, userId: u.userId, ...b } });
    });
  }

  @Get('profitability')
  profitability(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const [missions, times] = await Promise.all([tx.mission.findMany(), tx.timeEntry.findMany()]);
      const users = await this.db.client.user.findMany({ where: { memberships: { some: { tenantId: u.tenantId } } }, select: { id: true, fullName: true } });
      return {
        missions: missionProfitability(missions, times),
        staff: staffUtilisation(times).map((s) => ({ ...s, name: users.find((x) => x.id === s.userId)?.fullName ?? '' })),
      };
    });
  }

  /** Planning consolidé des échéances (missions et clôtures d'exercice) sur une fenêtre. */
  @Get('deadlines')
  deadlines(@CurrentUser() u: SessionUser, @Query('from') from: string, @Query('to') to: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const [missions, years, companies] = await Promise.all([tx.mission.findMany({ where: { deadline: { gte: from, lte: to } } }), tx.fiscalYear.findMany({ where: { endDate: { gte: from, lte: to } } }), tx.company.findMany()]);
      const name = (id: string) => companies.find((c) => c.id === id)?.name ?? '';
      return [
        ...missions.map((m) => ({ date: m.deadline!, company: name(m.companyId), kind: 'MISSION', label: m.title })),
        ...years.map((y) => ({ date: y.endDate, company: name(y.companyId), kind: 'CLOTURE', label: `Clôture ${y.label}` })),
      ].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  // ---------------------------------------------------------------- Balance importée → états financiers
  @Post('balance-statements')
  @HttpCode(200)
  balanceStatements(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const head = parse(z.object({ companyId: z.string().uuid() }).passthrough(), body);
      const c = await tx.company.findUniqueOrThrow({ where: { id: head.companyId } });
      const d = decimalsOf(c.currency);
      const zLine = z.object({ source: z.string().min(1), target: zAccount, debit: zAmount(d), credit: zAmount(d) });
      const b = parse(z.object({ companyId: z.string(), lines: z.array(zLine).min(2), prior: z.array(zLine).optional(), remember: z.boolean().default(true), thresholdPct: z.number().default(0.1) }), body);
      if (b.remember) {
        for (const l of b.lines) await tx.accountMapping.upsert({ where: { companyId_source: { companyId: c.id, source: l.source } }, create: { tenantId: u.tenantId, companyId: c.id, source: l.source, target: l.target }, update: { target: l.target } });
      }
      const build = (lines: z.infer<typeof zLine>[]) => {
        const posted = lines.map((l) => ({ account: l.target, date: '0000-00-00', debit: l.debit, credit: l.credit }));
        const balances = [...netByAccount(posted).entries()].map(([account, net]) => ({ account, net }));
        const bs = buildBalanceSheet(balances);
        const is = buildIncomeStatement(balances);
        return { posted, bs, is, analysis: financialAnalysis(bs, is, c.shareCapital) };
      };
      const cur = build(b.lines);
      const debit = b.lines.reduce((s, l) => s + l.debit, 0n);
      const credit = b.lines.reduce((s, l) => s + l.credit, 0n);
      const known = new Set((await tx.account.findMany({ where: { companyId: c.id }, select: { number: true } })).map((a) => a.number));
      const controls = {
        balanced: debit === credit,
        difference: debit - credit,
        unknownAccounts: [...new Set(b.lines.map((l) => l.target).filter((t) => !known.has(t)))],
        abnormalBalances: abnormalBalances(trialBalance(cur.posted)),
      };
      let variations: unknown[] = [];
      let prior = null;
      if (b.prior?.length) {
        const p = build(b.prior);
        prior = { balanceSheet: p.bs, incomeStatement: p.is };
        const rows = cur.is.rows.map((r) => ({ account: r.ref, label: r.label, current: major(r.value, d), prior: major(p.is.values[r.ref] ?? 0n, d) }));
        const turnover = Math.abs(major(cur.is.values.XB ?? 0n, d));
        variations = analyticalReview(rows, { amountThreshold: turnover * 0.01, pctThreshold: b.thresholdPct });
      }
      return { controls, balanceSheet: cur.bs, incomeStatement: cur.is, analysis: cur.analysis, prior, variations };
    });
  }

  // ---------------------------------------------------------------- Audit et révision
  @Get('missions/:id/audit')
  auditFile(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      const a = m.audit as AuditFile;
      const levels = new Map((a.risks ?? []).map((r) => [r.cycle, r]));
      const programmes = CYCLES.map((cycle) => ({
        cycle,
        risk: levels.get(cycle) ?? null,
        procedures: AUDIT_PROGRAMMES[cycle].map((p, i) => ({ ...p, workpaper: workpaperRef(cycle, i + 1), ...(a.workpapers?.[`${cycle}:${p.ref}`] ?? { status: 'A_FAIRE' }) })),
      }));
      const summary = a.planning ? misstatementSummary(a.misstatements ?? [], a.planning.result.overall) : null;
      return { mission: m, referentialStatus: 'A_VALIDER', planning: a.planning ?? null, independence: a.independence ?? null, programmes, misstatements: a.misstatements ?? [], summary };
    });
  }

  @Put('missions/:id/audit/planning')
  planning(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({
      benchmarks: z.array(z.object({ name: z.string(), base: z.number(), rate: z.number().min(0).max(1) })).min(1),
      selected: z.string(), performanceRatio: z.number().min(0).max(1), trivialRatio: z.number().min(0).max(1),
      risks: z.array(z.object({ cycle: z.enum(CYCLES as [Cycle, ...Cycle[]]), inherent: z.union([z.literal(1), z.literal(2), z.literal(3)]), control: z.union([z.literal(1), z.literal(2), z.literal(3)]) })).default([]),
    }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      let result;
      try {
        result = materiality(b);
      } catch (e) {
        throw domainError((e as Error).message, 'Référence de seuil inconnue.');
      }
      const audit: AuditFile = { ...(m.audit as AuditFile), planning: { ...b, result }, risks: riskAssessment(b.risks) };
      return tx.mission.update({ where: { id }, data: { audit: audit as never } });
    });
  }

  @Put('missions/:id/audit/independence')
  independence(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ answers: z.record(z.string(), z.boolean()) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      // Toute réponse « oui » à une menace d'indépendance bloque l'acceptation.
      const accepted = Object.values(b.answers).every((v) => !v);
      const audit: AuditFile = { ...(m.audit as AuditFile), independence: { answers: b.answers, accepted, by: u.userId, at: new Date().toISOString() } };
      return tx.mission.update({ where: { id }, data: { audit: audit as never } });
    });
  }

  @Put('missions/:id/audit/workpapers/:key')
  workpaper(@CurrentUser() u: SessionUser, @Param('id') id: string, @Param('key') key: string, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(['A_FAIRE', 'EN_COURS', 'TERMINE']), conclusion: z.string().max(5000).optional(), evidence: z.array(z.string().uuid()).default([]), review: z.boolean().default(false) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      if ((m.review as unknown as ReviewState).stage === 'VERROUILLE') throw domainError('DOSSIER_VERROUILLE', 'Dossier verrouillé.');
      const a = m.audit as AuditFile;
      const prev = a.workpapers?.[key];
      if (b.review && prev?.preparedBy === u.userId) throw domainError('SEPARATION_DES_TACHES', 'Le préparateur ne peut pas réviser sa propre feuille.');
      const wp = { status: b.status, conclusion: b.conclusion, evidence: b.evidence, preparedBy: b.review ? prev?.preparedBy : u.userId, reviewedBy: b.review ? u.userId : prev?.reviewedBy };
      const audit: AuditFile = { ...a, workpapers: { ...(a.workpapers ?? {}), [key]: wp } };
      return tx.mission.update({ where: { id }, data: { audit: audit as never } });
    });
  }

  @Post('missions/:id/audit/misstatements')
  misstatement(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ description: z.string().min(3), amount: z.number(), adjusted: z.boolean().default(false) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      const a = m.audit as AuditFile;
      const list = [...(a.misstatements ?? []), { ref: `AJ-${String((a.misstatements?.length ?? 0) + 1).padStart(3, '0')}`, ...b }];
      return tx.mission.update({ where: { id }, data: { audit: { ...a, misstatements: list } as never } });
    });
  }

  /** Procédures automatisées sur la comptabilité du client : Benford, écritures inhabituelles, séquences, sondage MUS, revue analytique. */
  @Get('missions/:id/audit/analytics')
  analytics(@CurrentUser() u: SessionUser, @Param('id') id: string, @Query('fiscalYearId') fyId?: string, @Query('sample') sampleSize = '25') {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      const c = await tx.company.findUniqueOrThrow({ where: { id: m.companyId } });
      const d = decimalsOf(c.currency);
      const controls = await this.reports.controls(tx, m.companyId, fyId);
      const fy = controls.fiscalYear;
      const entries = await tx.entry.findMany({ where: { companyId: m.companyId, fiscalYearId: fy.id, status: 'VALIDE' }, include: { lines: true } });
      const planning = (m.audit as AuditFile).planning;
      const unusual = unusualEntries(
        entries.map((e) => ({ id: e.id, number: e.number ?? undefined, date: e.date, description: e.label, createdBy: e.createdBy, validatedBy: e.validatedBy ?? undefined, amount: major(e.lines.reduce((s, l) => s + l.debit, 0n), d) })),
        { periodEnd: fy.endDate, roundTo: 10 ** (Math.max(0, String(Math.round(planning?.result.trivial ?? 100000)).length - 1)), daysBeforeEnd: 5, threshold: planning?.result.performance },
      ).slice(0, 200);
      const tb = await this.reports.trialBalance(tx, m.companyId, fy.id);
      const customers = tb.rows.filter((r) => r.account.startsWith('41')).map((r) => ({ id: r.account, label: r.label, amount: major(r.closingDebit - r.closingCredit, d) }));
      const prev = await tx.fiscalYear.findFirst({ where: { companyId: m.companyId, endDate: { lt: fy.startDate } }, orderBy: { endDate: 'desc' } });
      let review: unknown[] = [];
      if (prev) {
        const prior = await this.reports.trialBalance(tx, m.companyId, prev.id);
        const net = (r: { closingDebit: bigint; closingCredit: bigint }) => major(r.closingDebit - r.closingCredit, d);
        const accounts = new Set([...tb.rows, ...prior.rows].map((r) => r.account));
        review = analyticalReview([...accounts].map((a) => {
          const cur = tb.rows.find((r) => r.account === a);
          const p = prior.rows.find((r) => r.account === a);
          return { account: a, label: cur?.label ?? p?.label ?? '', current: cur ? net(cur) : 0, prior: p ? net(p) : 0 };
        }), { amountThreshold: planning?.result.performance ?? 0, pctThreshold: 0.1 });
      }
      return {
        fiscalYear: fy,
        benford: controls.benford,
        sequenceGaps: controls.sequenceGaps,
        possibleDuplicates: controls.possibleDuplicates,
        abnormalBalances: controls.abnormalBalances,
        unusualEntries: unusual,
        customerSample: monetaryUnitSample(customers, Number(sampleSize) || 25, 1),
        analyticalReview: review,
      };
    });
  }

  // ---------------------------------------------------------------- Documents générés (Word)
  @Post('missions/:id/documents/:kind')
  @Header('Content-Type', DOCX)
  async document(@CurrentUser() u: SessionUser, @Param('id') id: string, @Param('kind') kind: string, @Body() body: unknown) {
    const b = parse(z.object({ firm: z.string().min(2), firmAddress: z.string().default(''), partner: z.string().min(2), fee: z.string().default('selon proposition'), recipient: z.string().default(''), balance: z.string().optional() }), body);
    const { m, c, fy } = await this.db.forTenant(u.tenantId, async (tx) => {
      const m = await this.mission(tx, id);
      const c = await tx.company.findUniqueOrThrow({ where: { id: m.companyId } });
      const fy = await tx.fiscalYear.findFirst({ where: { companyId: c.id }, orderBy: { endDate: 'desc' } });
      return { m, c, fy };
    });
    const p = { firm: b.firm, firmAddress: b.firmAddress, client: c.name, fiscalYear: fy?.label ?? '', fee: b.fee, partner: b.partner, date: new Date().toISOString().slice(0, 10) };
    let doc: GeneratedDoc;
    const type = m.type as (typeof MISSION_TYPES)[number];
    if (kind === 'lettre-mission') doc = engagementLetter(type, p);
    else if (kind === 'demande-pieces') doc = documentRequest(type, c.name, p.fiscalYear);
    else if (kind === 'lettre-affirmation') doc = representationLetter(p);
    else if (/^confirmation-(client|fournisseur|banque|avocat)$/.test(kind)) {
      const k = kind.split('-')[1]!.toUpperCase() as 'CLIENT' | 'FOURNISSEUR' | 'BANQUE' | 'AVOCAT';
      const text = confirmationLetter(k, { entity: c.name, auditor: b.firm, auditorAddress: b.firmAddress, recipient: b.recipient, date: fy?.endDate ?? p.date, balance: b.balance, currency: c.currency });
      doc = { title: `Demande de confirmation — ${b.recipient}`, status: 'PROJET_A_VALIDER', sections: [{ heading: 'Lettre', paragraphs: text.split('\n').filter(Boolean) }] };
    } else throw domainError('DOCUMENT_INCONNU', 'Type de document inconnu.');
    return new StreamableFile(await buildWord({ title: doc.title, brand: b.firm, sections: toDoc(doc) }));
  }

  /** Manuel de procédures sur mesure (aperçu JSON ou Word). */
  @Post('manual')
  @HttpCode(200)
  async manual(@CurrentUser() u: SessionUser, @Body() body: unknown, @Query('format') format?: string) {
    const b = parse(z.object({
      companyId: z.string().uuid(), sector: z.enum(['COMMERCE', 'INDUSTRIE', 'SERVICES', 'BTP', 'MINES', 'AGRICULTURE', 'ONG']),
      positions: z.array(z.object({ id: z.string(), title: z.string(), holder: z.string().optional() })).max(200),
      assignments: z.record(z.string(), z.record(z.string(), z.string())).optional(), risks: z.array(z.string()).default([]), firm: z.string().optional(),
    }), body);
    const { c, accounts, rules } = await this.db.forTenant(u.tenantId, async (tx) => {
      const c = await tx.company.findUniqueOrThrow({ where: { id: b.companyId } });
      const accounts = await tx.account.findMany({ where: { companyId: c.id, imputable: true }, orderBy: { number: 'asc' }, select: { number: true, label: true } });
      const rules = await this.db.client.taxRule.findMany({ where: { country: c.country } });
      return { c, accounts, rules };
    });
    const methods = (c.methods ?? {}) as { depreciation?: string; stocks?: 'CMUP' | 'FIFO' };
    const manual = generateProceduresManual({
      company: c.name, country: c.country, sector: b.sector as Sector, system: c.system === 'SMT' ? 'SMT' : 'NORMAL', positions: b.positions,
      assignments: b.assignments as never, methods: { depreciation: methods.depreciation, inventory: methods.stocks },
      accounts: accounts.map((a) => ({ code: a.number, label: a.label })), risks: b.risks,
      obligations: [...new Set(rules.map((r) => r.tax))].map((t) => ({ label: t, frequency: 'Selon pack pays', deadline: rules.some((r) => r.tax === t && r.status !== 'VALIDE') ? 'À valider (fiscaliste)' : 'Pack validé' })),
    });
    if (format !== 'docx') return manual;
    const sections: WordSection[] = [
      { heading: 'Principes et méthodes comptables', paragraphs: manual.methods },
      ...manual.chapters.flatMap((ch) => [
        { heading: `Cycle ${ch.cycle.toLowerCase()}`, paragraphs: [`Objectif : ${ch.objective}`] },
        { heading: 'Procédure', level: 2 as const, table: { header: ['Étape', 'Acteur', 'Action', 'Document', 'Contrôle', 'Délai'], rows: ch.procedures.map((p) => [p.step, p.actor, p.action, p.document, p.control ?? '', p.delay ?? '']) } },
        { heading: 'Schémas d’écritures', level: 2 as const, paragraphs: ch.entries.length ? ch.entries : ['—'] },
      ]),
      { heading: 'Séparation des tâches et contrôles compensatoires', paragraphs: manual.segregationIssues.length ? manual.segregationIssues.map((i) => `${i.cycle} — ${i.duties.join(' / ')} : ${i.compensatingControl}`) : ['Aucun cumul de fonctions incompatibles détecté.'] },
      { heading: 'Annexe — matrice des délégations', table: { header: ['Cycle', 'Valideur'], rows: manual.annexes.delegationMatrix.map((r) => [r.cycle, r.approver]) } },
      { heading: 'Annexe — obligations fiscales et sociales', table: { header: ['Impôt', 'Périodicité', 'Statut'], rows: manual.annexes.obligations.map((o) => [o.label, o.frequency, o.deadline]) } },
      { heading: 'Annexe — plan de comptes', table: { header: ['Compte', 'Intitulé'], rows: manual.annexes.chartOfAccounts.map((a) => [a.code, a.label]) } },
    ];
    return new StreamableFile(await buildWord({ title: manual.title, subtitle: `Version ${manual.version} — ${c.country}`, brand: b.firm, toc: true, sections }), { type: DOCX });
  }

  // ---------------------------------------------------------------- Évaluation d'entreprise et restructuration
  @Post('valuation')
  @HttpCode(200)
  valuation(@Body() body: unknown) {
    const b = parse(z.object({
      ancc: z.object({ equity: z.number(), intangibleNonValues: z.number().default(0), adjustments: z.array(z.object({ label: z.string(), amount: z.number(), taxable: z.boolean().optional() })).default([]), deferredTaxRate: z.number().default(0) }),
      earnings: z.object({ normativeProfit: z.number(), capitalisationRate: z.number() }).optional(),
      goodwill: z.object({ profit: z.number(), normalReturn: z.number(), discountRate: z.number(), years: z.number().int().min(1).max(30) }).optional(),
      dcf: z.object({ freeCashFlows: z.array(z.number()).min(1), discountRate: z.number(), terminalGrowth: z.number(), netDebt: z.number() }).optional(),
      multiples: z.object({ metrics: z.record(z.string(), z.number()), multiples: z.array(z.object({ name: z.string(), metric: z.string(), multiple: z.number(), isEnterpriseValue: z.boolean().optional() })), netDebt: z.number() }).optional(),
      weights: z.record(z.string(), z.number()).default({}),
    }), body);
    try {
      const ancc = adjustedNetAssets(b.ancc);
      const methods: { name: string; value: number; weight: number }[] = [{ name: 'ANCC', value: ancc.value, weight: b.weights.ANCC ?? 1 }];
      const out: Record<string, unknown> = { ancc };
      if (b.earnings) methods.push({ name: 'RENDEMENT', value: (out.earnings = earningsValue(b.earnings.normativeProfit, b.earnings.capitalisationRate)) as number, weight: b.weights.RENDEMENT ?? 1 });
      if (b.goodwill) {
        const g = goodwillValue({ ...b.goodwill, ancc: ancc.value });
        out.goodwill = g;
        methods.push({ name: 'GOODWILL', value: g.value, weight: b.weights.GOODWILL ?? 1 });
      }
      if (b.dcf) {
        const dcf = dcfValuation(b.dcf);
        out.dcf = dcf;
        methods.push({ name: 'DCF', value: dcf.equityValue, weight: b.weights.DCF ?? 1 });
      }
      if (b.multiples) {
        const mu = multiplesValuation(b.multiples);
        out.multiples = mu;
        methods.push({ name: 'MULTIPLES', value: mu.median, weight: b.weights.MULTIPLES ?? 1 });
      }
      return { ...out, synthesis: valuationSynthesis(methods), status: 'PROJET_A_VALIDER' };
    } catch (e) {
      throw domainError((e as Error).message.split(':')[0]!, 'Paramètres d’évaluation incohérents.');
    }
  }

  @Post('restructuring')
  @HttpCode(200)
  restructuring(@Body() body: unknown) {
    const n = z.number();
    const b = parse(z.object({
      base: z.object({ revenue: n, variableCostRate: n, fixedCosts: n, personnel: n, debt: n, interestRate: n, cash: n, annualDebtRepayment: n, taxRate: n, depreciation: n }),
      scenarios: z.array(z.object({ name: z.string(), levers: z.array(z.object({ kind: z.enum(['REDUCTION_COUTS', 'REDUCTION_EFFECTIFS', 'CESSION_ACTIF', 'REECHELONNEMENT', 'AUGMENTATION_CAPITAL', 'CROISSANCE_CA', 'ABANDON_CREANCES']), year: z.number().int().min(1), value: n, cost: n.optional(), newTermYears: n.optional() })) })).min(1).max(6),
      years: z.number().int().min(3).max(5).default(5),
    }), body);
    return { scenarios: [{ name: 'Sans mesure', levers: [] }, ...b.scenarios].map((s) => ({ name: s.name, ...restructuringScenario(b.base, s.levers, b.years) })) };
  }
}

export const fmt = (v: bigint, currency: string) => `${formatAmount(v, decimalsOf(currency))} ${currency}`;
