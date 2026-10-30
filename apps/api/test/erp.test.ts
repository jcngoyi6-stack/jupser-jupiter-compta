/** Lots L7, L7b, L7c — gestion : stocks, achats, production, ventes/CRM, RH, collaboration, GED, courrier. */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let admin: Agent, chef: Agent, compta: Agent, dg: Agent, rh: Agent, com: Agent;
let users: Record<string, { id: string; email: string }>;
let cid: string;
let wh: string;
let supplier: string;
let client: string;

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'ERP', { admin: ['ADMIN'], chef: ['CHEF_COMPTABLE'], compta: ['COMPTABLE', 'CAISSIER'], dg: ['DIRECTION'], rh: ['RH', 'PAIE'], com: ['COMMERCIAL', 'EMPLOYE'] });
  users = t.users;
  admin = await login(ctx, t.users.admin!);
  chef = await login(ctx, t.users.chef!);
  compta = await login(ctx, t.users.compta!);
  dg = await login(ctx, t.users.dg!);
  rh = await login(ctx, t.users.rh!);
  com = await login(ctx, t.users.com!);
  cid = (await makeCompany(admin)).company.id;
  await admin.patch(`/api/companies/${cid}`).set(H).send({ einvoiceSettings: { mode: 'SIMULATION' } });
  wh = (await compta.get(`/api/companies/${cid}/stock/warehouses`)).body[0].id;
  supplier = (await compta.post(`/api/companies/${cid}/third-parties`).set(H).send({ type: 'FOURNISSEUR', code: 'F1', name: 'Grossiste' })).body.id;
  client = (await compta.post(`/api/companies/${cid}/third-parties`).set(H).send({ type: 'CLIENT', code: 'C1', name: 'Boutique', taxId: 'A9', consentMarketing: true, phone: '+243810000000' })).body.id;
});
afterAll(async () => ctx?.app.close());

describe('achats et stocks (inventaire permanent)', () => {
  let item: string;
  it('circuit bon de commande → approbation (quatre yeux) → réception → facture', async () => {
    item = (await compta.post(`/api/companies/${cid}/stock/items`).set(H).send({ code: 'SAC', label: 'Sac de ciment', kind: 'MARCHANDISE', salePrice: '20000', reorderLevel: '5' })).body.id;
    const po = await compta.post(`/api/companies/${cid}/purchases`).set(H).send({ supplierId: supplier, date: `${YEAR}-02-01`, lines: [{ itemId: item, description: 'Ciment', qty: '10', unitPrice: '10000' }] });
    expect(po.body.status).toBe('A_APPROUVER');
    expect((await chef.post(`/api/companies/${cid}/purchases/${po.body.id}/receive`).set(H).send({ date: `${YEAR}-02-02`, warehouseId: wh })).body.code).toBe('STATUT');
    expect((await dg.post(`/api/companies/${cid}/purchases/${po.body.id}/approve`).set(H)).body.status).toBe('VALIDE');
    await compta.post(`/api/companies/${cid}/purchases/${po.body.id}/receive`).set(H).send({ date: `${YEAR}-02-02`, warehouseId: wh });
    const po2 = await compta.post(`/api/companies/${cid}/purchases`).set(H).send({ supplierId: supplier, date: `${YEAR}-02-05`, lines: [{ itemId: item, description: 'Ciment', qty: '10', unitPrice: '16000' }] });
    await dg.post(`/api/companies/${cid}/purchases/${po2.body.id}/approve`).set(H);
    await compta.post(`/api/companies/${cid}/purchases/${po2.body.id}/receive`).set(H).send({ date: `${YEAR}-02-06`, warehouseId: wh });
    const inv = await compta.post(`/api/companies/${cid}/purchases/${po.body.id}/invoice`).set(H).send({ date: `${YEAR}-02-03`, supplierInvoiceNumber: 'FG-1' });
    expect(inv.body.status).toBe('VALIDE');
    const items = await compta.get(`/api/companies/${cid}/stock/items`);
    expect(items.body[0]).toMatchObject({ qtyMilli: '20000', unitCost: '1300000' }); // CMUP 13 000,00
  });
  it('vente d’articles : facture normalisée + sortie de stock au CMUP + encaissement lettré', async () => {
    const inv = await compta.post(`/api/companies/${cid}/invoices`).set(H).send({ date: `${YEAR}-02-10`, thirdPartyId: client, warehouseId: wh, paymentMethod: 'ESPECES', lines: [{ itemId: item, description: 'Ciment', quantity: 15, unitPrice: '20000', vat: 'NORMAL', account: '701100' }] });
    expect(inv.status).toBe(201);
    const items = await compta.get(`/api/companies/${cid}/stock/items`);
    expect(items.body[0].qtyMilli).toBe('5000');
    expect(items.body[0].belowReorder).toBe(true);
    const pay = await compta.post(`/api/companies/${cid}/invoices/${inv.body.id}/payment`).set(H).send({ date: `${YEAR}-02-11`, journalCode: 'CAI' });
    expect(pay.status).toBe(201);
    const open = await compta.get(`/api/companies/${cid}/open-items?account=411`);
    expect(open.body.every((l: any) => l.letter)).toBe(true);
  });
  it('refuse une sortie supérieure au stock ; inventaire physique comptabilisé', async () => {
    const ko = await compta.post(`/api/companies/${cid}/stock/moves`).set(H).send({ type: 'SORTIE', itemId: item, warehouseId: wh, date: `${YEAR}-02-12`, qty: '99', reference: 'BS-1' });
    expect(ko.body.code).toBe('STOCK_INSUFFISANT');
    const inv = await chef.post(`/api/companies/${cid}/stock/inventory`).set(H).send({ date: `${YEAR}-02-28`, warehouseId: wh, counts: [{ itemId: item, counted: '4' }] });
    expect(inv.body[0].diffMilli).toBe('-1000');
  });
});

