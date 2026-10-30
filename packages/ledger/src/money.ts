/**
 * Montants : entiers de la plus petite unité (bigint), jamais de flottant (CLAUDE.md, invariant 5).
 */
export const CURRENCY_DECIMALS: Record<string, number> = {
  CDF: 2,
  USD: 2,
  EUR: 2,
  XOF: 0,
  XAF: 0,
  GNF: 0,
  KMF: 0,
};

export function decimalsOf(currency: string): number {
  const d = CURRENCY_DECIMALS[currency.toUpperCase()];
  if (d === undefined) throw new Error(`Devise inconnue : ${currency}`);
  return d;
}

/**
 * Convertit une chaîne décimale (« 1 234,56 », « 1234.56 », « -12 ») en unités mineures.
 * Refuse toute précision supérieure à celle de la devise (pas d'arrondi silencieux).
 */
export function parseAmount(input: string | number | bigint, decimals = 2): bigint {
  if (typeof input === 'bigint') return input * 10n ** BigInt(decimals);
  if (typeof input === 'number') {
    if (!Number.isInteger(input)) throw new Error('Montant flottant refusé : fournir une chaîne décimale');
    return BigInt(input) * 10n ** BigInt(decimals);
  }
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Montant invalide : « ${input} »`);
  const frac = m[3] ?? '';
  if (frac.length > decimals) {
    if (/[^0]/.test(frac.slice(decimals))) {
      throw new Error(`Précision excessive pour « ${input} » (${decimals} décimales max.)`);
    }
  }
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const v = BigInt(m[2]! + fracPadded);
  return m[1] ? -v : v;
}

/** Formate selon l'usage OHADA francophone : espace pour les milliers, virgule décimale. */
export function formatAmount(minor: bigint, decimals = 2): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const s = abs.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals) || '0';
  const frac = decimals > 0 ? s.slice(s.length - decimals) : '';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + grouped + (frac ? ',' + frac : '');
}

/** Conversion en chaîne décimale « machine » (point décimal), pour les API et exports. */
export function toDecimalString(minor: bigint, decimals = 2): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const s = abs.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = decimals > 0 ? '.' + s.slice(s.length - decimals) : '';
  return (neg ? '-' : '') + int + frac;
}

export function sum(values: Iterable<bigint>): bigint {
  let t = 0n;
  for (const v of values) t += v;
  return t;
}

/** Division entière arrondie au plus proche (demi vers l'infini), sur bigint. */
export function divRound(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error('Division par zéro');
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = (n * 2n + d) / (2n * d);
  return neg ? -q : q;
}
