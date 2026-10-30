/**
 * Coûts préétablis (standards) et analyse des écarts — contrôle de gestion.
 * Convention : écart = réel − préétabli ; un écart positif sur coût est défavorable.
 */

export interface StandardLine { label: string; quantity: number; unitCost: number }

/** Fiche de coût standard unitaire. */
export function standardCostSheet(lines: StandardLine[]) {
  const rows = lines.map((l) => ({ ...l, amount: l.quantity * l.unitCost }));
  return { rows, unitCost: rows.reduce((s, r) => s + r.amount, 0) };
}

/** Écart sur matières (ou main-d'œuvre) : quantité (ou temps) et prix (ou taux). */
export function directCostVariance(p: { actualQty: number; actualPrice: number; standardQtyForActualOutput: number; standardPrice: number }) {
  const actual = p.actualQty * p.actualPrice;
  const standard = p.standardQtyForActualOutput * p.standardPrice;
  const onQuantity = (p.actualQty - p.standardQtyForActualOutput) * p.standardPrice;
  const onPrice = (p.actualPrice - p.standardPrice) * p.actualQty;
  return { actual, standard, total: actual - standard, onQuantity, onPrice, favourable: actual - standard <= 0 };
}

/**
 * Écart sur charges indirectes d'un centre, décomposé en trois :
 * budget (réel − budget flexible de l'activité réelle), activité (budget flexible − coût standard de l'activité réelle),
 * rendement (coût standard × (activité réelle − activité préétablie pour la production réelle)).
 */
export function overheadVariance(p: { actualCost: number; actualActivity: number; standardActivityForActualOutput: number; normalActivity: number; budgetFixed: number; budgetVariablePerUnit: number }) {
  const standardRate = p.budgetVariablePerUnit + p.budgetFixed / p.normalActivity;
  const flexible = p.budgetFixed + p.budgetVariablePerUnit * p.actualActivity;
  const standardCost = standardRate * p.standardActivityForActualOutput;
  const onBudget = p.actualCost - flexible;
  const onActivity = flexible - standardRate * p.actualActivity;
  const onEfficiency = standardRate * (p.actualActivity - p.standardActivityForActualOutput);
  return { standardRate, flexibleBudget: flexible, standardCost, total: p.actualCost - standardCost, onBudget, onActivity, onEfficiency };
}

/** Écarts sur chiffre d'affaires : prix, composition des ventes (mix) et volume global. */
export function revenueVariance(products: { code: string; actualQty: number; actualPrice: number; budgetQty: number; budgetPrice: number }[]) {
  const totalActual = products.reduce((s, p) => s + p.actualQty, 0);
  const totalBudget = products.reduce((s, p) => s + p.budgetQty, 0);
  const rows = products.map((p) => {
    const mixQty = totalBudget ? (totalActual * p.budgetQty) / totalBudget : 0;
    return {
      code: p.code,
      actual: p.actualQty * p.actualPrice,
      budget: p.budgetQty * p.budgetPrice,
      onPrice: (p.actualPrice - p.budgetPrice) * p.actualQty,
      onMix: (p.actualQty - mixQty) * p.budgetPrice,
      onVolume: (mixQty - p.budgetQty) * p.budgetPrice,
    };
  });
  const t = (k: 'actual' | 'budget' | 'onPrice' | 'onMix' | 'onVolume') => rows.reduce((s, r) => s + r[k], 0);
  return { rows, actual: t('actual'), budget: t('budget'), total: t('actual') - t('budget'), onPrice: t('onPrice'), onMix: t('onMix'), onVolume: t('onVolume') };
}

/** Écart sur marge : marge unitaire et quantité. */
export function marginVariance(p: { actualQty: number; actualUnitMargin: number; budgetQty: number; budgetUnitMargin: number }) {
  return {
    actual: p.actualQty * p.actualUnitMargin,
    budget: p.budgetQty * p.budgetUnitMargin,
    total: p.actualQty * p.actualUnitMargin - p.budgetQty * p.budgetUnitMargin,
    onUnitMargin: (p.actualUnitMargin - p.budgetUnitMargin) * p.actualQty,
    onQuantity: (p.actualQty - p.budgetQty) * p.budgetUnitMargin,
  };
}
