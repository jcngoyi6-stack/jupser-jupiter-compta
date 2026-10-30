/** Guide d'application — applications 106 à 112. */
import { describe, expect, it } from 'vitest';
import { branchEndowment, branchIntegration, branchTransfer, franchise, jointVentureAssetShare, jointVentureResult } from './index';
import { unknownAccounts } from './testkit';

const lines = (e: { lines: { account: string; debit: bigint; credit: bigint }[] }) => e.lines.map((l) => [l.account, l.debit || -l.credit]);
const K = 1_000n;
const M = 1_000_000n;

describe('applications 106 et 107 : société en participation', () => {
  const r = jointVentureResult({
    charges: [{ account: '601100', amount: 1_200n * K }, { account: '612000', amount: 220n * K }, { account: '616000', amount: 38n * K }, { account: '628100', amount: 74n * K }],
    products: [{ account: '701100', amount: 1_800n * K }], managerShare: 0.75, date: '2026-01-31',
  });
  it('résultat 268 : 201 pour le gérant, 67 pour l’associé', () => {
    expect(r.values).toMatchObject({ result: 268n * K, managerPart: 201n * K, partnerPart: 67n * K });
    expect(lines(r.entries[0]!).at(-1)).toEqual(['188000', -268n * K]);
    expect(lines(r.entries[1]!)).toEqual([['188000', 268n * K], ['752100', -201n * K], ['463100', -67n * K]]);
    expect(lines(r.counterpartEntries![0]!)).toEqual([['463100', 67n * K], ['752500', -67n * K]]);
  });
  it('perte partagée et quote-part d’immobilisation', () => {
    const l = jointVentureResult({ charges: [{ account: '601100', amount: 400n }], products: [{ account: '701100', amount: 0n }], managerShare: 0.75, date: 'x' });
    expect(lines(l.entries[1]!)).toEqual([['652100', 300n], ['463100', 100n], ['188000', -400n]]);
    expect(lines(l.counterpartEntries![0]!)).toEqual([['652500', 100n], ['463100', -100n]]);
    const a = jointVentureAssetShare({ amount: 16_000n * K, partnerShare: 0.25, date: '2026-01-07' });
    expect(lines(a.entries[0]!)).toEqual([['463100', 4_000n * K], ['182000', -4_000n * K]]);
    expect(lines(a.counterpartEntries![0]!)).toEqual([['277300', 4_000n * K], ['463100', -4_000n * K]]);
  });
});

