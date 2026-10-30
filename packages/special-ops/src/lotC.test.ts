/** Guide d'application — applications 58 à 64 et 66 à 70. */
import { describe, expect, it } from 'vitest';
import {
  allocateGrant, capitalAmortisation, capitalIncreaseCash, capitalIncreaseReserves, capitalReductionLosses, capitalReductionRepayment,
  equilibriumGrant, fractionedCapital, grantAward, grantOnDisposal, grantRelease, grantReleaseSchedule, incorporation, operatingGrant,
  stateAdvance, subsidisedAssetImpairment,
} from './index';
import { unknownAccounts } from './testkit';

const amt = (r: { entries: { lines: { account: string; debit: bigint; credit: bigint }[] }[] }, i: number) => r.entries[i]!.lines.map((l) => [l.account, l.debit || -l.credit]);
const M = 1_000_000n;

describe('application 58 : constitution, libération intégrale', () => {
  const r = incorporation({
    capital: 300n * M, promiseDate: '2026-09-19', realisationDate: '2026-09-20', notaryTransferDate: '2026-09-30', notaryFees: 5n * M, actFees: 500_000n,
    inKindAssets: [{ account: '212200', amount: 30n * M }, { account: '223100', amount: 20n * M }, { account: '231100', amount: 150n * M }, { account: '241100', amount: 50n * M }, { account: '411100', amount: 40n * M }],
    inKindLiabilities: [{ account: '162000', amount: 50n * M }],
  });
  it('apport en nature 240 M, numéraire 60 M, versement du notaire 54,5 M', () => {
    expect(r.values).toMatchObject({ inKind: 240n * M, cash: 60n * M });
    expect(amt(r, 0)).toEqual([['461100', 240n * M], ['461200', 60n * M], ['101100', -300n * M]]);
    expect(amt(r, 5)).toEqual([['101200', 300n * M], ['101300', -300n * M]]);
    expect(amt(r, 6)).toEqual([['521100', 54_500_000n], ['632400', 5n * M], ['632500', 500_000n], ['473200', -60n * M]]);
    expect(() => incorporation({ capital: 1n, inKindAssets: [{ account: '212200', amount: 2n }], promiseDate: 'x', realisationDate: 'x' })).toThrow('APPORTS_EN_NATURE');
    expect(incorporation({ capital: 10n, promiseDate: '2026-01-01', realisationDate: '2026-01-02' }).entries).toHaveLength(5);
  });
});

describe('application 59 : libération fractionnée', () => {
  it('moitié à la souscription, seconde moitié appelée en N+1', () => {
    const r = fractionedCapital({ capital: 25n * M, subscriptionDate: '2026-11-15', calls: [
      { amount: 12_500_000n, callDate: '2026-11-15', paymentDate: '2026-11-30' }, { amount: 12_500_000n, callDate: '2027-03-10', paymentDate: '2027-04-15' },
    ] });
    expect(amt(r, 2)).toEqual([['109000', 12_500_000n], ['461300', 12_500_000n], ['461200', -25n * M]]);
    expect(amt(r, 5)).toEqual([['461300', 12_500_000n], ['109000', -12_500_000n]]);
    expect(r.values!.uncalled).toBe(0n);
    expect(r.entries).toHaveLength(9);
    expect(() => fractionedCapital({ capital: 1n, subscriptionDate: 'x', calls: [] })).toThrow('AUCUN_APPEL');
    expect(() => fractionedCapital({ capital: 1n, subscriptionDate: 'x', calls: [{ amount: 2n, callDate: 'x' }] })).toThrow('APPELS_SUPERIEURS');
  });
});

