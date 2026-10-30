/** Gestion budgétaire : prévision des ventes (moindres carrés, saisonnalité), approvisionnements (Wilson). */

/** Ajustement linéaire y = a·x + b (x = 1..n). */
export function linearTrend(values: number[]) {
  const n = values.length;
  if (n < 2) throw new Error('SERIE_TROP_COURTE');
  const xs = values.map((_, i) => i + 1);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = values.reduce((s, y) => s + y, 0) / n;
  const a = xs.reduce((s, x, i) => s + (x - mx) * (values[i]! - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b = my - a * mx;
  const ssTot = values.reduce((s, y) => s + (y - my) ** 2, 0);
  const ssRes = values.reduce((s, y, i) => s + (y - (a * (i + 1) + b)) ** 2, 0);
  return { a, b, r2: ssTot ? 1 - ssRes / ssTot : 1, forecast: (x: number) => a * x + b };
}

/**
 * Prévision saisonnière : tendance sur les totaux annuels de saisons, coefficients saisonniers
 * moyens (rapport à la tendance), prévision des saisons de l'année suivante.
 * `history` : une ligne par année, une valeur par saison (mois ou trimestre).
 */
export function seasonalForecast(history: number[][]) {
  const seasons = history[0]?.length ?? 0;
  if (history.length < 2 || seasons === 0 || history.some((h) => h.length !== seasons)) throw new Error('HISTORIQUE_IRREGULIER');
  const flat = history.flat();
  const trend = linearTrend(flat);
  const ratios = Array.from({ length: seasons }, (_, s) => {
    const r = history.map((year, y) => year[s]! / trend.forecast(y * seasons + s + 1));
    return r.reduce((a, b) => a + b, 0) / r.length;
  });
  const norm = ratios.reduce((a, b) => a + b, 0) / seasons;
  const coefficients = ratios.map((r) => r / norm);
  const start = history.length * seasons;
  const forecast = coefficients.map((c, s) => trend.forecast(start + s + 1) * c);
  return { trend: { a: trend.a, b: trend.b, r2: trend.r2 }, coefficients, forecast, total: forecast.reduce((a, b) => a + b, 0) };
}

/** Modèle de Wilson : quantité économique de commande. */
export function wilson(p: { annualDemand: number; orderCost: number; unitPrice: number; holdingRate: number; leadTimeDays?: number; safetyStock?: number; daysPerYear?: number }) {
  const holdingUnit = p.unitPrice * p.holdingRate;
  if (holdingUnit <= 0 || p.annualDemand <= 0) throw new Error('PARAMETRES_INVALIDES');
  const q = Math.sqrt((2 * p.annualDemand * p.orderCost) / holdingUnit);
  const orders = p.annualDemand / q;
  const days = p.daysPerYear ?? 360;
  const daily = p.annualDemand / days;
  return {
    economicQuantity: q,
    ordersPerYear: orders,
    periodDays: days / orders,
    orderingCost: orders * p.orderCost,
    holdingCost: ((q / 2) + (p.safetyStock ?? 0)) * holdingUnit,
    totalCost: orders * p.orderCost + ((q / 2) + (p.safetyStock ?? 0)) * holdingUnit,
    reorderPoint: daily * (p.leadTimeDays ?? 0) + (p.safetyStock ?? 0),
  };
}

/** Budget de production : production = ventes prévues + stock final souhaité − stock initial. */
export function productionBudget(periods: { sales: number }[], openingStock: number, targetClosingRatio: number) {
  let stock = openingStock;
  return periods.map((p, i) => {
    const nextSales = periods[i + 1]?.sales ?? p.sales;
    const closing = nextSales * targetClosingRatio;
    const production = Math.max(0, p.sales + closing - stock);
    const row = { period: i + 1, sales: p.sales, opening: stock, production, closing: stock + production - p.sales };
    stock = row.closing;
    return row;
  });
}
