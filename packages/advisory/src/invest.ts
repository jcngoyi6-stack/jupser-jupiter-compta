/**
 * Évaluation des projets d'investissement (docs/16).
 * Montants en unités monétaires (nombres) : ce sont des prévisions, arrondies à l'affichage.
 * Les taux (actualisation, IS, emprunts) sont fournis par l'appelant — l'IS provient du pack pays validé.
 */

export function npv(rate: number, flows: number[]): number {
  return flows.reduce((s, f, t) => s + f / Math.pow(1 + rate, t), 0);
}

/** TRI par dichotomie ; null s'il n'y a pas de changement de signe sur ]-99 % ; 1000 %]. */
export function irr(flows: number[]): number | null {
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo, flows);
  const fHi = npv(hi, flows);
  if (fLo === 0) return lo;
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-12) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** TRI modifié : flux négatifs actualisés au taux de financement, positifs capitalisés au taux de réinvestissement. */
export function mirr(flows: number[], financeRate: number, reinvestRate: number): number | null {
  const n = flows.length - 1;
  if (n < 1) return null;
  const pvNeg = flows.reduce((s, f, t) => (f < 0 ? s + f / Math.pow(1 + financeRate, t) : s), 0);
  const fvPos = flows.reduce((s, f, t) => (f > 0 ? s + f * Math.pow(1 + reinvestRate, n - t) : s), 0);
  if (pvNeg === 0 || fvPos === 0) return null;
  return Math.pow(fvPos / -pvNeg, 1 / n) - 1;
}

function cumulativeRecovery(flows: number[]): number | null {
  let cum = 0;
  for (let t = 0; t < flows.length; t++) {
    const f = flows[t] ?? 0;
    const prev = cum;
    cum += f;
    if (t > 0 && prev < 0 && cum >= 0) return t - 1 + -prev / f;
  }
  return null;
}

/** Délai de récupération simple (en années, interpolé). */
export function payback(flows: number[]): number | null {
  return cumulativeRecovery(flows);
}

export function discountedPayback(flows: number[], rate: number): number | null {
  return cumulativeRecovery(flows.map((f, t) => f / Math.pow(1 + rate, t)));
}

/** Indice de profitabilité = VA des flux positifs / VA des décaissements. */
export function profitabilityIndex(flows: number[], rate: number): number | null {
  let pos = 0;
  let neg = 0;
  flows.forEach((f, t) => {
    const d = f / Math.pow(1 + rate, t);
    if (d >= 0) pos += d;
    else neg -= d;
  });
  return neg === 0 ? null : pos / neg;
}

/** Annuité équivalente (VAN répartie sur n années). */
export function equivalentAnnuity(value: number, rate: number, years: number): number {
  if (years <= 0) return 0;
  if (rate === 0) return value / years;
  return (value * rate) / (1 - Math.pow(1 + rate, -years));
}

export function capm(riskFree: number, beta: number, marketPremium: number): number {
  return riskFree + beta * marketPremium;
}

/** Coût moyen pondéré du capital. */
export function wacc(p: { equity: number; debt: number; costOfEquity: number; costOfDebt: number; taxRate: number }): number {
  const total = p.equity + p.debt;
  if (total <= 0) throw new Error('STRUCTURE_FINANCIERE_VIDE');
  return (p.equity / total) * p.costOfEquity + (p.debt / total) * p.costOfDebt * (1 - p.taxRate);
}

export interface Loan {
  label?: string;
  amount: number;
  rate: number;
  years: number;
  /** Années de différé (intérêts seuls). */
  deferral?: number;
  mode?: 'ANNUITE' | 'AMORTISSEMENT_CONSTANT';
  /** Année de décaissement (0 par défaut). */
  year?: number;
}

export interface LoanRow { year: number; opening: number; interest: number; principal: number; payment: number; closing: number }

export function loanSchedule(loan: Loan): LoanRow[] {
  const rows: LoanRow[] = [];
  const deferral = loan.deferral ?? 0;
  const start = loan.year ?? 0;
  const amortYears = loan.years - deferral;
  if (amortYears <= 0) throw new Error('DIFFERE_TROP_LONG');
  let balance = loan.amount;
  const annuity = loan.rate === 0 ? loan.amount / amortYears : (loan.amount * loan.rate) / (1 - Math.pow(1 + loan.rate, -amortYears));
  for (let k = 1; k <= loan.years; k++) {
    const interest = balance * loan.rate;
    let principal = 0;
    if (k > deferral) principal = loan.mode === 'AMORTISSEMENT_CONSTANT' ? loan.amount / amortYears : annuity - interest;
    if (k === loan.years) principal = balance;
    rows.push({ year: start + k, opening: balance, interest, principal, payment: interest + principal, closing: balance - principal });
    balance -= principal;
  }
  return rows;
}

