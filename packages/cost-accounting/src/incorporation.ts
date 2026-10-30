/**
 * Charges incorporables aux coûts et concordance des résultats (comptabilité générale → CAGE).
 * Charges incorporables = charges de la comptabilité générale − charges non incorporables
 *                         + charges supplétives ± différences sur charges calculées.
 * Montants en unités monétaires (nombres) : la CAGE n'est ni normalisée ni obligatoire (AUDCIF) ;
 * les montants restent rapprochés de la comptabilité générale par la concordance.
 */

export interface GlBalance { account: string; label?: string; amount: number }

export type ChargeTreatment = 'INCORPORABLE' | 'NON_INCORPORABLE';

/**
 * Charges non incorporables par défaut (à ajuster par l'entité) : charges HAO (81, 83, 85),
 * participation des travailleurs (87), impôts sur le résultat (89), dotations HAO (85).
 * Pénalités, dons et pertes exceptionnelles se règlent compte par compte (`overrides`).
 */
export const DEFAULT_NON_INCORPORABLE_PREFIXES = ['81', '83', '85', '87', '89'];
/** Produits non retenus en CAGE par défaut : produits HAO (82, 84, 86, 88). */
export const DEFAULT_NON_INCORPORATED_PRODUCT_PREFIXES = ['82', '84', '86', '88'];

export interface IncorporationRules {
  nonIncorporablePrefixes?: string[];
  /** Traitement explicite d'un compte (prioritaire sur les préfixes). */
  overrides?: Record<string, ChargeTreatment>;
  /** Montants non incorporables partiels (ex. rappel de salaire d'une période antérieure). */
  partialExclusions?: { account: string; amount: number; reason: string }[];
}

export interface SupplementaryCharge { label: string; amount: number }

/** Rémunération des capitaux propres sur une fraction d'année (charge supplétive). */
export function equityRemuneration(equity: number, annualRate: number, months: number): number {
  return (equity * annualRate * months) / 12;
}

/** Charge calculée : montant comptable remplacé par un montant économique (différence d'incorporation). */
export interface CalculatedCharge { label: string; account?: string; accounting: number; economic: number }

export interface IncorporationResult {
  generalCharges: number;
  nonIncorporable: { account: string; label?: string; amount: number; reason: string }[];
  nonIncorporableTotal: number;
  supplementary: SupplementaryCharge[];
  supplementaryTotal: number;
  calculated: (CalculatedCharge & { difference: number })[];
  /** Somme (économique − comptable) : positif = charges ajoutées aux coûts. */
  calculatedDifference: number;
  incorporable: number;
  /** Charges incorporables par compte, après exclusions (avant charges supplétives). */
  byAccount: { account: string; label?: string; amount: number }[];
}

const startsWithAny = (a: string, ps: string[]) => ps.some((p) => a.startsWith(p));

export function incorporableCharges(charges: GlBalance[], rules: IncorporationRules = {}, supplementary: SupplementaryCharge[] = [], calculated: CalculatedCharge[] = []): IncorporationResult {
  const prefixes = rules.nonIncorporablePrefixes ?? DEFAULT_NON_INCORPORABLE_PREFIXES;
  const nonInc: IncorporationResult['nonIncorporable'] = [];
  const byAccount: IncorporationResult['byAccount'] = [];
  for (const c of charges) {
    const o = rules.overrides?.[c.account];
    const excluded = o ? o === 'NON_INCORPORABLE' : startsWithAny(c.account, prefixes);
    if (excluded) {
      nonInc.push({ account: c.account, label: c.label, amount: c.amount, reason: o ? 'Choix de l’entité' : 'Charge hors activités ordinaires ou impôt sur le résultat' });
      continue;
    }
    let amount = c.amount;
    for (const p of (rules.partialExclusions ?? []).filter((x) => x.account === c.account)) {
      amount -= p.amount;
      nonInc.push({ account: c.account, label: c.label, amount: p.amount, reason: p.reason });
    }
    byAccount.push({ account: c.account, label: c.label, amount });
  }
  const calc = calculated.map((k) => ({ ...k, difference: k.economic - k.accounting }));
  const generalCharges = charges.reduce((s, c) => s + c.amount, 0);
  const nonIncorporableTotal = nonInc.reduce((s, c) => s + c.amount, 0);
  const supplementaryTotal = supplementary.reduce((s, c) => s + c.amount, 0);
  const calculatedDifference = calc.reduce((s, c) => s + c.difference, 0);
  return {
    generalCharges, nonIncorporable: nonInc, nonIncorporableTotal, supplementary, supplementaryTotal, calculated: calc, calculatedDifference,
    incorporable: generalCharges - nonIncorporableTotal + supplementaryTotal + calculatedDifference, byAccount,
  };
}

export interface ReconciliationItem { label: string; amount: number; account97?: string }

/**
 * Concordance : résultat de la comptabilité générale reconstitué depuis le résultat analytique.
 * R(CG) = R(CAGE) + charges supplétives − charges non incorporables + produits non incorporés
 *         + différences sur charges calculées (économique − comptable : la CAGE a supporté plus de charges)
 *         − coût de sous-activité (+ boni de suractivité)
 *         − charges incorporables non imputées aux coûts
 *         + écart de variation des stocks (comptabilité générale − CAGE)
 *         + différences d'inventaire (stock réel − stock théorique, lorsque la CG retient le stock réel).
 */
export function reconcile(p: {
  analyticResult: number;
  supplementary: number;
  nonIncorporableCharges: number;
  nonIncorporatedProducts: number;
  calculatedDifference: number;
  rationalImputationDifference?: number;
  nonImputedCharges?: number;
  stockVariationDifference?: number;
  inventoryDifference?: number;
  generalLedgerResult?: number;
}) {
  const items: ReconciliationItem[] = [
    { label: 'Résultat analytique', amount: p.analyticResult },
    { label: '+ Charges supplétives', amount: p.supplementary, account97: '972000' },
    { label: '− Charges non incorporables', amount: -p.nonIncorporableCharges, account97: '971000' },
    { label: '+ Produits non incorporés', amount: p.nonIncorporatedProducts, account97: '976000' },
    { label: '+ Différences sur charges calculées', amount: p.calculatedDifference, account97: '973000' },
    { label: '− Coût de sous-activité (+ boni de suractivité)', amount: -(p.rationalImputationDifference ?? 0), account97: '974000' },
    { label: '− Charges incorporables non imputées aux coûts', amount: -(p.nonImputedCharges ?? 0), account97: '977000' },
    { label: '± Écart de variation des stocks (CG − CAGE)', amount: p.stockVariationDifference ?? 0, account97: '978000' },
    { label: '± Différences d’inventaire', amount: p.inventoryDifference ?? 0, account97: '975000' },
  ];
  const computed = items.reduce((s, i) => s + i.amount, 0);
  const gap = p.generalLedgerResult === undefined ? null : p.generalLedgerResult - computed;
  return { items, computedGeneralResult: computed, generalLedgerResult: p.generalLedgerResult ?? null, gap, reconciled: gap === null ? null : Math.abs(gap) < 0.5 };
}
