/** Guide d'application — applications 48 à 51 et 55 à 57. */
import { describe, expect, it } from 'vitest';
import {
  acquireSecurities, debtWaiver, disposeFinancialAsset, disposePlacementSecurities, factoring, placementImpairment, reverseFactoring,
  securitisation, subscribeUnpaidSecurities,
} from './index';
import { unknownAccounts } from './testkit';

const amt = (r: { entries: { lines: { account: string; debit: bigint; credit: bigint }[] }[] }, i: number) => r.entries[i]!.lines.map((l) => [l.account, l.debit || -l.credit]);

describe('application 48 : acquisition de titres', () => {
  it('frais isolés pour les titres de placement, incorporés pour les titres immobilisés', () => {
    expect(amt(acquireSecurities({ category: 'PLACEMENT_ACTIONS_COTEES', quantity: 5000, unitPrice: 12_000n, feeRate: 0.015, date: '2026-06-05' }), 0))
      .toEqual([['502200', 60_000_000n], ['502600', 900_000n], ['521100', -60_900_000n]]);
    expect(amt(acquireSecurities({ category: 'PARTICIPATION', quantity: 2500, unitPrice: 16_000n, feeRate: 0.015, date: '2026-06-09' }), 0))
      .toEqual([['261000', 40_600_000n], ['521100', -40_600_000n]]);
    expect(acquireSecurities({ category: 'TIAP', quantity: 1500, unitPrice: 20_000n, feeRate: 0.015, date: '2026-06-16' }).values!.cost).toBe(30_450_000n);
    expect(amt(acquireSecurities({ category: 'TITRES_TRESOR', quantity: 1, unitPrice: 3_000_000n, feeRate: 0.015, date: '2026-06-24' }), 0))
      .toEqual([['501100', 3_000_000n], ['501600', 45_000n], ['521100', -3_045_000n]]);
    expect(acquireSecurities({ category: 'AUTRES_TITRES_IMMOBILISES', quantity: 1000, unitPrice: 18_000n, feeRate: 0.015, date: '2026-06-30' }).values!.cost).toBe(18_270_000n);
  });
});

describe('application 49 : titres non libérés', () => {
  it('souscription libérée de moitié puis libération du solde', () => {
    const r = subscribeUnpaidSecurities({ quantity: 20_000, nominal: 10_000n, premium: 2_000n, paidFraction: 0.5, fees: 1_000_000n, date: '2026-05-01', callDate: '2026-11-08' });
    expect(amt(r, 0)).toEqual([['274800', 241_000_000n], ['481300', -100_000_000n], ['521100', -141_000_000n]]);
    expect(amt(r, 1)).toEqual([['481300', 100_000_000n], ['521100', -100_000_000n]]);
    expect(subscribeUnpaidSecurities({ quantity: 10, nominal: 100n, paidFraction: 0.25, placement: true, date: '2026-05-01' }).entries[0]!.lines[1]!.account).toBe('472600');
  });
});

describe('application 50 : cession de titres immobilisés', () => {
  it('sortie, produit de cession et reprise de dépréciation ; incidence + 4 000 000', () => {
    const r = disposeFinancialAsset({ account: '274100', cost: 50_000_000n, impairment: 6_000_000n, price: 48_000_000n, date: '2026-08-15' });
    expect(amt(r, 0)).toEqual([['816000', 50_000_000n], ['274100', -50_000_000n]]);
    expect(amt(r, 2)).toEqual([['297400', 6_000_000n], ['797200', -6_000_000n]]);
    expect(r.values).toMatchObject({ hao: -2_000_000n, financial: 6_000_000n, total: 4_000_000n });
    expect(disposeFinancialAsset({ account: '261000', cost: 1n, price: 1n, date: '2026-08-15' }).entries).toHaveLength(2);
  });
});

describe('application 51 : titres de placement', () => {
  const lots = [
    { date: '2025-04-01', quantity: 1000, unitPrice: 12_000n }, { date: '2025-09-01', quantity: 500, unitPrice: 12_500n },
    { date: '2026-04-01', quantity: 1200, unitPrice: 11_000n }, { date: '2026-07-01', quantity: 300, unitPrice: 10_000n },
  ];
  it('dépréciation N-1 de 175 000, puis ajustements', () => {
    expect(amt(placementImpairment({ cost: 18_250_000n, marketValue: 18_075_000n, date: '2025-12-31' }), 0)).toEqual([['679500', 175_000n], ['590000', -175_000n]]);
    expect(amt(placementImpairment({ cost: 100n, marketValue: 200n, existing: 50n, date: '2026-12-31' }), 0)).toEqual([['590000', 50n], ['779500', -50n]]);
    expect(placementImpairment({ cost: 100n, marketValue: 100n, date: '2026-12-31' }).entries).toEqual([]);
  });
  it('PEPS : perte de 250 000, portefeuille restant 5 200 000', () => {
    const r = disposePlacementSecurities({ lots, quantity: 2500, price: 29_000_000n, method: 'PEPS', date: '2026-09-01' });
    expect(amt(r, 0)).toEqual([['472100', 29_000_000n], ['677100', 250_000n], ['502200', -29_250_000n]]);
    expect(r.values!.remainingCost).toBe(5_200_000n);
  });
  it('coût moyen pondéré : gain de 291 667, portefeuille restant 5 741 667', () => {
    const r = disposePlacementSecurities({ lots, quantity: 2500, price: 29_000_000n, method: 'CMP', date: '2026-09-01' });
    expect(amt(r, 0)).toEqual([['472100', 29_000_000n], ['777000', -291_667n], ['502200', -28_708_333n]]);
    expect(r.values!.remainingCost).toBe(5_741_667n);
    expect(disposePlacementSecurities({ lots, quantity: 3000, price: 1n, method: 'CMP', date: '2026-09-01', onCredit: false }).entries[0]!.lines[0]!.account).toBe('521100');
    expect(() => disposePlacementSecurities({ lots, quantity: 3001, price: 1n, method: 'PEPS', date: '2026-09-01' })).toThrow('QUANTITE_TITRES_INSUFFISANTE');
  });
});

