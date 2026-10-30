/** Guide d'application — applications 128 à 130 et 135 à 138. */
import { describe, expect, it } from 'vitest';
import { acquisitionDifferences, groupPercentages, translateStatements, votingRights } from './index';

const M = 1_000_000n;
const close = (a: number, b: number, d = 4) => expect(a).toBeCloseTo(b, d);

describe('application 128 : contrôle et intérêts', () => {
  const g = groupPercentages({ parent: 'H', jointControl: ['D'], holdings: [
    { owner: 'H', owned: 'A', capital: 0.9 }, { owner: 'H', owned: 'B', capital: 0.9 }, { owner: 'H', owned: 'C', capital: 0.9 }, { owner: 'H', owned: 'D', capital: 0.25 },
    { owner: 'A', owned: 'E', capital: 0.6 }, { owner: 'B', owned: 'F', capital: 0.3 }, { owner: 'C', owned: 'G', capital: 0.55 }, { owner: 'D', owned: 'I', capital: 0.7 },
  ] });
  it('E 54 %, F 27 %, G 49,5 %, I 17,5 % sans contrôle', () => {
    close(g.E!.interest, 0.54); close(g.F!.interest, 0.27); close(g.G!.interest, 0.495); close(g.I!.interest, 0.175);
    expect(g.D!.method).toBe('INTEGRATION_PROPORTIONNELLE');
    expect(g.F!.method).toBe('MISE_EN_EQUIVALENCE');
    expect(g.G!.method).toBe('INTEGRATION_GLOBALE');
    expect(g.I).toMatchObject({ control: 0, method: 'NON_CONSOLIDEE' });
  });
});

describe('application 129 : périmètre et méthodes', () => {
  const g = groupPercentages({ parent: 'MERAS', holdings: [
    { owner: 'MERAS', owned: 'A', capital: 0.9 }, { owner: 'MERAS', owned: 'B', capital: 0.6 }, { owner: 'MERAS', owned: 'C', capital: 0.15 },
    { owner: 'A', owned: 'B', capital: 0.25 }, { owner: 'B', owned: 'C', capital: 0.8 }, { owner: 'MERAS', owned: 'D', capital: 0.1 },
    { owner: 'B', owned: 'D', capital: 0.45 }, { owner: 'C', owned: 'D', capital: 0.25 }, { owner: 'D', owned: 'E', capital: 0.1 },
    { owner: 'MERAS', owned: 'F', capital: 0.05 }, { owner: 'D', owned: 'F', capital: 0.2 }, { owner: 'MERAS', owned: 'G', capital: 0.25 }, { owner: 'F', owned: 'G', capital: 0.7 },
  ] });
  it('B 82,5 %, C 81 %, D 67,37 % (contrôle 80 %), F 18,47 %, G 37,92 %', () => {
    close(g.B!.interest, 0.825); close(g.C!.interest, 0.81); close(g.D!.interest, 0.67375); close(g.D!.control, 0.8);
    close(g.F!.interest, 0.18475); close(g.G!.interest, 0.379325); close(g.G!.control, 0.25);
    expect(g.E!.method).toBe('NON_CONSOLIDEE');
    expect(g.F!.method).toBe('MISE_EN_EQUIVALENCE');
  });
  it('entité H : votes doubles, actions sans droit de vote et OCA → contrôle 51,03 %, intérêt 30,38 %', () => {
    const h = votingRights({ held: { ordinary: 12_000, double: 3_800, potential: 10_000 }, capital: { ordinary: 40_000, double: 4_000, nonVoting: 8_000, potential: 10_000 } });
    close(h.control, 0.5103); close(h.interest, 0.3038);
    expect(votingRights({ held: { ordinary: 1 }, capital: { ordinary: 2 } })).toEqual({ control: 0.5, interest: 0.5 });
  });
});

describe('application 130 : participations circulaires', () => {
  it('intérêts des actionnaires de M : 76,42 % dans M, 53,49 % dans F1, 21,39 % dans F2', () => {
    const g = groupPercentages({ parent: 'M', jointControl: ['F2'], holdings: [{ owner: 'M', owned: 'F1', capital: 0.7 }, { owner: 'F1', owned: 'F2', capital: 0.4 }, { owner: 'F2', owned: 'M', capital: 0.3 }] });
    close(g.M!.interest, 0.7642); close(g.F1!.interest, 0.5349); close(g.F2!.interest, 0.2139, 3); // le guide tronque 21,397 % en 21,39 %
  });
});

