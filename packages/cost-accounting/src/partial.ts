/** Coûts partiels : coût variable, seuil de rentabilité, coûts spécifiques, imputation rationnelle, coût marginal. */

export interface VariableCostInput { revenue: number; variableCosts: number; fixedCosts: number; /** Jours d'activité de l'exercice (360 par convention). */ days?: number; startDate?: string; quantity?: number }

export function breakEven(p: VariableCostInput) {
  const margin = p.revenue - p.variableCosts;
  const rate = p.revenue ? margin / p.revenue : 0;
  const result = margin - p.fixedCosts;
  const threshold = rate > 0 ? p.fixedCosts / rate : null;
  const days = p.days ?? 360;
  const deadPointDays = threshold === null || p.revenue === 0 ? null : (threshold / p.revenue) * days;
  let deadPointDate: string | null = null;
  if (deadPointDays !== null && p.startDate && deadPointDays <= days) {
    // Convention 30 jours par mois (année commerciale de 360 jours).
    const [y, mo, d] = p.startDate.split('-').map(Number) as [number, number, number];
    const total = (mo - 1) * 30 + (d - 1) + Math.max(Math.ceil(deadPointDays) - 1, 0);
    const month = Math.floor(total / 30) % 12;
    const day = (total % 30) + 1;
    deadPointDate = `${y + Math.floor(total / 360)}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const safetyMargin = threshold === null ? null : p.revenue - threshold;
  return {
    margin, marginRate: rate, result, threshold,
    thresholdQuantity: threshold !== null && p.quantity ? threshold / (p.revenue / p.quantity) : null,
    deadPointDays, deadPointDate, safetyMargin,
    safetyIndex: safetyMargin === null || !p.revenue ? null : safetyMargin / p.revenue,
    operatingLeverage: result ? margin / result : null,
  };
}

/** Seuil multi-produits (composition des ventes constante). */
export function multiProductBreakEven(products: { code: string; revenue: number; variableCosts: number }[], fixedCosts: number) {
  const revenue = products.reduce((s, p) => s + p.revenue, 0);
  const variable = products.reduce((s, p) => s + p.variableCosts, 0);
  const be = breakEven({ revenue, variableCosts: variable, fixedCosts });
  return {
    ...be,
    byProduct: products.map((p) => ({ code: p.code, margin: p.revenue - p.variableCosts, marginRate: p.revenue ? (p.revenue - p.variableCosts) / p.revenue : 0, threshold: be.threshold === null ? null : (be.threshold * p.revenue) / revenue })),
  };
}

/** Coûts spécifiques (direct costing évolué) : marge sur coût spécifique = marge sur CV − charges fixes directes. */
export function specificCosts(products: { code: string; revenue: number; variableCosts: number; specificFixedCosts: number }[], commonFixedCosts: number) {
  const rows = products.map((p) => {
    const mcv = p.revenue - p.variableCosts;
    const mcs = mcv - p.specificFixedCosts;
    return { ...p, variableMargin: mcv, specificMargin: mcs, keep: mcs > 0 };
  });
  const totalSpecific = rows.reduce((s, r) => s + r.specificMargin, 0);
  return { rows, totalSpecificMargin: totalSpecific, commonFixedCosts, result: totalSpecific - commonFixedCosts };
}

/** Imputation rationnelle des charges fixes : coefficient = activité réelle / activité normale. */
export function rationalImputation(p: { fixedCosts: number; variableCostPerUnit: number; normalActivity: number; actualActivity: number }) {
  if (p.normalActivity <= 0) throw new Error('ACTIVITE_NORMALE_INVALIDE');
  const coefficient = p.actualActivity / p.normalActivity;
  const imputedFixed = p.fixedCosts * coefficient;
  const difference = p.fixedCosts - imputedFixed;
  const variable = p.variableCostPerUnit * p.actualActivity;
  const total = variable + imputedFixed;
  return {
    coefficient, imputedFixed, variable, total,
    unitCost: p.actualActivity ? total / p.actualActivity : null,
    /** Positif : coût de sous-activité (chômage) ; négatif : boni de suractivité. */
    difference,
    nature: difference > 0 ? 'COUT_SOUS_ACTIVITE' : difference < 0 ? 'BONI_SURACTIVITE' : 'ACTIVITE_NORMALE',
  };
}

/** Coût marginal par tranche de production ; optimum de rentabilité et optimum technique. */
export function marginalCost(rows: { quantity: number; totalCost: number }[], unitPrice?: number) {
  const sorted = [...rows].sort((a, b) => a.quantity - b.quantity);
  const out = sorted.map((r, i) => {
    const prev = sorted[i - 1];
    const marginal = prev ? (r.totalCost - prev.totalCost) / (r.quantity - prev.quantity) : null;
    const average = r.quantity ? r.totalCost / r.quantity : null;
    const revenue = unitPrice === undefined ? null : unitPrice * r.quantity;
    return { ...r, marginal, average, revenue, result: revenue === null ? null : revenue - r.totalCost };
  });
  const technical = out.filter((r) => r.average !== null).sort((a, b) => a.average! - b.average!)[0] ?? null;
  const economic = unitPrice === undefined ? null : out.filter((r) => r.result !== null).sort((a, b) => b.result! - a.result!)[0] ?? null;
  return { rows: out, technicalOptimum: technical && technical.quantity, economicOptimum: economic && economic.quantity };
}
