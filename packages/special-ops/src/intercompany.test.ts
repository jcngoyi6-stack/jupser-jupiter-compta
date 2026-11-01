import { describe, expect, it } from 'vitest';
import { days360, INTERCOMPANY_KINDS, intercompanyEliminations, intercompanyOperation } from './index';
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
    expect(r.values).toMatchObject({ revenueEliminated: 6_200_200n, unrealisedMargin: 1_100_000n, deferredTaxAsset: 330_000n, resultEffectBeforeTax: -1_100_000n });
    const l = r.entries[0]!.lines.map((x) => [x.account, x.debit || -x.credit]);
    expect(l).toContainEqual(['603100', 100_000n]);
    expect(l).toContainEqual(['311100', -100_000n]);
    expect(l).toContainEqual(['241100', -1_000_000n]);
    expect(l).toContainEqual(['IDA', 330_000n]);
    expect(l).toContainEqual(['891100', -330_000n]);
    expect(r.values!.resultEffectAfterTax).toBe(-770_000n);
    expect(intercompanyEliminations({ lines: [] }).entries).toEqual([]);
  });
});

describe('stock d’ouverture et immobilisations cédées entre sociétés du groupe', () => {
  const period = { start: '2027-01-01', end: '2027-12-31' };
  const r = intercompanyEliminations({ taxRate: 0.3, period, lines: [
    // facture N-1 : 100 unités, 50 en stock à l'ouverture, 10 à la clôture
    { invoiceDate: '2026-10-01', net: 1_000_000n, quantity: 100, cost: 600_000n, sellerAccount: '701100', buyerAccount: '601100', openingRemainingQuantity: 50, remainingQuantity: 10 },
    // matériel cédé le 01/07 N-1, marge 1 200 000, 5 ans
    { invoiceDate: '2026-07-01', net: 5_200_000n, quantity: 1, cost: 4_000_000n, sellerAccount: '701100', buyerAccount: '241100', usefulLifeYears: 5 },
    // matériel cédé le 01/04 N, marge 600 000, 10 ans
    { invoiceDate: '2027-04-01', net: 2_600_000n, quantity: 1, cost: 2_000_000n, sellerAccount: '701100', buyerAccount: '241100', usefulLifeYears: 10 },
    // facture postérieure à la clôture : ignorée
    { invoiceDate: '2028-01-05', net: 9n, quantity: 1, cost: 1n, sellerAccount: '701100', buyerAccount: '601100', remainingQuantity: 1 },
  ] });
  const l = r.entries[0]!.lines.map((x) => [x.account, x.debit || -x.credit]);
  it('marge du stock d’ouverture en réserves, reprise en résultat ; marge de clôture déduite', () => {
    expect(l).toContainEqual(['118800', 200_000n]);
    expect(l).toContainEqual(['603100', -200_000n]);
    expect(l).toContainEqual(['603100', 40_000n]);
  });
  it('immobilisations : marge en réserves nette des amortissements antérieurs, dotation de l’exercice extournée', () => {
    expect(l).toContainEqual(['118800', 1_080_000n]);
    expect(l).toContainEqual(['284100', 120_000n]);
    expect(l).toContainEqual(['681300', -240_000n]);
    expect(l).toContainEqual(['681300', -45_000n]);
    expect(r.values).toMatchObject({
      revenueEliminated: 2_600_000n, openingStockMargin: 200_000n, closingStockMargin: 40_000n, assetMargin: 1_395_000n, depreciationReversed: 285_000n,
      reservesImpact: -1_280_000n, resultEffectBeforeTax: -155_000n, unrealisedMargin: 1_435_000n, deferredTaxAsset: 430_500n,
    });
  });
  it('impôt différé : 430 500 au bilan, 384 000 en réserves d’ouverture, variation 46 500 en charge d’impôt', () => {
    expect(l).toContainEqual(['IDA', 430_500n]);
    expect(l).toContainEqual(['118800', -384_000n]);
    expect(l).toContainEqual(['891100', -46_500n]);
    expect(r.values).toMatchObject({ openingDeferredTax: 384_000n, taxVariation: 46_500n, resultEffectAfterTax: -108_500n });
    expect(r.entries[0]!.lines.reduce((s, x) => s + x.debit - x.credit, 0n)).toBe(0n);
  });
  it('capitaux propres consolidés diminués de la marge restant au bilan', () => {
    expect(BigInt(r.values!.reservesImpact as bigint) + BigInt(r.values!.resultEffectBeforeTax as bigint)).toBe(-(r.values!.unrealisedMargin as bigint));
    expect(days360('2026-07-01', '2026-12-31')).toBe(180);
    expect(intercompanyEliminations({ period, lines: [{ invoiceDate: '2027-02-01', net: 10n, quantity: 1, cost: 5n, sellerAccount: '701100', buyerAccount: '241100' }] }).values!.depreciationReversed).toBe(0n);
  });
});
