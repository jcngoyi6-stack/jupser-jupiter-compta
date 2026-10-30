/** Formats OHADA francophones : espace pour les milliers, virgule décimale, dates JJ/MM/AAAA. */
export const DECIMALS: Record<string, number> = { CDF: 2, USD: 2, EUR: 2, XOF: 0, XAF: 0, GNF: 0, KMF: 0 };

/** Montant en unités mineures (chaîne venant de l'API) → texte. Aucun calcul flottant. */
export function money(minor: string | number | bigint | null | undefined, decimals = 2, opts: { blankZero?: boolean } = {}): string {
  if (minor === null || minor === undefined || minor === '') return '';
  let v = BigInt(minor);
  if (opts.blankZero && v === 0n) return '';
  const neg = v < 0n;
  if (neg) v = -v;
  const s = v.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals) || '0';
  const frac = decimals ? ',' + s.slice(s.length - decimals) : '';
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + frac;
}

/** Saisie utilisateur (« 1 234,56 ») → unités mineures (bigint), ou null si invalide. */
export function parseMoney(input: string, decimals = 2): bigint | null {
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!s) return 0n;
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const frac = m[3] ?? '';
  if (frac.length > decimals && /[^0]/.test(frac.slice(decimals))) return null;
  const v = BigInt(m[2] + (frac + '0'.repeat(decimals)).slice(0, decimals));
  return m[1] ? -v : v;
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function bp(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return (v / 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
}
