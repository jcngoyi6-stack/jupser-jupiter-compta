/**
 * Enchaînement des coûts complets (méthode des centres d'analyse) :
 * coût d'achat → stocks de matières → coût de production (en-cours, sous-produits, déchets)
 * → stocks de produits → coût de revient des produits vendus → résultat analytique.
 */
import { inventoryAccount, type ValuationMethod } from './inventory';

/** Consommation d'unités d'œuvre d'un centre (ou montant d'assiette pour un taux de frais). */
export interface CentreUse { centre: string; quantity: number }
export interface DirectCost { label: string; amount: number }

export interface MaterialDef {
  code: string;
  label: string;
  method: ValuationMethod;
  opening: { quantity: number; value: number };
  purchases: { quantity: number; price: number; directCosts?: DirectCost[]; centres?: CentreUse[] };
  physicalClosing?: number;
}

export interface ProductDef {
  code: string;
  label: string;
  method: ValuationMethod;
  opening: { quantity: number; value: number };
  produced: number;
  consumption: { material: string; quantity: number }[];
  /** Main-d'œuvre directe et autres charges directes de production. */
  directCosts?: DirectCost[];
  centres?: CentreUse[];
  wip?: { opening: number; closing: number };
  /** Sous-produits ou déchets valorisés (déduits) ; coût de traitement des déchets (ajouté). */
  byProductValue?: number;
  wasteTreatmentCost?: number;
  sold: number;
  salePrice: number;
  distribution?: { directCosts?: DirectCost[]; centres?: CentreUse[] };
  physicalClosing?: number;
}

export interface CostModel {
  unitCosts: Record<string, number>;
  materials: MaterialDef[];
  products: ProductDef[];
  /** Charges imputées par centre, pour la différence d'arrondi sur unités d'œuvre. */
  centreTotals?: Record<string, number>;
}

const sum = (xs: DirectCost[] = []) => xs.reduce((s, x) => s + x.amount, 0);

function centreCost(uses: CentreUse[] = [], unitCosts: Record<string, number>) {
  return uses.map((u) => {
    const c = unitCosts[u.centre];
    if (c === undefined) throw new Error(`COUT_UO_INCONNU:${u.centre}`);
    return { centre: u.centre, quantity: u.quantity, unitCost: c, amount: u.quantity * c };
  });
}

export function computeCosts(m: CostModel) {
  const imputed: Record<string, number> = {};
  const track = (rows: { centre: string; amount: number }[]) => rows.forEach((r) => (imputed[r.centre] = (imputed[r.centre] ?? 0) + r.amount));

  const materials = m.materials.map((mat) => {
    const centres = centreCost(mat.purchases.centres, m.unitCosts);
    track(centres);
    const price = mat.purchases.quantity * mat.purchases.price;
    const total = price + sum(mat.purchases.directCosts) + centres.reduce((s, c) => s + c.amount, 0);
    const unit = mat.purchases.quantity ? total / mat.purchases.quantity : 0;
    return { def: mat, purchaseCost: { price, direct: mat.purchases.directCosts ?? [], centres, total, unitCost: unit } };
  });

  const consumed = new Map<string, number>();
  for (const p of m.products) for (const c of p.consumption) consumed.set(c.material, (consumed.get(c.material) ?? 0) + c.quantity);

  const materialStocks = materials.map(({ def, purchaseCost }) => {
    const inv = inventoryAccount(def.method, def.opening, [
      { kind: 'ENTREE', label: 'Achats', quantity: def.purchases.quantity, unitCost: purchaseCost.unitCost },
      { kind: 'SORTIE', label: 'Consommations', quantity: consumed.get(def.code) ?? 0 },
    ], def.physicalClosing);
    return { code: def.code, label: def.label, purchaseCost, inventory: inv };
  });
  const matUnit = new Map(materialStocks.map((s) => [s.code, s.inventory.outputs.unitCost ?? 0]));

  const products = m.products.map((p) => {
    const materialsUsed = p.consumption.map((c) => {
      if (!matUnit.has(c.material)) throw new Error(`MATIERE_INCONNUE:${c.material}`);
      return { material: c.material, quantity: c.quantity, unitCost: matUnit.get(c.material)!, amount: c.quantity * matUnit.get(c.material)! };
    });
    const centres = centreCost(p.centres, m.unitCosts);
    track(centres);
    const wipOpen = p.wip?.opening ?? 0;
    const wipClose = p.wip?.closing ?? 0;
    const production = materialsUsed.reduce((s, x) => s + x.amount, 0) + sum(p.directCosts) + centres.reduce((s, c) => s + c.amount, 0)
      + wipOpen - wipClose - (p.byProductValue ?? 0) + (p.wasteTreatmentCost ?? 0);
    const productionUnit = p.produced ? production / p.produced : 0;
    const inv = inventoryAccount(p.method, p.opening, [
      { kind: 'ENTREE', label: 'Production', quantity: p.produced, unitCost: productionUnit },
      { kind: 'SORTIE', label: 'Ventes', quantity: p.sold },
    ], p.physicalClosing);
    const distCentres = centreCost(p.distribution?.centres, m.unitCosts);
    track(distCentres);
    const distribution = sum(p.distribution?.directCosts) + distCentres.reduce((s, c) => s + c.amount, 0);
    const costOfSales = inv.outputs.value;
    const fullCost = costOfSales + distribution;
    const revenue = p.sold * p.salePrice;
    const result = revenue - fullCost;
    return {
      code: p.code, label: p.label,
      productionCost: { materials: materialsUsed, direct: p.directCosts ?? [], centres, wipOpening: wipOpen, wipClosing: wipClose, byProduct: p.byProductValue ?? 0, wasteTreatment: p.wasteTreatmentCost ?? 0, total: production, quantity: p.produced, unitCost: productionUnit },
      inventory: inv,
      fullCost: { costOfSales, distribution: { direct: p.distribution?.directCosts ?? [], centres: distCentres, total: distribution }, total: fullCost, quantity: p.sold, unitCost: p.sold ? fullCost / p.sold : null },
      revenue, result, unitResult: p.sold ? result / p.sold : null, margin: revenue ? result / revenue : null,
    };
  });

  const roundingDifferences = Object.entries(m.centreTotals ?? {}).map(([centre, total]) => ({ centre, total, imputed: imputed[centre] ?? 0, difference: total - (imputed[centre] ?? 0) }));
  const inventoryDifference = [...materialStocks.map((s) => s.inventory), ...products.map((p) => p.inventory)].reduce((s, i) => s + (i.inventoryDifference?.value ?? 0), 0);
  return {
    materials: materialStocks,
    products,
    analyticResult: products.reduce((s, p) => s + p.result, 0),
    revenue: products.reduce((s, p) => s + p.revenue, 0),
    roundingDifferences,
    roundingTotal: roundingDifferences.reduce((s, r) => s + r.difference, 0),
    inventoryDifference,
  };
}
