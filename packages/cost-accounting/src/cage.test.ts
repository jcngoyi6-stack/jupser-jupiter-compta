import { describe, expect, it } from 'vitest';
import {
  incorporableCharges, equityRemuneration, reconcile, primaryDistribution, secondaryDistribution, distributionTable, solveLinear, unitCosts,
  inventoryAccount, computeCosts, breakEven, multiProductBreakEven, specificCosts, rationalImputation, marginalCost,
  driverCosts, resourcesToActivities, abcProductCosts, standardCostSheet, directCostVariance, overheadVariance, revenueVariance, marginVariance,
  linearTrend, seasonalForecast, wilson, productionBudget, cageJournal, centreAccount, trialBalance, type Centre, type CostModel,
} from './index';

const close = (a: number | null | undefined, b: number, eps = 0.01) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(eps);

describe('charges incorporables (exemple AFOM & Fils, trimestre)', () => {
  const charges = [
    { account: '602100', label: 'Consommation de matière première', amount: 860000 },
    { account: '605100', label: 'Eau et électricité', amount: 92000 },
    { account: '601500', label: 'Transport sur achat', amount: 220000 },
    { account: '604100', label: 'Fournitures d’entretien', amount: 120000 },
    { account: '625000', label: 'Prime d’assurance', amount: 250000 },
    { account: '661000', label: 'Charges de personnel', amount: 420000 },
    { account: '681300', label: 'Amortissement', amount: 400000 },
    { account: '658100', label: 'Dons et libéralités', amount: 80000 },
    { account: '659000', label: 'Vol de stocks', amount: 120000 },
    { account: '668000', label: 'Personnel non qualifié', amount: 80000 },
    { account: '622000', label: 'Locations', amount: 465000 },
    { account: '641000', label: 'Patente', amount: 75000 },
    { account: '647100', label: 'Pénalités fiscales', amount: 50000 },
    { account: '671000', label: 'Intérêts', amount: 150000 },
    { account: '618000', label: 'Transport refacturé', amount: 85000 },
  ];
  const supp = [
    { label: 'Rémunération des capitaux propres', amount: equityRemuneration(16_000_000, 0.12, 3) },
    { label: 'Rémunération de l’exploitant', amount: (1_800_000 * 3) / 12 },
  ];
  const r = incorporableCharges(charges, {
    overrides: { '658100': 'NON_INCORPORABLE', '668000': 'NON_INCORPORABLE', '647100': 'NON_INCORPORABLE', '618000': 'NON_INCORPORABLE' },
    partialExclusions: [
      { account: '602100', amount: 60000, reason: 'Perte sur matières' },
      { account: '661000', amount: 70000, reason: 'Rappel de salaire du trimestre précédent' },
      { account: '671000', amount: 37500, reason: 'Emprunt non affecté à l’exploitation' },
    ],
  }, supp, [{ label: 'Amortissement économique', account: '681300', accounting: 400000, economic: (4_000_000 * 3) / 24 }]);
  it('retrouve les montants du corrigé', () => {
    expect(r.generalCharges).toBe(3_467_000);
    expect(r.nonIncorporableTotal).toBe(462_500);
    expect(r.supplementaryTotal).toBe(930_000);
    expect(r.calculatedDifference).toBe(100_000);
    expect(r.incorporable).toBe(4_034_500);
    expect(r.byAccount.find((a) => a.account === '602100')!.amount).toBe(800_000);
  });
  it('préfixes par défaut (HAO, impôt sur le résultat)', () => {
    const d = incorporableCharges([{ account: '811000', amount: 10 }, { account: '891000', amount: 5 }, { account: '601100', amount: 100 }, { account: '812000', amount: 1 }], { overrides: { '812000': 'INCORPORABLE' } });
    expect(d.nonIncorporableTotal).toBe(15);
    expect(d.incorporable).toBe(101);
  });
  it('concordance des résultats', () => {
    const c = reconcile({ analyticResult: 1000, supplementary: 930, nonIncorporableCharges: 462.5, nonIncorporatedProducts: 50, calculatedDifference: 100, rationalImputationDifference: 20, inventoryDifference: -5, generalLedgerResult: 1392.5 });
    expect(c.computedGeneralResult).toBe(1392.5);
    expect(c.reconciled).toBe(true);
    expect(reconcile({ analyticResult: 1, supplementary: 0, nonIncorporableCharges: 0, nonIncorporatedProducts: 0, calculatedDifference: 0 }).reconciled).toBeNull();
  });
});

