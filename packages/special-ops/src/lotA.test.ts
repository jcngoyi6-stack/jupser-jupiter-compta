/** Guide d'application — applications 37 à 43. */
import { describe, expect, it } from 'vitest';
import { buildingOnLeasedLand, implicitRate, investmentProperty, landOwnerAtLeaseExpiry, leaseSchedule, lesseeLease, lessorLease, lifeAnnuity, retentionBuyer, retentionSeller } from './index';
import { unknownAccounts } from './testkit';

const amt = (r: { entries: { lines: { account: string; debit: bigint; credit: bigint }[] }[] }, i: number) => r.entries[i]!.lines.map((l) => [l.account, l.debit || -l.credit]);
const near = (a: bigint, b: number, tol = 10) => expect(Math.abs(Number(a) - b)).toBeLessThanOrEqual(tol);

describe('application 37 : location-acquisition chez le preneur', () => {
  const p = { assetAccount: '241100', nature: 'MOBILIER' as const, value: 450_000n, payment: 80_650n, periods: 7, optionPrice: 51_600n, directCosts: 50_000n, usefulLifeYears: 10, startDate: '2026-01-01' };
  it('taux implicite de 8 % et tableau d’amortissement de la dette', () => {
    expect(implicitRate(450_000n, 80_650n, 7, 51_600n)).toBeCloseTo(0.08, 3);
    const r = lesseeLease(p);
    const s = r.schedule!;
    expect(s[0]).toMatchObject({ interest: 36_000n, principal: 44_650n, balance: 405_350n });
    [32_430, 28_570, 24_405, 19_905, 15_045, 9_795].forEach((v, i) => near(s[i + 1]!.interest, v));
    expect(s.at(-1)!.balance).toBe(51_600n);
    expect(s.reduce((t, x) => t + x.principal, 0n)).toBe(398_400n);
  });
  it('écritures : mise en place, redevance, éclatement, levée ou non de l’option', () => {
    const r = lesseeLease(p);
    expect(amt(r, 0)).toEqual([['241100', 500_000n], ['173000', -450_000n], ['481200', -50_000n]]);
    expect(amt(r, 2)).toEqual([['173000', 44_650n], ['672300', 36_000n], ['623300', -80_650n]]);
    expect(r.entries.at(-1)!.label).toContain('levée');
    const waived = lesseeLease({ ...p, exercised: false });
    expect(amt(waived, waived.entries.length - 2)).toEqual([['812000', 150_000n], ['284100', 350_000n], ['241100', -500_000n]]);
    expect(amt(waived, waived.entries.length - 1)).toEqual([['173000', 51_600n], ['822000', -51_600n]]);
    expect(lesseeLease({ ...p, optionPrice: undefined, rate: 0.08 }).entries.at(-1)!.label).toContain('Éclatement');
    expect(implicitRate(700n, 100n, 7)).toBeCloseTo(0, 6);
  });
});

describe('application 38 : location-financement chez le bailleur', () => {
  it('créance, sortie de stock, loyers ventilés', () => {
    const r = lessorLease({ salePrice: 450_000n, productionCost: 400_000n, payment: 70_000n, periods: 10, rate: 0.1, lastPayment: 51_570n, startDate: '2026-01-01', commission: 2_000n });
    expect(r.schedule![0]).toMatchObject({ principal: 25_000n, interest: 45_000n, balance: 425_000n });
    expect(r.schedule![1]).toMatchObject({ principal: 27_500n, interest: 42_500n });
    expect(r.schedule!.at(-1)!.balance).toBe(0n);
    expect(amt(r, 0)).toEqual([['271400', 450_000n], ['702100', -450_000n]]);
    expect(amt(r, 3)).toEqual([['521100', 70_000n], ['271400', -25_000n], ['775000', -45_000n]]);
    expect(lessorLease({ salePrice: 100n, productionCost: 90n, payment: 110n, periods: 1, rate: 0.1, startDate: '2026-01-01' }).entries).toHaveLength(3);
  });
});

describe('applications 39 et 40 : réserve de propriété', () => {
  it('acheteur : immobilisation et engagement accordé', () => {
    const r = retentionBuyer({ assetAccount: '241100', amount: 50_000_000n, date: '2026-01-02', paymentDate: '2026-03-31' });
    expect(amt(r, 1)).toEqual([['918300', 50_000_000n], ['908300', -50_000_000n]]);
    expect(amt(r, 3)).toEqual([['908300', 50_000_000n], ['918300', -50_000_000n]]);
    expect(retentionBuyer({ assetAccount: '241100', amount: 1n, date: '2026-01-02' }).entries).toHaveLength(2);
  });
  it('vendeur : engagement obtenu, défaillance, reprise du bien et rectification', () => {
    const r = retentionSeller({ amount: 100_000_000n, date: '2026-01-02', default: { outstanding: 60_000_000n, recoverable: 42_000_000n, date: '2027-02-20', reposessionValue: 37_000_000n, finalNetPrice: 38_000_000n } });
    expect(amt(r, 1)).toEqual([['904300', 100_000_000n], ['914300', -100_000_000n]]);
    expect(amt(r, 3)).toEqual([['659400', 18_000_000n], ['491200', -18_000_000n]]);
    expect(amt(r, 5)).toEqual([['601100', 1_000_000n], ['416200', -1_000_000n]]);
    expect(retentionSeller({ amount: 1n, date: '2026-01-02', default: { outstanding: 1n, recoverable: 0n, date: '2026-02-01' } }).entries).toHaveLength(4);
  });
});

