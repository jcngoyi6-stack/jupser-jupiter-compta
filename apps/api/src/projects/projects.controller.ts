import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { compareProjects, evaluateProject, monteCarlo, scenarios, sensitivity, RISK_VARIABLES, type ProjectInput, type RiskVariable } from '@jupiter/advisory';
import { z } from 'zod';
import { CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { domainError, parse } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { buildWord } from '../common/word';

const n = z.number().finite();
const zRate = n.min(-0.99).max(10);
const zInput = z.object({
  name: z.string().optional(),
  promoter: z.string().optional(),
  sector: z.string().optional(),
  location: z.string().optional(),
  country: z.string().length(2).optional(),
  currency: z.string().length(3).default('CDF'),
  years: z.number().int().min(1).max(50),
  discountRate: zRate,
  taxRate: n.min(0).max(1),
  taxHolidayYears: z.number().int().min(0).max(50).optional(),
  investments: z.array(z.object({ label: z.string(), year: z.number().int().min(0), amount: n.min(0), lifeYears: z.number().int().min(0).max(100) })).max(200),
  products: z.array(z.object({ name: z.string(), volumes: z.array(n.min(0)).min(1), price: n.min(0), unitVariableCost: n.min(0), priceGrowth: n.optional() })).max(50),
  fixedCosts: z.array(n.min(0)).default([]),
  personnelCosts: z.array(n.min(0)).default([]),
  workingCapital: z.object({ receivableDays: n.min(0), inventoryDays: n.min(0), payableDays: n.min(0) }).optional(),
  loans: z.array(z.object({ label: z.string().optional(), amount: n.min(0), rate: n.min(0).max(1), years: z.number().int().min(1).max(40), deferral: z.number().int().min(0).optional(), mode: z.enum(['ANNUITE', 'AMORTISSEMENT_CONSTANT']).optional(), year: z.number().int().min(0).optional() })).optional(),
  subsidy: n.min(0).optional(),
  residualValue: n.optional(),
  jobs: z.number().int().min(0).optional(),
});
type Input = z.infer<typeof zInput>;

const zDist = z.discriminatedUnion('type', [
  z.object({ type: z.literal('uniform'), min: n, max: n }),
  z.object({ type: z.literal('triangular'), min: n, mode: n, max: n }),
  z.object({ type: z.literal('normal'), mean: n, sd: n.min(0) }),
]);
const zMult = z.record(z.enum(RISK_VARIABLES as [RiskVariable, ...RiskVariable[]]), n.min(0));
const zRisk = z.object({
  deltas: z.array(n).max(10).optional(),
  scenarios: z.array(z.object({ name: z.string(), probability: n.min(0).max(1).optional(), multipliers: zMult })).max(10).optional(),
  monteCarlo: z.object({ iterations: z.number().int().min(10).max(20000), seed: z.number().int().optional(), distributions: z.record(z.enum(RISK_VARIABLES as [RiskVariable, ...RiskVariable[]]), zDist) }).optional(),
});

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(2)} %`);
const num = (v: number) => Math.round(v).toLocaleString('fr-FR');

@ApiTags('Évaluation des projets d’investissement')
@RequiresModule('ANALYSE_FINANCIERE')
@Roles('DIRECTION', 'CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE', 'AUDITEUR')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly db: PrismaService) {}

  /** L'IS doit venir du pack pays : on signale s'il diffère de la règle ou si la règle n'est pas validée. */
  private async taxCheck(input: Input) {
    if (!input.country) return { status: 'NON_VERIFIE', message: 'Pays non renseigné : taux d’IS saisi librement.' };
    const rule = await this.db.client.taxRule.findFirst({ where: { country: input.country, tax: 'IS', param: 'taux' }, orderBy: { effectiveFrom: 'desc' } });
    if (!rule || rule.value === null) return { status: 'A_VALIDER', message: 'Estimation — règle non validée (taux d’IS absent du pack pays).' };
    const packRate = Number(rule.value as string);
    const differs = Math.abs(packRate - input.taxRate) > 1e-9;
    if (rule.status !== 'VALIDE') return { status: 'A_VALIDER', packRate, differs, message: 'Estimation — règle non validée.' };
    return { status: differs ? 'DEROGATOIRE' : 'VALIDE', packRate, differs, message: differs ? 'Taux d’IS différent du pack validé (régime dérogatoire à justifier).' : 'Taux conforme au pack validé.' };
  }

  private compute(input: Input) {
    try {
      return evaluateProject(input as ProjectInput);
    } catch (e) {
      throw domainError((e as Error).message, 'Données du projet incohérentes.');
    }
  }

  @Get()
  list(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) => tx.projectEvaluation.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, createdAt: true, results: true } }));
  }

  /** Calcul sans enregistrement (saisie libre). */
  @Post('compute')
  @HttpCode(200)
  async computeOnly(@Body() body: unknown) {
    const input = parse(zInput, body);
    return { result: this.compute(input), taxCheck: await this.taxCheck(input) };
  }

  @Post()
  create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().min(2).max(200), input: zInput }), body);
    const result = this.compute(b.input);
    return this.db.forTenant(u.tenantId, (tx) => tx.projectEvaluation.create({ data: { tenantId: u.tenantId, name: b.name, input: b.input as never, results: { economic: result.economic, financial: result.financial } as never, createdBy: u.userId } }));
  }

  @Get(':id')
  get(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const p = await tx.projectEvaluation.findUniqueOrThrow({ where: { id } });
      const input = zInput.parse(p.input);
      return { ...p, result: this.compute(input), taxCheck: await this.taxCheck(input) };
    });
  }

  @Put(':id')
  update(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().min(2).max(200).optional(), input: zInput }), body);
    const result = this.compute(b.input);
    return this.db.forTenant(u.tenantId, (tx) => tx.projectEvaluation.update({ where: { id }, data: { name: b.name, input: b.input as never, results: { economic: result.economic, financial: result.financial } as never } }));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    await this.db.forTenant(u.tenantId, (tx) => tx.projectEvaluation.delete({ where: { id } }));
  }

  /** Analyse de risque : sensibilité, scénarios, Monte-Carlo. */
  @Post(':id/risk')
  @HttpCode(200)
  risk(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(zRisk, body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const p = await tx.projectEvaluation.findUniqueOrThrow({ where: { id } });
      const input = zInput.parse(p.input) as ProjectInput;
      const out = {
        sensitivity: sensitivity(input, b.deltas),
        scenarios: b.scenarios ? scenarios(input, b.scenarios) : null,
        monteCarlo: b.monteCarlo ? monteCarlo(input, b.monteCarlo) : null,
      };
      await tx.projectEvaluation.update({ where: { id }, data: { results: { ...((p.results as object) ?? {}), risk: { scenarios: out.scenarios, monteCarlo: out.monteCarlo && { ...out.monteCarlo, histogram: undefined } } } as never } });
      return out;
    });
  }

  @Post('compare')
  @HttpCode(200)
  compare(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ ids: z.array(z.string().uuid()).min(2).max(10) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const list = await tx.projectEvaluation.findMany({ where: { id: { in: b.ids } } });
      return compareProjects(list.map((p) => ({ name: p.name, input: zInput.parse(p.input) as ProjectInput })));
    });
  }

  /** Rapport d'évaluation Word (à la charte du cabinet), commentaires à rédiger et valider par l'expert. */
  @Post(':id/report.docx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  async report(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ brand: z.string().optional(), comments: z.string().max(20000).optional() }), body ?? {});
    const p = await this.db.forTenant(u.tenantId, (tx) => tx.projectEvaluation.findUniqueOrThrow({ where: { id } }));
    const input = zInput.parse(p.input);
    const r = this.compute(input);
    const tax = await this.taxCheck(input);
    const crit = (label: string, c: typeof r.economic): (string | number)[][] => [
      [`${label} — VAN`, num(c.npv)], [`${label} — TRI`, pct(c.irr)], [`${label} — TRI modifié`, pct(c.mirr)],
      [`${label} — délai de récupération`, c.payback === null ? '—' : `${c.payback.toFixed(2)} ans`],
      [`${label} — délai actualisé`, c.discountedPayback === null ? '—' : `${c.discountedPayback.toFixed(2)} ans`],
      [`${label} — indice de profitabilité`, c.profitabilityIndex === null ? '—' : c.profitabilityIndex.toFixed(3)],
      [`${label} — annuité équivalente`, num(c.equivalentAnnuity)],
    ];
    const risk = (p.results as { risk?: { scenarios?: { results: { name: string; npv: number }[] }; monteCarlo?: { mean: number; probabilityNegative: number; p5: number; p95: number } } } | null)?.risk;
    const buf = await buildWord({
      title: `Rapport d’évaluation — ${p.name}`,
      subtitle: [input.promoter, input.sector, input.location].filter(Boolean).join(' — ') || undefined,
      brand: b.brand,
      toc: true,
      sections: [
        { heading: 'Hypothèses', paragraphs: [
          `Horizon : ${input.years} ans ; taux d’actualisation : ${pct(input.discountRate)} ; devise : ${input.currency}.`,
          `Impôt sur les sociétés : ${pct(input.taxRate)} (${tax.message})${input.taxHolidayYears ? ` ; exonération ${input.taxHolidayYears} an(s)` : ''}.`,
        ] },
        { heading: 'Comptes de résultat et flux prévisionnels', table: { header: ['Année', 'CA', 'EBE', 'Dotations', 'Résultat net', 'CAF', 'Investissement', 'Var. BFR', 'Flux économique', 'Flux actionnaire'], rows: r.rows.map((x) => [x.year, num(x.revenue), num(x.ebitda), num(x.depreciation), num(x.netIncome), num(x.caf), num(x.investment), num(x.deltaWorkingCapital), num(x.economicFlow), num(x.equityFlow)]) } },
        { heading: 'Critères de rentabilité', table: { header: ['Critère', 'Valeur'], rows: [...crit('Économique', r.economic), ...crit('Financière', r.financial)] } },
        { heading: 'Seuil de rentabilité', table: { header: ['Année', 'CA critique'], rows: r.breakEven.map((x) => [x.year, x.revenue === null ? '—' : num(x.revenue)]) } },
        { heading: 'Analyse de risque', paragraphs: [
          ...(risk?.scenarios?.results ?? []).map((s) => `Scénario ${s.name} : VAN ${num(s.npv)}.`),
          ...(risk?.monteCarlo ? [`Monte-Carlo : VAN moyenne ${num(risk.monteCarlo.mean)} ; intervalle 5 %–95 % [${num(risk.monteCarlo.p5)} ; ${num(risk.monteCarlo.p95)}] ; probabilité de VAN négative ${pct(risk.monteCarlo.probabilityNegative)}.`] : []),
          ...(risk ? [] : ['Analyse de risque non encore réalisée.']),
        ] },
        { heading: 'Impact économique et social', paragraphs: [`Valeur ajoutée cumulée : ${num(r.economicImpact.valueAdded)} ; salaires : ${num(r.economicImpact.wages)} ; impôts : ${num(r.economicImpact.taxes)} ; emplois : ${r.economicImpact.jobs}.`] },
        { heading: 'Commentaires de l’expert', paragraphs: [b.comments ?? 'À rédiger (JUPSER IA peut proposer un projet), puis valider par l’expert.'] },
      ],
    });
    return new StreamableFile(buf);
  }
}
