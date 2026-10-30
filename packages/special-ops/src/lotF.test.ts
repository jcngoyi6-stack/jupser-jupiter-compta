/** Guide d'application — applications 113 à 115, 121 à 126. */
import { describe, expect, it } from 'vitest';
import {
  agriculturalOps, bondPremiumTransition, componentReallocation, establishmentCostsTransition, foreignAccountAdjustment, liquidation, longTermContractTransition, pensionTransition,
} from './index';
import { unknownAccounts } from './testkit';

const lines = (e: { lines: { account: string; debit: bigint; credit: bigint }[] }) => e.lines.map((l) => [l.account, l.debit || -l.credit]);
const M = 1_000_000n;

describe('applications 113 et 114 : comptabilité pluri-monétaire', () => {
  it('clients US : écart de conversion passif de 3 500 ; banque en dollars : perte de 1 200', () => {
    const c = foreignAccountAdjustment({ account: '411100', kind: 'CREANCE', closingRate: 510, date: '2026-12-31', movements: [
      { side: 'D', foreign: 1000, local: 507_000n }, { side: 'C', foreign: 1000, local: 510_000n }, { side: 'D', foreign: 1200, local: 609_600n },
      { side: 'C', foreign: 900, local: 459_900n }, { side: 'D', foreign: 1400, local: 716_800n },
    ] });
    expect(lines(c.entries[0]!)).toEqual([['411100', 3_500n], ['479100', -3_500n]]);
    const b = foreignAccountAdjustment({ account: '521500', kind: 'TRESORERIE', closingRate: 510, date: '2026-12-31', movements: [
      { side: 'D', foreign: 1000, local: 510_000n }, { side: 'D', foreign: 900, local: 459_900n }, { side: 'C', foreign: 300, local: 152_700n },
    ] });
    expect(lines(b.entries[0]!)).toEqual([['676000', 1_200n], ['521500', -1_200n]]);
    expect(lines(foreignAccountAdjustment({ account: '521500', kind: 'TRESORERIE', closingRate: 522, date: 'x', movements: [{ side: 'D', foreign: 1000, local: 517_000n }] }).entries[0]!))
      .toEqual([['521500', 5_000n], ['776000', -5_000n]]);
  });
  it('dettes et créances financières ; solde nul', () => {
    const d = (kind: 'CREANCE' | 'DETTE', nature: 'EXPLOITATION' | 'FINANCIER', rate: number) =>
      foreignAccountAdjustment({ account: '401100', kind, nature, closingRate: rate, date: 'x', movements: [{ side: kind === 'DETTE' ? 'C' : 'D', foreign: 10, local: 5_000n }] });
    expect(lines(d('DETTE', 'EXPLOITATION', 520).entries[0]!)).toEqual([['478300', 200n], ['401100', -200n]]);
    expect(lines(d('DETTE', 'FINANCIER', 480).entries[0]!)).toEqual([['401100', 200n], ['479400', -200n]]);
    expect(lines(d('DETTE', 'FINANCIER', 520).entries[0]!)[0]).toEqual(['478400', 200n]);
    expect(lines(d('DETTE', 'EXPLOITATION', 480).entries[0]!)[1]).toEqual(['479300', -200n]);
    expect(lines(d('CREANCE', 'FINANCIER', 520).entries[0]!)[1]).toEqual(['479200', -200n]);
    expect(lines(d('CREANCE', 'FINANCIER', 480).entries[0]!)[0]).toEqual(['478200', 200n]);
    expect(lines(d('CREANCE', 'EXPLOITATION', 480).entries[0]!)[0]).toEqual(['478100', 200n]);
    expect(d('CREANCE', 'EXPLOITATION', 500).entries).toEqual([]);
  });
});

describe('application 115 : entités agricoles', () => {
  it('fumures, plantation (3 750 000 par an), autoconsommation, cession d’une vache laitière', () => {
    const r = agriculturalOps({
      soilImprovement: { amount: 362_000n, date: '2026-01-01' },
      plantation: { value: 150n * M, productiveYears: 40, date: '2026-01-01', closingDate: '2026-12-31' },
      selfConsumption: { amount: 50_000n, date: '2026-03-01' },
      livestockSale: { cost: 800_000n, productiveYears: 8, acquisitionDate: '2026-07-01', saleDate: '2028-07-01', price: 1n * M, previousAccumulated: 150_000n },
    });
    expect(lines(r.entries[0]!)).toEqual([['224500', 362_000n], ['481200', -362_000n]]);
    expect(lines(r.entries[2]!)).toEqual([['681300', 3_750_000n], ['284600', -3_750_000n]]);
    expect(lines(r.entries[3]!)).toEqual([['104700', 50_000n], ['724000', -50_000n]]);
    expect(lines(r.entries[4]!)).toEqual([['681300', 50_000n], ['284600', -50_000n]]);
    expect(lines(r.entries[5]!)).toEqual([['654200', 600_000n], ['284600', 200_000n], ['246200', -800_000n]]);
    expect(lines(r.entries[6]!)).toEqual([['414200', 1n * M], ['754200', -1n * M]]);
    expect(agriculturalOps({}).entries).toEqual([]);
  });
});

