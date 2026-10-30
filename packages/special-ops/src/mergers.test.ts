/** Guide d'application — applications 116 à 120 (fusions et apport partiel d'actif). */
import { describe, expect, it } from 'vitest';
import { merger, mergerShareValues, partialContribution } from './index';
import { unknownAccounts } from './testkit';

const lines = (e: { lines: { account: string; debit: bigint; credit: bigint }[] }) => e.lines.map((l) => [l.account, l.debit || -l.credit]);
const M = 1_000_000n;

describe('application 116 : fusion simple', () => {
  const r = merger({
    date: '2026-06-30',
    absorbing: { shares: 10_000, nominal: 5_000n, netAssets: 90n * M, shareValue: 9_000n },
    absorbed: {
      shares: 6_000,
      assets: [
        { account: '211000', gross: 6n * M, accumulated: 3n * M },
        { account: '223200', gross: 30n * M, value: 37_500_000n },
        { account: '232300', gross: 60n * M, accumulated: 20n * M, accumulatedAccount: '283100', value: 50n * M },
        { account: '241100', gross: 20n * M, accumulated: 10_500_000n },
        { account: '311100', gross: 15n * M }, { account: '411100', gross: 5n * M }, { account: '521100', gross: 10n * M },
      ],
      liabilities: [{ account: '162000', amount: 40n * M }],
      equity: [{ account: '101300', amount: 60n * M }, { account: '118100', amount: 12_500_000n }],
    },
    costs: { fees: 15n * M, bankFees: M },
  });
  it('apport 90 M, parité 5 A pour 3 B, 10 000 titres, prime de fusion 40 M', () => {
    expect(r.values).toMatchObject({ valueB: 15_000n, contribution: 90n * M, issued: 10_000, capital: 50n * M, premium: 40n * M, mergerResult: 17_500_000n });
    expect(lines(r.entries[0]!)).toEqual([['461400', 90n * M], ['101300', -50n * M], ['105300', -40n * M]]);
    expect(lines(r.entries[1]!)).toContainEqual(['232300', 50n * M]);
    expect(lines(r.entries[2]!)).toEqual([['632400', 15n * M], ['631800', M], ['521100', -16n * M]]);
  });
  it('chez l’absorbée : résultat de fusion 17,5 M et désintéressement des associés', () => {
    const b = r.counterpartEntries!;
    expect(lines(b[0]!)).toContainEqual(['138100', -17_500_000n]);
    expect(lines(b[0]!)).toContainEqual(['283100', 20n * M]);
    expect(lines(b[2]!)).toEqual([['101300', 60n * M], ['118100', 12_500_000n], ['138100', 17_500_000n], ['461800', -90n * M]]);
    expect(lines(b[3]!)).toEqual([['461800', 90n * M], ['502300', -90n * M]]);
  });
  it('option : frais imputés sur la prime de fusion', () => {
    const o = merger({ date: 'x', absorbing: { shares: 1, nominal: 1n, netAssets: 1n, shareValue: 1n }, absorbed: { shares: 1, assets: [{ account: '521100', gross: 1n }], liabilities: [], equity: [{ account: '101300', amount: 1n }] }, costs: { fees: 5n, imputeOnPremium: true } });
    expect(lines(o.entries.at(-1)!)).toEqual([['105300', 5n], ['521100', -5n]]);
  });
});

describe('application 117 : participation de l’absorbante dans l’absorbée (fusion-renonciation)', () => {
  const r = merger({
    date: '2026-06-30',
    absorbing: { shares: 10_000, nominal: 10_000n, netAssets: 260n * M, holdsAbsorbedShares: 2_000, holdingCost: 10n * M, holdingAccount: '263000' },
    absorbed: {
      shares: 5_000,
      assets: [{ account: '241100', gross: 37n * M, value: 85n * M }, { account: '411100', gross: 18n * M }],
      liabilities: [{ account: '162000', amount: 3n * M }],
      equity: [{ account: '101300', amount: 50n * M }, { account: '118100', amount: 2n * M }],
    },
  });
  it('titre A 30 000, titre B 20 000 ; 2 000 titres émis ; prime 40 M + boni 30 M', () => {
    expect(r.values).toMatchObject({ valueA: 30_000n, valueB: 20_000n, issued: 2_000, capital: 20n * M, premium: 40n * M, boni: 30n * M, mergerResult: 48n * M });
    expect(lines(r.entries[0]!)).toEqual([['461400', 100n * M], ['101300', -20n * M], ['105300', -70n * M], ['263000', -10n * M]]);
    expect(lines(r.counterpartEntries![2]!)).toEqual([['101300', 50n * M], ['118100', 2n * M], ['138100', 48n * M], ['461800', -60n * M], ['471800', -40n * M]]);
  });
});