describe('centres d’analyse', () => {
  const centres: Centre[] = [
    { code: 'ADM', label: 'Administration', kind: 'AUXILIAIRE' },
    { code: 'ENT', label: 'Entretien', kind: 'AUXILIAIRE' },
    { code: 'FM', label: 'Force motrice', kind: 'AUXILIAIRE' },
    { code: 'A', label: 'Atelier A', kind: 'PRINCIPAL', unit: 'heure' },
    { code: 'B', label: 'Atelier B', kind: 'PRINCIPAL', unit: 'heure' },
    { code: 'DIS', label: 'Distribution', kind: 'PRINCIPAL', unit: '100 F de CA', valueBase: true },
  ];
  const primary = { ADM: 450000, ENT: 568800, FM: 997200, A: 218000, B: 360000, DIS: 3000000 };
  const transfers = {
    ADM: { ENT: 10, FM: 5, A: 15, B: 20, DIS: 50 },
    ENT: { FM: 10, A: 25, B: 40, DIS: 25 },
    FM: { ENT: 10, A: 40, B: 40, DIS: 10 },
  };
  it('prestations réciproques résolues algébriquement (exemple du cours)', () => {
    const s = secondaryDistribution(centres, primary, transfers);
    close(s.auxiliaryTotals.ENT, 723000);
    close(s.auxiliaryTotals.FM, 1092000);
    // Le corrigé imprime 902 250 : erreur d'addition (218 000 + 67 500 + 180 750 + 436 800 = 903 050) ;
    // contrôle : 903 050 + 1 176 000 + 3 514 950 = 5 594 000 = total des charges primaires.
    close(s.totals.A, 903050);
    close(s.totals.A + s.totals.B + s.totals.DIS, 5594000);
    close(s.totals.B, 1176000);
    close(s.totals.DIS, 3514950);
    expect(s.totals.ENT).toBe(0);
    expect(() => secondaryDistribution(centres, primary, { ...transfers, ADM: { A: 50 } })).toThrow('CLE_SECONDAIRE_NON_100');
  });
  it('répartition primaire, unités d’œuvre, tableau complet', () => {
    const p = primaryDistribution(centres, [{ charge: 'Loyer', amount: 1000, shares: { A: 3, B: 1 } }], { DIS: 10 });
    expect(p.totals).toMatchObject({ A: 750, B: 250, DIS: 10 });
    expect(() => primaryDistribution(centres, [{ charge: 'x', amount: 1, shares: {} }])).toThrow('CLE_VIDE');
    expect(() => primaryDistribution(centres, [{ charge: 'x', amount: 1, shares: { Z: 1 } }])).toThrow('CENTRE_INCONNU');
    const t = distributionTable({ centres, keys: [], direct: primary, transfers, units: { A: 1000, B: 0, DIS: 35149.5 } });
    close(t.unitCosts.find((u) => u.centre === 'A')!.unitCost, 903.05);
    expect(t.unitCosts.find((u) => u.centre === 'B')!.unitCost).toBeNull();
    close(t.unitCosts.find((u) => u.centre === 'DIS')!.unitCost, 100);
    expect(unitCosts(centres, {}, {})).toHaveLength(3);
    expect(secondaryDistribution([{ code: 'A', label: 'A', kind: 'PRINCIPAL' }], { A: 5 }, {}).totals.A).toBe(5);
    expect(() => solveLinear([[0, 0], [0, 0]], [1, 1])).toThrow('SYSTEME_INDETERMINE');
  });
});

