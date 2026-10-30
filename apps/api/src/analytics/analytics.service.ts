import { Injectable } from '@nestjs/common';
import {
  cageJournal, computeCosts, incorporableCharges, primaryDistribution, rationalImputation, reconcile, secondaryDistribution, unitCosts,
  type Centre, type DistributionKey, type ProductDef, type MaterialDef,
} from '@jupiter/cost-accounting';
import { decimalsOf } from '@jupiter/ledger';
import { domainError } from '../common/http';
import type { Tx } from '../common/prisma.service';
import { defaultSettings, zSettings, type Dataset, type Settings } from './analytics.types';

const MILLI = 1000;
const monthsBetween = (from: string, to: string) => {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000 + 1) / (365 / 12);
};
const r2 = (v: number) => Math.round(v * 100) / 100;

@Injectable()
export class AnalyticsService {
  async settings(tx: Tx, companyId: string): Promise<{ settings: Settings; configured: boolean }> {
    const c = await tx.analyticConfig.findUnique({ where: { companyId } });
    return c ? { settings: zSettings.parse(c.settings), configured: true } : { settings: defaultSettings(), configured: false };
  }

  /** Collecte automatique : grand-livre, stocks, production, ventes, budgets et capitaux propres de la période. */
  async collect(tx: Tx, companyId: string, from: string, to: string, settings: Settings): Promise<Dataset> {
    if (from > to) throw domainError('PERIODE_INVALIDE', 'La date de début doit précéder la date de fin.');
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const dec = decimalsOf(company.currency);
    const m = (v: bigint) => Number(v) / 10 ** dec;
    const warnings: string[] = [];

    // 1. Grand-livre : charges et produits de la période (hors à-nouveaux et écritures de clôture)
    const lines = await tx.entryLine.findMany({
      where: { entry: { companyId, date: { gte: from, lte: to }, status: { in: ['VALIDE', 'CONTREPASSE'] }, NOT: { origin: 'CLOTURE' } }, account: { gte: '6', lt: '9' } },
      include: { entry: { select: { journalId: true } } },
    });
    const anJournals = new Set((await tx.journal.findMany({ where: { companyId, type: 'AN' } })).map((j) => j.id));
    const labels = new Map((await tx.account.findMany({ where: { companyId }, select: { number: true, label: true } })).map((a) => [a.number, a.label]));
    const isCharge = (a: string) => a.startsWith('6') || /^8[13579]/.test(a);
    const charges = new Map<string, { account: string; label?: string; amount: number; analytic: Record<string, number> }>();
    let products = 0;
    let variation603 = 0;
    let stocked73 = 0;
    for (const l of lines) {
      if (anJournals.has(l.entry.journalId)) continue;
      const net = m(l.debit - l.credit);
      if (isCharge(l.account)) {
        const c = charges.get(l.account) ?? { account: l.account, label: labels.get(l.account), amount: 0, analytic: {} };
        c.amount += net;
        if (l.analytic) c.analytic[l.analytic] = (c.analytic[l.analytic] ?? 0) + net;
        charges.set(l.account, c);
        if (l.account.startsWith('603')) variation603 += net;
      } else {
        products -= net;
        if (l.account.startsWith('73')) stocked73 -= net;
      }
    }
    const chargeList = [...charges.values()].filter((c) => Math.abs(c.amount) > 0.004).map((c) => ({ ...c, amount: r2(c.amount) })).sort((a, b) => a.account.localeCompare(b.account));
    const totalCharges = chargeList.reduce((s, c) => s + c.amount, 0);

    // 2. Capitaux propres à l'ouverture de la période (rémunération supplétive)
    const eq = await tx.entryLine.aggregate({ where: { entry: { companyId, date: { lt: from }, status: { in: ['VALIDE', 'CONTREPASSE'] } }, account: { gte: '10', lt: '14' } }, _sum: { debit: true, credit: true } });
    const equity = m((eq._sum.credit ?? 0n) - (eq._sum.debit ?? 0n));

    // 3. Stocks, production et ventes
    const items = await tx.stockItem.findMany({ where: { companyId } });
    const moves = await tx.stockMove.findMany({ where: { companyId, date: { lte: to } } });
    const wos = await tx.workOrder.findMany({ where: { companyId, date: { gte: from, lte: to } } });
    const boms = new Map((await tx.bom.findMany({ where: { companyId } })).map((b) => [b.id, b]));
    const invoices = await tx.salesDocument.findMany({ where: { companyId, type: { in: ['FACTURE', 'AVOIR'] }, status: 'EMISE', date: { gte: from, lte: to } } });
    const woProduct = new Map(wos.map((w) => [w.number, boms.get(w.bomId)?.productId ?? '']));
    const sales = new Map<string, { qty: number; net: number }>();
    for (const inv of invoices) {
      const sign = inv.type === 'AVOIR' ? -1 : 1;
      for (const l of inv.lines as { itemId?: string; quantity: number; net: string }[]) {
        if (!l.itemId) continue;
        const s = sales.get(l.itemId) ?? { qty: 0, net: 0 };
        s.qty += sign * l.quantity;
        s.net += sign * m(BigInt(l.net));
        sales.set(l.itemId, s);
      }
    }
    const code = new Map(items.map((i) => [i.id, i.code]));
    const centreOf = (fn: string) => settings.centres.filter((c) => c.kind === 'PRINCIPAL' && c.fn === fn);
    const units: Record<string, number> = {};
    const use = (centre: { code: string }, q: number) => { units[centre.code] = (units[centre.code] ?? 0) + q; return { centre: centre.code, quantity: r2(q) }; };

    const materials: Dataset['materials'] = [];
    const productsOut: Dataset['products'] = [];
    for (const it of items) {
      const mv = moves.filter((x) => x.itemId === it.id);
      const before = mv.filter((x) => x.date < from);
      const inPeriod = mv.filter((x) => x.date >= from);
      const opening = { quantity: before.reduce((s, x) => s + Number(x.qtyMilli), 0) / MILLI, value: r2(before.reduce((s, x) => s + m(x.totalCost), 0)) };
      const purchases = inPeriod.filter((x) => x.type === 'ENTREE');
      const pq = purchases.reduce((s, x) => s + Number(x.qtyMilli), 0) / MILLI;
      const pv = purchases.reduce((s, x) => s + m(x.totalCost), 0);
      const apps = centreOf('APPROVISIONNEMENT');
      const purchaseCentres = apps.filter((c) => c.unitSource === 'QTE_ACHETEE' && pq > 0).map((c) => use(c, pq));
      const sold = sales.get(it.id) ?? { qty: 0, net: 0 };
      const distCentres = centreOf('DISTRIBUTION').concat(centreOf('ADMINISTRATION')).flatMap((c) => {
        if (c.unitSource === 'QTE_VENDUE' && sold.qty > 0) return [use(c, sold.qty)];
        if (c.unitSource === 'CA_100' && sold.net > 0) return [use(c, sold.net / 100)];
        return [];
      });
      if (it.kind === 'MATIERE' || it.kind === 'FOURNITURE') {
        if (!opening.quantity && !pq && !inPeriod.length) continue;
        materials.push({ code: it.code, label: it.label, opening, purchases: { quantity: pq, price: pq ? r2(pv / pq) : 0, directCosts: [], centres: purchaseCentres } });
        continue;
      }
      if (!opening.quantity && !inPeriod.length && !sold.qty) continue;
      const salePrice = sold.qty > 0 ? sold.net / sold.qty : m(it.salePrice);
      if (it.kind === 'MARCHANDISE') {
        // Marchandise : « production » = achats de la période (coût d'achat), sans transformation.
        productsOut.push({
          code: it.code, label: it.label, opening, produced: pq, consumption: [], directCosts: pv ? [{ label: 'Prix d’achat', amount: r2(pv) }] : [], centres: purchaseCentres,
          sold: Math.max(0, sold.qty), salePrice: r2(salePrice), distribution: { directCosts: [], centres: distCentres },
        });
        continue;
      }
      // Produit fabriqué : ordres de fabrication de la période
      const myWos = wos.filter((w) => boms.get(w.bomId)?.productId === it.id);
      const produced = inPeriod.filter((x) => x.type === 'PRODUCTION').reduce((s, x) => s + Number(x.qtyMilli), 0) / MILLI;
      const consumption = new Map<string, number>();
      for (const x of moves.filter((y) => y.type === 'CONSOMMATION' && y.date >= from && woProduct.get(y.reference) === it.id)) {
        const c = code.get(x.itemId)!;
        consumption.set(c, (consumption.get(c) ?? 0) - Number(x.qtyMilli) / MILLI);
      }
      let labour = 0;
      const hoursByPoste = new Map<string, number>();
      for (const w of myWos) {
        const sheet = w.costSheet as { labourCost?: string } | null;
        labour += sheet?.labourCost ? m(BigInt(sheet.labourCost)) : 0;
        for (const r of (boms.get(w.bomId)?.routing ?? []) as { poste: string; minutes: number }[]) {
          hoursByPoste.set(r.poste, (hoursByPoste.get(r.poste) ?? 0) + (r.minutes * Number(w.qtyMilli)) / MILLI / 60);
        }
      }
      const prodCentres = centreOf('PRODUCTION').flatMap((c) => {
        if (c.unitSource === 'HEURES_PRODUCTION') {
          const h = hoursByPoste.has(c.code) ? hoursByPoste.get(c.code)! : [...hoursByPoste.values()].reduce((s, v) => s + v, 0);
          return h > 0 ? [use(c, h)] : [];
        }
        if (c.unitSource === 'QTE_PRODUITE' && produced > 0) return [use(c, produced)];
        return [];
      });
      const missing = [...consumption.keys()].filter((c) => !items.some((i) => i.code === c && (i.kind === 'MATIERE' || i.kind === 'FOURNITURE')));
      if (missing.length) warnings.push(`${it.code} consomme des articles non suivis comme matières : ${missing.join(', ')}.`);
      productsOut.push({
        code: it.code, label: it.label, opening, produced,
        consumption: [...consumption.entries()].filter(([c]) => !missing.includes(c)).map(([material, quantity]) => ({ material, quantity })),
        directCosts: labour ? [{ label: 'Main-d’œuvre directe (ordres de fabrication)', amount: r2(labour) }] : [], centres: prodCentres,
        sold: Math.max(0, sold.qty), salePrice: r2(salePrice), distribution: { directCosts: [], centres: distCentres },
      });
    }
    for (const c of settings.centres.filter((x) => x.kind === 'PRINCIPAL' && x.unitSource === 'MANUEL')) {
      units[c.code] = units[c.code] ?? 0;
      warnings.push(`Centre ${c.code} : nombre d’unités d’œuvre à saisir (source manuelle).`);
    }

    // 4. Budgets par centre (axe analytique des lignes budgétaires de l'exercice)
    const fy = await tx.fiscalYear.findFirst({ where: { companyId, startDate: { lte: to }, endDate: { gte: from } } });
    const budgets: Record<string, number> = {};
    if (fy) for (const b of await tx.budgetLine.findMany({ where: { companyId, fiscalYearId: fy.id, version: 'INITIAL', analytic: { not: '' } } })) budgets[b.analytic] = (budgets[b.analytic] ?? 0) + m(b.amount);

    if (!chargeList.length) warnings.push('Aucune charge comptabilisée sur la période.');
    return {
      from, to, currency: company.currency, charges: chargeList, generalProducts: r2(products), generalResult: r2(products - totalCharges), equity: r2(equity), stockVariation: r2(stocked73 - variation603), stockedProduction: r2(stocked73),
      units: Object.fromEntries(Object.entries(units).map(([k, v]) => [k, r2(v)])), materials, products: productsOut, budgets, warnings,
    };
  }