describe('application 118 : participation de l’absorbée dans l’absorbante', () => {
  const r = merger({
    date: '2026-06-30',
    absorbing: { shares: 10_000, nominal: 10_000n, netAssets: 120n * M },
    absorbed: {
      shares: 5_000, holdsAbsorbingShares: 2_000, holdingAccount: '263000',
      assets: [{ account: '241100', gross: 40n * M, value: 60n * M }, { account: '263000', gross: 5n * M }, { account: '411100', gross: 21n * M }],
      liabilities: [{ account: '162000', amount: 15n * M }],
      equity: [{ account: '101300', amount: 50n * M }, { account: '111000', amount: M }],
    },
  });
  it('titre A 12 000, titre B 18 000 ; 7 500 titres ; réduction de capital de 20 M, prime finale 11 M', () => {
    expect(r.values).toMatchObject({ valueA: 12_000n, valueB: 18_000n, contribution: 90n * M, issued: 7_500, capital: 75n * M, premium: 15n * M, mergerResult: 39n * M });
    expect(lines(r.entries[1]!)).toContainEqual(['502100', 24n * M]);
    expect(lines(r.entries[2]!)).toEqual([['101300', 20n * M], ['105300', 4n * M], ['502100', -24n * M]]);
  });
});

describe('application 119 : participations réciproques', () => {
  it('système à deux équations : A = 20 000, B = 30 000', () => {
    expect(mergerShareValues({ naA: 185n * M, naB: 140n * M, sharesA: 10_000, sharesB: 5_000, aHoldsB: 500, bHoldsA: 500 })).toEqual({ valueA: 20_000n, valueB: 30_000n });
  });
  it('apport 150 M, 6 750 titres émis, prime 67,5 M + boni 10 M, puis imputation de 5 M', () => {
    const r = merger({
      date: '2026-06-30',
      absorbing: { shares: 10_000, nominal: 10_000n, netAssets: 185n * M, holdsAbsorbedShares: 500, holdingCost: 5n * M, holdingAccount: '268000' },
      absorbed: {
        shares: 5_000, holdsAbsorbingShares: 500, holdingAccount: '268000',
        assets: [{ account: '241100', gross: 61n * M, value: 130n * M }, { account: '268000', gross: 9n * M }, { account: '411100', gross: 70n * M }],
        liabilities: [{ account: '162000', amount: 60n * M }],
        equity: [{ account: '101300', amount: 50n * M }, { account: '118100', amount: 30n * M }],
      },
    });
    expect(r.values).toMatchObject({ contribution: 150n * M, issued: 6_750, capital: 67_500_000n, premium: 67_500_000n, boni: 10n * M, mergerResult: 70n * M });
    expect(lines(r.entries[0]!)).toEqual([['461400', 150n * M], ['101300', -67_500_000n], ['105300', -77_500_000n], ['268000', -5n * M]]);
    expect(lines(r.entries[2]!)).toEqual([['101300', 5n * M], ['105300', 5n * M], ['502100', -10n * M]]);
  });
});

describe('application 120 : apport partiel d’actif', () => {
  it('apport net 123 M, 8 200 actions, prime d’apport 41 M', () => {
    const r = partialContribution({
      items: [{ account: '215000', amount: 25n * M }, { account: '241100', amount: 45n * M }, { account: '311100', amount: 36n * M }],
      liabilities: [{ account: '401100', amount: 12_820_000n }],
      doubtful: { gross: 7_200_000n, impairment: 5_760_000n, clientsGross: 35_580_000n },
      issuePrice: 15_000n, nominal: 10_000n, date: '2027-01-01',
    });
    expect(r.values).toMatchObject({ net: 123n * M, shares: 8_200n, capital: 82n * M, premium: 41n * M });
    expect(lines(r.entries[1]!)).toEqual([
      ['215000', 25n * M], ['241100', 45n * M], ['311100', 36n * M], ['411100', 28_380_000n], ['416200', 7_200_000n], ['491200', -5_760_000n], ['401100', -12_820_000n], ['461400', -123n * M],
    ]);
    expect(partialContribution({ items: [{ account: '241100', amount: 10n }], liabilities: [], issuePrice: 10n, nominal: 5n, date: 'x' }).values!.premium).toBe(5n);
  });
  it('tous les comptes utilisés existent et sont imputables', () => {
    const r = merger({
      date: 'x', absorbing: { shares: 10, nominal: 10n, netAssets: 100n, holdsAbsorbedShares: 1, holdingCost: 5n },
      absorbed: { shares: 10, holdsAbsorbingShares: 1, assets: [{ account: '241100', gross: 50n, accumulated: 10n, value: 60n }, { account: '263000', gross: 5n }], liabilities: [{ account: '162000', amount: 5n }], equity: [{ account: '101300', amount: 40n }] },
      costs: { fees: 1n, bankFees: 1n },
    });
    expect(unknownAccounts([r, { entries: r.counterpartEntries! }])).toEqual([]);
  });
});