describe('stocks', () => {
  const moves = [
    { kind: 'ENTREE' as const, quantity: 100, unitCost: 12 },
    { kind: 'SORTIE' as const, quantity: 120 },
    { kind: 'ENTREE' as const, quantity: 50, unitCost: 15 },
    { kind: 'SORTIE' as const, quantity: 40 },
  ];
  it('CMUP de période, CMUP après chaque entrée, PEPS', () => {
    const p = inventoryAccount('CMUP_PERIODE', { quantity: 50, value: 500 }, moves);
    close(p.averageCost, (500 + 1200 + 750) / 200);
    close(p.closing.value, 40 * 12.25);
    const e = inventoryAccount('CMUP_ENTREE', { quantity: 50, value: 500 }, moves);
    close(e.lines[1]!.unitCost, 1700 / 150);
    const f = inventoryAccount('PEPS', { quantity: 50, value: 500 }, moves);
    expect(f.outputs.value).toBe(50 * 10 + 70 * 12 + 30 * 12 + 10 * 15);
    expect(f.closing.value).toBe(40 * 15);
  });
  it('différences d’inventaire et refus du DEPS', () => {
    const d = inventoryAccount('CMUP_PERIODE', { quantity: 10, value: 100 }, [{ kind: 'SORTIE', quantity: 4 }], 5);
    expect(d.inventoryDifference).toEqual({ quantity: -1, value: -10 });
    expect(d.closing).toEqual({ quantity: 5, value: 50 });
    expect(() => inventoryAccount('LIFO' as never, { quantity: 0, value: 0 }, [])).toThrow('METHODE_NON_ADMISE');
    expect(() => inventoryAccount('PEPS', { quantity: 0, value: 0 }, [{ kind: 'SORTIE', quantity: 1 }])).toThrow('STOCK_INSUFFISANT');
    expect(inventoryAccount('CMUP_PERIODE', { quantity: 0, value: 0 }, [], 2).inventoryDifference!.value).toBe(0);
    expect(inventoryAccount('CMUP_ENTREE', { quantity: 0, value: 0 }, [{ kind: 'SORTIE', quantity: 0 }]).outputs.unitCost).toBeNull();
  });
});

const centresChain: Centre[] = [
  { code: 'APP', label: 'Approvisionnement', kind: 'PRINCIPAL', unit: 'kg acheté', fn: 'APPROVISIONNEMENT' },
  { code: 'ATE', label: 'Atelier', kind: 'PRINCIPAL', unit: 'heure machine', fn: 'PRODUCTION' },
  { code: 'DIS', label: 'Distribution', kind: 'PRINCIPAL', unit: '100 F de CA', valueBase: true, fn: 'DISTRIBUTION' },
];
const model: CostModel = {
  unitCosts: { APP: 50, ATE: 1000, DIS: 2 },
  centreTotals: { APP: 20000, ATE: 20000, DIS: 3300 },
  materials: [{ code: 'M', label: 'Matière', method: 'CMUP_PERIODE', opening: { quantity: 100, value: 20000 }, purchases: { quantity: 400, price: 180, directCosts: [{ label: 'Transport', amount: 4000 }], centres: [{ centre: 'APP', quantity: 400 }] } }],
  products: [{
    code: 'P', label: 'Produit', method: 'CMUP_PERIODE', opening: { quantity: 10, value: 9000 }, produced: 100,
    consumption: [{ material: 'M', quantity: 300 }], directCosts: [{ label: 'Main-d’œuvre directe', amount: 30000 }], centres: [{ centre: 'ATE', quantity: 20 }],
    wip: { opening: 5000, closing: 2600 }, sold: 80, salePrice: 2000,
    distribution: { directCosts: [{ label: 'Commissions', amount: 1600 }], centres: [{ centre: 'DIS', quantity: 1600 }] },
  }],
};

