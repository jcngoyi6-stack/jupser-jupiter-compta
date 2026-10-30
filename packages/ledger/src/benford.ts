/** Distribution attendue du premier chiffre (loi de Benford) — contrôle d'audit (docs/07). */
export const BENFORD_EXPECTED = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => Math.log10(1 + 1 / d));

export function firstDigit(v: bigint): number | null {
  const s = (v < 0n ? -v : v).toString().replace(/^0+/, '');
  return s ? Number(s[0]) : null;
}

/** Retourne la distribution observée et l'écart absolu moyen (MAD). MAD > 0,015 : non-conformité. */
export function benfordAnalysis(amounts: bigint[]) {
  const counts = new Array<number>(9).fill(0);
  let n = 0;
  for (const a of amounts) {
    const d = firstDigit(a);
    if (d) {
      counts[d - 1]!++;
      n++;
    }
  }
  const observed = counts.map((c) => (n ? c / n : 0));
  const mad = n ? observed.reduce((s, o, i) => s + Math.abs(o - BENFORD_EXPECTED[i]!), 0) / 9 : 0;
  return { n, observed, expected: BENFORD_EXPECTED, mad, conform: n >= 50 ? mad <= 0.015 : null };
}
