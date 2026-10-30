import { applyRate, MissingRuleError, progressiveTax, RuleSet, RuleTrace, type Bracket, type TaxRule } from './index';

/**
 * Packs pays (docs/06) : règles de départ générées depuis data/pays_ohada_referentiel.json,
 * TOUTES au statut A_VALIDER. Une valeur non chiffrée dans le référentiel devient une règle à
 * valeur `null` : tout calcul qui en dépend échoue avec un message explicite (jamais de taux inventé).
 */
export interface CountryRef {
  code: string;
  nom: string;
  zone: string;
  devise: string;
  banque_centrale: string;
  source_cours: string;
  impot_societes: string;
  minimum_impot: string;
  tva: Record<string, number | string> | string;
  impot_salaires: string;
  cotisations_sociales: Record<string, number | string>;
  autres_prelevements_salaires: Record<string, number | string>;
  echeances_types: string;
  confiance: string;
  statut: string;
}

export interface Contribution {
  code: string;
  organisme: string;
  part: 'SALARIE' | 'EMPLOYEUR';
  taux: string | null; // décimal, null = à renseigner
  base: 'COTISABLE' | 'BRUT';
  note?: string;
}

/** Extrait un taux décimal d'un libellé (« 27,5 % » → "0.275") ; null si ambigu. */
export function parsePercent(text: string): string | null {
  const eq = /=\s*(\d+(?:[.,]\d+)?)\s*%/.exec(text);
  const all = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)];
  if (/à confirmer|selon/i.test(text) && !eq && all.length !== 1) return null;
  if (/\d\s*%\s*à\s*\d/.test(text)) return null; // fourchette « 25 % à 35 % »
  const m = eq ?? all[0];
  if (!m) return null;
  const v = m[1]!.replace(',', '.');
  const [i, f = ''] = v.split('.');
  // division exacte par 100 sur chaîne
  const digits = (i! + f).replace(/^0+(?=\d)/, '');
  const scale = f.length + 2;
  const padded = digits.padStart(scale + 1, '0');
  return (padded.slice(0, padded.length - scale) + '.' + padded.slice(padded.length - scale)).replace(/\.?0+$/, '') || '0';
}

function numToRate(v: number): string {
  // les taux du référentiel ont au plus 4 décimales
  return v.toFixed(6).replace(/\.?0+$/, '');
}

const ORGANISMES: Record<string, string> = {
  CNSS: 'CNSS', CNPS: 'CNPS', IPRES: 'IPRES', CSS: 'CSS', INPS: 'INPS', AMO: 'AMO', CNAMGS: 'CNAMGS', INSESO: 'INSESO', INSS: 'INSS',
};

export function contributionsOf(c: CountryRef): Contribution[] {
  const out: Contribution[] = [];
  const add = (key: string, val: number | string, employerTax: boolean) => {
    const part: Contribution['part'] = /salarie/i.test(key) ? 'SALARIE' : 'EMPLOYEUR';
    const organisme = Object.keys(ORGANISMES).find((o) => key.toUpperCase().startsWith(o)) ?? key.split('_')[0]!;
    const taux = typeof val === 'number' ? numToRate(val) : null;
    out.push({ code: key, organisme, part, taux, base: employerTax ? 'BRUT' : 'COTISABLE', ...(typeof val === 'string' ? { note: val } : {}) });
  };
  for (const [k, v] of Object.entries(c.cotisations_sociales ?? {})) add(k, v, false);
  for (const [k, v] of Object.entries(c.autres_prelevements_salaires ?? {})) {
    if (c.code === 'CD') continue; // RDC : INPP/ONEM gérés par le moteur de paie spécifique
    add(k, v, true);
  }
  return out;
}