describe('enchaînement des coûts complets', () => {
  const r = computeCosts(model);
  it('coût d’achat, stock, coût de production, coût de revient, résultat', () => {
    const m = r.materials[0]!;
    expect(m.purchaseCost.total).toBe(96000);
    expect(m.inventory.averageCost).toBe(232);
    expect(m.inventory.outputs.value).toBe(69600);
    const p = r.products[0]!;
    expect(p.productionCost.total).toBe(122000);
    close(p.inventory.outputs.value, (131000 / 110) * 80);
    close(p.fullCost.total, (131000 / 110) * 80 + 4800);
    close(p.result, 160000 - ((131000 / 110) * 80 + 4800));
    close(r.analyticResult, p.result);
    expect(r.roundingDifferences.find((d) => d.centre === 'DIS')!.difference).toBe(100);
    expect(r.roundingTotal).toBe(100);
  });
  it('erreurs de modèle', () => {
    expect(() => computeCosts({ ...model, unitCosts: {} })).toThrow('COUT_UO_INCONNU');
    expect(() => computeCosts({ ...model, products: [{ ...model.products[0]!, consumption: [{ material: 'X', quantity: 1 }] }] })).toThrow('MATIERE_INCONNUE');
    const z = computeCosts({ unitCosts: {}, materials: [], products: [{ code: 'Z', label: 'Z', method: 'PEPS', opening: { quantity: 0, value: 0 }, produced: 0, consumption: [], sold: 0, salePrice: 0, byProductValue: 0, wasteTreatmentCost: 0 }] });
    expect(z.products[0]!.fullCost.unitCost).toBeNull();
    expect(z.products[0]!.margin).toBeNull();
    const w = computeCosts({ unitCosts: {}, materials: [{ code: 'M', label: 'M', method: 'PEPS', opening: { quantity: 0, value: 0 }, purchases: { quantity: 0, price: 0 }, physicalClosing: 0 }], products: [] });
    expect(w.inventoryDifference).toBe(0);
  });
  it('journal analytique en classe 9 équilibré et concordant', () => {
    const inc = incorporableCharges([{ account: '601100', amount: 72000 }, { account: '661000', amount: 30000 }, { account: '611000', amount: 5600 }, { account: '631000', amount: 43300 }]);
    const j = cageJournal({ centres: centresChain, incorporation: inc, primaryTotals: { APP: 20000, ATE: 20000, DIS: 3300 }, secondaryRows: [], costs: r });
    for (const e of j.entries) {
      const d = e.lines.reduce((s, l) => s + l.debit, 0);
      const c = e.lines.reduce((s, l) => s + l.credit, 0);
      expect(Math.abs(d - c), e.ref).toBeLessThan(0.005);
    }
    const bal = (a: string) => j.balance.find((b) => b.account === a)?.balance ?? 0;
    close(bal('981'), -Math.round(r.analyticResult * 100) / 100, 0.02);
    close(bal('951'), 46400);
    expect(Math.abs(bal(centreAccount(centresChain, 'DIS')))).toBeLessThan(0.01);
    expect(bal('977')).not.toBe(0);
    expect(j.entries.some((e) => e.ref === 'CAGE-08')).toBe(true);
    expect(centreAccount(centresChain, 'ATE')).toBe('9302');
    expect(trialBalance([])).toEqual([]);
  });
  it('journal avec différences d’inventaire et répartition secondaire', () => {
    const cs: Centre[] = [{ code: 'AUX', label: 'Aux', kind: 'AUXILIAIRE' }, ...centresChain];
    const costs = computeCosts({ ...model, materials: [{ ...model.materials[0]!, physicalClosing: 199 }], products: [{ ...model.products[0]!, physicalClosing: 29, byProductValue: 1000, wasteTreatmentCost: 200 }] });
    const sec = secondaryDistribution(cs, { AUX: 1000, APP: 19000, ATE: 20000, DIS: 3300 }, { AUX: { APP: 100 } });
    const j = cageJournal({ centres: cs, incorporation: incorporableCharges([{ account: '601100', amount: 150000 }]), primaryTotals: { AUX: 1000, APP: 19000, ATE: 20000, DIS: 3300 }, secondaryRows: sec.rows, costs });
    expect(j.entries.find((e) => e.ref === 'CAGE-07')!.lines.length).toBe(4);
    const total = j.balance.reduce((s, b) => s + b.balance, 0);
    expect(Math.abs(total)).toBeLessThan(0.05);
  });
});