  /** Calcul complet : incorporation, répartition, unités d'œuvre, coûts, résultats, concordance, journal classe 9. */
  compute(settings: Settings, d: Dataset) {
    const months = monthsBetween(d.from, d.to);
    const centres: Centre[] = settings.centres;
    const codes = new Set(centres.map((c) => c.code));
    const supp = [
      ...(settings.supplementary.equityRate > 0 && d.equity > 0 ? [{ label: 'Rémunération des capitaux propres', amount: r2((d.equity * settings.supplementary.equityRate * months) / 12) }] : []),
      ...(settings.supplementary.ownerAnnual > 0 ? [{ label: 'Rémunération de l’exploitant', amount: r2((settings.supplementary.ownerAnnual * months) / 12) }] : []),
    ];
    const calc = settings.calculated.map((k) => ({
      label: k.label, account: k.account,
      accounting: d.charges.filter((c) => c.account.startsWith(k.account)).reduce((s, c) => s + c.amount, 0),
      economic: r2((k.annualEconomic * months) / 12),
    }));
    const inc = incorporableCharges(d.charges, settings.rules, supp, calc);

    // Répartition primaire : codes analytiques des écritures (affectation directe), sinon clé par préfixe de compte.
    const keyFor = (account: string) => settings.keys.filter((k) => account.startsWith(k.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
    const direct: Record<string, number> = {};
    const keys: DistributionKey[] = [];
    let directCharges = 0;
    const unallocated: { account: string; amount: number }[] = [];
    for (const c of inc.byAccount) {
      // Variations de stocks (603) : traitées par les comptes d'inventaire de la CAGE, pas par les centres.
      if (c.account.startsWith('603')) continue;
      const src = d.charges.find((x) => x.account === c.account);
      let rest = c.amount;
      for (const [code, v] of Object.entries(src?.analytic ?? {})) {
        if (!codes.has(code)) continue;
        const part = Math.min(v, rest);
        direct[code] = (direct[code] ?? 0) + part;
        rest -= part;
      }
      if (Math.abs(rest) < 0.005) continue;
      const k = keyFor(c.account);
      if (k) keys.push({ charge: `${c.account} ${c.label ?? ''}`.trim(), amount: rest, shares: k.shares });
      else { directCharges += rest; unallocated.push({ account: c.account, amount: r2(rest) }); }
    }
    const suppCentre = settings.supplementary.centre && codes.has(settings.supplementary.centre) ? settings.supplementary.centre : null;
    if (suppCentre) direct[suppCentre] = (direct[suppCentre] ?? 0) + inc.supplementaryTotal;
    else directCharges += inc.supplementaryTotal;
    for (const k of inc.calculated) {
      const key = k.account ? keyFor(k.account) : undefined;
      if (key && k.difference) keys.push({ charge: `Différence d’incorporation ${k.label}`, amount: k.difference, shares: key.shares });
      else directCharges += k.difference;
    }
    let prim: ReturnType<typeof primaryDistribution>;
    let sec: ReturnType<typeof secondaryDistribution>;
    try {
      prim = primaryDistribution(centres, keys, direct);
      sec = secondaryDistribution(centres, prim.totals, settings.transfers);
    } catch (e) {
      throw domainError((e as Error).message.split(':')[0]!, `Paramétrage analytique incohérent (${(e as Error).message}).`);
    }

    // Imputation rationnelle des charges fixes par centre principal
    const imputed: Record<string, number> = { ...sec.totals };
    const rational = settings.centres.filter((c) => c.kind === 'PRINCIPAL' && c.fixedShare && c.normalActivity).map((c) => {
      const total = sec.totals[c.code] ?? 0;
      const fixed = total * c.fixedShare!;
      const r = rationalImputation({ fixedCosts: fixed, variableCostPerUnit: 0, normalActivity: c.normalActivity!, actualActivity: d.units[c.code] ?? 0 });
      imputed[c.code] = total - fixed + r.imputedFixed;
      return { centre: c.code, fixed: r2(fixed), coefficient: r.coefficient, imputedFixed: r2(r.imputedFixed), difference: r2(r.difference), nature: r.nature };
    });
    const uc = unitCosts(centres, imputed, d.units);
    const unitMap = Object.fromEntries(uc.filter((u) => u.unitCost !== null).map((u) => [u.centre, u.unitCost!]));
    const missingUnits = uc.filter((u) => u.unitCost === null && Math.abs(u.total) > 0.005).map((u) => u.centre);

    const method = settings.method;
    const usedCentres = new Set([...d.materials.flatMap((x) => x.purchases.centres), ...d.products.flatMap((p) => [...p.centres, ...p.distribution.centres])].map((u) => u.centre));
    const unknown = [...usedCentres].filter((c) => !(c in unitMap));
    if (unknown.length) throw domainError('UNITES_OEUVRE_MANQUANTES', `Coût d’unité d’œuvre indisponible pour : ${unknown.join(', ')} (unités d’œuvre nulles ou centre inconnu).`);
    let costs: ReturnType<typeof computeCosts>;
    try {
      costs = computeCosts({
        unitCosts: unitMap,
        centreTotals: Object.fromEntries(centres.filter((c) => c.kind === 'PRINCIPAL').map((c) => [c.code, imputed[c.code] ?? 0])),
        materials: d.materials.map((x) => ({ ...x, method }) as MaterialDef),
        products: d.products.map((p) => ({ ...p, method }) as ProductDef),
      });
    } catch (e) {
      throw domainError((e as Error).message.split(':')[0]!, `Données de coûts incohérentes (${(e as Error).message}).`);
    }
    const rationalDiff = rational.reduce((s, r) => s + r.difference, 0);
    // Charges effectivement imputées aux coûts (achats, charges directes, centres) et variation des stocks analytiques.
    const sumD = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
    const imputedTotal = costs.materials.reduce((s, x) => s + x.purchaseCost.total, 0)
      + costs.products.reduce((s, p) => s + sumD(p.productionCost.direct) + p.productionCost.wasteTreatment + sumD(p.productionCost.centres) + p.fullCost.distribution.total, 0);
    const stockAN = [...costs.materials.map((x) => x.inventory), ...costs.products.map((p) => p.inventory)].reduce((s, i) => s + i.closing.value - i.opening.value, 0)
      + costs.products.reduce((s, p) => s + p.productionCost.wipClosing - p.productionCost.wipOpening + p.productionCost.byProduct, 0);
    const charges603 = d.charges.filter((c) => c.account.startsWith('603')).reduce((s, c) => s + c.amount, 0);
    const nonImputed = inc.incorporable - charges603 - imputedTotal - rationalDiff;
    const nonImputedDetail = { incorporableExcludingStockVariation: r2(inc.incorporable - charges603), imputedToCosts: r2(imputedTotal), rationalImputationDifference: r2(rationalDiff), nonImputed: r2(nonImputed) };
    const concordance = reconcile({
      analyticResult: costs.analyticResult,
      supplementary: inc.supplementaryTotal,
      nonIncorporableCharges: inc.nonIncorporableTotal,
      nonIncorporatedProducts: d.generalProducts - costs.revenue - d.stockedProduction,
      calculatedDifference: inc.calculatedDifference,
      rationalImputationDifference: rationalDiff,
      nonImputedCharges: nonImputed,
      stockVariationDifference: d.stockVariation - (stockAN - costs.inventoryDifference),
      inventoryDifference: 0,
      generalLedgerResult: d.generalResult,
    });
    const journal = cageJournal({ centres, incorporation: inc, primaryTotals: prim.totals, secondaryRows: sec.rows, costs });
    const centreReport = centres.map((c) => ({
      code: c.code, label: c.label, kind: c.kind, primary: r2(prim.totals[c.code] ?? 0), afterSecondary: r2(sec.totals[c.code] ?? 0),
      // Budget du centre comparé à ses charges propres (répartition primaire).
      budget: d.budgets[c.code] ?? null, budgetGap: d.budgets[c.code] === undefined ? null : r2((prim.totals[c.code] ?? 0) - d.budgets[c.code]!),
    }));
    return {
      period: { from: d.from, to: d.to, months: r2(months), currency: d.currency },
      incorporation: inc,
      distribution: { primary: prim, secondary: sec, unitCosts: uc, missingUnits, rational, directCharges: r2(directCharges), unallocated },
      centres: centreReport,
      costs,
      concordance: { ...concordance, nonImputedDetail },
      journal,
      summary: {
        revenue: r2(costs.revenue), analyticResult: r2(costs.analyticResult), generalResult: d.generalResult,
        products: costs.products.map((p) => ({ code: p.code, label: p.label, sold: p.fullCost.quantity, revenue: r2(p.revenue), fullCost: r2(p.fullCost.total), unitCost: p.fullCost.unitCost, result: r2(p.result), margin: p.margin })),
      },
      warnings: [
        ...d.warnings,
        ...unallocated.map((u) => `Compte ${u.account} (${u.amount}) sans clé de répartition : traité comme charge directe.`),
        ...missingUnits.map((c) => `Centre ${c} : charges non imputées faute d’unités d’œuvre.`),
        ...(nonImputed >= 0.5 ? [`${r2(nonImputed)} de charges incorporables ne sont imputées à aucun coût (charges directes sans objet de coût) : vérifiez les clés de répartition et les codes analytiques.`] : []),
        ...(nonImputed <= -0.5 ? [`Les coûts calculés dépassent de ${r2(-nonImputed)} les charges incorporables comptabilisées : des achats ou de la main-d’œuvre suivis en stocks ou en production n’ont pas de charge correspondante en comptabilité générale sur la période.`] : []),
      ],
    };
  }
}