describe('applications 60 à 64 : augmentations, réductions et amortissement du capital', () => {
  it('augmentation en numéraire avec prime de 25 M', () => {
    const r = capitalIncreaseCash({ quantity: 5000, nominal: 10_000n, issuePrice: 15_000n, subscriptionDate: '2026-05-08', recordDate: '2026-05-09', transferDate: '2026-05-10' });
    expect(amt(r, 1)).toEqual([['461500', 75n * M], ['101300', -50n * M], ['105100', -25n * M]]);
  });
  it('incorporation de réserves, imputation des pertes, remboursement, amortissement', () => {
    expect(amt(capitalIncreaseReserves({ amount: 20n * M, date: '2026-04-01' }), 0)).toEqual([['118100', 20n * M], ['101300', -20n * M]]);
    expect(amt(capitalReductionLosses({ amount: 80n * M, date: '2026-06-10' }), 0)).toEqual([['101300', 80n * M], ['129100', -80n * M]]);
    expect(capitalReductionRepayment({ amount: 25n * M, date: '2026-10-01', paymentDate: '2026-11-01' }).entries).toHaveLength(2);
    expect(capitalReductionRepayment({ amount: 25n * M, date: '2026-10-01' }).entries).toHaveLength(1);
    const a = capitalAmortisation({ amount: 37_500_000n, date: '2026-08-01' });
    expect(amt(a, 0)).toEqual([['101300', 37_500_000n], ['101400', -37_500_000n]]);
    expect(amt(a, 1)).toEqual([['118800', 37_500_000n], ['461900', -37_500_000n]]);
  });
});

describe('application 66 : subventions d’investissement', () => {
  it('octroi, réception, bien reçu en nature', () => {
    expect(amt(grantAward({ amount: 260n * M, date: '2026-03-25', receiptDate: '2026-05-12' }), 1)).toEqual([['521100', 260n * M], ['449400', -260n * M]]);
    expect(amt(grantAward({ amount: 12n * M, grantAccount: '141200', date: '2026-03-25', receiptDate: '2026-04-01', inKindAsset: '245100' }), 1)).toEqual([['245100', 12n * M], ['449400', -12n * M]]);
    expect(grantAward({ amount: 1n, date: '2026-03-25' }).entries).toHaveLength(1);
  });
  it('répartition 13/30e : terrain 52 M, construction 208 M', () => {
    expect(allocateGrant(260n * M, [120n * M, 480n * M])).toEqual([52n * M, 208n * M]);
    expect(allocateGrant(10n, [])).toEqual([]);
  });
  it('reprises : véhicule au rythme de l’amortissement, terrain sur 10 ans, construction 6 933 333 puis 13 866 667', () => {
    const v = grantReleaseSchedule({ grant: 12n * M, assetCost: 12n * M, depreciations: [{ year: 2026, amount: 1_800_000n }, { year: 2027, amount: 2_400_000n }] });
    expect(v[0]!.release).toBe(1_800_000n);
    const land = grantReleaseSchedule({ grant: 52n * M, firstYear: 2026 });
    expect(land).toHaveLength(10);
    expect(land[0]).toMatchObject({ year: 2026, release: 5_200_000n });
    const b = grantReleaseSchedule({ grant: 208n * M, assetCost: 480n * M, depreciations: [
      { year: 2027, amount: 16n * M }, { year: 2028, amount: 32n * M }, { year: 2029, amount: 32n * M }, { year: 2030, amount: 32n * M },
    ] });
    expect(b.map((x) => x.release).slice(0, 3)).toEqual([6_933_333n, 13_866_667n, 13_866_667n]);
    const released = b.slice(0, 3).reduce((s, x) => s + x.release, 0n);
    expect(released).toBe(34_666_667n);
    expect(amt(grantOnDisposal({ grant: 208n * M, alreadyReleased: released, date: '2030-12-31' }), 0)).toEqual([['141100', 173_333_333n], ['799000', -173_333_333n]]);
    expect(amt(grantRelease({ amount: 1_800_000n, grantAccount: '141200', date: '2026-12-31' }), 0)).toEqual([['141200', 1_800_000n], ['799000', -1_800_000n]]);
  });
});

