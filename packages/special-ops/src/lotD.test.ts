/** Guide d'application — applications 78 à 83 et 88 à 91. */
import { describe, expect, it } from 'vitest';
import {
  bondLoan, convertibleBond, fixedRateHedgedPurchase, forwardSaleHedge, fxPosition, insuredPensionPremium, pensionYearEnd, projectedObligation, retirementPayment,
} from './index';
import { unknownAccounts } from './testkit';

const amt = (r: { entries: { lines: { account: string; debit: bigint; credit: bigint }[] }[] }, i: number) => r.entries[i]!.lines.map((l) => [l.account, l.debit || -l.credit]);
const M = 1_000_000n;

describe('application 78 : emprunt obligataire remboursable par amortissements constants', () => {
  // Erratum du guide : le coupon retenu (10 000 × 5 % = 500) ne correspond pas au nominal de 5 000 ;
  // on reproduit les tableaux du guide avec un coupon de 500 (taux de 10 % sur le nominal de 5 000).
  const r = bondLoan({ count: 10_000, nominal: 5_000n, issuePrice: 4_900n, redemptionPrice: 5_100n, rate: 0.1, years: 4, mode: 'AMORTISSEMENT_CONSTANT', issueDate: '2026-01-01', fees: 750_000n, viaSubscription: true });
  it('tableau de remboursement et primes de 500 000 par an', () => {
    expect(r.schedule!.map((x) => x.annuity)).toEqual([17_750_000n, 16_500_000n, 15_250_000n, 14_000_000n]);
    expect(r.schedule!.every((x) => x.premium === 500_000n)).toBe(true);
    expect(amt(r, 0)).toEqual([['471300', 49n * M], ['161100', -49n * M]]);
    expect(amt(r, 2)).toEqual([['631600', 750_000n], ['521100', -750_000n]]);
    expect(amt(r, 3)).toEqual([['161100', 12_250_000n], ['671100', 5n * M], ['671400', 500_000n], ['521100', -17_750_000n]]);
    expect(amt(r, 4)).toEqual([['161100', 12_250_000n], ['671100', 3_750_000n], ['671400', 500_000n], ['521100', -16_500_000n]]);
  });
});

describe('application 79 : emprunt obligataire in fine', () => {
  const r = bondLoan({ count: 5_000, nominal: 10_000n, issuePrice: 9_500n, redemptionPrice: 10_500n, rate: 0.06, years: 5, mode: 'IN_FINE', issueDate: '2026-01-01' });
  it('coupons de 3 M, prime rattachée de 1 M par an, remboursement de 52,5 M', () => {
    expect(r.schedule!.map((x) => x.premium)).toEqual([M, M, M, M, M]);
    expect(r.schedule![4]!.annuity).toBe(55_500_000n);
    expect(amt(r, 0)).toEqual([['521100', 47_500_000n], ['161100', -47_500_000n]]);
    expect(amt(r, 2)).toEqual([['671400', M], ['166100', -M]]);
    expect(amt(r, r.entries.length - 1)).toEqual([['161100', 47_500_000n], ['166100', 5n * M], ['521100', -52_500_000n]]);
  });
});

describe('application 80 : emprunt obligataire convertible', () => {
  it('provision de la prime totale, conversion de 4 000 obligations, reprise de 8 M', () => {
    const r = convertibleBond({ count: 25_000, nominal: 15_000n, issuePrice: 13_000n, issueDate: '2026-01-01', provisionDate: '2026-12-31',
      conversions: [{ bonds: 4_000, shares: 3_000, shareNominal: 10_000n, date: '2028-01-01', reversalDate: '2029-12-31' }] });
    expect(amt(r, 0)).toEqual([['521100', 325n * M], ['161200', -325n * M]]);
    expect(amt(r, 1)).toEqual([['697100', 50n * M], ['198800', -50n * M]]);
    expect(amt(r, 2)).toEqual([['161200', 52n * M], ['101300', -30n * M], ['105400', -22n * M]]);
    expect(amt(r, 3)).toEqual([['198800', 8n * M], ['797100', -8n * M]]);
    expect(convertibleBond({ count: 1, nominal: 1n, issuePrice: 1n, issueDate: 'x', conversions: [{ bonds: 1, shares: 1, shareNominal: 1n, date: 'x', reversalDate: 'x' }] }).entries).toHaveLength(2);
  });
});