describe('applications 55 à 57 : abandons, affacturage, titrisation', () => {
  it('abandons de créances commercial et financier', () => {
    expect(amt(debtWaiver({ side: 'CREANCIER', nature: 'COMMERCIAL', amount: 10_000_000n, date: '2026-09-30' }), 0)).toEqual([['836000', 10_000_000n], ['411100', -10_000_000n]]);
    expect(amt(debtWaiver({ side: 'DEBITEUR', nature: 'COMMERCIAL', amount: 10_000_000n, date: '2026-09-30' }), 0)).toEqual([['401100', 10_000_000n], ['846000', -10_000_000n]]);
    expect(amt(debtWaiver({ side: 'CREANCIER', nature: 'FINANCIER', amount: 12_000_000n, date: '2026-06-30' }), 0)).toEqual([['836000', 12_000_000n], ['277100', -12_000_000n]]);
    expect(amt(debtWaiver({ side: 'DEBITEUR', nature: 'FINANCIER', amount: 12_000_000n, date: '2026-06-30' }), 0)).toEqual([['181100', 12_000_000n], ['846000', -12_000_000n]]);
  });
  it('affacturage classique et inversé', () => {
    const f = factoring({ amount: 28_500_000n, factoringFee: 250_000n, financingFee: 200_000n, transferDate: '2026-07-01', settlementDate: '2026-07-03' });
    expect(amt(f, 1)).toEqual([['521100', 28_050_000n], ['631400', 250_000n], ['674500', 200_000n], ['471600', -28_500_000n]]);
    expect(amt(reverseFactoring({ side: 'FOURNISSEUR', amount: 20_000_000n, financingFee: 1_000_000n, date: '2026-07-01' }), 0))
      .toEqual([['521100', 19_000_000n], ['674500', 1_000_000n], ['411100', -20_000_000n]]);
    const c = reverseFactoring({ side: 'CLIENT', amount: 20_000_000n, factoringFee: 20_000n, date: '2026-07-01', maturityDate: '2026-09-30' });
    expect(amt(c, 1)).toEqual([['471600', 20_000_000n], ['631400', 20_000n], ['521100', -20_020_000n]]);
    expect(reverseFactoring({ side: 'CLIENT', amount: 1n, date: '2026-07-01' }).entries).toHaveLength(1);
  });
  it('titrisation : perte de 10 000 000', () => {
    const t = securitisation({ nominal: 80_000_000n, price: 70_000_000n, transferDate: '2026-04-01', settlementDate: '2026-04-10' });
    expect(amt(t, 1)).toEqual([['521100', 70_000_000n], ['678200', 10_000_000n], ['471600', -80_000_000n]]);
    expect(securitisation({ nominal: 1n, price: 2n, transferDate: '2026-04-01', settlementDate: '2026-04-10' }).values!.result).toBe(1n);
  });
  it('tous les comptes utilisés existent et sont imputables', () => {
    expect(unknownAccounts([
      acquireSecurities({ category: 'OBLIGATIONS_IMMOBILISEES', quantity: 1, unitPrice: 1n, date: '2026-01-01' }),
      subscribeUnpaidSecurities({ quantity: 1, nominal: 10n, paidFraction: 0.5, placement: true, date: '2026-01-01', callDate: '2026-02-01' }),
      disposeFinancialAsset({ account: '274100', cost: 5n, impairment: 1n, price: 4n, date: '2026-01-01' }),
      placementImpairment({ cost: 100n, marketValue: 200n, existing: 50n, date: '2026-12-31' }),
      debtWaiver({ side: 'DEBITEUR', nature: 'FINANCIER', amount: 1n, date: '2026-01-01' }),
      reverseFactoring({ side: 'CLIENT', amount: 1n, factoringFee: 1n, date: '2026-07-01', maturityDate: '2026-09-30' }),
      securitisation({ nominal: 1n, price: 2n, transferDate: '2026-04-01', settlementDate: '2026-04-10' }),
    ])).toEqual([]);
  });
});