export interface Investment {
  label: string;
  /** Année de l'investissement (0 = démarrage). */
  year: number;
  amount: number;
  /** Durée d'amortissement linéaire ; 0 = non amortissable (terrain). */
  lifeYears: number;
}

export interface Product {
  name: string;
  /** Volumes par année d'exploitation (index 0 = année 1). */
  volumes: number[];
  price: number;
  unitVariableCost: number;
  /** Évolution annuelle du prix (ex. 0,03). */
  priceGrowth?: number;
}

export interface ProjectInput {
  name?: string;
  currency?: string;
  years: number;
  discountRate: number;
  /** Taux d'IS du pack pays validé. */
  taxRate: number;
  /** Années d'exonération (Code des investissements). */
  taxHolidayYears?: number;
  investments: Investment[];
  products: Product[];
  /** Charges fixes hors personnel, par année (la dernière valeur est prolongée). */
  fixedCosts: number[];
  personnelCosts: number[];
  workingCapital?: { receivableDays: number; inventoryDays: number; payableDays: number };
  loans?: Loan[];
  subsidy?: number;
  /** Valeur résiduelle imposée ; à défaut, VNC des investissements en fin d'horizon. */
  residualValue?: number;
  jobs?: number;
}

export interface YearRow {
  year: number;
  revenue: number;
  variableCosts: number;
  fixedCosts: number;
  personnel: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interest: number;
  tax: number;
  netIncome: number;
  caf: number;
  investment: number;
  workingCapital: number;
  deltaWorkingCapital: number;
  economicFlow: number;
  equityFlow: number;
}

export interface Criteria {
  npv: number;
  irr: number | null;
  mirr: number | null;
  payback: number | null;
  discountedPayback: number | null;
  profitabilityIndex: number | null;
  equivalentAnnuity: number;
}

export interface ProjectResult {
  rows: YearRow[];
  economic: Criteria;
  financial: Criteria;
  residualValue: number;
  breakEven: { year: number; revenue: number | null }[];
  loans: LoanRow[][];
  economicImpact: { valueAdded: number; wages: number; taxes: number; jobs: number };
}

const at = (arr: number[], i: number): number => (arr.length === 0 ? 0 : (arr[Math.min(i, arr.length - 1)] ?? 0));

function criteria(flows: number[], rate: number, years: number): Criteria {
  const v = npv(rate, flows);
  return {
    npv: v,
    irr: irr(flows),
    mirr: mirr(flows, rate, rate),
    payback: payback(flows),
    discountedPayback: discountedPayback(flows, rate),
    profitabilityIndex: profitabilityIndex(flows, rate),
    equivalentAnnuity: equivalentAnnuity(v, rate, years),
  };
}

/** Taxe sur un résultat avec report déficitaire illimité. */
function taxWithCarryForward(results: number[], rate: number, holiday: number): number[] {
  let losses = 0;
  return results.map((r, i) => {
    const year = i + 1;
    let base = r - losses;
    if (base < 0) {
      losses = -base;
      base = 0;
    } else losses = 0;
    return year <= holiday ? 0 : base * rate;
  });
}

