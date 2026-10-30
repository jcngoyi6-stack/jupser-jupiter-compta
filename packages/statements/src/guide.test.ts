/**
 * Guide d'application du SYSCOHADA révisé — application 127 : jeu complet d'états financiers.
 * La balance N du guide (162 comptes) est reprise telle quelle ; tous les postes et totaux doivent
 * être identiques à ceux publiés par le guide.
 * N.B. Le guide supprime les rubriques non utilisées et décale les lettres des capitaux propres
 * (CF « Report à nouveau ») ; Jupiter Compta conserve les références du modèle de l'Acte uniforme (CH).
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/guide-application-127.json';
import { buildBalanceSheet, buildIncomeStatement } from './index';

const balances = Object.entries(fixture.soldes as Record<string, number>).map(([account, net]) => ({ account, net: BigInt(net) }));
const bs = buildBalanceSheet(balances);
const is = buildIncomeStatement(balances);
const asset = (ref: string) => bs.assets.find((r) => r.ref === ref)!;
const liab = (ref: string) => bs.liabilities.find((r) => r.ref === ref)!.value;

describe('guide d’application — application 127', () => {
  it('bilan : actif (brut, amortissements, net)', () => {
    expect([asset('AZ').gross, asset('AZ').depreciation, asset('AZ').net]).toEqual([1_041_480_134n, 321_157_361n, 720_322_773n]);
    expect([asset('BK').gross, asset('BK').depreciation, asset('BK').net]).toEqual([227_682_098n, 31_677_520n, 196_004_578n]);
    expect([asset('BI').gross, asset('BI').depreciation, asset('BI').net]).toEqual([167_938_821n, 31_677_520n, 136_261_301n]);
    expect(asset('AP').net).toBe(20_000_000n);
    expect(asset('BA').net).toBe(2_140_000n);
    expect(asset('BT').net).toBe(123_097_127n);
    expect([asset('BZ').gross, asset('BZ').depreciation, asset('BZ').net]).toEqual([1_407_259_359n, 352_834_881n, 1_054_424_478n]);
  });
  it('bilan : passif', () => {
    expect(liab('CH')).toBe(76_069_991n); // « Report à nouveau » (CF dans la numérotation condensée du guide)
    expect(liab('DA')).toBe(94_699_075n);
    expect(liab('DF')).toBe(813_775_142n);
    expect(liab('DH')).toBe(156_649_942n);
    expect(liab('DJ')).toBe(38_210_222n);
    expect(liab('DM')).toBe(620_000n);
    expect(liab('DP')).toBe(238_148_411n);
    expect(liab('DZ')).toBe(1_054_424_478n);
  });
  it('compte de résultat', () => {
    expect(is.values.XA).toBe(40_000_000n);
    expect(is.values.RB).toBe(5_000_000n);
    expect(is.values.RD).toBe(106_416n);
    expect(is.values.RF).toBe(-2_414_711n);
    expect(is.values.XI).toBe(215_389_710n);
  });
});

describe('guide d’application — consolidation (applications 132 à 134)', async () => {
  const { consolidate } = await import('./consolidation');
  const M = 1_000_000n;
  // Mère M et filiale F (45 % acquis à la création de F : capitaux propres d'acquisition = capital 5 000 000)
  const mere = { id: 'M', name: 'M', parent: true, method: 'IG' as const, ownershipPpm: 1_000_000n, balances: [
    { account: '231000', net: 135n * M }, { account: '261000', net: 2_250_000n }, { account: '521000', net: 12_750_000n },
    { account: '101300', net: -100n * M }, { account: '111000', net: -25n * M }, { account: '401000', net: -20n * M },
    { account: '601000', net: 395n * M }, { account: '701000', net: -400n * M },
  ] };
  const fille = (method: 'IG' | 'IP' | 'MEE') => ({ id: 'F', name: 'F', parent: false, method, ownershipPpm: 450_000n, investmentCost: 2_250_000n, investmentAccount: '261000', equityAtAcquisition: 5n * M, balances: [
    { account: '231000', net: 10n * M }, { account: '521000', net: 5_500_000n },
    { account: '101300', net: -5n * M }, { account: '111000', net: -4n * M }, { account: '401000', net: -5n * M },
    { account: '601000', net: 43_500_000n }, { account: '701000', net: -45n * M },
  ] });
  const val = (r: ReturnType<typeof consolidate>, a: string) => r.balances.find((b) => b.account === a)?.net ?? 0n;
  it('application 132 : intégration globale', () => {
    const r = consolidate([mere, fille('IG')]);
    expect(val(r, '231000')).toBe(145n * M);
    expect(val(r, '521000')).toBe(18_250_000n);
    expect(val(r, '261000')).toBe(0n);
    expect(r.goodwill).toBe(0n);
    expect(r.consolidatedReserves).toBe(1_800_000n);
    expect(r.minorityEquity).toBe(4_950_000n);
    expect(r.minorityResult).toBe(825_000n);
    expect(r.minorityInterests).toBe(5_775_000n);
    expect(r.summary).toEqual({ groupCapital: 100n * M, groupReserves: 26_800_000n, groupResult: 5_675_000n, groupEquity: 132_475_000n, totalResult: 6_500_000n });
  });
  it('application 133 : intégration proportionnelle (45 %, sans minoritaires)', () => {
    const r = consolidate([mere, fille('IP')]);
    expect(val(r, '231000')).toBe(139_500_000n);
    expect(val(r, '521000')).toBe(15_225_000n);
    expect(val(r, '401000')).toBe(-22_250_000n);
    expect(r.minorityInterests).toBe(0n);
    expect(r.summary.groupReserves).toBe(26_800_000n);
    expect(r.summary.groupResult).toBe(5_675_000n);
  });
  it('application 134 : mise en équivalence', () => {
    const r = consolidate([mere, fille('MEE')]);
    expect(val(r, '231000')).toBe(135n * M);
    expect(val(r, '261000')).toBe(4_725_000n); // titres mis en équivalence
    expect(r.equityMethodResult).toBe(675_000n);
    expect(r.summary.groupReserves).toBe(26_800_000n);
    expect(r.summary.groupResult).toBe(5_675_000n);
    expect(r.summary.groupEquity).toBe(132_475_000n);
    expect(r.balances.some((b) => b.account === '776000')).toBe(false);
  });
});
