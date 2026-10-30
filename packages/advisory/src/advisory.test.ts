import { describe, expect, it } from 'vitest';
import {
  npv, irr, mirr, payback, discountedPayback, profitabilityIndex, equivalentAnnuity, capm, wacc, loanSchedule,
  evaluateProject, sensitivity, scenarios, monteCarlo, compareProjects, sample, prng, applyMultipliers, type ProjectInput,
  adjustedNetAssets, earningsValue, goodwillValue, dcfValuation, multiplesValuation, valuationSynthesis,
  restructuringScenario, materiality, riskAssessment, unusualEntries, sequenceCheck, monetaryUnitSample, analyticalReview,
  misstatementSummary, confirmationLetter, workpaperRef, AUDIT_PROGRAMMES, CYCLE_ACCOUNTS,
  reviewTransition, emptyReview, missionProfitability, staffUtilisation, deadlinesInWindow,
  engagementLetter, documentRequest, representationLetter, MISSION_TYPES, generateProceduresManual,
} from './index';

const close = (a: number | null, b: number, eps = 1e-4) => expect(a !== null && Math.abs(a - b) < eps).toBe(true);

describe('critères de choix', () => {
  const flows = [-1000, 300, 400, 500];
  it('VAN, TRI, TRIM', () => {
    close(npv(0.1, flows), -21.0368, 1e-3);
    close(irr(flows), 0.0889633, 1e-5);
    expect(irr([100, 100])).toBeNull();
    expect(irr([0, 0])).toBe(-0.99);
    close(mirr(flows, 0.1, 0.1), Math.pow((300 * 1.21 + 400 * 1.1 + 500) / 1000, 1 / 3) - 1);
    expect(mirr([100], 0.1, 0.1)).toBeNull();
    expect(mirr([100, 100], 0.1, 0.1)).toBeNull();
  });
  it('délais, indice, annuité', () => {
    close(payback(flows), 2 + 300 / 500);
    expect(payback([-100, 10])).toBeNull();
    expect(discountedPayback(flows, 0.1)).toBeNull();
    expect(discountedPayback([-100, 60, 60], 0)).toBeCloseTo(1 + 40 / 60);
    close(profitabilityIndex(flows, 0.1), (1000 - 21.0368) / 1000, 1e-3);
    expect(profitabilityIndex([10], 0.1)).toBeNull();
    close(equivalentAnnuity(1000, 0.1, 3), 402.1148, 1e-3);
    expect(equivalentAnnuity(900, 0, 3)).toBe(300);
    expect(equivalentAnnuity(900, 0.1, 0)).toBe(0);
  });
  it('MEDAF, CMPC', () => {
    close(capm(0.05, 1.2, 0.06), 0.122);
    close(wacc({ equity: 600, debt: 400, costOfEquity: 0.15, costOfDebt: 0.1, taxRate: 0.3 }), 0.118);
    expect(() => wacc({ equity: 0, debt: 0, costOfEquity: 0, costOfDebt: 0, taxRate: 0 })).toThrow('STRUCTURE_FINANCIERE_VIDE');
  });
  it('tableau d’emprunt', () => {
    const a = loanSchedule({ amount: 1000, rate: 0.1, years: 3 });
    close(a[0]?.payment ?? 0, 402.1148, 1e-3);
    expect(Math.abs(a[2]?.closing ?? 1)).toBeLessThan(1e-9);
    const c = loanSchedule({ amount: 900, rate: 0.1, years: 4, deferral: 1, mode: 'AMORTISSEMENT_CONSTANT', year: 1 });
    expect(c[0]).toMatchObject({ year: 2, principal: 0, interest: 90 });
    expect(c[1]?.principal).toBe(300);
    expect(loanSchedule({ amount: 100, rate: 0, years: 2 })[0]?.principal).toBe(50);
    expect(() => loanSchedule({ amount: 1, rate: 0.1, years: 2, deferral: 2 })).toThrow('DIFFERE_TROP_LONG');
  });
});

const project: ProjectInput = {
  years: 5,
  discountRate: 0.12,
  taxRate: 0.3,
  taxHolidayYears: 1,
  investments: [
    { label: 'Terrain', year: 0, amount: 200, lifeYears: 0 },
    { label: 'Équipement', year: 0, amount: 1000, lifeYears: 5 },
  ],
  products: [{ name: 'P', volumes: [100, 120, 150], price: 10, unitVariableCost: 4, priceGrowth: 0.02 }],
  fixedCosts: [100],
  personnelCosts: [150, 160],
  workingCapital: { receivableDays: 36, inventoryDays: 18, payableDays: 9 },
  loans: [{ amount: 500, rate: 0.1, years: 4 }, { amount: 100, rate: 0.1, years: 8 }],
  subsidy: 50,
  jobs: 12,
};

