/** Taux décimal (« 0.15 ») appliqué sans flottant. */
export function applyRate(base: bigint, rate: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(rate);
  if (!m) throw new Error(`Taux invalide : ${rate}`);
  const ppm = BigInt(m[1]! + (m[2] ?? '').padEnd(6, '0'));
  const num = base * ppm;
  return (num + (num >= 0n ? 500_000n : -500_000n)) / 1_000_000n;
}