describe('applications 67 à 70 : exploitation, équilibre, avances, dépréciation', () => {
  it('subvention d’exploitation : remboursement de taxe et complément de prix', () => {
    expect(amt(operatingGrant({ amount: 96n * M, chargeAccount: '604200', date: '2026-12-31' }), 0)).toEqual([['449500', 96n * M], ['604200', -96n * M]]);
    expect(amt(operatingGrant({ amount: 97_500_000n, date: '2026-12-31' }), 0)).toEqual([['449500', 97_500_000n], ['718100', -97_500_000n]]);
    expect(amt(equilibriumGrant({ amount: 400n * M, date: '2026-12-31' }), 0)).toEqual([['449600', 400n * M], ['881000', -400n * M]]);
  });
  it('avance de l’État : remboursement avec intérêts, ou transformation en subvention', () => {
    const r = stateAdvance({ amount: 600n * M, date: '2026-09-30', settlements: [
      { date: '2030-09-30', principal: 200n * M, interest: 20n * M }, { date: '2031-09-30', principal: 200n * M, interest: 50n * M }, { date: '2032-09-30', principal: 200n * M, interest: 70n * M },
    ] });
    expect(amt(r, 3)).toEqual([['163000', 200n * M], ['674800', 70n * M], ['521100', -270n * M]]);
    const s = stateAdvance({ amount: 600n * M, date: '2026-09-30', settlements: [{ date: '2032-09-30', principal: 200n * M, waived: 400n * M }] });
    expect(amt(s, 1)).toEqual([['163000', 600n * M], ['521100', -200n * M], ['718100', -400n * M]]);
    expect(s.values!.outstanding).toBe(0n);
    expect(() => stateAdvance({ amount: 1n, date: 'x', settlements: [{ date: 'x', principal: 2n }] })).toThrow('AVANCE_SURSOLDEE');
  });
  it('dépréciation d’un bien subventionné : même incidence (− 2 M) selon les deux méthodes', () => {
    const base = { assetAccount: '241100', netBookValue: 20n * M, grantBalance: 12n * M, recoverable: 6n * M, date: '2026-12-31' };
    const m1 = subsidisedAssetImpairment({ ...base, method: 1 });
    const m2 = subsidisedAssetImpairment({ ...base, method: 2 });
    expect(amt(m1, 0)).toEqual([['691400', 2n * M], ['294100', -2n * M]]);
    expect(amt(m2, 1)).toEqual([['141100', 12n * M], ['799000', -12n * M]]);
    expect(m1.values!.impact).toBe(-2n * M);
    expect(m2.values!.impact).toBe(-2n * M);
    expect(subsidisedAssetImpairment({ ...base, recoverable: 30n * M, method: 1 }).entries).toEqual([]);
    expect(subsidisedAssetImpairment({ ...base, assetAccount: '212200', recoverable: 30n * M, method: 2 }).entries).toEqual([]);
  });
  it('tous les comptes utilisés existent et sont imputables', () => {
    expect(unknownAccounts([
      incorporation({ capital: 300n, promiseDate: 'x', realisationDate: 'x', notaryTransferDate: 'x', notaryFees: 1n, actFees: 1n, inKindAssets: [{ account: '212200', amount: 100n }], inKindLiabilities: [{ account: '162000', amount: 10n }] }),
      fractionedCapital({ capital: 10n, subscriptionDate: 'x', calls: [{ amount: 5n, callDate: 'x', paymentDate: 'x' }, { amount: 5n, callDate: 'x', paymentDate: 'x' }] }),
      capitalIncreaseCash({ quantity: 1, nominal: 1n, issuePrice: 2n, subscriptionDate: 'x', recordDate: 'x', transferDate: 'x' }),
      capitalIncreaseReserves({ amount: 1n, date: 'x' }), capitalReductionLosses({ amount: 1n, date: 'x' }),
      capitalReductionRepayment({ amount: 1n, date: 'x', paymentDate: 'x' }), capitalAmortisation({ amount: 1n, date: 'x' }),
      grantAward({ amount: 1n, date: 'x', receiptDate: 'x' }), grantRelease({ amount: 1n, date: 'x' }), operatingGrant({ amount: 1n, date: 'x' }),
      equilibriumGrant({ amount: 1n, date: 'x' }), stateAdvance({ amount: 10n, date: 'x', settlements: [{ date: 'x', principal: 2n, interest: 1n, waived: 3n }] }),
      subsidisedAssetImpairment({ assetAccount: '212200', netBookValue: 20n, grantBalance: 12n, recoverable: 6n, method: 2, date: 'x' }),
      subsidisedAssetImpairment({ assetAccount: '245100', netBookValue: 20n, grantBalance: 12n, recoverable: 1n, method: 1, date: 'x' }),
    ])).toEqual([]);
  });
});