export function evaluateProject(p: ProjectInput): ProjectResult {
  if (p.years < 1) throw new Error('HORIZON_INVALIDE');
  const n = p.years;
  const loans = (p.loans ?? []).map(loanSchedule);
  const wc = p.workingCapital ?? { receivableDays: 0, inventoryDays: 0, payableDays: 0 };

  const depreciation = new Array<number>(n + 1).fill(0);
  const invest = new Array<number>(n + 1).fill(0);
  let residualBook = 0;
  for (const inv of p.investments) {
    if (inv.year >= 0 && inv.year <= n) invest[inv.year] = (invest[inv.year] ?? 0) + inv.amount;
    if (inv.lifeYears <= 0) {
      residualBook += inv.amount;
      continue;
    }
    const annual = inv.amount / inv.lifeYears;
    let booked = 0;
    for (let y = inv.year + 1; y <= Math.min(n, inv.year + inv.lifeYears); y++) {
      depreciation[y] = (depreciation[y] ?? 0) + annual;
      booked += annual;
    }
    residualBook += inv.amount - booked;
  }
  const residual = p.residualValue ?? residualBook;

  const interest = new Array<number>(n + 1).fill(0);
  const principal = new Array<number>(n + 1).fill(0);
  const proceeds = new Array<number>(n + 1).fill(0);
  (p.loans ?? []).forEach((l, i) => {
    const y0 = l.year ?? 0;
    if (y0 <= n) proceeds[y0] = (proceeds[y0] ?? 0) + l.amount;
    for (const r of loans[i] ?? []) {
      if (r.year > n) continue;
      interest[r.year] = (interest[r.year] ?? 0) + r.interest;
      principal[r.year] = (principal[r.year] ?? 0) + r.principal;
    }
    // Solde restant dû remboursé à l'horizon (cession ou refinancement).
    const outstanding = (loans[i] ?? []).filter((r) => r.year > n).reduce((s, r) => s + r.principal, 0);
    principal[n] = (principal[n] ?? 0) + outstanding;
  });

  const base: Omit<YearRow, 'tax' | 'netIncome' | 'caf' | 'economicFlow' | 'equityFlow'>[] = [];
  let prevWc = 0;
  for (let y = 0; y <= n; y++) {
    let revenue = 0;
    let variableCosts = 0;
    if (y >= 1) {
      for (const pr of p.products) {
        const vol = at(pr.volumes, y - 1);
        revenue += vol * pr.price * Math.pow(1 + (pr.priceGrowth ?? 0), y - 1);
        variableCosts += vol * pr.unitVariableCost;
      }
    }
    const fixedCosts = y >= 1 ? at(p.fixedCosts, y - 1) : 0;
    const personnel = y >= 1 ? at(p.personnelCosts, y - 1) : 0;
    const ebitda = revenue - variableCosts - fixedCosts - personnel;
    const dep = depreciation[y] ?? 0;
    const level = y >= 1 && y < n + 1 ? (revenue * wc.receivableDays + variableCosts * (wc.inventoryDays - wc.payableDays)) / 360 : 0;
    const delta = level - prevWc;
    prevWc = level;
    base.push({
      year: y, revenue, variableCosts, fixedCosts, personnel, ebitda, depreciation: dep, ebit: ebitda - dep,
      interest: interest[y] ?? 0, investment: invest[y] ?? 0, workingCapital: level, deltaWorkingCapital: delta,
    });
  }

  const holiday = p.taxHolidayYears ?? 0;
  const ecoTax = [0, ...taxWithCarryForward(base.slice(1).map((r) => r.ebit), p.taxRate, holiday)];
  const finTax = [0, ...taxWithCarryForward(base.slice(1).map((r) => r.ebit - r.interest), p.taxRate, holiday)];

  const rows: YearRow[] = base.map((r, y) => {
    const tax = finTax[y] ?? 0;
    const netIncome = r.ebit - r.interest - tax;
    const terminal = y === n ? residual + r.workingCapital : 0;
    const economicFlow = r.ebitda - (ecoTax[y] ?? 0) - r.investment - r.deltaWorkingCapital + terminal;
    const equityFlow =
      r.ebitda - r.interest - tax - r.investment - r.deltaWorkingCapital + (proceeds[y] ?? 0) - (principal[y] ?? 0) +
      (y === 0 ? (p.subsidy ?? 0) : 0) + terminal;
    return { ...r, tax, netIncome, caf: netIncome + r.depreciation, economicFlow, equityFlow };
  });

  const breakEven = rows.slice(1).map((r) => {
    const marginRate = r.revenue === 0 ? 0 : (r.revenue - r.variableCosts) / r.revenue;
    return { year: r.year, revenue: marginRate <= 0 ? null : (r.fixedCosts + r.personnel + r.depreciation + r.interest) / marginRate };
  });

  const op = rows.slice(1);
  return {
    rows,
    economic: criteria(rows.map((r) => r.economicFlow), p.discountRate, n),
    financial: criteria(rows.map((r) => r.equityFlow), p.discountRate, n),
    residualValue: residual,
    breakEven,
    loans,
    economicImpact: {
      valueAdded: op.reduce((s, r) => s + r.revenue - r.variableCosts - r.fixedCosts, 0),
      wages: op.reduce((s, r) => s + r.personnel, 0),
      taxes: op.reduce((s, r) => s + r.tax, 0),
      jobs: p.jobs ?? 0,
    },
  };
}

// ---------------------------------------------------------------- Analyse de risque

export type RiskVariable = 'price' | 'volume' | 'variableCost' | 'fixedCost' | 'investment' | 'discountRate';
export const RISK_VARIABLES: RiskVariable[] = ['price', 'volume', 'variableCost', 'fixedCost', 'investment', 'discountRate'];

/** Applique des coefficients multiplicateurs (1 = inchangé) aux variables clés. */
export function applyMultipliers(p: ProjectInput, m: Partial<Record<RiskVariable, number>>): ProjectInput {
  const k = (v: RiskVariable) => m[v] ?? 1;
  return {
    ...p,
    discountRate: p.discountRate * k('discountRate'),
    investments: p.investments.map((i) => ({ ...i, amount: i.amount * k('investment') })),
    products: p.products.map((pr) => ({
      ...pr,
      price: pr.price * k('price'),
      volumes: pr.volumes.map((v) => v * k('volume')),
      unitVariableCost: pr.unitVariableCost * k('variableCost'),
    })),
    fixedCosts: p.fixedCosts.map((c) => c * k('fixedCost')),
    personnelCosts: p.personnelCosts.map((c) => c * k('fixedCost')),
  };
}