describe('production', () => {
  it('fabrique selon la nomenclature et calcule le coût de revient', async () => {
    const mp = (await compta.post(`/api/companies/${cid}/stock/items`).set(H).send({ code: 'FAR', label: 'Farine (kg)', kind: 'MATIERE' })).body.id;
    const pf = (await compta.post(`/api/companies/${cid}/stock/items`).set(H).send({ code: 'PAIN', label: 'Pain', kind: 'PRODUIT_FINI' })).body.id;
    await compta.post(`/api/companies/${cid}/stock/moves`).set(H).send({ type: 'ENTREE', itemId: mp, warehouseId: wh, date: `${YEAR}-03-01`, qty: '100', unitCost: '2000', reference: 'BE-1' });
    const bom = await chef.post(`/api/companies/${cid}/production/boms`).set(H).send({ productId: pf, components: [{ itemId: mp, qty: '0.5' }], routing: [{ poste: 'Four', minutes: 6, hourlyRate: '6000' }], overheadRate: '0.10' });
    const sim = await chef.post(`/api/companies/${cid}/production/work-orders`).set(H).send({ bomId: bom.body.id, qty: '10', date: `${YEAR}-03-02`, warehouseId: wh, simulate: true });
    expect(sim.body.sheet.total).toBe('1760000'); // matières 1 000 000 + main-d'œuvre 600 000 + 10 % de frais
    const of = await chef.post(`/api/companies/${cid}/production/work-orders`).set(H).send({ bomId: bom.body.id, qty: '10', date: `${YEAR}-03-02`, warehouseId: wh });
    expect(of.body.status).toBe('TERMINE');
    const items = await compta.get(`/api/companies/${cid}/stock/items`);
    expect(items.body.find((i: any) => i.code === 'PAIN')).toMatchObject({ qtyMilli: '10000', unitCost: '176000' });
  });
});