describe('évaluation de projet', () => {
  const r = evaluateProject(project);
  it('tableau prévisionnel cohérent', () => {
    expect(r.rows).toHaveLength(6);
    const y1 = r.rows[1]!;
    expect(y1.revenue).toBe(1000);
    expect(y1.ebitda).toBe(1000 - 400 - 100 - 150);
    expect(y1.depreciation).toBe(200);
    expect(y1.tax).toBe(0); // exonération
    expect(r.rows[0]!.investment).toBe(1200);
    expect(y1.workingCapital).toBeCloseTo((1000 * 36 + 400 * 9) / 360);
    expect(r.residualValue).toBe(200);
    expect(r.rows[5]!.deltaWorkingCapital).toBeCloseTo(r.rows[5]!.workingCapital - r.rows[4]!.workingCapital);
    expect(r.economic.irr).not.toBeNull();
    expect(r.breakEven[0]!.revenue).toBeGreaterThan(0);
    expect(r.economicImpact.jobs).toBe(12);
    expect(r.loans).toHaveLength(2);
    expect(r.rows[0]!.equityFlow).toBeCloseTo(-1200 + 600 + 50);
  });
  it('report déficitaire et seuil nul', () => {
    const loss = evaluateProject({ ...project, taxHolidayYears: 0, products: [{ name: 'P', volumes: [10, 200], price: 10, unitVariableCost: 10 }] });
    expect(loss.rows[1]!.tax).toBe(0);
    expect(loss.breakEven[0]!.revenue).toBeNull();
    const none = evaluateProject({ ...project, products: [{ name: 'X', volumes: [0], price: 1, unitVariableCost: 0 }], fixedCosts: [], personnelCosts: [], workingCapital: undefined, loans: undefined, residualValue: 0, investments: [{ label: 'i', year: 9, amount: 1, lifeYears: 2 }] });
    expect(none.breakEven[0]!.revenue).toBeNull();
    expect(() => evaluateProject({ ...project, years: 0 })).toThrow('HORIZON_INVALIDE');
  });
  it('sensibilité, scénarios, Monte-Carlo, comparaison', () => {
    const s = sensitivity(project);
    expect(s).toHaveLength(6);
    const price = s.find((x) => x.variable === 'price')!;
    expect(price.points[0]!.npv).toBeLessThan(price.points[3]!.npv);
    expect(price.criticalChange).not.toBeNull();
    expect(sensitivity({ ...project, products: [] }, [0.1], ['discountRate'])[0]!.criticalChange).toBeNull();
    const sc = scenarios(project, [
      { name: 'Pessimiste', probability: 0.25, multipliers: { price: 0.9, volume: 0.9 } },
      { name: 'Réaliste', probability: 0.5, multipliers: {} },
      { name: 'Optimiste', probability: 0.25, multipliers: { price: 1.1 } },
    ]);
    expect(sc.results[0]!.npv).toBeLessThan(sc.results[2]!.npv);
    expect(sc.expectedNpv).not.toBeNull();
    expect(scenarios(project, [{ name: 'x', multipliers: {} }]).expectedNpv).toBeNull();
    const mc = monteCarlo(project, { iterations: 300, seed: 7, distributions: {
      price: { type: 'triangular', min: 0.8, mode: 1, max: 1.1 }, volume: { type: 'normal', mean: 1, sd: 0.1 }, fixedCost: { type: 'uniform', min: 0.9, max: 1.2 },
    } });
    expect(mc.histogram.reduce((s, b) => s + b.count, 0)).toBe(300);
    expect(mc.p5).toBeLessThanOrEqual(mc.p95);
    expect(mc.probabilityNegative).toBeGreaterThanOrEqual(0);
    expect(monteCarlo(project, { iterations: 5, seed: 1, distributions: {} }).sd).toBe(0);
    expect(() => monteCarlo(project, { iterations: 0, distributions: {} })).toThrow('ITERATIONS_HORS_LIMITES');
    const cmp = compareProjects([{ name: 'A', input: project }, { name: 'B', input: applyMultipliers(project, { price: 1.2 }) }]);
    expect(cmp[0]).toMatchObject({ rank: 1, name: 'B' });
  });
  it('tirages', () => {
    const rnd = prng(3);
    const t = sample({ type: 'triangular', min: 0, mode: 0.5, max: 1 }, rnd);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1);
    for (let i = 0; i < 50; i++) sample({ type: 'triangular', min: 0, mode: 0.2, max: 1 }, rnd);
  });
});

