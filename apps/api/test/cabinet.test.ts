/** Espace Cabinet (docs/15) et évaluation des projets d'investissement (docs/16). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let admin: Agent, prep: Agent, rev: Agent, partner: Agent;
let cid: string;
let mission: string;

const binary = (res: { on: (e: string, cb: (c?: Buffer) => void) => void; setEncoding?: unknown }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c!));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'CAB', { admin: ['ADMIN'], prep: ['COMPTABLE'], rev: ['CHEF_COMPTABLE'], partner: ['EXPERT_EXTERNE'] }, 'CABINET');
  admin = await login(ctx, t.users.admin!);
  prep = await login(ctx, t.users.prep!);
  rev = await login(ctx, t.users.rev!);
  partner = await login(ctx, t.users.partner!);
  cid = (await makeCompany(admin)).company.id;
  for (const [i, d] of [[1, `${YEAR}-03-14`], [2, `${YEAR}-12-30`]] as const) {
    await prep.post(`/api/companies/${cid}/entries?validate=true`).set(H).send({
      journalCode: 'OD', date: d, pieceRef: `PJ-${i}`, label: i === 1 ? 'Apport' : 'Divers',
      lines: [{ account: '521100', debit: '5000000' }, { account: '101300', credit: '5000000' }],
    });
  }
});
afterAll(async () => ctx?.app.close());

describe('missions, temps et circuit de revue', () => {
  it('crée une mission et suit les temps', async () => {
    const m = await prep.post('/api/cabinet/missions').set(H).send({ companyId: cid, type: 'AUDIT', title: 'Audit des comptes', budgetHours: 1, feeAmount: '1000000', hourlyRate: '50000', deadline: `${YEAR}-03-31` });
    expect(m.status).toBe(201);
    mission = m.body.id;
    await prep.post(`/api/cabinet/missions/${mission}/time`).set(H).send({ date: `${YEAR}-02-01`, minutes: 90, description: 'Planification' });
    const p = await rev.get('/api/cabinet/profitability');
    expect(p.body.missions[0]).toMatchObject({ minutes: 90, overBudget: true });
    expect(p.body.staff[0].name).toBe('prep');
    const pf = await rev.get('/api/cabinet/portfolio');
    expect(pf.body[0].missions[0].alerts).toContain('BUDGET_HEURES_DEPASSE');
    const dl = await rev.get(`/api/cabinet/deadlines?from=${YEAR}-01-01&to=${YEAR}-12-31`);
    expect(dl.body.map((x: { kind: string }) => x.kind)).toEqual(['MISSION', 'CLOTURE']);
  });

  it('impose la séparation préparateur / réviseur / associé', async () => {
    await prep.post(`/api/cabinet/missions/${mission}/review`).set(H).send({ action: 'SOUMETTRE' });
    expect((await prep.post(`/api/cabinet/missions/${mission}/review`).set(H).send({ action: 'APPROUVER' })).body.code).toBe('SEPARATION_DES_TACHES');
    const pt = await rev.post(`/api/cabinet/missions/${mission}/review/points`).set(H).send({ text: 'Justifier la caisse' });
    expect((await rev.post(`/api/cabinet/missions/${mission}/review`).set(H).send({ action: 'APPROUVER' })).body.code).toBe('POINTS_DE_REVUE_OUVERTS');
    await prep.post(`/api/cabinet/missions/${mission}/review/points/${pt.body.review.points[0].id}/resolve`).set(H);
    expect((await rev.post(`/api/cabinet/missions/${mission}/review`).set(H).send({ action: 'APPROUVER' })).body.review.stage).toBe('SIGNATURE');
  });

  it('dossier d’audit : seuil, risques, feuilles de travail, anomalies, analyses automatisées', async () => {
    const pl = await rev.put(`/api/cabinet/missions/${mission}/audit/planning`).set(H).send({
      benchmarks: [{ name: 'Total bilan', base: 10000000, rate: 0.01 }], selected: 'Total bilan', performanceRatio: 0.75, trivialRatio: 0.05,
      risks: [{ cycle: 'TRESORERIE', inherent: 3, control: 2 }],
    });
    expect(pl.body.audit.planning.result.overall).toBe(100000);
    expect((await rev.put(`/api/cabinet/missions/${mission}/audit/planning`).set(H).send({ benchmarks: [{ name: 'a', base: 1, rate: 0.1 }], selected: 'b', performanceRatio: 1, trivialRatio: 1 })).body.code).toBe('REFERENCE_INCONNUE');
    await prep.put(`/api/cabinet/missions/${mission}/audit/workpapers/TRESORERIE:T1`).set(H).send({ status: 'TERMINE', conclusion: 'Confirmé' });
    expect((await prep.put(`/api/cabinet/missions/${mission}/audit/workpapers/TRESORERIE:T1`).set(H).send({ status: 'TERMINE', review: true })).body.code).toBe('SEPARATION_DES_TACHES');
    await rev.put(`/api/cabinet/missions/${mission}/audit/workpapers/TRESORERIE:T1`).set(H).send({ status: 'TERMINE', review: true });
    await rev.put(`/api/cabinet/missions/${mission}/audit/independence`).set(H).send({ answers: { interets_financiers: false } });
    await rev.post(`/api/cabinet/missions/${mission}/audit/misstatements`).set(H).send({ description: 'Cut-off', amount: 150000 });
    const a = await rev.get(`/api/cabinet/missions/${mission}/audit`);
    expect(a.body.referentialStatus).toBe('A_VALIDER');
    expect(a.body.independence.accepted).toBe(true);
    const tr = a.body.programmes.find((p: { cycle: string }) => p.cycle === 'TRESORERIE');
    expect(tr.risk.level).toBe('ELEVE');
    expect(tr.procedures[0]).toMatchObject({ workpaper: 'T-01', status: 'TERMINE', reviewedBy: expect.any(String) });
    expect(a.body.summary.exceedsMateriality).toBe(true);
    const an = await rev.get(`/api/cabinet/missions/${mission}/audit/analytics`);
    expect(an.status).toBe(200);
    const flagged = an.body.unusualEntries.find((e: { description: string }) => e.description === 'Divers');
    expect(flagged.flags).toEqual(expect.arrayContaining(['PROCHE_CLOTURE', 'LIBELLE_VAGUE', 'MONTANT_ROND']));
  });

  it('signature par l’associé puis verrouillage', async () => {
    expect((await partner.post(`/api/cabinet/missions/${mission}/review`).set(H).send({ action: 'SIGNER' })).body.status).toBe('TERMINEE');
    expect((await prep.put(`/api/cabinet/missions/${mission}/audit/workpapers/TRESORERIE:T2`).set(H).send({ status: 'EN_COURS' })).body.code).toBe('DOSSIER_VERROUILLE');
  });

  it('génère les documents de mission en Word', async () => {
    for (const kind of ['lettre-mission', 'demande-pieces', 'lettre-affirmation', 'confirmation-banque']) {
      const r = await rev.post(`/api/cabinet/missions/${mission}/documents/${kind}`).set(H).send({ firm: 'Cabinet Test', partner: 'Associé', recipient: 'Banque' }).buffer(true).parse(binary);
      expect(r.status).toBe(201);
      expect((r.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    }
    expect((await rev.post(`/api/cabinet/missions/${mission}/documents/inconnu`).set(H).send({ firm: 'Cabinet', partner: 'Associé' })).status).toBe(400);
  });
});

describe('production des états depuis une balance importée', () => {
  it('contrôles, états, analyse et variations N/N-1', async () => {
    const lines = [
      { source: '1013', target: '101300', debit: '0', credit: '10000000' },
      { source: '5211', target: '521100', debit: '14000000', credit: '0' },
      { source: '7011', target: '701100', debit: '0', credit: '8000000' },
      { source: '6011', target: '601100', debit: '4000000', credit: '0' },
    ];
    const prior = [
      { source: '1013', target: '101300', debit: '0', credit: '10000000' },
      { source: '5211', target: '521100', debit: '11000000', credit: '0' },
      { source: '7011', target: '701100', debit: '0', credit: '2000000' },
      { source: '6011', target: '601100', debit: '1000000', credit: '0' },
    ];
    const r = await rev.post('/api/cabinet/balance-statements').set(H).send({ companyId: cid, lines, prior });
    expect(r.status).toBe(200);
    expect(r.body.controls.balanced).toBe(true);
    expect(r.body.incomeStatement.values.XI).toBe('400000000'); // unités mineures (CDF à 2 décimales)
    expect(r.body.variations.length).toBeGreaterThan(0);
    const bad = await rev.post('/api/cabinet/balance-statements').set(H).send({ companyId: cid, lines: lines.slice(0, 2), remember: false });
    expect(bad.body.controls.balanced).toBe(false);
  });
});

describe('manuel de procédures, évaluation, restructuration', () => {
  it('manuel JSON et Word', async () => {
    const body = { companyId: cid, sector: 'COMMERCE', positions: [{ id: 'dg', title: 'Gérant' }, { id: 'cpt', title: 'Comptable' }] };
    const j = await rev.post('/api/cabinet/manual').set(H).send(body);
    expect(j.body.status).toBe('PROJET_A_VALIDER');
    expect(j.body.segregationIssues.length).toBeGreaterThan(0);
    expect(j.body.annexes.chartOfAccounts.length).toBeGreaterThan(100);
    const w = await rev.post('/api/cabinet/manual?format=docx').set(H).send(body).buffer(true).parse(binary);
    expect((w.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('évaluation d’entreprise multicritère', async () => {
    const r = await rev.post('/api/cabinet/valuation').set(H).send({
      ancc: { equity: 1000, adjustments: [{ label: 'Terrain', amount: 100 }] }, earnings: { normativeProfit: 150, capitalisationRate: 0.15 },
      goodwill: { profit: 150, normalReturn: 0.1, discountRate: 0.15, years: 5 }, dcf: { freeCashFlows: [100, 110], discountRate: 0.12, terminalGrowth: 0.02, netDebt: 200 },
      multiples: { metrics: { EBE: 200 }, multiples: [{ name: 'VE/EBE', metric: 'EBE', multiple: 5, isEnterpriseValue: true }], netDebt: 200 },
    });
    expect(r.body.synthesis.methods).toHaveLength(5);
    expect((await rev.post('/api/cabinet/valuation').set(H).send({ ancc: { equity: 1 }, earnings: { normativeProfit: 1, capitalisationRate: 0 } })).body.code).toBe('TAUX_CAPITALISATION_INVALIDE');
  });

  it('scénarios de restructuration', async () => {
    const r = await rev.post('/api/cabinet/restructuring').set(H).send({
      base: { revenue: 1000, variableCostRate: 0.5, fixedCosts: 300, personnel: 250, debt: 600, interestRate: 0.1, cash: 20, annualDebtRepayment: 200, taxRate: 0.3, depreciation: 50 },
      scenarios: [{ name: 'Plan', levers: [{ kind: 'REECHELONNEMENT', year: 1, value: 0, newTermYears: 5 }] }], years: 3,
    });
    expect(r.body.scenarios.map((s: { name: string }) => s.name)).toEqual(['Sans mesure', 'Plan']);
  });

  it('module Cabinet refusé à une entreprise', async () => {
    const t = await makeTenant(ctx, 'ENT', { a: ['ADMIN'] });
    const a = await login(ctx, t.users.a!);
    expect((await a.get('/api/cabinet/missions')).body.code).toBe('MODULE_NON_SOUSCRIT');
  });
});

describe('projets d’investissement', () => {
  const input = {
    name: 'Boulangerie', country: 'CD', currency: 'CDF', years: 5, discountRate: 0.12, taxRate: 0.3,
    investments: [{ label: 'Four', year: 0, amount: 100000000, lifeYears: 5 }],
    products: [{ name: 'Pain', volumes: [100000, 120000], price: 1000, unitVariableCost: 400 }],
    fixedCosts: [10000000], personnelCosts: [15000000], workingCapital: { receivableDays: 10, inventoryDays: 15, payableDays: 30 },
    loans: [{ amount: 50000000, rate: 0.1, years: 4 }], jobs: 8,
  };
  let id: string;
  it('calcule, enregistre, signale la règle d’IS non validée', async () => {
    const c = await rev.post('/api/projects/compute').set(H).send(input);
    expect(c.status).toBe(200);
    expect(c.body.result.economic.irr).toBeGreaterThan(0);
    expect(c.body.taxCheck.status).toBe('A_VALIDER');
    expect((await rev.post('/api/projects/compute').set(H).send({ ...input, country: undefined })).body.taxCheck.status).toBe('NON_VERIFIE');
    expect((await rev.post('/api/projects/compute').set(H).send({ ...input, years: 0 })).status).toBe(400);
    id = (await rev.post('/api/projects').set(H).send({ name: 'Boulangerie', input })).body.id;
    const id2 = (await rev.post('/api/projects').set(H).send({ name: 'Variante', input: { ...input, discountRate: 0.2 } })).body.id;
    expect((await rev.get('/api/projects')).body).toHaveLength(2);
    expect((await rev.get(`/api/projects/${id}`)).body.result.rows).toHaveLength(6);
    const cmp = await rev.post('/api/projects/compare').set(H).send({ ids: [id, id2] });
    expect(cmp.body[0].name).toBe('Boulangerie');
    await rev.put(`/api/projects/${id2}`).set(H).send({ input: { ...input, discountRate: 0.15 } });
    expect((await rev.delete(`/api/projects/${id2}`).set(H)).status).toBe(204);
  });
  it('analyse de risque et rapport Word', async () => {
    const r = await rev.post(`/api/projects/${id}/risk`).set(H).send({
      scenarios: [{ name: 'Pessimiste', multipliers: { price: 0.9 } }],
      monteCarlo: { iterations: 200, seed: 3, distributions: { price: { type: 'triangular', min: 0.8, mode: 1, max: 1.1 } } },
    });
    expect(r.body.sensitivity).toHaveLength(6);
    expect(r.body.monteCarlo.iterations).toBe(200);
    const w = await rev.post(`/api/projects/${id}/report.docx`).set(H).send({ brand: 'Cabinet Test' }).buffer(true).parse(binary);
    expect(w.status).toBe(201);
    expect((w.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
});