describe('applications 135 à 137 : écarts d’évaluation et d’acquisition', () => {
  it('intégration globale : écart d’évaluation 17 625 000, goodwill 15 900 000 amorti sur 10 ans', () => {
    const r = acquisitionDifferences({ cost: 50n * M, interest: 0.8, equity: 25n * M, taxRate: 0.25, adjustments: [
      { label: 'Terrain', amount: 15n * M }, { label: 'Marque', amount: 10n * M }, { label: 'Brevet', amount: 6n * M }, { label: 'Retraite', amount: -7_500_000n },
    ] });
    expect(r.values).toMatchObject({ consolidationDifference: 30n * M, deferredTax: 5_875_000n, valuationDifference: 17_625_000n, groupValuation: 14_100_000n, minorityValuation: 3_525_000n, goodwill: 15_900_000n, annualGoodwillAmortisation: 1_590_000n });
  });
  it('mise en équivalence : goodwill 84 375 000 inclus dans les titres', () => {
    const r = acquisitionDifferences({ cost: 170n * M, interest: 0.25, equity: 300_500_000n, taxRate: 0.3, method: 'MISE_EN_EQUIVALENCE',
      adjustments: [{ label: 'Terrain', amount: 10n * M }, { label: 'Bâtiment', amount: 50n * M }] });
    expect(r.values).toMatchObject({ valuationDifference: 42n * M, fairValueNetAssets: 342_500_000n, goodwill: 84_375_000n, annualGoodwillAmortisation: 0n });
  });
  it('badwill de 16 710 000 rapporté au résultat', () => {
    const r = acquisitionDifferences({ cost: 90n * M, interest: 0.6, equity: 160n * M, taxRate: 0.3, adjustments: [{ label: 'Réestimations', amount: 25_500_000n }] });
    expect(r.values).toMatchObject({ fairValueNetAssets: 177_850_000n, goodwill: -16_710_000n, badwillToResult: 16_710_000n, annualGoodwillAmortisation: 0n });
    expect(acquisitionDifferences({ cost: 10n, interest: 1, equity: 0n, taxRate: 0, adjustments: [], goodwillUsefulLife: 5 }).values!.annualGoodwillAmortisation).toBe(2n);
    expect(acquisitionDifferences({ cost: 10n, interest: 1, equity: 0n, taxRate: 0, adjustments: [], goodwillUsefulLife: 'NON_LIMITEE' }).values!.annualGoodwillAmortisation).toBe(0n);
  });
});

describe('application 138 : conversion des états en devises', () => {
  it('cours de clôture, historique et moyen ; écart de conversion', () => {
    const r = translateStatements({ closingRate: 2.3, averageRate: 2.2, items: [
      { code: 'IMMO', amount: 2_000_000n, basis: 'HISTORIQUE', historicalRate: 2 }, { code: 'STOCK', amount: 2_000_000n, basis: 'HISTORIQUE', historicalRate: 2.25 },
      { code: 'BANQUE', amount: 1_000_000n, basis: 'CLOTURE' }, { code: 'CAPITAL', amount: -2_000_000n, basis: 'HISTORIQUE', historicalRate: 2 },
      { code: 'RESERVES', amount: -1_000_000n, basis: 'HISTORIQUE', historicalRate: 2 }, { code: 'RESULTAT', amount: -500_000n, basis: 'MOYEN' },
      { code: 'DETTES', amount: -1_500_000n, basis: 'CLOTURE' },
    ] });
    expect(r.values).toMatchObject({ IMMO: 4_000_000n, STOCK: 4_500_000n, BANQUE: 2_300_000n, RESULTAT: -1_100_000n, DETTES: -3_450_000n });
    expect(r.values!.translationDifference).toBe(-(4_000_000n + 4_500_000n + 2_300_000n - 4_000_000n - 2_000_000n - 1_100_000n - 3_450_000n));
    expect(translateStatements({ closingRate: 1, averageRate: 1, items: [{ code: 'X', amount: 5n, basis: 'HISTORIQUE' }] }).values!.X).toBe(5n);
  });
});
