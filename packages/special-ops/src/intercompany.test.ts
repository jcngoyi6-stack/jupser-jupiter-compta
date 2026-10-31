import { describe, expect, it } from 'vitest';
import { INTERCOMPANY_KINDS, intercompanyEliminations, intercompanyOperation } from './index';
import { unknownAccounts } from './testkit';

const lines = (e: { lines: { account: string; debit: bigint; credit: bigint }[] }) => e.lines.map((l) => [l.account, l.debit || -l.credit]);

describe('opérations intragroupe', () => {
  it('refacturation de prestations avec TVA : comptes groupe réciproques', () => {
    const r = intercompanyOperation({ kind: 'PRESTATION', amount: 1_000_000n, vatRate: 0.16, date: '2026-06-30', label: 'Frais de siège' });
    expect(lines(r.entries[0]!)).toEqual([['411200', 1_160_000n], ['706100', -1_000_000n], ['443100', -160_000n]]);
    expect(lines(r.counterpartEntries![0]!)).toEqual([['632800', 1_000_000n], ['445200', 160_000n], ['401200', -1_160_000n]]);
  });
  it('prêt intragroupe et dividende', () => {
    const p = intercompanyOperation({ kind: 'PRET', amount: 5n, date: 'x' });
    expect(lines(p.counterpartEntries![0]!)).toEqual([['521100', 5n], ['181100', -5n]]);
    expect(lines(intercompanyOperation({ kind: 'DIVIDENDE', amount: 7n, date: 'x' }).counterpartEntries![0]!)).toEqual([['521100', 7n], ['772100', -7n]]);
  });
  it('tous les types sont équilibrés sur des comptes imputables', () => {
    const all = INTERCOMPANY_KINDS.map((kind) => intercompanyOperation({ kind, amount: 100n, vatRate: 0.18, date: 'x' }));
    expect(unknownAccounts([...all, ...all.map((r) => ({ entries: r.counterpartEntries! }))])).toEqual([]);
  });
});

describe('retraitement de la marge intragroupe', () => {
  it('marge sur le stock restant chez l’acheteur, immobilisation, impôt différé', () => {
    const r = intercompanyEliminations({ taxRate: 0.3, lines: [
      { net: 1_000_000n, quantity: 100, cost: 600_000n, sellerAccount: '701100', buyerAccount: '601100', buyerStockAccount: '311100', remainingQuantity: 25 },
      { net: 5_000_000n, quantity: 1, cost: 4_000_000n, sellerAccount: '701100', buyerAccount: '241100' },
      { net: 200_000n, quantity: 1, sellerAccount: '706100', buyerAccount: '632800' },
      { net: 100n, quantity: 1, cost: 150n, sellerAccount: '701100', buyerAccount: '601100' },
      { net: 100n, quantity: 10, cost: 50n, sellerAccount: '701100', buyerAccount: '601100' },
    ] });
    expect(r.values).toMatchObject({ revenueEliminated: 6_200_200n, unrealisedMargin: 1_100_000n, deferredTaxAsset: 330_000n, netEffectOnResult: -770_000n });
    const l = r.entries[0]!.lines.map((x) => [x.account, x.debit || -x.credit]);
    expect(l).toContainEqual(['603100', 100_000n]);
    expect(l).toContainEqual(['311100', -100_000n]);
    expect(l).toContainEqual(['241100', -1_000_000n]);
    expect(intercompanyEliminations({ lines: [] }).entries).toEqual([]);
  });
});