describe('applications 81 à 83 : engagements de retraite', () => {
  const base = { salaryGrowth: 0.05, benefitRate: 0.4, totalYears: 35, discountRate: 0.0585, probability: 0.77, chargesRate: 0.1 };
  it('valeur actuelle 14 718 en N, 31 158 en N+1, coût des services 15 579', () => {
    expect(projectedObligation({ ...base, salary: 2_000_000n, yearsServed: 1, yearsToRetirement: 34 })).toBe(14_718n);
    expect(projectedObligation({ ...base, salary: 2_100_000n, yearsServed: 2, yearsToRetirement: 33 })).toBe(31_158n);
    expect(projectedObligation({ ...base, salary: 2_100_000n, yearsServed: 1, yearsToRetirement: 33 })).toBe(15_579n);
    expect(projectedObligation({ ...base, discountRate: 0.06, salary: 2_100_000n, yearsServed: 2, yearsToRetirement: 33 })).toBe(29_736n);
  });
  it('dotation N+1 (15 579 + 861) et gain actuariel de 1 422', () => {
    const r = pensionYearEnd({ opening: 14_718n, serviceCost: 15_579n, discountRate: 0.0585, closing: 29_736n, date: '2027-12-31' });
    expect(amt(r, 0)).toEqual([['691100', 15_579n], ['697100', 861n], ['196100', -16_440n]]);
    expect(amt(r, 1)).toEqual([['196100', 1_422n], ['797100', -1_422n]]);
    expect(amt(pensionYearEnd({ opening: 0n, serviceCost: 10n, discountRate: 0, closing: 12n, date: 'x' }), 1)).toEqual([['697100', 2n], ['196100', -2n]]);
    expect(pensionYearEnd({ opening: 0n, serviceCost: 10n, discountRate: 0, date: 'x' }).entries).toHaveLength(1);
  });
  it('régimes couverts : méthodes 1 et 2', () => {
    expect(amt(insuredPensionPremium({ method: 1, premium: 10_000n, obligation: 14_718n, date: '2026-12-31' }), 1)).toEqual([['691100', 4_718n], ['196100', -4_718n]]);
    const m2 = insuredPensionPremium({ method: 2, premium: 10_000n, obligation: 14_718n, date: '2026-12-31' });
    expect(amt(m2, 0)).toEqual([['196200', 10_000n], ['521100', -10_000n]]);
    expect(amt(m2, 1)).toEqual([['691100', 14_718n], ['196100', -14_718n]]);
    expect(insuredPensionPremium({ method: 2, premium: 1n, obligation: 5n, existingProvision: 5n, date: 'x' }).entries).toHaveLength(1);
    const p = { obligation: 4_202_678n, insurerPays: 3_200_000n, date: '2061-01-01', closingDate: '2061-12-31' };
    expect(amt(retirementPayment({ ...p, method: 1, provision: 1_002_678n }), 0)).toEqual([['661800', 1_002_678n], ['521100', -1_002_678n]]);
    expect(amt(retirementPayment({ ...p, method: 2, provision: 4_202_678n }), 0)).toEqual([['661800', 4_202_678n], ['196200', -3_200_000n], ['521100', -1_002_678n]]);
    const e = retirementPayment({ ...p, method: 2, paidTo: 'ENTITE', provision: 4_202_678n });
    expect(amt(e, 0)).toEqual([['521100', 3_200_000n], ['196200', -3_200_000n]]);
    expect(amt(e, 2)).toEqual([['196100', 4_202_678n], ['791100', -4_202_678n]]);
  });
});