describe('évaluation d’entreprise', () => {
  it('ANCC, rendement, goodwill, DCF, multiples, synthèse', () => {
    const a = adjustedNetAssets({ equity: 1000, intangibleNonValues: 50, adjustments: [{ label: 'Terrain', amount: 200 }, { label: 'Stock', amount: -20, taxable: false }], deferredTaxRate: 0.3 });
    expect(a.value).toBeCloseTo(1000 - 50 + 140 - 20);
    expect(adjustedNetAssets({ equity: 10, adjustments: [] }).value).toBe(10);
    expect(earningsValue(120, 0.12)).toBeCloseTo(1000);
    expect(() => earningsValue(1, 0)).toThrow();
    const g = goodwillValue({ ancc: 1000, profit: 150, normalReturn: 0.1, discountRate: 0.15, years: 5 });
    expect(g.superProfit).toBe(50);
    expect(g.value).toBeGreaterThan(1000);
    const d = dcfValuation({ freeCashFlows: [100, 110], discountRate: 0.1, terminalGrowth: 0.02, netDebt: 300 });
    expect(d.terminal).toBeCloseTo((110 * 1.02) / 0.08);
    expect(d.equityValue).toBeCloseTo(d.enterpriseValue - 300);
    expect(() => dcfValuation({ freeCashFlows: [1], discountRate: 0.02, terminalGrowth: 0.02, netDebt: 0 })).toThrow();
    const m = multiplesValuation({ metrics: { EBE: 100, RN: 40 }, netDebt: 100, multiples: [
      { name: 'VE/EBE', metric: 'EBE', multiple: 6, isEnterpriseValue: true }, { name: 'PER', metric: 'RN', multiple: 10 },
    ] });
    expect(m.median).toBe(450);
    expect(multiplesValuation({ metrics: { RN: 1 }, netDebt: 0, multiples: [{ name: 'PER', metric: 'RN', multiple: 3 }] }).median).toBe(3);
    expect(multiplesValuation({ metrics: {}, netDebt: 0, multiples: [] }).median).toBe(0);
    expect(() => multiplesValuation({ metrics: {}, netDebt: 0, multiples: [{ name: 'x', metric: 'CA', multiple: 1 }] })).toThrow('AGREGAT_MANQUANT');
    const s = valuationSynthesis([{ name: 'ANCC', value: 1000, weight: 1 }, { name: 'DCF', value: 1400, weight: 3 }]);
    expect(s.weighted).toBe(1300);
    expect([s.low, s.high]).toEqual([1000, 1400]);
    expect(() => valuationSynthesis([])).toThrow();
  });
});

describe('restructuration', () => {
  it('leviers', () => {
    const base = { revenue: 1000, variableCostRate: 0.5, fixedCosts: 300, personnel: 250, debt: 600, interestRate: 0.1, cash: 20, annualDebtRepayment: 200, taxRate: 0.3, depreciation: 50 };
    const without = restructuringScenario(base, [], 3);
    expect(without.viable).toBe(false);
    const withLevers = restructuringScenario(base, [
      { kind: 'REDUCTION_COUTS', year: 1, value: 0.1 }, { kind: 'REDUCTION_EFFECTIFS', year: 1, value: 0.2, cost: 30 },
      { kind: 'CESSION_ACTIF', year: 1, value: 100 }, { kind: 'AUGMENTATION_CAPITAL', year: 2, value: 100 },
      { kind: 'ABANDON_CREANCES', year: 1, value: 100 }, { kind: 'REECHELONNEMENT', year: 1, value: 0, newTermYears: 5 },
      { kind: 'CROISSANCE_CA', year: 2, value: 0.05 },
    ], 4);
    expect(withLevers.minCash).toBeGreaterThan(without.minCash);
    expect(withLevers.rows[1]!.revenue).toBeCloseTo(1050);
    expect(restructuringScenario({ ...base, revenue: 0 }, [], 1).rows[0]!.debtToEbitda).toBeNull();
  });
});