const base = {
  date: '2027-01-25', openingCash: 9_850_000n, fees: 3n * M,
  assets: [
    { account: '231100', gross: 40n * M, reduction: 26_500_000n, proceeds: 25n * M },
    { account: '241100', gross: 20n * M, reduction: 15n * M, proceeds: 4_500_000n },
    { account: '311100', gross: 7_500_000n, reduction: 3_450_000n, reductionAccount: '391000', proceeds: 3_750_000n },
  ],
  receivables: [
    { account: '416200', gross: 11_500_000n, impairment: 3_900_000n, collected: 8_500_000n },
    { account: '411100', gross: 11n * M, collected: 9_500_000n, discount: 1_500_000n },
  ],
  liabilities: [{ account: '401100', amount: 17n * M }],
  equity: [{ account: '101300', amount: 20n * M }, { account: '118100', amount: 14n * M }],
};

describe('application 122 : liquidation', () => {
  it('méthode directe : boni de 7,1 M, trésorerie 41,1 M remboursée aux associés', () => {
    const r = liquidation({ ...base, method: 'DIRECT' });
    expect(r.values).toMatchObject({ result: 7_100_000n, cash: 41_100_000n, toShareholders: 41_100_000n });
    expect(lines(r.entries[1]!)).toEqual([['138400', 13_500_000n], ['283100', 26_500_000n], ['231100', -40n * M]]);
    expect(lines(r.entries.at(-2)!)).toEqual([['101300', 20n * M], ['118100', 14n * M], ['138400', 7_100_000n], ['461900', -41_100_000n]]);
  });
  it('méthode HAO : regroupement 847 (37,15 M) / 837 (30,05 M)', () => {
    const r = liquidation({ ...base, method: 'HAO' });
    expect(lines(r.entries.at(-3)!)).toEqual([['847000', 37_150_000n], ['837000', -30_050_000n], ['138400', -7_100_000n]]);
  });
});

describe('applications 121 à 126 : période comparative et première application', () => {
  it('frais d’établissement : 4 500 000 virés en 4751 puis 1 500 000 par an', () => {
    const r = establishmentCostsTransition({ legacyAccount: '201100', originalYears: 4, yearsElapsed: 1, transitionDate: '2018-01-01',
      originalCharges: [{ account: '632400', amount: 5n * M }, { account: '632500', amount: 100_000n }, { account: '646100', amount: 900_000n }] });
    expect(lines(r.entries[0]!)).toEqual([['475100', 4_500_000n], ['201100', -4_500_000n]]);
    expect(lines(r.entries[1]!)).toEqual([['632400', 1_250_000n], ['632500', 25_000n], ['646100', 225_000n], ['475100', -1_500_000n]]);
    expect(r.entries).toHaveLength(4);
  });
  it('primes de remboursement : 33 750 000 imputés sur l’emprunt, 11 250 000 par an', () => {
    const r = bondPremiumTransition({ balance: 33_750_000n, remainingInterests: [30n * M, 30n * M, 30n * M], transitionDate: '2018-01-01' });
    expect(lines(r.entries[0]!)).toEqual([['161100', 33_750_000n], ['206000', -33_750_000n]]);
    expect(r.entries.slice(1).map((e) => e.lines[0]!.debit)).toEqual([11_250_000n, 11_250_000n, 11_250_000n]);
  });
  it('approche par composants : annuité portée de 25 M à 31,25 M', () => {
    const r = componentReallocation({ assetAccount: '231100', gross: 500n * M, accumulated: 250n * M, date: '2018-01-01', components: [
      { account: '231110', depreciationAccount: '283110', share: 0.75, remainingYears: 10 }, { account: '231120', depreciationAccount: '283120', share: 0.25, remainingYears: 5 },
    ] });
    expect(lines(r.entries[0]!)).toEqual([['231110', 375n * M], ['231120', 125n * M], ['283100', 250n * M], ['231100', -500n * M], ['283110', -187_500_000n], ['283120', -62_500_000n]]);
    expect(r.values).toMatchObject({ annuite_231110: 18_750_000n, annuite_231120: 12_500_000n, annualTotal: 31_250_000n });
  });
  it('engagements de retraite antérieurs (75 M) étalés sur 5 ans ; en-cours de contrat soldés', () => {
    const r = pensionTransition({ priorObligation: 75n * M, spreadYears: 5, transitionDate: '2018-01-01' });
    expect(lines(r.entries[0]!)).toEqual([['475100', 75n * M], ['196100', -75n * M]]);
    expect(lines(r.entries[1]!)).toEqual([['691100', 15n * M], ['475100', -15n * M]]);
    expect(r.entries).toHaveLength(6);
    expect(lines(longTermContractTransition({ workInProgress: 2_500_000n, transitionDate: '2018-01-01' }).entries[0]!)).toEqual([['418100', 2_500_000n], ['352100', -2_500_000n]]);
  });
  it('tous les comptes utilisés existent et sont imputables (hors comptes de l’ancien plan)', () => {
    expect(unknownAccounts([
      agriculturalOps({ soilImprovement: { amount: 1n, date: 'x' }, plantation: { value: 40n, productiveYears: 4, date: 'x', closingDate: 'x' }, selfConsumption: { amount: 1n, date: 'x' },
        livestockSale: { cost: 80n, productiveYears: 8, acquisitionDate: '2026-07-01', saleDate: '2028-07-01', price: 100n, previousAccumulated: 15n } }),
      liquidation({ ...base, method: 'HAO' }),
      pensionTransition({ priorObligation: 10n, spreadYears: 2, transitionDate: '2018-01-01' }),
    ])).toEqual([]);
  });
});