describe('applications 108 à 111 : établissements et succursales', () => {
  it('flux siège / succursale en comptes de liaison', () => {
    const f = branchTransfer({ flow: 'FONDS', amount: 5n * M, date: '2026-06-25', hqTreasury: '571100', branchTreasury: '572100' });
    expect(lines(f.entries[0]!)).toEqual([['185000', 5n * M], ['571100', -5n * M]]);
    expect(lines(f.counterpartEntries![0]!)).toEqual([['572100', 5n * M], ['185000', -5n * M]]);
    expect(lines(branchTransfer({ flow: 'MARCHANDISES_SIEGE', amount: 27_200_000n, date: 'x' }).counterpartEntries![0]!)).toEqual([['186000', 27_200_000n], ['185000', -27_200_000n]]);
    expect(lines(branchTransfer({ flow: 'ACHAT_DIRECT', amount: 5n * M, date: 'x' }).entries[0]!)).toEqual([['185000', 5n * M], ['401100', -5n * M]]);
    expect(lines(branchTransfer({ flow: 'LIVRAISON_AU_SIEGE', amount: 6_800_000n, date: 'x' }).counterpartEntries![0]!)).toEqual([['185000', 6_800_000n], ['187000', -6_800_000n]]);
  });
  it('dotation de la succursale en compte 184 (135 M)', () => {
    const r = branchEndowment({
      assets: [{ account: '215000', amount: 24n * M }, { account: '223100', amount: 12n * M }, { account: '231300', amount: 72n * M }, { account: '244100', amount: 20n * M }, { account: '521100', amount: 7n * M }],
      hqFinancing: [{ account: '162000', amount: 67_500_000n }, { account: '521100', amount: 67_500_000n }], date: '2026-12-01',
    });
    expect(lines(r.entries[0]!)).toEqual([['184000', 135n * M], ['162000', -67_500_000n], ['521100', -67_500_000n]]);
    expect(lines(r.counterpartEntries![0]!).at(-1)).toEqual(['184000', -135n * M]);
  });
  it('intégration : résultat de la succursale 7,4 M, virement des soldes au 185', () => {
    const d = (account: string, v: bigint) => ({ account, debit: v, credit: 0n });
    const c = (account: string, v: bigint) => ({ account, debit: 0n, credit: v });
    const r = branchIntegration({ date: '2026-12-31', balances: [
      c('184000', 135n * M), c('185000', 44_300_000n), d('186000', 27_200_000n), c('187000', 6_800_000n), d('215000', 24n * M), d('223100', 12n * M), d('231300', 72n * M),
      d('244100', 20n * M), c('283100', 300_000n), c('284400', 200_000n), d('311100', 600_000n), d('521100', 32_500_000n), d('572100', 5_700_000n), d('601100', 21_400_000n),
      c('603100', 600_000n), d('622000', 1_400_000n), d('625000', 900_000n), d('641000', 800_000n), d('681300', 500_000n), c('701100', 31_800_000n),
    ] });
    expect(r.values).toMatchObject({ branchResult: 7_400_000n, branchResultWithLiaison: 7_400_000n - 27_200_000n + 6_800_000n });
    const closing = lines(r.counterpartEntries![0]!);
    expect(closing).toContainEqual(['184000', 135n * M]);
    expect(closing.at(-1)).toEqual(['185000', 44_300_000n]);
    const hq = lines(r.entries[0]!);
    expect(hq).toContainEqual(['184000', -135n * M]);
    expect(hq).toContainEqual(['187000', 27_200_000n]);
    expect(hq).toContainEqual(['186000', -6_800_000n]);
    expect(hq.at(-1)).toEqual(['185000', -44_300_000n]);
    expect(lines(branchIntegration({ balances: [{ account: '701100', debit: 0n, credit: 5n }], date: 'x' }).entries[0]!)).toEqual([['701100', -5n], ['185000', 5n]]);
  });
});

describe('application 112 : franchise', () => {
  it('droit d’entrée, redevance 10 M, amortissements prorata 4 791 667 et 3 833 333', () => {
    const r = franchise({ rightOfUse: 100n * M, fitOut: 40n * M, date: '2026-01-15', paymentDate: '2026-01-30', contractYears: 20, fitOutYears: 10, monthsInFirstYear: 11.5, royaltyRate: 0.05, revenue: 200n * M, closingDate: '2026-12-31' });
    expect(lines(r.entries[3]!)).toEqual([['634400', 10n * M], ['408100', -10n * M]]);
    expect(lines(r.entries[4]!)).toEqual([['681200', 4_791_667n], ['681300', 3_833_333n], ['281800', -4_791_667n], ['283500', -3_833_333n]]);
    expect(lines(r.counterpartEntries![2]!)).toEqual([['418100', 10n * M], ['706100', -10n * M]]);
    const s = franchise({ rightOfUse: 1n, date: 'x', contractYears: 1, monthsInFirstYear: 12, royaltyRate: 0, revenue: 0n, closingDate: 'x' });
    expect(s.entries).toHaveLength(3);
  });
  it('tous les comptes utilisés existent et sont imputables', () => {
    const all = [
      jointVentureResult({ charges: [{ account: '601100', amount: 1n }], products: [{ account: '701100', amount: 5n }], managerShare: 0.5, date: 'x' }),
      jointVentureResult({ charges: [{ account: '601100', amount: 5n }], products: [], managerShare: 0.5, date: 'x' }),
      jointVentureAssetShare({ amount: 4n, partnerShare: 0.5, date: 'x' }),
      ...(['FONDS', 'MARCHANDISES_SIEGE', 'ACHAT_DIRECT', 'LIVRAISON_AU_SIEGE'] as const).map((flow) => branchTransfer({ flow, amount: 1n, date: 'x' })),
      franchise({ rightOfUse: 10n, fitOut: 10n, date: 'x', paymentDate: 'x', contractYears: 1, fitOutYears: 1, monthsInFirstYear: 12, royaltyRate: 0.5, revenue: 10n, closingDate: 'x' }),
    ];
    expect(unknownAccounts([...all, ...all.map((r) => ({ entries: r.counterpartEntries ?? [] }))])).toEqual([]);
  });
});