describe('ventes et CRM', () => {
  it('devis avec QR, pipeline commercial, campagne avec consentement et désinscription', async () => {
    const dv = await com.post(`/api/companies/${cid}/sales-docs`).set(H).send({ type: 'DEVIS', date: `${YEAR}-04-01`, thirdPartyId: client, lines: [{ description: 'Livraison', quantity: 1, unitPrice: '50000', vat: 'NORMAL' }] });
    expect(dv.body.number).toMatch(/^DV-/);
    const lead = await com.post(`/api/companies/${cid}/crm/leads`).set(H).send({ name: 'Prospect', org: 'Hôtel Fleuve', phone: '+243820000000', consent: true });
    await com.post(`/api/companies/${cid}/crm/leads/${lead.body.id}/stage`).set(H).send({ stage: 'GAGNE' });
    const noConsent = await com.post(`/api/companies/${cid}/crm/leads`).set(H).send({ name: 'Sans accord', phone: '+243830000000' });
    expect(noConsent.status).toBe(201);
    const c = await com.post(`/api/companies/${cid}/crm/campaigns`).set(H).send({ name: 'Promo', channel: 'SMS', message: 'Bonjour {{nom}}, -10 % ce mois-ci' });
    expect(c.body.stats).toMatchObject({ audience: 4, eligible: 3, sent: 3, excludedNoConsent: 1 });
    const msg = await ctx.db.forTenant((await ctx.db.client.tenant.findFirst({ where: { name: 'ERP' }, orderBy: { createdAt: 'desc' } })).id, (tx: any) => tx.campaignMessage.findFirst());
    const u = await request(ctx.server).post(`/api/unsubscribe/${msg.token}`);
    expect(u.body.ok).toBe(true);
    const d = await com.get(`/api/companies/${cid}/crm/dashboard`);
    expect(d.body.pipeline.find((p: any) => p.stage === 'GAGNE').count).toBe(1);
  });
});

describe('RH : congés, pointage biométrique → paie, recrutement, libre-service', () => {
  let empId: string;
  it('importe les pointages FingerTec et les transmet à la paie sans ressaisie', async () => {
    const e = await rh.post(`/api/companies/${cid}/payroll/employees`).set(H).send({ matricule: 'M1', fullName: 'Agent', hireDate: `${YEAR}-01-01`, currency: 'CDF', dependents: 0, badgeId: '12', userId: users.com!.id, elements: [{ code: 'BASE', label: 'Base', amount: '1730000', taxable: true, contributable: true }] });
    empId = e.body.id;
    const imp = await rh.post(`/api/companies/${cid}/hr/attendance/import`).set(H).send({ content: `AC-No.;Date;Time\n12;02/05/${YEAR};08:30\n12;02/05/${YEAR};18:00\n99;02/05/${YEAR};08:00` });
    expect(imp.body).toEqual({ days: 1, unknownBadges: ['99'] });
    await rh.post(`/api/companies/${cid}/hr/attendance/validate`).set(H).send({ month: `${YEAR}-05` });
    const tid = (await ctx.db.client.tenant.findFirst({ where: { name: 'ERP' }, orderBy: { createdAt: 'desc' } })).id;
    for (const [param, value] of [['majoration_hs_pct', 30], ['heures_mensuelles', 173]] as const) {
      await ctx.db.client.taxRule.create({ data: { country: 'CD', tax: 'PRESENCE', param, value, effectiveFrom: `${YEAR}-02-01`, status: 'VALIDE', legalRef: 'cas de test' } });
    }
    void tid;
    const run = await rh.post(`/api/companies/${cid}/payroll/runs`).set(H).send({ period: `${YEAR}-05`, payDate: `${YEAR}-05-31` });
    expect(run.status).toBe(201);
    const hs = run.body.payslips[0].convertedElements.find((x: any) => x.code === 'HS');
    expect(hs.local).toBe('1950000'); // 90 min sup. × 10 000 CDF/h (1 730 000 / 173 h) × 1,30 = 19 500 CDF
  });
  it('congés : demande en libre-service, validation par les RH', async () => {
    await ctx.db.forTenant((await ctx.db.client.tenant.findFirst({ where: { name: 'ERP' }, orderBy: { createdAt: 'desc' } })).id, (tx: any) => tx.employee.update({ where: { id: empId }, data: { leaveBalance: 1000 } }));
    const req = await com.post(`/api/companies/${cid}/hr/leaves`).set(H).send({ fromDate: `${YEAR}-06-01`, toDate: `${YEAR}-06-05` });
    expect(req.body.days).toBe(500);
    expect((await rh.post(`/api/companies/${cid}/hr/leaves/${req.body.id}/decide`).set(H).send({ approve: true })).body.status).toBe('APPROUVE');
    const me = await com.get(`/api/companies/${cid}/hr/me`);
    expect(me.body.payslips).toHaveLength(1);
    expect(me.body.employee.leaveBalance).toBe(500);
  });
  it('recrutement : critères pondérés, critère discriminatoire refusé, classement', async () => {
    expect((await rh.post(`/api/companies/${cid}/hr/jobs`).set(H).send({ title: 'Comptable', criteria: [{ code: 'AGE', label: 'Âge', weight: 1 }] })).body.code).toBe('CRITERES');
    const job = await rh.post(`/api/companies/${cid}/hr/jobs`).set(H).send({ title: 'Comptable', criteria: [{ code: 'DIP', label: 'Diplôme', weight: 2 }, { code: 'EXP', label: 'Expérience', weight: 3 }] });
    const a = await rh.post(`/api/companies/${cid}/hr/jobs/${job.body.id}/candidates`).set(H).send({ name: 'Alpha' });
    const b = await rh.post(`/api/companies/${cid}/hr/jobs/${job.body.id}/candidates`).set(H).send({ name: 'Bravo' });
    await rh.post(`/api/companies/${cid}/hr/candidates/${a.body.id}/scores`).set(H).send({ scores: [{ criterion: 'DIP', score: 12 }, { criterion: 'EXP', score: 10 }] });
    await rh.post(`/api/companies/${cid}/hr/candidates/${b.body.id}/scores`).set(H).send({ scores: [{ criterion: 'DIP', score: 16 }, { criterion: 'EXP', score: 15 }] });
    const jobs = await rh.get(`/api/companies/${cid}/hr/jobs`);
    expect(jobs.body[0].ranking.map((r: any) => r.name)).toEqual(['Bravo', 'Alpha']);
  });
});

