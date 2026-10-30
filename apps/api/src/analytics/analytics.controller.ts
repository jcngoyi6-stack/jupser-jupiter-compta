import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  abcProductCosts, breakEven, directCostVariance, linearTrend, marginalCost, marginVariance, multiProductBreakEven, overheadVariance,
  productionBudget, rationalImputation, resourcesToActivities, revenueVariance, seasonalForecast, specificCosts, wilson,
} from '@jupiter/cost-accounting';
import { decimalsOf } from '@jupiter/ledger';
import { z } from 'zod';
import { CurrentUser, RequiresModule, Roles, type Role, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError, parse, zDate } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { buildWorkbook } from '../common/spreadsheet';
import { AnalyticsService } from './analytics.service';
import { zDataset, zSettings } from './analytics.types';

const WRITE: Role[] = ['CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE'];
const READ: Role[] = [...WRITE, 'DIRECTION', 'AUDITEUR'];

/** Exécute une fonction de calcul pure et convertit ses erreurs métier en réponses 400. */
function tool<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw domainError((e as Error).message.split(':')[0]!, `Données incohérentes (${(e as Error).message}).`);
  }
}

@ApiTags('Comptabilité analytique de gestion')
@RequiresModule('COMPTABILITE_ANALYTIQUE')
@Roles(...READ)
@Controller('companies/:companyId/analytics')
export class AnalyticsController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly svc: AnalyticsService,
  ) {}

  // ---------------------------------------------------------------- Paramétrage
  @Get('config')
  config(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.svc.settings(tx, companyId));
  }

  @Roles('CHEF_COMPTABLE', 'EXPERT_EXTERNE')
  @Put('config')
  saveConfig(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const settings = parse(zSettings, body);
    const codes = new Set(settings.centres.map((c) => c.code));
    if (codes.size !== settings.centres.length) throw domainError('CENTRE_EN_DOUBLE', 'Deux centres portent le même code.');
    for (const k of settings.keys) for (const c of Object.keys(k.shares)) if (!codes.has(c)) throw domainError('CENTRE_INCONNU', `Clé ${k.prefix} : centre ${c} inconnu.`);
    for (const [aux, t] of Object.entries(settings.transfers)) {
      const centre = settings.centres.find((c) => c.code === aux);
      if (!centre || centre.kind === 'PRINCIPAL') throw domainError('CENTRE_AUXILIAIRE', `${aux} n’est pas un centre auxiliaire.`);
      const total = Object.values(t).reduce((s, v) => s + v, 0);
      if (Math.abs(total - 100) > 0.001) throw domainError('CLE_SECONDAIRE_NON_100', `La répartition de ${aux} totalise ${total} % au lieu de 100 %.`);
      for (const c of Object.keys(t)) if (!codes.has(c)) throw domainError('CENTRE_INCONNU', `Répartition de ${aux} : centre ${c} inconnu.`);
    }
    return this.db.forTenant(u.tenantId, async (tx) => {
      const r = await tx.analyticConfig.upsert({
        where: { companyId },
        create: { tenantId: u.tenantId, companyId, settings: settings as never, updatedBy: u.userId },
        update: { settings: settings as never, updatedBy: u.userId },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'CAGE_PARAMETRAGE', `company:${companyId}`, { centres: settings.centres.length, keys: settings.keys.length });
      return { settings: r.settings, configured: true };
    });
  }

  // ---------------------------------------------------------------- Collecte et calcul
  /** Données de la période, collectées dans tout le système (grand-livre, stocks, production, ventes, budgets). */
  @Get('collect')
  collect(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('from') from: string, @Query('to') to: string) {
    parse(z.object({ from: zDate, to: zDate }), { from, to });
    return this.db.forTenant(u.tenantId, async (tx) => this.svc.collect(tx, companyId, from, to, (await this.svc.settings(tx, companyId)).settings));
  }

  /** Calcul sans enregistrement (simulation) ; sans données fournies, la période est collectée. */
  @Post('compute')
  @HttpCode(200)
  compute(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ dataset: zDataset.optional(), from: zDate.optional(), to: zDate.optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const { settings } = await this.svc.settings(tx, companyId);
      const d = b.dataset ?? (b.from && b.to ? await this.svc.collect(tx, companyId, b.from, b.to, settings) : null);
      if (!d) throw domainError('DONNEES_MANQUANTES', 'Fournissez les données ou la période.');
      return { dataset: d, results: this.svc.compute(settings, d) };
    });
  }

  // ---------------------------------------------------------------- Périodes analytiques
  @Get('periods')
  periods(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => (await tx.analyticPeriod.findMany({ where: { companyId }, orderBy: { toDate: 'desc' } })).map((p) => ({
      id: p.id, label: p.label, fromDate: p.fromDate, toDate: p.toDate, status: p.status, createdAt: p.createdAt, validatedAt: p.validatedAt,
      summary: (p.results as { summary?: unknown }).summary ?? null,
    })));
  }

  @Roles(...WRITE)
  @Post('periods')
  createPeriod(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ label: z.string().min(2).max(100), dataset: zDataset }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const { settings } = await this.svc.settings(tx, companyId);
      const results = this.svc.compute(settings, b.dataset);
      const p = await tx.analyticPeriod.create({
        data: { tenantId: u.tenantId, companyId, label: b.label, fromDate: b.dataset.from, toDate: b.dataset.to, input: { settings, dataset: b.dataset } as never, results: JSON.parse(JSON.stringify(results)) as never, createdBy: u.userId },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'CAGE_PERIODE_CALCULEE', `analytic_period:${p.id}`, { from: b.dataset.from, to: b.dataset.to, result: results.summary.analyticResult });
      return { id: p.id, status: p.status, results };
    });
  }

  @Get('periods/:id')
  period(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.analyticPeriod.findFirstOrThrow({ where: { id, companyId } }));
  }

  /** Validation à quatre yeux : le valideur n'est pas l'auteur du calcul. */
  @Roles('CHEF_COMPTABLE', 'EXPERT_EXTERNE')
  @Post('periods/:id/validate')
  @HttpCode(200)
  validate(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const p = await tx.analyticPeriod.findFirstOrThrow({ where: { id, companyId } });
      if (p.status !== 'BROUILLON') throw domainError('DEJA_VALIDEE', 'Période déjà validée.');
      if (p.createdBy === u.userId) throw domainError('QUATRE_YEUX', 'La période doit être validée par une autre personne que son auteur.');
      const v = await tx.analyticPeriod.update({ where: { id }, data: { status: 'VALIDE', validatedBy: u.userId, validatedAt: new Date() } });
      await this.audit.log(tx, u.tenantId, u.userId, 'CAGE_PERIODE_VALIDEE', `analytic_period:${id}`);
      return { id: v.id, status: v.status };
    });
  }

  @Roles(...WRITE)
  @Delete('periods/:id')
  @HttpCode(204)
  async remove(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    await this.db.forTenant(u.tenantId, async (tx) => {
      const p = await tx.analyticPeriod.findFirstOrThrow({ where: { id, companyId } });
      if (p.status === 'VALIDE') throw domainError('PERIODE_VALIDEE', 'Une période validée ne peut pas être supprimée.');
      await tx.analyticPeriod.delete({ where: { id } });
    });
  }

  /** Classeur Excel : charges incorporables, répartition, coûts, résultats, concordance, journal classe 9. */
  @Get('periods/:id/report.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async report(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    const { p, company } = await this.db.forTenant(u.tenantId, async (tx) => ({ p: await tx.analyticPeriod.findFirstOrThrow({ where: { id, companyId } }), company: await tx.company.findUniqueOrThrow({ where: { id: companyId } }) }));
    const r = p.results as unknown as ReturnType<AnalyticsService['compute']>;
    const toMinor = (v: number) => BigInt(Math.round(v * 10 ** decimalsOf(company.currency)));
    const money = (v: number | null | undefined) => (v === null || v === undefined ? null : toMinor(v));
    const title = (t: string) => `${t} — ${company.name} — ${p.label} (${p.fromDate} au ${p.toDate})${p.status === 'VALIDE' ? '' : ' — PROVISOIRE'}`;
    const buf = await buildWorkbook([
      { name: 'Incorporation', title: title('Charges incorporables'), columns: [{ header: 'Élément', width: 50 }, { header: 'Montant', money: true }], rows: [
        ['Charges de la comptabilité générale', money(r.incorporation.generalCharges)],
        ...r.incorporation.nonIncorporable.map((n) => [`− ${n.account} ${n.label ?? ''} (${n.reason})`, money(-n.amount)] as [string, bigint | null]),
        ...r.incorporation.supplementary.map((s) => [`+ ${s.label}`, money(s.amount)] as [string, bigint | null]),
        ...r.incorporation.calculated.map((c) => [`± ${c.label}`, money(c.difference)] as [string, bigint | null]),
        ['Charges incorporables', money(r.incorporation.incorporable)],
      ] },
      { name: 'Centres', title: title('Tableau de répartition'), columns: [{ header: 'Centre' }, { header: 'Libellé', width: 30 }, { header: 'Primaire', money: true }, { header: 'Après secondaire', money: true }, { header: 'Unités d’œuvre' }, { header: 'Coût de l’UO', money: true }, { header: 'Budget', money: true }, { header: 'Écart budget', money: true }],
        rows: r.centres.map((c) => { const uo = r.distribution.unitCosts.find((x) => x.centre === c.code); return [c.code, c.label, money(c.primary), money(c.afterSecondary), uo?.quantity ?? null, money(uo?.unitCost), money(c.budget), money(c.budgetGap)]; }) },
      { name: 'Résultats', title: title('Coûts de revient et résultats analytiques'), columns: [{ header: 'Produit' }, { header: 'Libellé', width: 30 }, { header: 'Quantité vendue' }, { header: 'Chiffre d’affaires', money: true }, { header: 'Coût de revient', money: true }, { header: 'Résultat', money: true }],
        rows: r.summary.products.map((x) => [x.code, x.label, x.sold, money(x.revenue), money(x.fullCost), money(x.result)]) },
      { name: 'Concordance', title: title('Concordance des résultats'), columns: [{ header: 'Élément', width: 55 }, { header: 'Montant', money: true }, { header: 'Compte' }],
        rows: [...r.concordance.items.map((i) => [i.label, money(i.amount), i.account97 ?? '']), ['Résultat de la comptabilité générale', money(r.concordance.generalLedgerResult), '']] },
      { name: 'Journal classe 9', title: title('Journal analytique (comptes 92 à 99)'), columns: [{ header: 'Pièce' }, { header: 'Compte' }, { header: 'Libellé', width: 45 }, { header: 'Axe' }, { header: 'Débit', money: true }, { header: 'Crédit', money: true }],
        rows: r.journal.entries.flatMap((e) => e.lines.map((l) => [e.ref, l.account, l.label, l.analytic ?? '', money(l.debit), money(l.credit)])) },
    ]);
    return new StreamableFile(buf);
  }

  /** Tableau de bord : évolution des résultats par produit sur les périodes validées. */
  @Get('dashboard')
  dashboard(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const ps = await tx.analyticPeriod.findMany({ where: { companyId, status: 'VALIDE' }, orderBy: { toDate: 'asc' }, take: 24 });
      return ps.map((p) => ({ id: p.id, label: p.label, toDate: p.toDate, summary: (p.results as { summary: unknown }).summary }));
    });
  }

  /** Écarts sur coûts préétablis des ordres de fabrication de la période (matières et main-d'œuvre). */
  @Get('standards/variances')
  variances(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('from') from: string, @Query('to') to: string) {
    parse(z.object({ from: zDate, to: zDate }), { from, to });
    return this.db.forTenant(u.tenantId, async (tx) => {
      const { settings } = await this.svc.settings(tx, companyId);
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const m = (v: bigint | string) => Number(BigInt(v)) / 10 ** decimalsOf(company.currency);
      const items = new Map((await tx.stockItem.findMany({ where: { companyId } })).map((i) => [i.id, i]));
      const boms = new Map((await tx.bom.findMany({ where: { companyId } })).map((b) => [b.id, b]));
      const wos = await tx.workOrder.findMany({ where: { companyId, date: { gte: from, lte: to } } });
      const rows: unknown[] = [];
      const missing = new Set<string>();
      for (const w of wos) {
        const sheet = w.costSheet as { materials: { itemId: string; qtyMilli: string; unitCost: string }[]; labour: { poste: string; cost: string }[] } | null;
        if (!sheet) continue;
        const bom = boms.get(w.bomId)!;
        const product = items.get(bom.productId);
        for (const mat of sheet.materials) {
          const it = items.get(mat.itemId)!;
          const std = settings.standards.prices[it.code];
          if (std === undefined) { missing.add(it.code); continue; }
          const qty = Number(mat.qtyMilli) / 1000;
          // Les quantités consommées suivent la nomenclature : l'écart de quantité vient des corrections saisies.
          const v = directCostVariance({ actualQty: qty, actualPrice: m(mat.unitCost), standardQtyForActualOutput: qty, standardPrice: std });
          rows.push({ workOrder: w.number, product: product?.code, element: it.code, kind: 'MATIERE', ...v });
        }
        for (const lab of sheet.labour) {
          const step = (bom.routing as { poste: string; minutes: number; hourlyRate: string }[]).find((r) => r.poste === lab.poste);
          const rate = settings.standards.hourlyRates[lab.poste];
          if (!step || rate === undefined) { missing.add(lab.poste); continue; }
          const hours = (step.minutes * Number(w.qtyMilli)) / 1000 / 60;
          const v = directCostVariance({ actualQty: hours, actualPrice: hours ? m(lab.cost) / hours : 0, standardQtyForActualOutput: hours, standardPrice: rate });
          rows.push({ workOrder: w.number, product: product?.code, element: lab.poste, kind: 'MAIN_OEUVRE', ...v });
        }
      }
      return { rows, missingStandards: [...missing] };
    });
  }

  // ---------------------------------------------------------------- Outils de calcul (coûts partiels, ABC, contrôle de gestion, budgets)
  @Post('tools/:name')
  @HttpCode(200)
  tools(@Param('name') name: string, @Body() body: unknown) {
    const n = z.number().finite();
    switch (name) {
      case 'seuil': {
        const b = parse(z.object({ revenue: n, variableCosts: n, fixedCosts: n, startDate: zDate.optional(), quantity: n.optional(), days: n.optional() }), body);
        return tool(() => breakEven(b));
      }
      case 'seuil-multi': {
        const b = parse(z.object({ products: z.array(z.object({ code: z.string(), revenue: n, variableCosts: n })).min(1), fixedCosts: n }), body);
        return tool(() => multiProductBreakEven(b.products, b.fixedCosts));
      }
      case 'couts-specifiques': {
        const b = parse(z.object({ products: z.array(z.object({ code: z.string(), revenue: n, variableCosts: n, specificFixedCosts: n })).min(1), commonFixedCosts: n }), body);
        return tool(() => specificCosts(b.products, b.commonFixedCosts));
      }
      case 'imputation-rationnelle': {
        const b = parse(z.object({ fixedCosts: n, variableCostPerUnit: n, normalActivity: n, actualActivity: n }), body);
        return tool(() => rationalImputation(b));
      }
      case 'cout-marginal': {
        const b = parse(z.object({ rows: z.array(z.object({ quantity: n, totalCost: n })).min(2), unitPrice: n.optional() }), body);
        return tool(() => marginalCost(b.rows, b.unitPrice));
      }
      case 'abc': {
        const b = parse(z.object({
          resources: z.array(z.object({ label: z.string(), amount: n, shares: z.record(z.string(), n) })).optional(),
          activities: z.array(z.object({ code: z.string(), label: z.string(), cost: n.default(0), driver: z.string() })).min(1),
          volumes: z.array(z.object({ driver: z.string(), label: z.string().optional(), volume: n })),
          products: z.array(z.object({ code: z.string(), label: z.string().optional(), quantity: n, directCosts: n, drivers: z.record(z.string(), n), revenue: n.optional() })),
        }), body);
        return tool(() => {
          const fromResources = b.resources ? resourcesToActivities(b.resources) : null;
          const acts = b.activities.map((a) => ({ ...a, cost: fromResources ? (fromResources[a.code] ?? 0) : a.cost }));
          return { activities: acts, ...abcProductCosts(acts, b.volumes, b.products) };
        });
      }
      case 'ecarts': {
        const b = parse(z.object({
          materials: z.array(z.object({ label: z.string(), actualQty: n, actualPrice: n, standardQtyForActualOutput: n, standardPrice: n })).default([]),
          labour: z.array(z.object({ label: z.string(), actualQty: n, actualPrice: n, standardQtyForActualOutput: n, standardPrice: n })).default([]),
          overheads: z.array(z.object({ label: z.string(), actualCost: n, actualActivity: n, standardActivityForActualOutput: n, normalActivity: n.positive(), budgetFixed: n, budgetVariablePerUnit: n })).default([]),
          revenue: z.array(z.object({ code: z.string(), actualQty: n, actualPrice: n, budgetQty: n, budgetPrice: n })).default([]),
          margin: z.object({ actualQty: n, actualUnitMargin: n, budgetQty: n, budgetUnitMargin: n }).optional(),
        }), body);
        return tool(() => ({
          materials: b.materials.map((x) => ({ label: x.label, ...directCostVariance(x) })),
          labour: b.labour.map((x) => ({ label: x.label, ...directCostVariance(x) })),
          overheads: b.overheads.map((x) => ({ label: x.label, ...overheadVariance(x) })),
          revenue: b.revenue.length ? revenueVariance(b.revenue) : null,
          margin: b.margin ? marginVariance(b.margin) : null,
        }));
      }
      case 'previsions': {
        const b = parse(z.object({ series: z.array(n).min(2).optional(), seasons: z.array(z.array(n)).optional(), horizon: z.number().int().min(1).max(36).default(4) }), body);
        return tool(() => {
          if (b.seasons) return { seasonal: seasonalForecast(b.seasons) };
          const t = linearTrend(b.series ?? []);
          return { trend: { a: t.a, b: t.b, r2: t.r2 }, forecast: Array.from({ length: b.horizon }, (_, i) => t.forecast((b.series ?? []).length + i + 1)) };
        });
      }
      case 'wilson': {
        const b = parse(z.object({ annualDemand: n, orderCost: n, unitPrice: n, holdingRate: n, leadTimeDays: n.optional(), safetyStock: n.optional() }), body);
        return tool(() => wilson(b));
      }
      case 'budget-production': {
        const b = parse(z.object({ sales: z.array(n).min(1), openingStock: n, targetClosingRatio: n }), body);
        return tool(() => productionBudget(b.sales.map((sales) => ({ sales })), b.openingStock, b.targetClosingRatio));
      }
      default:
        throw domainError('OUTIL_INCONNU', `Outil ${name} inconnu.`);
    }
  }
}
