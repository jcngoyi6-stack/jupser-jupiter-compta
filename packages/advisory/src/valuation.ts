/**
 * Évaluation de l'entreprise et du patrimoine (docs/15 §4).
 * Les taux (capitalisation, actualisation, croissance) relèvent du jugement de l'évaluateur et sont saisis.
 */
import { npv } from './invest';

export interface Adjustment { label: string; amount: number; taxable?: boolean }

/** Actif net comptable corrigé : capitaux propres + plus/moins-values (nettes d'impôt latent si demandé) − non-valeurs. */
export function adjustedNetAssets(p: { equity: number; intangibleNonValues?: number; adjustments: Adjustment[]; deferredTaxRate?: number }) {
  const t = p.deferredTaxRate ?? 0;
  const detail = p.adjustments.map((a) => ({ ...a, net: a.taxable === false ? a.amount : a.amount * (1 - t) }));
  const value = p.equity - (p.intangibleNonValues ?? 0) + detail.reduce((s, a) => s + a.net, 0);
  return { value, detail };
}

/** Valeur de rendement : bénéfice normatif / taux de capitalisation. */
export function earningsValue(normativeProfit: number, capitalisationRate: number): number {
  if (capitalisationRate <= 0) throw new Error('TAUX_CAPITALISATION_INVALIDE');
  return normativeProfit / capitalisationRate;
}

/** Méthode du goodwill (rente abrégée) : ANCC + VA sur n années de (bénéfice − rémunération normale de l'ANCC). */
export function goodwillValue(p: { ancc: number; profit: number; normalReturn: number; discountRate: number; years: number }) {
  const superProfit = p.profit - p.normalReturn * p.ancc;
  const goodwill = npv(p.discountRate, [0, ...Array<number>(p.years).fill(superProfit)]);
  return { superProfit, goodwill, value: p.ancc + goodwill };
}

/** Flux de trésorerie disponibles actualisés + valeur terminale de Gordon-Shapiro. */
export function dcfValuation(p: { freeCashFlows: number[]; discountRate: number; terminalGrowth: number; netDebt: number }) {
  if (p.discountRate <= p.terminalGrowth) throw new Error('CROISSANCE_SUPERIEURE_AU_TAUX');
  const n = p.freeCashFlows.length;
  const pvFlows = p.freeCashFlows.reduce((s, f, i) => s + f / Math.pow(1 + p.discountRate, i + 1), 0);
  const last = p.freeCashFlows[n - 1] ?? 0;
  const terminal = (last * (1 + p.terminalGrowth)) / (p.discountRate - p.terminalGrowth);
  const pvTerminal = terminal / Math.pow(1 + p.discountRate, n);
  const enterpriseValue = pvFlows + pvTerminal;
  return { pvFlows, terminal, pvTerminal, enterpriseValue, equityValue: enterpriseValue - p.netDebt };
}

/** Multiples de comparables : valeur par multiple et médiane. */
export function multiplesValuation(p: { metrics: Record<string, number>; multiples: { name: string; metric: string; multiple: number; isEnterpriseValue?: boolean }[]; netDebt: number }) {
  const values = p.multiples.map((m) => {
    const base = p.metrics[m.metric];
    if (base === undefined) throw new Error(`AGREGAT_MANQUANT:${m.metric}`);
    const raw = base * m.multiple;
    return { name: m.name, value: m.isEnterpriseValue ? raw - p.netDebt : raw };
  });
  const sorted = values.map((v) => v.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? 0 : sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return { values, median };
}

/** Synthèse : moyenne pondérée et fourchette de valeur. */
export function valuationSynthesis(methods: { name: string; value: number; weight: number }[]) {
  const totalW = methods.reduce((s, m) => s + m.weight, 0);
  if (totalW <= 0) throw new Error('PONDERATIONS_NULLES');
  const values = methods.map((m) => m.value);
  return {
    weighted: methods.reduce((s, m) => s + m.value * m.weight, 0) / totalW,
    low: Math.min(...values),
    high: Math.max(...values),
    methods: methods.map((m) => ({ ...m, share: m.weight / totalW })),
  };
}
