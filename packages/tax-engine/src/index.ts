import { divRound } from '@jupiter/ledger';

/**
 * Moteur fiscal paramétrable : aucun taux codé en dur (CLAUDE.md). Tout paramètre provient d'une
 * `TaxRule` versionnée (pays, date d'effet, statut, référence légale).
 */
export type RuleStatus = 'A_VALIDER' | 'VALIDE';

export interface TaxRule<T = unknown> {
  country: string;
  tax: string; // ex. TVA, IS, IRPP_SALAIRES, CNSS…
  param: string; // ex. taux_normal, bareme_annuel…
  value: T;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: RuleStatus;
  legalRef: string;
}

export const ESTIMATION_BANNER = 'Estimation — règle non validée';

export class MissingRuleError extends Error {
  constructor(public readonly key: string) {
    super(`Règle fiscale absente : ${key} — TODO(fiscaliste) : créer la règle (statut A_VALIDER).`);
  }
}

/** Taux exprimé en chaîne décimale (« 0.16 ») → points par million (entier). */
export function rateToPpm(rate: string | number): bigint {
  const s = String(rate);
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) throw new Error(`Taux invalide : ${rate}`);
  return BigInt(m[1]! + (m[2] ?? '').padEnd(6, '0'));
}

export function applyRate(base: bigint, rate: string | number): bigint {
  return divRound(base * rateToPpm(rate), 1_000_000n);
}

export class RuleSet {
  constructor(private readonly rules: TaxRule[]) {}