describe('collaboration, GED, courrier', () => {
  it('messagerie, réunion → tâches, alertes', async () => {
    const ch = await chef.post('/api/collab/channels').set(H).send({ name: 'Comptabilité' });
    await chef.post(`/api/collab/channels/${ch.body.id}/messages`).set(H).send({ body: 'Voir la facture FA-0001', link: '/factures' });
    expect((await compta.get(`/api/collab/channels/${ch.body.id}/messages`)).body[0].author).toBe('chef');
    const m = await chef.post('/api/collab/meetings').set(H).send({ title: 'Clôture mensuelle', agenda: 'Revue', date: `${YEAR}-12-20T09:00`, location: 'Salle A', participants: [users.compta!.id] });
    await compta.post(`/api/collab/meetings/${m.body.id}/ack`).set(H);
    await chef.post(`/api/collab/meetings/${m.body.id}/minutes`).set(H).send({ minutes: 'PV de la réunion', decisions: [{ text: 'Relancer les clients', assigneeId: users.compta!.id }] });
    const tasks = await compta.get('/api/collab/tasks');
    expect(tasks.body.map((t: any) => t.source).sort()).toEqual(['DECISION', 'REUNION']);
    const alerts = await chef.get('/api/collab/alerts');
    expect(alerts.body.some((a: any) => a.kind === 'STOCK_BAS')).toBe(true);
  });
  it('GED : dépôt chiffré, classement automatique, recherche, intégrité', async () => {
    const text = `FACTURE N° 77\nSNEL\nDate : 15/03/${YEAR}\nTotal TTC : 116 000,00 CDF`;
    const d = await compta.post('/api/ged/documents').set(H).send({ fileName: 'snel.txt', mimeType: 'text/plain', base64: Buffer.from(text).toString('base64') });
    expect(d.body).toMatchObject({ category: 'FACTURE_FOURNISSEUR', docDate: `${YEAR}-03-15`, amount: '11600000', retentionUntil: `${YEAR + 10}-12-31` });
    expect((await compta.get('/api/ged/documents?q=snel')).body).toHaveLength(1);
    expect((await compta.get(`/api/ged/documents/${d.body.id}/content`)).body.intact).toBe(true);
  });
  it('courrier : registre numéroté, affectation et circuit', async () => {
    const m = await compta.post('/api/mail').set(H).send({ direction: 'ARRIVE', date: `${YEAR}-03-01`, correspondent: 'DGI', subject: 'Avis de contrôle', assigneeId: users.chef!.id, dueDate: `${YEAR}-03-10` });
    expect(m.body.number).toBe(`CA-${YEAR}-00001`);
    const s = await chef.post(`/api/mail/${m.body.id}/step`).set(H).send({ action: 'TRAITE', note: 'Réponse envoyée' });
    expect(s.body.steps).toHaveLength(2);
  });
});
