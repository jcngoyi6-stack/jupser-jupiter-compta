/**
 * Socle des opérations spécifiques : chaque opération renvoie des écritures datées (comptes du plan
 * SYSCOHADA révisé à 6 chiffres), équilibrées, à proposer en brouillon — jamais validées sans un humain.
 * Montants en unités mineures (bigint) ; les taux sont des nombres (ex. 0.08), arrondis à l'unité mineure.
 */
export interface OpLine { account: string; debit: bigint; credit: bigint; label?: string; thirdPartyId?: string | null }
export interface OpEntry { date?: string; label: string; lines: OpLine[] }
export interface OpResult<S = unknown> { entries: OpEntry[]; schedule?: S[]; notes?: string[]; values?: Record<string, bigint | number | string | null> }

export const D = (account: string, amount: bigint, label?: string): OpLine => ({ account, debit: amount, credit: 0n, ...(label ? { label } : {}) });
export const C = (account: string, amount: bigint, label?: string): OpLine => ({ account, debit: 0n, credit: amount, ...(label ? { label } : {}) });

/** Écriture équilibrée ; les lignes nulles sont retirées, les montants négatifs inversés. */
export function entry(label: string, lines: OpLine[], date?: string): OpEntry {
  const clean = lines
    .map((l) => (l.debit < 0n || l.credit < 0n ? { ...l, debit: l.credit < 0n ? -l.credit : 0n, credit: l.debit < 0n ? -l.debit : 0n } : l))
    .map((l) => (l.debit > 0n && l.credit > 0n ? { ...l, debit: l.debit > l.credit ? l.debit - l.credit : 0n, credit: l.credit > l.debit ? l.credit - l.debit : 0n } : l))
    .filter((l) => l.debit !== 0n || l.credit !== 0n);
  const d = clean.reduce((s, l) => s + l.debit, 0n);
  const c = clean.reduce((s, l) => s + l.credit, 0n);
  if (d !== c) throw new Error(`ECRITURE_DESEQUILIBREE:${label}:${d}≠${c}`);
  return { label, lines: clean, ...(date ? { date } : {}) };
}

export const pct = (amount: bigint, rate: number): bigint => BigInt(Math.round(Number(amount) * rate));
export const ratio = (amount: bigint, num: bigint, den: bigint): bigint => (den === 0n ? 0n : (amount * num * 2n + den) / (2n * den));

/** Résolution d'un taux par dichotomie : f(taux) croissant ou décroissant, racine dans [lo ; hi]. */
export function solveRate(f: (r: number) => number, lo = -0.99, hi = 5): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.abs(fm) < 1e-9 || b - a < 1e-12) return m;
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

export function addMonthsISO(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
