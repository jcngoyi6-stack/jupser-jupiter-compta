/**
 * Plan de comptes SYSCOHADA révisé — numéros sur 6 chiffres (CLAUDE.md, invariant 4).
 */
export type AccountNature = 'bilan' | 'gestion' | 'hao' | 'analytique' | 'engagement';

export interface ChartAccount {
  number: string; // 6 chiffres
  official: string; // numéro officiel (2 à 4 chiffres)
  label: string;
  level: number;
  imputable: boolean;
  class: number;
  parent: string | null;
  nature: string;
}

export function normalizeAccountNumber(n: string): string {
  const s = n.replace(/\s/g, '');
  if (!/^\d{1,6}$/.test(s)) throw new Error(`Numéro de compte invalide : ${n}`);
  return s.padEnd(6, '0');
}

export function isValidAccountNumber(n: string): boolean {
  return /^[1-9]\d{5}$/.test(n);
}

export function accountClass(n: string): number {
  return Number(n[0]);
}

/** Sens normal du solde (indicatif) — sert aux contrôles de soldes anormaux. */
export function normalSide(n: string): 'D' | 'C' | 'DC' {
  const c = accountClass(n);
  if (c === 2 || c === 3 || c === 6) {
    // 28x/29x/39x : amortissements et dépréciations (créditeurs)
    if (n.startsWith('28') || n.startsWith('29') || n.startsWith('39')) return 'C';
    if (n.startsWith('603')) return 'DC';
    return 'D';
  }
  if (c === 1 || c === 7) {
    if (n.startsWith('109') || n.startsWith('129') || n.startsWith('139') || n.startsWith('1309')) return 'D';
    if (n.startsWith('12') || n.startsWith('13')) return 'DC';
    if (n.startsWith('73')) return 'DC';
    return 'C';
  }
  if (c === 5) {
    if (n.startsWith('59') || n.startsWith('56')) return 'C';
    if (n.startsWith('57')) return 'D';
    return 'DC';
  }
  if (c === 8) {
    // 81, 83, 85, 87, 89 : charges HAO ; 82, 84, 86, 88 : produits HAO
    return Number(n[1]) % 2 === 1 ? 'D' : 'C';
  }
  return 'DC';
}

/** Comptes collectifs exigeant un tiers (fournisseurs, clients, personnel). */
export const DEFAULT_COLLECTIVE_PREFIXES = ['40', '41', '42'];

export function isCollective(n: string, prefixes = DEFAULT_COLLECTIVE_PREFIXES): boolean {
  return prefixes.some((p) => n.startsWith(p));
}

export function parseChartCsv(csv: string): ChartAccount[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: ChartAccount[] = [];
  for (const line of lines.slice(1)) {
    const [compte6, officiel, intitule, niveau, , imputable, classe, , parent, nature] = line.split(';');
    if (!compte6) continue; // rubriques à 2 chiffres : non imputables, sans numéro à 6 chiffres
    out.push({
      number: compte6,
      official: officiel ?? '',
      label: intitule ?? '',
      level: Number(niveau),
      imputable: imputable === 'oui',
      class: Number(classe),
      parent: parent || null,
      nature: nature ?? '',
    });
  }
  return out;
}

/** Rubriques à 2 chiffres (non imputables) du plan, utilisées pour l'arborescence. */
export function parseChartHeadings(csv: string): { official: string; label: string; class: number }[] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(';'))
    .filter((c) => c[0] === '' && c[1])
    .map((c) => ({ official: c[1]!, label: c[2] ?? '', class: Number(c[6]) }));
}

/**
 * Contrôle de création d'un sous-compte (docs/14 §3) : rattaché à un compte officiel existant,
 * même préfixe, même classe ; numéro libre.
 */
export function validateSubAccount(
  number: string,
  parentNumber: string,
  existing: ReadonlyMap<string, { official: string; class: number }>,
): string[] {
  const errors: string[] = [];
  if (!isValidAccountNumber(number)) errors.push('Le numéro doit comporter exactement 6 chiffres.');
  const parent = existing.get(parentNumber);
  if (!parent) {
    errors.push(`Compte parent ${parentNumber} inexistant dans le plan.`);
    return errors;
  }
  if (!number.startsWith(parent.official)) {
    errors.push(`Le sous-compte doit commencer par le numéro officiel du parent (${parent.official}).`);
  }
  if (accountClass(number) !== parent.class) errors.push('Le sous-compte doit rester dans la classe du parent.');
  if (existing.has(number)) errors.push(`Le compte ${number} existe déjà.`);
  return errors;
}

/** Compte officiel le plus long (préfixe) auquel un compte est rattaché. */
export function officialAncestor(
  number: string,
  officialNumbers: ReadonlySet<string>,
): string | null {
  for (let len = 4; len >= 2; len--) {
    const p = number.slice(0, len);
    if (officialNumbers.has(p)) return p;
  }
  return null;
}