describe('applications 41 à 43', () => {
  it('immeuble de placement', () => {
    expect(amt(investmentProperty({ ownUse: 50_000_000n, investment: 150_000_000n, date: '2026-01-01' }), 0)).toEqual([['231300', 50_000_000n], ['231500', 150_000_000n], ['481200', -200_000_000n]]);
  });
  it('construction sur sol d’autrui et propriétaire du terrain', () => {
    const r = buildingOnLeasedLand({ cost: 60_000_000n, expectedIndemnity: 10_000_000n, leaseYears: 15, completionDate: '2026-10-01', expiryDate: '2041-09-30', lastYearDotation: 3_333_333n });
    expect(r.values!.firstYearDepreciation).toBe(833_333n);
    expect(amt(r, 4)).toEqual([['812000', 10_000_000n], ['283200', 50_000_000n], ['232300', -60_000_000n]]);
    expect(amt(landOwnerAtLeaseExpiry({ value: 10_000_000n, indemnityPaid: true, date: '2041-10-01' }), 0)[1]).toEqual(['521100', -10_000_000n]);
    expect(amt(landOwnerAtLeaseExpiry({ value: 10_000_000n, indemnityPaid: false, date: '2041-10-01' }), 0)[1]).toEqual(['841000', -10_000_000n]);
    expect(amt(landOwnerAtLeaseExpiry({ value: 10_000_000n, indemnityPaid: false, significant: true, date: '2041-10-01' }), 0)[1]).toEqual(['148000', -10_000_000n]);
    expect(buildingOnLeasedLand({ cost: 1500n, expectedIndemnity: 0n, leaseYears: 15, completionDate: '2026-01-01' }).entries).toHaveLength(2);
  });
  it('rente viagère : décès avant ou après épuisement de la rente capitalisée', () => {
    const base = { land: 50_000_000n, building: 300_000_000n, downPayment: 110_000_000n, annuity: 20_000_000n, date: '2026-10-01', buildingYears: 30 };
    const h1 = lifeAnnuity({ ...base, paymentsMade: 5, deathDate: '2031-12-15' });
    expect(amt(h1, 0)).toEqual([['223200', 50_000_000n], ['231300', 300_000_000n], ['521100', -110_000_000n], ['168100', -240_000_000n]]);
    expect(h1.values!.firstYearDepreciation).toBe(2_500_000n);
    expect(amt(h1, h1.entries.length - 1)).toEqual([['168100', 140_000_000n], ['841000', -140_000_000n]]);
    const h2 = lifeAnnuity({ ...base, paymentsMade: 14, deathDate: '2040-11-10' });
    expect(amt(h2, h2.entries.length - 1)).toEqual([['831000', 20_000_000n], ['521100', -20_000_000n]]);
    expect(lifeAnnuity({ ...base, paymentsMade: 1, ordinaryActivity: true, deathDate: '2028-01-01' }).entries.at(-1)!.lines[1]!.account).toBe('778100');
  });
});

describe('plan comptable', () => {
  it('tous les comptes utilisés existent et sont imputables', () => {
    const all = [
      lesseeLease({ assetAccount: '241100', nature: 'IMMOBILIER', value: 450_000n, payment: 80_650n, periods: 7, optionPrice: 51_600n, directCosts: 50_000n, usefulLifeYears: 10, startDate: '2026-01-01', exercised: false }),
      lessorLease({ salePrice: 450_000n, productionCost: 400_000n, payment: 70_000n, periods: 10, rate: 0.1, startDate: '2026-01-01', commission: 2n }),
      retentionBuyer({ assetAccount: '241100', amount: 1n, date: '2026-01-02', paymentDate: '2026-02-01' }),
      retentionSeller({ amount: 10n, date: '2026-01-02', default: { outstanding: 6n, recoverable: 4n, date: '2026-02-01', reposessionValue: 3n, finalNetPrice: 4n } }),
      investmentProperty({ ownUse: 1n, investment: 1n, date: '2026-01-01' }),
      buildingOnLeasedLand({ cost: 60n, expectedIndemnity: 10n, leaseYears: 5, completionDate: '2026-01-01', expiryDate: '2031-01-01' }),
      landOwnerAtLeaseExpiry({ value: 1n, indemnityPaid: false, significant: true, date: '2026-01-01' }),
      lifeAnnuity({ land: 50n, building: 300n, downPayment: 110n, annuity: 200n, date: '2026-10-01', buildingYears: 30, paymentsMade: 2, deathDate: '2030-01-01', ordinaryActivity: true }),
    ];
    expect(unknownAccounts(all)).toEqual([]);
    expect(leaseSchedule(100n, 0.1, 50n, 2)[1]!.balance).toBe(0n);
  });
});