const ecoNpv = (p: ProjectInput) => evaluateProject(p).economic.npv;

/** Sensibilité de la VAN et valeur critique (variation qui annule la VAN). */
export function sensitivity(p: ProjectInput, deltas: number[] = [-0.2, -0.1, 0.1, 0.2], variables: RiskVariable[] = RISK_VARIABLES) {
  const baseNpv = ecoNpv(p);
  return variables.map((v) => {
    const points = deltas.map((d) => ({ delta: d, npv: ecoNpv(applyMultipliers(p, { [v]: 1 + d })) }));
    let critical: number | null = null;
    let lo = 0;
    let hi = 0;
    for (const target of [-0.999, 5]) {
      const f = ecoNpv(applyMultipliers(p, { [v]: 1 + target }));
      if (f * baseNpv <= 0) {
        lo = 0;
        hi = target;
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          const fm = ecoNpv(applyMultipliers(p, { [v]: 1 + mid }));
          if (fm * baseNpv > 0) lo = mid;
          else hi = mid;
        }
        critical = (lo + hi) / 2;
        break;
      }
    }
    return { variable: v, points, criticalChange: critical };
  });
}

export type Scenario = { name: string; probability?: number; multipliers: Partial<Record<RiskVariable, number>> };

export function scenarios(p: ProjectInput, list: Scenario[]) {
  const results = list.map((s) => {
    const r = evaluateProject(applyMultipliers(p, s.multipliers));
    return { name: s.name, probability: s.probability ?? null, npv: r.economic.npv, irr: r.economic.irr, financialNpv: r.financial.npv };
  });
  const totalP = list.reduce((s, x) => s + (x.probability ?? 0), 0);
  const expectedNpv = totalP > 0 ? results.reduce((s, r) => s + r.npv * (r.probability ?? 0), 0) / totalP : null;
  return { results, expectedNpv };
}

export type Distribution =
  | { type: 'uniform'; min: number; max: number }
  | { type: 'triangular'; min: number; mode: number; max: number }
  | { type: 'normal'; mean: number; sd: number };

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample(d: Distribution, rnd: () => number): number {
  if (d.type === 'uniform') return d.min + (d.max - d.min) * rnd();
  if (d.type === 'triangular') {
    const u = rnd();
    const c = (d.mode - d.min) / (d.max - d.min);
    return u < c
      ? d.min + Math.sqrt(u * (d.max - d.min) * (d.mode - d.min))
      : d.max - Math.sqrt((1 - u) * (d.max - d.min) * (d.max - d.mode));
  }
  // Box-Muller
  const u1 = Math.max(rnd(), 1e-12);
  const u2 = rnd();
  return d.mean + d.sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))] ?? 0;

/** Simulation de Monte-Carlo : les distributions portent sur les coefficients multiplicateurs. */
export function monteCarlo(
  p: ProjectInput,
  o: { iterations: number; seed?: number; distributions: Partial<Record<RiskVariable, Distribution>>; bins?: number },
) {
  if (o.iterations < 1 || o.iterations > 100000) throw new Error('ITERATIONS_HORS_LIMITES');
  const rnd = prng(o.seed ?? 42);
  const values: number[] = [];
  for (let i = 0; i < o.iterations; i++) {
    const m: Partial<Record<RiskVariable, number>> = {};
    for (const [k, d] of Object.entries(o.distributions)) if (d) m[k as RiskVariable] = sample(d, rnd);
    values.push(ecoNpv(applyMultipliers(p, m)));
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const bins = o.bins ?? 20;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const width = (max - min) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    const bin = histogram[idx];
    if (bin) bin.count++;
  }
  return {
    iterations: o.iterations,
    mean,
    sd,
    min,
    max,
    p5: quantile(sorted, 0.05),
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    probabilityNegative: values.filter((v) => v < 0).length / values.length,
    histogram,
  };
}

/** Classement de projets ou variantes. */
export function compareProjects(list: { name: string; input: ProjectInput }[]) {
  return list
    .map(({ name, input }) => {
      const r = evaluateProject(input);
      return { name, npv: r.economic.npv, irr: r.economic.irr, profitabilityIndex: r.economic.profitabilityIndex, equivalentAnnuity: r.economic.equivalentAnnuity, payback: r.economic.payback };
    })
    .sort((a, b) => b.npv - a.npv)
    .map((x, i) => ({ rank: i + 1, ...x }));
}