  /** Règle applicable à une date (date d'effet la plus récente ≤ date). */
  find<T>(country: string, tax: string, param: string, date: string): TaxRule<T> {
    const r = this.rules
      .filter(
        (x) =>
          x.country === country &&
          x.tax === tax &&
          x.param === param &&
          x.effectiveFrom <= date &&
          (!x.effectiveTo || x.effectiveTo >= date),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    if (!r) throw new MissingRuleError(`${country}/${tax}/${param}@${date}`);
    return r as TaxRule<T>;
  }

  tryFind<T>(country: string, tax: string, param: string, date: string): TaxRule<T> | null {
    try {
      return this.find<T>(country, tax, param, date);
    } catch {
      return null;
    }
  }
}

/** Trace des règles utilisées par un calcul : si l'une est A_VALIDER, le bandeau d'estimation s'affiche. */
export class RuleTrace {
  readonly used: TaxRule[] = [];
  use<T>(r: TaxRule<T>): T {
    this.used.push(r as TaxRule);
    return r.value;
  }
  get estimation(): boolean {
    return this.used.some((r) => r.status !== 'VALIDE');
  }
  get banner(): string | null {
    return this.estimation ? ESTIMATION_BANNER : null;
  }
}

export interface Bracket {
  de: number;
  a: number | null;
  taux: number;
}

/**
 * Barème progressif. Les bornes sont exprimées en unités de la monnaie (sans décimales) ;
 * `divisor` permet d'appliquer un barème annuel en paie mensuelle (÷ 12).
 * Le calcul est effectué en unités mineures × divisor pour rester exact.
 */
export function progressiveTax(baseMinor: bigint, brackets: Bracket[], decimals: number, divisor = 1): bigint {
  const unit = 10n ** BigInt(decimals);
  const d = BigInt(divisor);
  const scaledBase = baseMinor * d; // comparer base × divisor aux bornes annuelles
  let taxScaled = 0n;
  for (const b of brackets) {
    const lo = BigInt(b.de) * unit;
    const hi = b.a === null ? null : BigInt(b.a) * unit;
    if (scaledBase <= lo) break;
    const top = hi === null || scaledBase < hi ? scaledBase : hi;
    taxScaled += (top - lo) * rateToPpm(b.taux);
  }
  return divRound(taxScaled, 1_000_000n * d);
}

export interface VatReturnInput {
  collected: bigint; // TVA facturée (443x) de la période
  deductible: bigint; // TVA récupérable (445x) de la période
  previousCredit: bigint; // crédit reporté (4449)
}

export function vatReturn(i: VatReturnInput) {
  const net = i.collected - i.deductible - i.previousCredit;
  return {
    ...i,
    due: net > 0n ? net : 0n,
    creditToCarry: net < 0n ? -net : 0n,
  };
}

/** Écriture de liquidation de TVA (443x / 445x / 4441 / 4449). */
export function vatSettlementLines(i: VatReturnInput) {
  const r = vatReturn(i);
  const lines: { account: string; debit: bigint; credit: bigint }[] = [];
  if (i.collected) lines.push({ account: '443100', debit: i.collected, credit: 0n });
  if (i.deductible) lines.push({ account: '445200', debit: 0n, credit: i.deductible });
  if (i.previousCredit) lines.push({ account: '444900', debit: 0n, credit: i.previousCredit });
  if (r.due) lines.push({ account: '444100', debit: 0n, credit: r.due });
  if (r.creditToCarry) lines.push({ account: '444900', debit: r.creditToCarry, credit: 0n });
  return lines;
}

/** TVA d'une opération : HT → TVA → TTC. */
export function vatFromNet(netMinor: bigint, rate: string | number) {
  const vat = applyRate(netMinor, rate);
  return { net: netMinor, vat, gross: netMinor + vat };
}

/** Décomposition d'un TTC (arrondi sur la TVA, HT = TTC – TVA). */
export function vatFromGross(grossMinor: bigint, rate: string | number) {
  const ppm = rateToPpm(rate);
  const net = divRound(grossMinor * 1_000_000n, 1_000_000n + ppm);
  return { net, vat: grossMinor - net, gross: grossMinor };
}

export interface CorporateTaxInput {
  country: string;
  date: string;
  taxableProfit: bigint; // résultat fiscal
  turnover: bigint; // chiffre d'affaires
}

/**
 * Impôt sur le résultat : max(IS au taux × résultat fiscal, minimum en % du CA).
 * Paramètres lus dans les règles IS/taux et IS/minimum_taux_ca.
 */
export function corporateTax(rules: RuleSet, i: CorporateTaxInput) {
  const trace = new RuleTrace();
  const rate = trace.use(rules.find<string>(i.country, 'IS', 'taux', i.date));
  const minRate = trace.use(rules.find<string>(i.country, 'IS', 'minimum_taux_ca', i.date));
  const is = i.taxableProfit > 0n ? applyRate(i.taxableProfit, rate) : 0n;
  const minimum = applyRate(i.turnover, minRate);
  const due = is >= minimum ? is : minimum;
  return {
    is,
    minimum,
    due,
    basis: is >= minimum ? ('IS' as const) : ('MINIMUM' as const),
    account: is >= minimum ? '891100' : '895000',
    banner: trace.banner,
    rulesUsed: trace.used,
  };
}

export interface CalendarEvent {
  tax: string;
  period: string;
  dueDate: string;
  label: string;
}

/** Échéances mensuelles (ex. le 15 du mois suivant), à partir d'une règle « jour d'échéance ». */
export function monthlyDeadlines(tax: string, year: number, dueDay: number, label: string): CalendarEvent[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const ny = m === 12 ? year + 1 : year;
    const nm = m === 12 ? 1 : m + 1;
    return {
      tax,
      period: `${year}-${String(m).padStart(2, '0')}`,
      dueDate: `${ny}-${String(nm).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
      label: `${label} — ${String(m).padStart(2, '0')}/${year}`,
    };
  });
}

/** Seuils SMT (art. 13 AUDCIF) en FCFA, selon l'activité. */
export const SMT_THRESHOLDS_XAF: Record<'NEGOCE' | 'ARTISANAT' | 'SERVICES', bigint> = {
  NEGOCE: 60_000_000n,
  ARTISANAT: 40_000_000n,
  SERVICES: 30_000_000n,
};

export function smtEligible(turnoverLocal: bigint, thresholdLocal: bigint): boolean {
  return turnoverLocal < thresholdLocal;
}

/** Règles de départ RDC issues de data/ (statut A_VALIDER tant qu'un fiscaliste ne les a pas validées). */
export function rdcSeedRules(): TaxRule[] {
  const base = { country: 'CD', status: 'A_VALIDER' as const, effectiveFrom: '2026-01-01' };
  const lir = 'Loi n°23/053 du 30/11/2023 (IS et IRPP) ; LF n°25/060 du 29/12/2025';
  return [
    { ...base, tax: 'TVA', param: 'taux_normal', value: '0.16', legalRef: 'Code de la TVA (RDC)' },
    { ...base, tax: 'TVA', param: 'taux_reduit', value: '0.08', legalRef: 'Code de la TVA (RDC)' },
    { ...base, tax: 'TVA', param: 'jour_echeance', value: 15, legalRef: 'À confirmer (fiscaliste)' },
    { ...base, tax: 'IS', param: 'taux', value: '0.30', legalRef: lir },
    { ...base, tax: 'IS', param: 'minimum_taux_ca', value: '0.01', legalRef: lir },
    {
      ...base,
      tax: 'IRPP_SALAIRES',
      param: 'bareme_annuel',
      value: [
        { de: 0, a: 1944000, taux: 0.03 },
        { de: 1944000, a: 21600000, taux: 0.15 },
        { de: 21600000, a: 43200000, taux: 0.3 },
        { de: 43200000, a: null, taux: 0.4 },
      ],
      legalRef: lir,
    },
    { ...base, tax: 'IRPP_SALAIRES', param: 'minimum_mensuel', value: 2000, legalRef: lir },
    { ...base, tax: 'IRPP_SALAIRES', param: 'plafond_taux_revenu', value: '0.30', legalRef: lir },
    { ...base, tax: 'IRPP_SALAIRES', param: 'reduction_par_personne', value: '0.02', legalRef: lir },
    { ...base, tax: 'IRPP_SALAIRES', param: 'max_personnes', value: 9, legalRef: lir },
    { ...base, tax: 'IRPP_SALAIRES', param: 'cnss_deductible', value: false, legalRef: 'TODO(fiscaliste) : sources divergentes' },
    { ...base, tax: 'CNSS', param: 'salarie', value: '0.05', legalRef: 'Décret 18/041 du 24/11/2018' },
    { ...base, tax: 'CNSS', param: 'employeur_pensions', value: '0.05', legalRef: 'Décret 18/041 du 24/11/2018' },
    { ...base, tax: 'CNSS', param: 'employeur_risques_pro', value: '0.015', legalRef: 'Décret 18/041 du 24/11/2018' },
    { ...base, tax: 'CNSS', param: 'employeur_prestations_familiales', value: '0.065', legalRef: 'Décret 18/041 du 24/11/2018' },
    {
      ...base,
      tax: 'INPP',
      param: 'taux_par_effectif',
      value: [
        { max: 50, taux: '0.03' },
        { max: 300, taux: '0.02' },
        { max: null, taux: '0.01' },
      ],
      legalRef: 'TODO(fiscaliste) : deux grilles en circulation (3/2/1 % ou 3,5/3/2 %)',
    },
    { ...base, tax: 'ONEM', param: 'employeur', value: '0.002', legalRef: 'À confirmer (fiscaliste)' },
    { ...base, tax: 'SMIG', param: 'journalier_cdf', value: null, legalRef: 'Décret n°25/22 du 30/05/2025 — TODO(fiscaliste) : montant' },
  ];
}

export * from './packs';