describe('coûts partiels', () => {
  it('seuil de rentabilité (exemple Lynne-Marlène)', () => {
    const b = breakEven({ revenue: 120_000_000, variableCosts: 90_000_000, fixedCosts: 20_000_000, startDate: '2010-01-01', quantity: 1000 });
    expect(b.marginRate).toBe(0.25);
    expect(b.threshold).toBe(80_000_000);
    expect(b.deadPointDays).toBe(240);
    expect(b.deadPointDate).toBe('2010-08-30');
    expect(b.safetyMargin).toBe(40_000_000);
    close(b.safetyIndex, 1 / 3);
    close(b.operatingLeverage, 3);
    expect(b.thresholdQuantity).toBeCloseTo(666.67, 1);
    const loss = breakEven({ revenue: 100, variableCosts: 120, fixedCosts: 10 });
    expect(loss.threshold).toBeNull();
    expect(loss.safetyIndex).toBeNull();
    expect(breakEven({ revenue: 0, variableCosts: 0, fixedCosts: 0 }).operatingLeverage).toBeNull();
    expect(breakEven({ revenue: 100, variableCosts: 50, fixedCosts: 80, startDate: '2026-01-01' }).deadPointDate).toBeNull();
  });
  it('multi-produits et coûts spécifiques', () => {
    const m = multiProductBreakEven([{ code: 'A', revenue: 600, variableCosts: 300 }, { code: 'B', revenue: 400, variableCosts: 300 }], 200);
    expect(m.threshold).toBe(500);
    expect(m.byProduct[0]!.threshold).toBe(300);
    expect(multiProductBreakEven([{ code: 'A', revenue: 0, variableCosts: 1 }], 1).byProduct[0]!.threshold).toBeNull();
    const s = specificCosts([{ code: 'A', revenue: 1000, variableCosts: 600, specificFixedCosts: 100 }, { code: 'B', revenue: 500, variableCosts: 400, specificFixedCosts: 150 }], 120);
    expect(s.rows.map((r) => r.keep)).toEqual([true, false]);
    expect(s.result).toBe(130);
  });
  it('imputation rationnelle (exemple du restaurant)', () => {
    const low = rationalImputation({ fixedCosts: 9000, variableCostPerUnit: 7, normalActivity: 2000, actualActivity: 400 });
    expect(low.coefficient).toBe(0.2);
    expect(low.imputedFixed).toBe(1800);
    expect(low.difference).toBe(7200);
    expect(low.unitCost).toBe(11.5);
    expect(low.nature).toBe('COUT_SOUS_ACTIVITE');
    const high = rationalImputation({ fixedCosts: 9000, variableCostPerUnit: 7, normalActivity: 2000, actualActivity: 3000 });
    expect(high.difference).toBe(-4500);
    expect(high.nature).toBe('BONI_SURACTIVITE');
    expect(rationalImputation({ fixedCosts: 1, variableCostPerUnit: 1, normalActivity: 1, actualActivity: 1 }).nature).toBe('ACTIVITE_NORMALE');
    expect(rationalImputation({ fixedCosts: 1, variableCostPerUnit: 1, normalActivity: 1, actualActivity: 0 }).unitCost).toBeNull();
    expect(() => rationalImputation({ fixedCosts: 1, variableCostPerUnit: 1, normalActivity: 0, actualActivity: 1 })).toThrow();
  });
  it('coût marginal et optimums', () => {
    const m = marginalCost([{ quantity: 200, totalCost: 1500 }, { quantity: 100, totalCost: 1000 }, { quantity: 300, totalCost: 2400 }, { quantity: 0, totalCost: 400 }], 8);
    expect(m.rows[1]!.marginal).toBe(6);
    expect(m.technicalOptimum).toBe(200);
    expect(m.economicOptimum).toBe(200);
    expect(marginalCost([{ quantity: 1, totalCost: 1 }]).economicOptimum).toBeNull();
    expect(marginalCost([]).technicalOptimum).toBeNull();
  });
});

describe('méthode ABC', () => {
  const activities = [
    { code: 'A1', label: 'Réception', cost: 40000, driver: 'RECEPTIONS' },
    { code: 'A2', label: 'Lancement', cost: 60000, driver: 'LOTS' },
    { code: 'A3', label: 'Usinage', cost: 100000, driver: 'HEURES' },
    { code: 'A4', label: 'Contrôle qualité', cost: 20000, driver: 'LOTS' },
  ];
  const volumes = [{ driver: 'RECEPTIONS', volume: 200 }, { driver: 'LOTS', volume: 40, label: 'Nombre de lots' }, { driver: 'HEURES', volume: 1000 }];
  it('coûts des inducteurs et des produits', () => {
    const d = driverCosts(activities, volumes);
    expect(d.find((x) => x.driver === 'LOTS')).toMatchObject({ cost: 80000, unitCost: 2000, activities: ['A2', 'A4'] });
    const r = abcProductCosts(activities, volumes, [
      { code: 'X', quantity: 1000, directCosts: 50000, drivers: { RECEPTIONS: 150, LOTS: 10, HEURES: 600 }, revenue: 200000 },
      { code: 'Y', quantity: 100, directCosts: 10000, drivers: { RECEPTIONS: 50, LOTS: 30, HEURES: 400 } },
    ]);
    expect(r.products[0]!.indirectTotal).toBe(30000 + 20000 + 60000);
    expect(r.products[1]!.indirectTotal).toBe(10000 + 60000 + 40000);
    expect(r.products[0]!.result).toBe(40000);
    expect(r.products[1]!.result).toBeNull();
    expect(r.unabsorbed).toBe(0);
    expect(() => driverCosts(activities, [])).toThrow('VOLUME_INDUCTEUR_MANQUANT');
    expect(() => abcProductCosts(activities, volumes, [{ code: 'Z', quantity: 0, directCosts: 0, drivers: { AUTRE: 1 } }])).toThrow('INDUCTEUR_INCONNU');
    expect(abcProductCosts(activities, volumes, [{ code: 'Z', quantity: 0, directCosts: 0, drivers: {} }]).products[0]!.unitCost).toBeNull();
  });
  it('ressources vers activités', () => {
    expect(resourcesToActivities([{ label: 'Salaires', amount: 100, shares: { A1: 1, A2: 3 } }, { label: 'Loyer', amount: 10, shares: { A1: 1 } }])).toEqual({ A1: 35, A2: 75 });
    expect(() => resourcesToActivities([{ label: 'x', amount: 1, shares: {} }])).toThrow();
  });
});