describe('audit', () => {
  it('seuil et risques', () => {
    const m = materiality({ benchmarks: [{ name: 'CA', base: 10000, rate: 0.01 }], selected: 'CA', performanceRatio: 0.75, trivialRatio: 0.05 });
    expect(m.overall).toBe(100);
    expect(m.performance).toBe(75);
    expect(() => materiality({ benchmarks: [], selected: 'x', performanceRatio: 1, trivialRatio: 1 })).toThrow();
    const r = riskAssessment([{ cycle: 'STOCKS', inherent: 3, control: 2 }, { cycle: 'TRESORERIE', inherent: 1, control: 3 }, { cycle: 'PERSONNEL', inherent: 1, control: 1 }]);
    expect(r.map((x) => x.level)).toEqual(['ELEVE', 'MOYEN', 'FAIBLE']);
    expect(Object.keys(AUDIT_PROGRAMMES)).toEqual(Object.keys(CYCLE_ACCOUNTS));
  });
  it('écritures inhabituelles, séquences, sondage, revue analytique', () => {
    const u = unusualEntries([
      { id: '1', date: '2025-12-27', amount: 1000000, description: 'Divers', createdBy: 'a', validatedBy: 'a' },
      { id: '2', date: '2025-06-11', amount: 1234, description: 'Facture client 12' },
      { id: '3', date: '2025-06-11', amount: 0, description: 'ok' },
    ], { periodEnd: '2025-12-31', roundTo: 1000, daysBeforeEnd: 5, threshold: 500000 });
    expect(u[0]!.flags).toEqual(['WEEK_END', 'MONTANT_ROND', 'PROCHE_CLOTURE', 'MEME_SAISISSEUR_VALIDEUR', 'LIBELLE_VAGUE', 'SUPERIEUR_SEUIL']);
    expect(u).toHaveLength(2);
    const s = sequenceCheck(['FV-0001', 'FV-0002', 'FV-0005', 'FV-0002', 'X']);
    expect(s.gaps).toEqual([{ prefix: 'FV-', from: 3, to: 4 }]);
    expect(s.duplicates).toEqual(['FV-0002']);
    const items = Array.from({ length: 20 }, (_, i) => ({ id: String(i), amount: (i + 1) * 100 }));
    const mus = monetaryUnitSample(items, 5, 3);
    expect(mus.selected.length).toBeGreaterThan(0);
    expect(mus.selected.length).toBeLessThanOrEqual(5);
    expect(monetaryUnitSample(items, 0).selected).toEqual([]);
    const a = analyticalReview([
      { account: '701', label: 'Ventes', current: 1500, prior: 1000 },
      { account: '605', label: 'Autres', current: 1010, prior: 1000 },
      { account: '622', label: 'Loyers', current: 500, prior: 0 },
    ], { amountThreshold: 100, pctThreshold: 0.1 });
    expect(a.map((x) => x.account)).toEqual(['701', '622']);
    expect(misstatementSummary([{ ref: 'a', description: '', amount: 120, adjusted: false }, { ref: 'b', description: '', amount: 50, adjusted: true }], 100).exceedsMateriality).toBe(true);
    expect(misstatementSummary([], 100).opinionHint).toBe('OPINION_SANS_RESERVE_ENVISAGEABLE');
  });
  it('lettres et références', () => {
    for (const k of ['CLIENT', 'FOURNISSEUR', 'BANQUE', 'AVOCAT'] as const) {
      expect(confirmationLetter(k, { entity: 'E', auditor: 'A', auditorAddress: 'Kinshasa', recipient: 'R', date: '31/12/2025', balance: '10' })).toContain('à valider');
    }
    expect(workpaperRef('VENTES_CLIENTS', 3)).toBe('V-03');
  });
});

