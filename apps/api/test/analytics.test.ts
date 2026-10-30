/** Comptabilité analytique de gestion : collecte dans tout le système, calcul, concordance, classe 9, interconnexions. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let chef: Agent, compta: Agent, dg: Agent;
let cid: string;
let wh: string;
let bomId: string;
let periodId: string;
const from = `${YEAR}-04-01`;
const to = `${YEAR}-04-30`;
const binary = (res: { on: (e: string, cb: (c?: Buffer) => void) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c!));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'CAGE', { admin: ['ADMIN'], chef: ['CHEF_COMPTABLE'], compta: ['COMPTABLE', 'CAISSIER'], dg: ['DIRECTION'] });
  const admin = await login(ctx, t.users.admin!);
  chef = await login(ctx, t.users.chef!);
  compta = await login(ctx, t.users.compta!);
  dg = await login(ctx, t.users.dg!);
  cid = (await makeCompany(admin)).company.id;
  await admin.patch(`/api/companies/${cid}`).set(H).send({ einvoiceSettings: { mode: 'SIMULATION' } });
  wh = (await compta.get(`/api/companies/${cid}/stock/warehouses`)).body[0].id;
  const client = (await compta.post(`/api/companies/${cid}/third-parties`).set(H).send({ type: 'CLIENT', code: 'C1', name: 'Boulangerie cliente', taxId: 'A77' })).body.id;
  const mp = (await compta.post(`/api/companies/${cid}/stock/items`).set(H).send({ code: 'FAR', label: 'Farine (kg)', kind: 'MATIERE' })).body.id;
  const pf = (await compta.post(`/api/companies/${cid}/stock/items`).set(H).send({ code: 'PAIN', label: 'Pain', kind: 'PRODUIT_FINI', salePrice: '5000' })).body.id;
  await compta.post(`/api/companies/${cid}/stock/moves`).set(H).send({ type: 'ENTREE', itemId: mp, warehouseId: wh, date: `${YEAR}-04-01`, qty: '100', unitCost: '2000', reference: 'BE-1' });
  bomId = (await chef.post(`/api/companies/${cid}/production/boms`).set(H).send({ productId: pf, components: [{ itemId: mp, qty: '0.5' }], routing: [{ poste: 'ATE', minutes: 6, hourlyRate: '6000' }], overheadRate: '0.10' })).body.id;
  await chef.post(`/api/companies/${cid}/production/work-orders`).set(H).send({ bomId, qty: '10', date: `${YEAR}-04-02`, warehouseId: wh });
  const inv = await compta.post(`/api/companies/${cid}/invoices`).set(H).send({ date: `${YEAR}-04-10`, thirdPartyId: client, warehouseId: wh, paymentMethod: 'ESPECES', lines: [{ itemId: pf, description: 'Pain', quantity: 8, unitPrice: '5000', vat: 'NORMAL', account: '702100' }] });
  expect(inv.status).toBe(201);
  const entry = (lines: unknown[], label: string, pieceRef: string) =>
    compta.post(`/api/companies/${cid}/entries?validate=true`).set(H).send({ journalCode: 'OD', date: `${YEAR}-04-05`, pieceRef, label, lines });
  expect((await entry([{ account: '622200', debit: '30000' }, { account: '521100', credit: '30000' }], 'Loyer du mois', 'LOY-4')).status).toBe(201);
  expect((await entry([{ account: '605200', debit: '5000', analytic: 'ATE' }, { account: '521100', credit: '5000' }], 'Électricité atelier', 'SNEL-4')).status).toBe(201);
  expect((await entry([{ account: '812000', debit: '1000' }, { account: '521100', credit: '1000' }], 'Sortie d’immobilisation', 'HAO-4')).status).toBe(201);
});
afterAll(async () => ctx?.app.close());

describe('paramétrage', () => {
  it('propose un paramétrage par défaut puis l’enregistre avec contrôles', async () => {
    const c = await compta.get(`/api/companies/${cid}/analytics/config`);
    expect(c.body.configured).toBe(false);
    const settings = { ...c.body.settings, supplementary: { equityRate: 0.12, ownerAnnual: 0, centre: 'ADM' }, standards: { prices: { FAR: 1900 }, hourlyRates: { ATE: 6000 } } };
    expect((await compta.put(`/api/companies/${cid}/analytics/config`).set(H).send(settings)).body.code).toBe('ROLE');
    expect((await chef.put(`/api/companies/${cid}/analytics/config`).set(H).send({ ...settings, transfers: { ADM: { ATE: 50 } } })).body.code).toBe('CLE_SECONDAIRE_NON_100');
    expect((await chef.put(`/api/companies/${cid}/analytics/config`).set(H).send({ ...settings, keys: [{ prefix: '62', shares: { ZZZ: 1 } }] })).body.code).toBe('CENTRE_INCONNU');
    expect((await chef.put(`/api/companies/${cid}/analytics/config`).set(H).send({ ...settings, transfers: { ATE: { DIS: 100 } } })).body.code).toBe('CENTRE_AUXILIAIRE');
    expect((await chef.put(`/api/companies/${cid}/analytics/config`).set(H).send({ ...settings, centres: [...settings.centres, settings.centres[0]] })).body.code).toBe('CENTRE_EN_DOUBLE');
    const saved = await chef.put(`/api/companies/${cid}/analytics/config`).set(H).send(settings);
    expect(saved.body.configured).toBe(true);
  });
});

describe('collecte et calcul', () => {
  let dataset: any;
  it('collecte la période dans le grand-livre, les stocks, la production et les ventes', async () => {
    const d = await compta.get(`/api/companies/${cid}/analytics/collect?from=${from}&to=${to}`);
    expect(d.status).toBe(200);
    dataset = d.body;
    expect(dataset.charges.find((c: any) => c.account === '605200').analytic).toEqual({ ATE: 5000 });
    expect(dataset.charges.some((c: any) => c.account === '812000')).toBe(true);
    const pain = dataset.products.find((p: any) => p.code === 'PAIN');
    expect(pain).toMatchObject({ produced: 10, sold: 8, salePrice: 5000, consumption: [{ material: 'FAR', quantity: 5 }] });
    expect(pain.directCosts[0].amount).toBe(6000);
    expect(dataset.materials[0]).toMatchObject({ code: 'FAR', purchases: { quantity: 100, price: 2000 } });
    expect(dataset.units).toMatchObject({ APP: 100, ATE: 1, DIS: 400 });
    expect((await compta.get(`/api/companies/${cid}/analytics/collect?from=${to}&to=${from}`)).body.code).toBe('PERIODE_INVALIDE');
  });
  it('calcule coûts, résultats, concordance exacte et journal classe 9 équilibré', async () => {
    const r = await compta.post(`/api/companies/${cid}/analytics/compute`).set(H).send({ dataset });
    expect(r.status).toBe(200);
    const res = r.body.results;
    expect(res.incorporation.nonIncorporableTotal).toBe(1000);
    expect(res.concordance.reconciled).toBe(true);
    // L'entrée en stock de la farine et la main-d'œuvre de l'OF n'ont pas de charge en comptabilité générale : signalé.
    expect(res.concordance.nonImputedDetail.nonImputed).toBe(-206000);
    expect(res.warnings.some((w: string) => w.includes('dépassent de 206000'))).toBe(true);
    expect(res.warnings.some((w: string) => w.includes('603'))).toBe(false);
    expect(res.summary.products[0]).toMatchObject({ code: 'PAIN', sold: 8, revenue: 40000 });
    const ate = res.distribution.unitCosts.find((u: any) => u.centre === 'ATE');
    expect(ate.quantity).toBe(1);
    expect(ate.unitCost).toBeGreaterThan(5000);
    // Application 52 du guide : le coût de l'UO servant à valoriser les stocks exclut l'administration générale.
    const ateStock = res.distribution.stockUnitCosts.find((u: any) => u.centre === 'ATE');
    expect(ateStock.unitCost).toBeLessThan(ate.unitCost);
    expect(ateStock.excludedAdministration).toBeGreaterThan(0);
    for (const e of res.journal.entries) {
      const dr = e.lines.reduce((s: number, l: any) => s + l.debit, 0);
      const cr = e.lines.reduce((s: number, l: any) => s + l.credit, 0);
      expect(Math.abs(dr - cr), e.ref).toBeLessThan(0.005);
    }
    expect(res.journal.balance.some((b: any) => b.account === '981000')).toBe(true);
    const byPeriod = await compta.post(`/api/companies/${cid}/analytics/compute`).set(H).send({ from, to });
    expect(byPeriod.body.results.summary.analyticResult).toBe(res.summary.analyticResult);
    expect((await compta.post(`/api/companies/${cid}/analytics/compute`).set(H).send({})).body.code).toBe('DONNEES_MANQUANTES');
    const noUnits = { ...dataset, units: { ...dataset.units, ATE: 0 } };
    expect((await compta.post(`/api/companies/${cid}/analytics/compute`).set(H).send({ dataset: noUnits })).body.code).toBe('UNITES_OEUVRE_MANQUANTES');
  });
  it('période enregistrée, validée à quatre yeux, exportée', async () => {
    const p = await compta.post(`/api/companies/${cid}/analytics/periods`).set(H).send({ label: `Avril ${YEAR}`, dataset });
    expect(p.status).toBe(201);
    periodId = p.body.id;
    expect((await dg.post(`/api/companies/${cid}/analytics/periods`).set(H).send({ label: 'x', dataset })).body.code).toBe('ROLE');
    expect((await compta.post(`/api/companies/${cid}/analytics/periods/${periodId}/validate`).set(H)).body.code).toBe('ROLE');
    const own = await chef.post(`/api/companies/${cid}/analytics/periods`).set(H).send({ label: 'Brouillon', dataset });
    expect((await chef.post(`/api/companies/${cid}/analytics/periods/${own.body.id}/validate`).set(H)).body.code).toBe('QUATRE_YEUX');
    expect((await chef.delete(`/api/companies/${cid}/analytics/periods/${own.body.id}`).set(H)).status).toBe(204);
    expect((await chef.post(`/api/companies/${cid}/analytics/periods/${periodId}/validate`).set(H)).body.status).toBe('VALIDE');
    expect((await chef.post(`/api/companies/${cid}/analytics/periods/${periodId}/validate`).set(H)).body.code).toBe('DEJA_VALIDEE');
    expect((await chef.delete(`/api/companies/${cid}/analytics/periods/${periodId}`).set(H)).body.code).toBe('PERIODE_VALIDEE');
    expect((await dg.get(`/api/companies/${cid}/analytics/periods`)).body[0].summary.products[0].code).toBe('PAIN');
    expect((await dg.get(`/api/companies/${cid}/analytics/periods/${periodId}`)).body.status).toBe('VALIDE');
    expect((await dg.get(`/api/companies/${cid}/analytics/dashboard`)).body).toHaveLength(1);
    const x = await dg.get(`/api/companies/${cid}/analytics/periods/${periodId}/report.xlsx`).buffer(true).parse(binary);
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
});

describe('interconnexions', () => {
  it('la production impute les frais d’atelier au coût de l’unité d’œuvre de la période validée', async () => {
    const sim = await chef.post(`/api/companies/${cid}/production/work-orders`).set(H).send({ bomId, qty: '10', date: `${YEAR}-05-02`, warehouseId: wh, simulate: true });
    expect(sim.body.sheet.overheadSource).toBe(`CAGE:Avril ${YEAR}`);
    expect(sim.body.sheet.analyticCentres[0].centre).toBe('ATE');
    const before = await chef.post(`/api/companies/${cid}/production/work-orders`).set(H).send({ bomId, qty: '10', date: `${YEAR}-04-03`, warehouseId: wh, simulate: true });
    expect(before.body.sheet.overheadSource).toBe('TAUX_NOMENCLATURE');
  });
  it('écarts sur coûts préétablis des ordres de fabrication', async () => {
    const v = await compta.get(`/api/companies/${cid}/analytics/standards/variances?from=${from}&to=${to}`);
    const far = v.body.rows.find((r: any) => r.element === 'FAR');
    expect(far.onPrice).toBe(500);
    expect(v.body.rows.find((r: any) => r.element === 'ATE').total).toBe(0);
    expect(v.body.missingStandards).toEqual([]);
  });
  it('module non souscrit', async () => {
    const t = await makeTenant(ctx, 'NOCAGE', { a: ['ADMIN'] });
    await ctx.db.client.tenant.update({ where: { id: t.tenant.id }, data: { modules: ['COMPTABILITE'] } });
    const a = await login(ctx, t.users.a!);
    expect((await a.get(`/api/companies/${cid}/analytics/config`)).body.code).toBe('MODULE_NON_SOUSCRIT');
  });
});

describe('outils de calcul', () => {
  const tool = (name: string, body: unknown) => compta.post(`/api/companies/${cid}/analytics/tools/${name}`).set(H).send(body);
  it('coûts partiels, imputation rationnelle, coût marginal', async () => {
    expect((await tool('seuil', { revenue: 120000000, variableCosts: 90000000, fixedCosts: 20000000, startDate: '2010-01-01' })).body.deadPointDate).toBe('2010-08-30');
    expect((await tool('seuil-multi', { products: [{ code: 'A', revenue: 600, variableCosts: 300 }, { code: 'B', revenue: 400, variableCosts: 300 }], fixedCosts: 200 })).body.threshold).toBe(500);
    expect((await tool('couts-specifiques', { products: [{ code: 'A', revenue: 100, variableCosts: 50, specificFixedCosts: 10 }], commonFixedCosts: 20 })).body.result).toBe(20);
    expect((await tool('imputation-rationnelle', { fixedCosts: 9000, variableCostPerUnit: 7, normalActivity: 2000, actualActivity: 400 })).body.difference).toBe(7200);
    expect((await tool('imputation-rationnelle', { fixedCosts: 9000, variableCostPerUnit: 7, normalActivity: 0, actualActivity: 400 })).body.code).toBe('ACTIVITE_NORMALE_INVALIDE');
    expect((await tool('cout-marginal', { rows: [{ quantity: 100, totalCost: 1000 }, { quantity: 200, totalCost: 1500 }], unitPrice: 8 })).body.rows[1].marginal).toBe(5);
  });
  it('ABC, écarts, prévisions, Wilson, budget de production', async () => {
    const abc = await tool('abc', {
      resources: [{ label: 'Salaires indirects', amount: 100000, shares: { R: 40, U: 60 } }],
      activities: [{ code: 'R', label: 'Réception', driver: 'NB_RECEPTIONS' }, { code: 'U', label: 'Usinage', driver: 'HEURES' }],
      volumes: [{ driver: 'NB_RECEPTIONS', volume: 20 }, { driver: 'HEURES', volume: 300 }],
      products: [{ code: 'X', quantity: 10, directCosts: 5000, drivers: { NB_RECEPTIONS: 20, HEURES: 300 }, revenue: 200000 }],
    });
    expect(abc.body.products[0].total).toBe(105000);
    expect((await tool('abc', { activities: [{ code: 'R', label: 'R', driver: 'D' }], volumes: [], products: [] })).body.code).toBe('VOLUME_INDUCTEUR_MANQUANT');
    const e = await tool('ecarts', {
      materials: [{ label: 'Farine', actualQty: 2100, actualPrice: 480, standardQtyForActualOutput: 2000, standardPrice: 500 }],
      overheads: [{ label: 'Atelier', actualCost: 260000, actualActivity: 1100, standardActivityForActualOutput: 1000, normalActivity: 1200, budgetFixed: 120000, budgetVariablePerUnit: 100 }],
      revenue: [{ code: 'A', actualQty: 120, actualPrice: 11, budgetQty: 100, budgetPrice: 10 }],
      margin: { actualQty: 110, actualUnitMargin: 9, budgetQty: 100, budgetUnitMargin: 10 },
    });
    expect(e.body.materials[0].total).toBe(8000);
    expect(e.body.overheads[0].onEfficiency).toBe(20000);
    expect(e.body.margin.total).toBe(-10);
    expect((await tool('previsions', { series: [10, 12, 14, 16], horizon: 2 })).body.forecast).toEqual([18, 20]);
    expect((await tool('previsions', { seasons: [[100, 200], [110, 220]] })).body.seasonal.coefficients).toHaveLength(2);
    expect((await tool('wilson', { annualDemand: 3600, orderCost: 2000, unitPrice: 100, holdingRate: 0.1 })).body.ordersPerYear).toBe(3);
    expect((await tool('budget-production', { sales: [100, 200], openingStock: 30, targetClosingRatio: 0.2 })).body[0].production).toBe(110);
    expect((await tool('inconnu', {})).body.code).toBe('OUTIL_INCONNU');
  });
});