describe('coûts standards et écarts', () => {
  it('fiche standard et écarts sur charges directes', () => {
    expect(standardCostSheet([{ label: 'Matière', quantity: 2, unitCost: 500 }, { label: 'MOD', quantity: 0.5, unitCost: 2000 }]).unitCost).toBe(2000);
    const v = directCostVariance({ actualQty: 2100, actualPrice: 480, standardQtyForActualOutput: 2000, standardPrice: 500 });
    expect(v.onQuantity).toBe(50000);
    expect(v.onPrice).toBe(-42000);
    expect(v.total).toBe(8000);
    expect(v.favourable).toBe(false);
  });
  it('écart sur charges indirectes : budget, activité, rendement', () => {
    const o = overheadVariance({ actualCost: 260000, actualActivity: 1100, standardActivityForActualOutput: 1000, normalActivity: 1200, budgetFixed: 120000, budgetVariablePerUnit: 100 });
    expect(o.standardRate).toBe(200);
    expect(o.onBudget).toBe(260000 - 230000);
    expect(o.onActivity).toBe(230000 - 220000);
    expect(o.onEfficiency).toBe(20000);
    expect(o.onBudget + o.onActivity + o.onEfficiency).toBe(o.total);
  });
  it('écarts sur chiffre d’affaires et sur marge', () => {
    const r = revenueVariance([{ code: 'A', actualQty: 120, actualPrice: 11, budgetQty: 100, budgetPrice: 10 }, { code: 'B', actualQty: 60, actualPrice: 19, budgetQty: 100, budgetPrice: 20 }]);
    expect(r.onPrice).toBe(120 - 60);
    expect(r.onPrice + r.onMix + r.onVolume).toBeCloseTo(r.total, 6);
    expect(revenueVariance([{ code: 'A', actualQty: 1, actualPrice: 1, budgetQty: 0, budgetPrice: 1 }]).onVolume).toBe(0);
    const m = marginVariance({ actualQty: 110, actualUnitMargin: 9, budgetQty: 100, budgetUnitMargin: 10 });
    expect(m.onUnitMargin + m.onQuantity).toBe(m.total);
  });
});

describe('budgets', () => {
  it('tendance, saisonnalité, Wilson, production', () => {
    const t = linearTrend([10, 12, 14, 16]);
    expect(t.a).toBe(2);
    expect(t.b).toBe(8);
    expect(t.r2).toBe(1);
    expect(linearTrend([5, 5]).r2).toBe(1);
    expect(() => linearTrend([1])).toThrow();
    const s = seasonalForecast([[100, 200, 100, 200], [110, 220, 110, 220]]);
    expect(s.coefficients.reduce((a, b) => a + b, 0)).toBeCloseTo(4, 6);
    expect(s.forecast[1]!).toBeGreaterThan(s.forecast[0]!);
    expect(() => seasonalForecast([[1, 2], [1]])).toThrow('HISTORIQUE_IRREGULIER');
    const w = wilson({ annualDemand: 3600, orderCost: 2000, unitPrice: 100, holdingRate: 0.1, leadTimeDays: 10, safetyStock: 50 });
    expect(w.economicQuantity).toBeCloseTo(1200, 6);
    expect(w.ordersPerYear).toBe(3);
    expect(w.reorderPoint).toBe(150);
    expect(w.orderingCost).toBeCloseTo(6000, 6);
    expect(() => wilson({ annualDemand: 0, orderCost: 1, unitPrice: 1, holdingRate: 1 })).toThrow();
    const b = productionBudget([{ sales: 100 }, { sales: 200 }], 30, 0.2);
    expect(b[0]).toMatchObject({ production: 110, closing: 40 });
    expect(b[1]).toMatchObject({ opening: 40, production: 200, closing: 40 });
  });
});