describe('cabinet', () => {
  it('circuit de revue', () => {
    let s = reviewTransition(emptyReview(), 'SOUMETTRE', 'p', 't1');
    expect(() => reviewTransition(s, 'APPROUVER', 'p', 't')).toThrow('SEPARATION_DES_TACHES');
    expect(() => reviewTransition({ ...s, points: [{ id: '1', text: 'x', by: 'r', at: 't', resolved: false }] }, 'APPROUVER', 'r', 't')).toThrow('POINTS_DE_REVUE_OUVERTS');
    const back = reviewTransition(s, 'RENVOYER', 'r', 't');
    expect(back.stage).toBe('PREPARATION');
    s = reviewTransition(s, 'APPROUVER', 'r', 't2');
    expect(() => reviewTransition(s, 'SIGNER', 'r', 't')).toThrow('SEPARATION_DES_TACHES');
    expect(() => reviewTransition({ ...s, points: [{ id: '1', text: 'x', by: 'r', at: 't', resolved: false }] }, 'SIGNER', 'a', 't')).toThrow('POINTS_DE_REVUE_OUVERTS');
    s = reviewTransition(s, 'SIGNER', 'a', 't3');
    expect(s.stage).toBe('VERROUILLE');
    expect(s.history).toHaveLength(3);
    expect(() => reviewTransition(s, 'RENVOYER', 'a', 't')).toThrow('DOSSIER_VERROUILLE');
    expect(() => reviewTransition(emptyReview(), 'SIGNER', 'a', 't')).toThrow('TRANSITION_INVALIDE');
  });
  it('temps et honoraires', () => {
    const missions = [
      { id: 'm1', title: 'Audit', budgetMinutes: 600, feeAmount: 1000000n, hourlyRate: 50000n },
      { id: 'm2', title: 'Tenue', budgetMinutes: 0, feeAmount: 0n, hourlyRate: 30000n },
    ];
    const times = [
      { missionId: 'm1', userId: 'u1', minutes: 720, billable: true },
      { missionId: 'm2', userId: 'u1', minutes: 60, billable: false },
      { missionId: 'm2', userId: 'u2', minutes: 120, billable: true },
    ];
    const p = missionProfitability(missions, times, { u1: 20000n });
    expect(p[0]).toMatchObject({ overBudget: true, budgetUsedPct: 120, valuedTime: 600000n, writeOff: -400000n, cost: 240000n });
    expect(p[1]).toMatchObject({ fee: 60000n, budgetUsedPct: null, writeOff: 0n });
    const st = staffUtilisation(times);
    expect(st.find((x) => x.userId === 'u1')!.rate).toBeCloseTo(720 / 780);
    expect(deadlinesInWindow([{ date: '2026-03-31' }, { date: '2026-01-15' }, { date: '2026-05-01' }], '2026-01-01', '2026-03-31')).toHaveLength(2);
  });
  it('documents de mission', () => {
    const p = { firm: 'Cabinet', client: 'Client', fiscalYear: '2025', fee: '5 000 000 CDF', partner: 'Associé', date: '01/02/2026' };
    for (const t of MISSION_TYPES) {
      expect(engagementLetter(t, p).sections.length).toBe(6);
      expect(documentRequest(t, 'C', '2025').sections[0]!.paragraphs.length).toBeGreaterThanOrEqual(4);
    }
    expect(representationLetter(p).status).toBe('PROJET_A_VALIDER');
  });
  it('manuel de procédures et séparation des tâches', () => {
    const small = generateProceduresManual({ company: 'X', country: 'CD', sector: 'COMMERCE', system: 'NORMAL', positions: [{ id: 'dg', title: 'Directeur' }, { id: 'cpt', title: 'Comptable' }], methods: { inventory: 'FIFO' } });
    expect(small.chapters.map((c) => c.cycle)).toContain('STOCKS');
    expect(small.segregationIssues.length).toBeGreaterThan(0);
    expect(small.methods[2]).toContain('PEPS');
    const big = generateProceduresManual({
      company: 'ONG', country: 'SN', sector: 'ONG', system: 'SMT',
      positions: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, title: id.toUpperCase() })),
      assignments: { ACHATS: { INITIATION: 'a', VALIDATION: 'b', GARDE: 'c', ENREGISTREMENT: 'd', PAIEMENT: 'e' } },
    });
    expect(big.chapters[0]!.cycle).toBe('SUBVENTIONS');
    expect(big.segregationIssues.filter((i) => i.cycle === 'ACHATS')).toHaveLength(0);
    expect(big.methods[0]).toContain('minimal');
    for (const s of ['INDUSTRIE', 'SERVICES', 'BTP', 'MINES', 'AGRICULTURE'] as const) {
      expect(generateProceduresManual({ company: 'Y', country: 'CI', sector: s, system: 'NORMAL', positions: [] }).chapters[0]!.procedures[0]!.actor).toBe('À désigner');
    }
  });
});
