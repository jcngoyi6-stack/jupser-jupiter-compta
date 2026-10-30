/** Scénarios de restructuration sur 3 à 5 ans (docs/15 §4). */

export interface RestructuringBase {
  revenue: number;
  variableCostRate: number;
  fixedCosts: number;
  personnel: number;
  debt: number;
  interestRate: number;
  cash: number;
  annualDebtRepayment: number;
  taxRate: number;
  depreciation: number;
}

export interface Lever {
  kind: 'REDUCTION_COUTS' | 'REDUCTION_EFFECTIFS' | 'CESSION_ACTIF' | 'REECHELONNEMENT' | 'AUGMENTATION_CAPITAL' | 'CROISSANCE_CA' | 'ABANDON_CREANCES';
  /** Année d'effet (1 = première année). */
  year: number;
  /** Montant (cession, capital, abandon) ou taux (réductions, croissance). */
  value: number;
  /** Coût de mise en œuvre (indemnités…) l'année d'effet. */
  cost?: number;
  /** Pour REECHELONNEMENT : nouvelle durée de remboursement en années. */
  newTermYears?: number;
}

export function restructuringScenario(base: RestructuringBase, levers: Lever[], years: number) {
  const rows = [];
  let revenue = base.revenue;
  let fixed = base.fixedCosts;
  let personnel = base.personnel;
  let debt = base.debt;
  let repayment = base.annualDebtRepayment;
  let cash = base.cash;
  for (let y = 1; y <= years; y++) {
    let oneOff = 0;
    let inflow = 0;
    for (const l of levers.filter((x) => x.year === y)) {
      oneOff += l.cost ?? 0;
      switch (l.kind) {
        case 'REDUCTION_COUTS': fixed *= 1 - l.value; break;
        case 'REDUCTION_EFFECTIFS': personnel *= 1 - l.value; break;
        case 'CROISSANCE_CA': break;
        case 'CESSION_ACTIF': inflow += l.value; break;
        case 'AUGMENTATION_CAPITAL': inflow += l.value; break;
        case 'ABANDON_CREANCES': debt = Math.max(0, debt - l.value); break;
        case 'REECHELONNEMENT': repayment = debt / Math.max(1, l.newTermYears ?? 1); break;
      }
    }
    const growth = levers.filter((l) => l.kind === 'CROISSANCE_CA' && l.year <= y).reduce((s, l) => s + l.value, 0);
    if (y > 1 || growth) revenue = revenue * (1 + growth);
    const ebitda = revenue * (1 - base.variableCostRate) - fixed - personnel;
    const interest = debt * base.interestRate;
    const preTax = ebitda - base.depreciation - interest - oneOff;
    const tax = Math.max(0, preTax) * base.taxRate;
    const net = preTax - tax;
    const pay = Math.min(debt, repayment);
    debt -= pay;
    cash += net + base.depreciation + inflow - pay;
    rows.push({ year: y, revenue, ebitda, interest, oneOff, netIncome: net, debtRepayment: pay, debt, cash, debtToEbitda: ebitda > 0 ? debt / ebitda : null });
  }
  return { rows, viable: rows.every((r) => r.cash >= 0), minCash: Math.min(...rows.map((r) => r.cash)) };
}