export function countryPackRules(countries: CountryRef[], effectiveFrom = '2026-01-01'): TaxRule[] {
  const rules: TaxRule[] = [];
  for (const c of countries) {
    const base = { country: c.code, status: 'A_VALIDER' as const, effectiveFrom };
    const ref = `Référentiel JUPSER ${c.code} — à confirmer sur le CGI et la loi de finances en vigueur`;
    const todo = (what: string) => `TODO(fiscaliste) : ${what} non renseigné pour ${c.nom}`;
    const tva = typeof c.tva === 'object' ? c.tva : {};
    const normal = typeof tva.normal === 'number' ? numToRate(tva.normal) : null;
    const reduit = typeof tva.reduit === 'number' ? numToRate(tva.reduit) : null;
    rules.push({ ...base, tax: 'TVA', param: 'taux_normal', value: normal, legalRef: normal ? ref : todo('taux normal de TVA') });
    rules.push({ ...base, tax: 'TVA', param: 'taux_reduit', value: reduit, legalRef: reduit ? ref : todo('taux réduit de TVA') });
    rules.push({ ...base, tax: 'TVA', param: 'jour_echeance', value: 15, legalRef: `${ref} (« généralement le 15 du mois suivant »)` });
    const is = parsePercent(c.impot_societes);
    rules.push({ ...base, tax: 'IS', param: 'taux', value: is, legalRef: is ? `${ref} — « ${c.impot_societes} »` : todo("taux de l'impôt sur les sociétés") });
    const min = parsePercent(c.minimum_impot);
    rules.push({ ...base, tax: 'IS', param: 'minimum_taux_ca', value: min, legalRef: min ? ref : todo(`minimum d'imposition (« ${c.minimum_impot} »)`) });
    rules.push({ ...base, tax: 'SOCIAL', param: 'cotisations', value: contributionsOf(c), legalRef: ref });
    if (c.code !== 'CD') {
      rules.push({ ...base, tax: 'IMPOT_SALAIRES', param: 'libelle', value: c.impot_salaires, legalRef: ref });
      rules.push({ ...base, tax: 'IMPOT_SALAIRES', param: 'bareme_annuel', value: null, legalRef: todo(`barème de l'impôt sur salaires (${c.impot_salaires})`) });
      rules.push({ ...base, tax: 'IMPOT_SALAIRES', param: 'abattement_taux', value: '0', legalRef: todo('abattement forfaitaire éventuel') });
    }
  }
  return rules;
}

export class MissingValueError extends Error {
  constructor(public readonly rule: TaxRule) {
    super(`Paramètre non renseigné : ${rule.country}/${rule.tax}/${rule.param} — ${rule.legalRef}`);
  }
}

function req<T>(r: TaxRule<T | null>): T {
  if (r.value === null || r.value === undefined) throw new MissingValueError(r as TaxRule);
  return r.value;
}

export interface GenericPayInput {
  country: string;
  payDate: string;
  decimals: number;
  gross: bigint; // devise locale
  contributableBase: bigint;
  taxableBase: bigint;
}

/** Paie générique (16 pays hors RDC) : cotisations du pack + barème de l'impôt sur salaires. */
export function computeGenericPayslip(rules: RuleSet, i: GenericPayInput) {
  const t = new RuleTrace();
  const contribs = t.use(rules.find<Contribution[]>(i.country, 'SOCIAL', 'cotisations', i.payDate));
  const lines = contribs.map((c) => {
    if (c.taux === null) throw new MissingValueError({ country: i.country, tax: 'SOCIAL', param: c.code, value: null, effectiveFrom: i.payDate, status: 'A_VALIDER', legalRef: `TODO(fiscaliste) : ${c.note ?? 'taux à confirmer'}` });
    const base = c.base === 'BRUT' ? i.gross : i.contributableBase;
    return { ...c, baseAmount: base, amount: applyRate(base, c.taux) };
  });
  const employee = lines.filter((l) => l.part === 'SALARIE').reduce((s, l) => s + l.amount, 0n);
  const employer = lines.filter((l) => l.part === 'EMPLOYEUR').reduce((s, l) => s + l.amount, 0n);
  const bRule = rules.find<Bracket[] | null>(i.country, 'IMPOT_SALAIRES', 'bareme_annuel', i.payDate);
  t.use(bRule);
  const brackets = req(bRule);
  const abat = t.use(rules.find<string>(i.country, 'IMPOT_SALAIRES', 'abattement_taux', i.payDate));
  const taxable = i.taxableBase - applyRate(i.taxableBase, abat);
  const incomeTax = progressiveTax(taxable < 0n ? 0n : taxable, brackets, i.decimals, 12);
  return {
    gross: i.gross,
    contributions: lines,
    employeeContributions: employee,
    employerContributions: employer,
    incomeTax,
    net: i.gross - employee - incomeTax,
    totalCost: i.gross + employer,
    banner: t.banner,
  };
}

export { MissingRuleError };