describe('applications 88 à 91 : change', () => {
  it('position globale : provision limitée à 1 400 000', () => {
    const r = fxPosition({ mode: 'POSITION_GLOBALE', date: '2026-12-31', items: [
      { account: '277100', kind: 'CREANCE', nature: 'FINANCIER', foreign: 100_000, historicalRate: 620, closingRate: 550 },
      { account: '162000', kind: 'DETTE', nature: 'FINANCIER', foreign: 80_000, historicalRate: 620, closingRate: 550 },
    ] });
    expect(amt(r, 0)).toEqual([['478200', 7n * M], ['277100', -7n * M]]);
    expect(amt(r, 1)).toEqual([['162000', 5_600_000n], ['479400', -5_600_000n]]);
    expect(amt(r, 2)).toEqual([['697100', 1_400_000n], ['194000', -1_400_000n]]);
  });
  it('opération symétrique : compensation en 4788 et provision de 1 375 000', () => {
    const r = fxPosition({ mode: 'COUVERTURE', date: '2026-12-31', items: [
      { account: '401100', kind: 'DETTE', nature: 'EXPLOITATION', foreign: 100_000, historicalRate: 600, closingRate: 625 },
      { account: '271800', kind: 'CREANCE', nature: 'FINANCIER', foreign: 75_000, historicalRate: 610, closingRate: 625 },
      { account: '271800', kind: 'CREANCE', nature: 'FINANCIER', foreign: 1, historicalRate: 1, closingRate: 1 },
    ] });
    expect(amt(r, 0)).toEqual([['478300', 2_500_000n], ['401100', -2_500_000n]]);
    expect(amt(r, 1)).toEqual([['271800', 1_125_000n], ['479200', -1_125_000n]]);
    expect(amt(r, 2)).toEqual([['478800', 1_125_000n], ['478300', -1_125_000n]]);
    expect(amt(r, 3)).toEqual([['659100', 1_375_000n], ['499100', -1_375_000n]]);
    expect(amt(fxPosition({ mode: 'POSITION_GLOBALE', date: 'x', items: [{ account: '401100', kind: 'DETTE', nature: 'EXPLOITATION', foreign: 1, historicalRate: 600, closingRate: 500 }, { account: '411100', kind: 'CREANCE', nature: 'EXPLOITATION', foreign: 1, historicalRate: 500, closingRate: 600 }] }), 1))
      .toEqual([['411100', 100n], ['479100', -100n]]);
  });
  it('couverture fixant le cours : achat à 650', () => {
    const r = fixedRateHedgedPurchase({ foreign: 250_000, hedgedRate: 650, date: '2026-12-05', paymentDate: '2027-02-05' });
    expect(amt(r, 0)).toEqual([['601100', 162_500_000n], ['401100', -162_500_000n]]);
    expect(r.entries).toHaveLength(2);
  });
  it('couverture d’une vente future : report/déport, dénouement, vente, clôture et règlement', () => {
    const r = forwardSaleHedge({
      foreign: 400_000, spotAtInception: 600, forwardRate: 590, inceptionDate: '2026-05-01', maturityDate: '2027-04-30', coverMonths: 12,
      closingDate: '2026-12-31', monthsToClosing: 8, spotAtMaturity: 575, saleDate: '2027-07-31', saleRate: 550,
      saleClosingDate: '2027-12-31', saleClosingRate: 530, settlementDate: '2028-02-10', settlementRate: 515,
    });
    expect(amt(r, 0)).toEqual([['678400', 2_666_667n], ['544000', -2_666_667n]]);
    expect(amt(r, 1)).toEqual([['521100', 10n * M], ['479700', -10n * M]]);
    expect(amt(r, 2)).toEqual([['544000', 2_666_667n], ['678400', 1_333_333n], ['521100', -4n * M]]);
    expect(amt(r, 4)).toEqual([['479700', 10n * M], ['756000', -10n * M]]);
    expect(amt(r, 7)).toEqual([['411100', 8n * M], ['478100', -8n * M]]);
    expect(amt(r, 8)).toEqual([['521100', 206n * M], ['656000', 14n * M], ['411100', -220n * M]]);
    expect(amt(r, 9)).toEqual([['499100', 8n * M], ['759100', -8n * M]]);
    const g = forwardSaleHedge({ foreign: 1, spotAtInception: 600, forwardRate: 590, inceptionDate: 'x', maturityDate: 'x', coverMonths: 12, spotAtMaturity: 575, saleDate: 'x', saleRate: 550, saleClosingDate: '2027-12-31', saleClosingRate: 560, settlementDate: 'x', settlementRate: 600 });
    expect(g.values!.provision).toBe(0n);
    expect(g.entries.at(-1)!.lines[1]!.account).toBe('756000');
  });
  it('tous les comptes utilisés existent et sont imputables', () => {
    expect(unknownAccounts([
      bondLoan({ count: 4, nominal: 10n, issuePrice: 9n, redemptionPrice: 11n, rate: 0.1, years: 2, mode: 'IN_FINE', issueDate: '2026-01-01', fees: 1n, viaSubscription: true }),
      convertibleBond({ count: 4, nominal: 10n, issuePrice: 9n, issueDate: 'x', provisionDate: 'x', conversions: [{ bonds: 2, shares: 1, shareNominal: 5n, date: 'x', reversalDate: 'x' }] }),
      pensionYearEnd({ opening: 100n, serviceCost: 10n, discountRate: 0.1, closing: 200n, date: 'x' }),
      insuredPensionPremium({ method: 1, premium: 1n, obligation: 5n, date: 'x' }),
      retirementPayment({ method: 2, obligation: 5n, insurerPays: 2n, paidTo: 'ENTITE', provision: 5n, date: 'x', closingDate: 'x' }),
      fxPosition({ mode: 'COUVERTURE', date: 'x', items: [
        { account: '401100', kind: 'DETTE', nature: 'FINANCIER', foreign: 1, historicalRate: 600, closingRate: 700 },
        { account: '411100', kind: 'CREANCE', nature: 'EXPLOITATION', foreign: 1, historicalRate: 600, closingRate: 500 },
        { account: '401100', kind: 'DETTE', nature: 'EXPLOITATION', foreign: 1, historicalRate: 600, closingRate: 500 },
        { account: '271800', kind: 'CREANCE', nature: 'FINANCIER', foreign: 1, historicalRate: 600, closingRate: 610 },
      ] }),
      fixedRateHedgedPurchase({ foreign: 1, hedgedRate: 650, date: 'x', paymentDate: 'x' }),
    ])).toEqual([]);
  });
});
