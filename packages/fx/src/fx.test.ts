import { balanceGap } from '@jupiter/ledger';
import { describe, expect, it } from 'vitest';
import { convert, convertXafThreshold, FIXED_PEGS, pickRate, rateToScaled, realizedDifference, revalue, type FxRate } from './index';

describe('conversion', () => {
  it('convertit sans flottant, arrondi au plus proche', () => {
    expect(convert(100_00n, '2850.5', 2, 2)).toBe(285_050_00n); // 100 USD → CDF
    expect(convert(1n, '0.005', 2, 2)).toBe(0n);
    expect(convert(1_000n, '655.957', 2, 0)).toBe(6_560n); // 10 EUR → XOF
    expect(convert(333n, '1,5', 0, 0)).toBe(500n);
    expect(rateToScaled('1')).toBe(10_000_000_000n);
    expect(() => rateToScaled('abc')).toThrow();
    expect(() => rateToScaled('0')).toThrow();
    expect(FIXED_PEGS.XOF!.rate).toBe('655.957');
  });
  it('choisit le cours applicable', () => {
    const rates: FxRate[] = [
      { currency: 'USD', quote: 'CDF', rate: '2800', date: '2026-03-01', source: 'BCC', type: 'OFFICIEL' },
      { currency: 'USD', quote: 'CDF', rate: '2810', date: '2026-03-10', source: 'Manuel', type: 'MANUEL' },
      { currency: 'USD', quote: 'CDF', rate: '2805', date: '2026-03-10', source: 'BCC', type: 'OFFICIEL' },
      { currency: 'USD', quote: 'CDF', rate: '2900', date: '2026-04-01', source: 'BCC', type: 'OFFICIEL' },
    ];
    expect(pickRate(rates, 'USD', 'CDF', '2026-03-15')!.rate).toBe('2805');
    expect(pickRate(rates, 'USD', 'CDF', '2026-02-01')).toBeNull();
  });
  it('convertit le seuil SMT FCFA en CDF', () => {
    // 30 000 000 FCFA = 45 734,705… EUR ; au cours 1 EUR = 3 300 CDF → 150 924 527,07 CDF
    expect(convertXafThreshold(30_000_000n, '3300', 2)).toBe(15_092_452_707n);
  });
});

/** Critère L1 : écart de change correct sur 10 cas. */
describe('écarts de change — 10 cas de référence', () => {
  const base = { account: '411100', thirdPartyId: 'C1', currency: 'USD', currencyDecimals: 2, foreignOutstanding: 1_000_00n };
  const cases = [
    { n: 1, kind: 'CREANCE' as const, booked: 2_800_000_00n, rate: '2750', diff: -50_000_00n, latent: 'PERTE', acc: '478100' },
    { n: 2, kind: 'CREANCE' as const, booked: 2_800_000_00n, rate: '2850', diff: 50_000_00n, latent: 'GAIN', acc: '479100' },
    { n: 3, kind: 'DETTE' as const, booked: 2_800_000_00n, rate: '2850', diff: 50_000_00n, latent: 'PERTE', acc: '478300' },
    { n: 4, kind: 'DETTE' as const, booked: 2_800_000_00n, rate: '2750', diff: -50_000_00n, latent: 'GAIN', acc: '479300' },
    { n: 5, kind: 'CREANCE' as const, booked: 2_800_000_00n, rate: '2800', diff: 0n, latent: 'NUL', acc: null },
  ];
  for (const c of cases) {
    it(`cas ${c.n} : ${c.kind} ${c.latent}`, () => {
      const r = revalue({ ...base, account: c.kind === 'DETTE' ? '401000' : '411100', kind: c.kind, bookedLocal: c.booked }, c.rate, 2);
      expect(r.difference).toBe(c.diff);
      expect(r.latent).toBe(c.latent);
      if (c.acc) {
        expect(r.lines.some((l) => l.account === c.acc)).toBe(true);
        expect(balanceGap(r.lines)).toBe(0n);
      } else expect(r.lines).toHaveLength(0);
      // prudence : gain latent jamais en résultat ; perte latente provisionnée
      expect(r.lines.some((l) => l.account.startsWith('7'))).toBe(false);
      if (c.latent === 'PERTE') expect(r.provisionLines.map((l) => l.account)).toEqual(['697100', '194000']);
      else expect(r.provisionLines).toHaveLength(0);
    });
  }
  it('cas 6 : créance financière en perte latente → 478200', () => {
    const r = revalue({ ...base, kind: 'CREANCE', financial: true, bookedLocal: 2_800_000_00n }, '2700', 2);
    expect(r.lines[0]!.account).toBe('478200');
  });
  it('cas 7 : dette financière en perte latente → 478400 ; créance financière en gain → 479200', () => {
    expect(revalue({ ...base, kind: 'DETTE', financial: true, bookedLocal: 1n }, '2700', 2).lines[0]!.account).toBe('478400');
    expect(revalue({ ...base, kind: 'CREANCE', financial: true, bookedLocal: 1n }, '2700', 2).lines[1]!.account).toBe('479200');
  });
  it('cas 8 : gain de change réalisé sur créance → 776', () => {
    const r = realizedDifference('CREANCE', 2_800_000_00n, 2_850_000_00n);
    expect(r).toEqual({ gainOrLoss: 'GAIN', line: { account: '776000', debit: 0n, credit: 50_000_00n } });
  });
  it('cas 9 : perte de change réalisée sur dette → 676', () => {
    const r = realizedDifference('DETTE', 2_800_000_00n, 2_850_000_00n);
    expect(r).toEqual({ gainOrLoss: 'PERTE', line: { account: '676000', debit: 50_000_00n, credit: 0n } });
  });
  it('cas 10 : règlement au cours historique → aucun écart', () => {
    expect(realizedDifference('DETTE', 10n, 10n)).toEqual({ gainOrLoss: 'NUL', line: null });
  });
});
