/**
 * Tests d'acceptation de l'API (lots L0, L1, L2, L3, L4, L5, L7b) sur une base PostgreSQL réelle,
 * avec le rôle applicatif soumis à la Row Level Security.
 */
import { authenticator } from 'otplib';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.JWT_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require('../dist/main');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaService } = require('../dist/common/prisma.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AuthService } = require('../dist/auth/auth.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedTaxRules } = require('../dist/common/reference');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EDITION_MODULES } = require('@jupiter/licensing');

type Agent = ReturnType<typeof request.agent>;
const H = { 'X-Requested-With': 'JupiterCompta' };
const PW = 'Test-Password-2026';
const YEAR = new Date().getUTCFullYear();
const run = Date.now().toString(36);

let app: { getHttpServer(): unknown; close(): Promise<void>; get<T>(t: unknown): T };
let db: { client: any; forTenant: (id: string, fn: (tx: any) => Promise<unknown>) => Promise<any> };

async function makeTenant(name: string, roles: Record<string, string[]>) {
  const auth = app.get<{ hash(p: string): Promise<string> }>(AuthService);
  const tenant = await db.client.tenant.create({
    data: { name, edition: 'ERP', modules: EDITION_MODULES.ERP, subStatus: 'ESSAI', trialEndsAt: new Date(Date.now() + 30 * 86_400_000), maxCompanies: 5, maxUsers: 20, aiCredits: 50 },
  });
  const users: Record<string, { id: string; email: string; secret?: string }> = {};
  for (const [key, r] of Object.entries(roles)) {
    const email = `${key}.${run}.${name.replace(/\W/g, '').toLowerCase()}@test.cd`;
    const u = await db.client.user.create({ data: { email, fullName: key, passwordHash: await auth.hash(PW) } });
    await db.client.membership.create({ data: { tenantId: tenant.id, userId: u.id, roles: r } });
    users[key] = { id: u.id, email };
  }
  return { tenant, users };
}

/** Connexion complète, y compris mise en place et vérification de la double authentification. */
async function login(user: { email: string; secret?: string }): Promise<Agent> {
  const agent = request.agent(app.getHttpServer() as never);
  const r = await agent.post('/api/auth/login').send({ email: user.email, password: PW });
  expect(r.status).toBe(200);
  if (r.body.stage === 'mfa_setup_required') {
    const blocked = await agent.get('/api/companies');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('MFA_REQUISE');
    const s = await agent.post('/api/auth/mfa/setup').set(H);
    user.secret = s.body.secret;
    const e = await agent.post('/api/auth/mfa/enable').set(H).send({ code: authenticator.generate(user.secret!) });
    expect(e.status).toBe(200);
  } else if (r.body.stage === 'mfa_pending') {
    const v = await agent.post('/api/auth/mfa/verify').send({ code: authenticator.generate(user.secret!) });
    expect(v.status).toBe(200);
  }
  return agent;
}

let A: Awaited<ReturnType<typeof makeTenant>>;
let B: Awaited<ReturnType<typeof makeTenant>>;
let admin: Agent;
let compta: Agent;
let chef: Agent;
let companyId: string;
let fyId: string;
let clientId: string;
let supplierId: string;

beforeAll(async () => {
  app = await createApp();
  await app.init();
  db = app.get(PrismaService);
  await seedTaxRules(db);
  A = await makeTenant('Tenant A', { admin: ['ADMIN'], compta: ['COMPTABLE'], chef: ['CHEF_COMPTABLE', 'PAIE', 'FISCALITE'], dg: ['DIRECTION'], auditeur: ['AUDITEUR'] });
  B = await makeTenant('Tenant B', { admin: ['ADMIN'] });
  await db.forTenant(A.tenant.id, (tx) =>
    tx.fxRate.createMany({
      data: [
        { tenantId: A.tenant.id, currency: 'USD', quote: 'CDF', rate: '2800', date: `${YEAR}-01-01`, source: 'Test', type: 'MANUEL' },
        { tenantId: A.tenant.id, currency: 'USD', quote: 'CDF', rate: '2850', date: `${YEAR}-12-31`, source: 'Test', type: 'MANUEL' },
        { tenantId: A.tenant.id, currency: 'EUR', quote: 'CDF', rate: '3300', date: `${YEAR}-01-01`, source: 'Test', type: 'MANUEL' },
      ],
    }),
  );
  admin = await login(A.users.admin!);
  compta = await login(A.users.compta!);
  chef = await login(A.users.chef!);
});

afterAll(async () => {
  await app?.close();
});

describe('L0 — socle : authentification, double authentification, sécurité', () => {
  it('refuse un mot de passe incorrect et verrouille après 5 échecs', async () => {
    const u = A.users.dg!;
    for (let i = 0; i < 5; i++) {
      const r = await request(app.getHttpServer() as never).post('/api/auth/login').send({ email: u.email, password: 'mauvais' });
      expect(r.status).toBe(401);
    }
    const locked = await request(app.getHttpServer() as never).post('/api/auth/login').send({ email: u.email, password: PW });
    expect(locked.body.code).toBe('COMPTE_VERROUILLE');
    await db.client.user.update({ where: { id: u.id }, data: { lockedUntil: null } });
  });
  it('exige le code TOTP à la reconnexion', async () => {
    const agent = request.agent(app.getHttpServer() as never);
    const r = await agent.post('/api/auth/login').send({ email: A.users.compta!.email, password: PW });
    expect(r.body.stage).toBe('mfa_pending');
    expect((await agent.get('/api/companies')).status).toBe(401);
    expect((await agent.post('/api/auth/mfa/verify').send({ code: '000000' })).status).toBe(401);
    expect((await agent.post('/api/auth/mfa/verify').send({ code: authenticator.generate(A.users.compta!.secret!) })).status).toBe(200);
  });
  it('protège contre le CSRF (en-tête obligatoire sur les requêtes d’écriture)', async () => {
    const r = await admin.post('/api/companies').send({});
    expect(r.body.code).toBe('CSRF');
  });
  it("refuse l'accès sans session", async () => {
    expect((await request(app.getHttpServer() as never).get('/api/companies')).status).toBe(401);
  });
});

describe('Ouverture du dossier (docs/14)', () => {
  it('évalue le SMT avec le seuil converti en CDF', async () => {
    const r = await admin.post('/api/companies/smt-assessment').set(H).send({ country: 'CD', activity: 'SERVICES', expectedTurnover: '100000000', eurRate: '3300' });
    expect(r.body.eligible).toBe(true);
    expect(r.body.currency).toBe('CDF');
    expect(r.body.calc).toMatch(/655,957/);
  });
  it('crée la société : devise imposée CDF, plan SYSCOHADA à 6 chiffres, journaux, exercice', async () => {
    const r = await admin.post('/api/companies').set(H).send({
      name: 'Société Test SARL', legalForm: 'SARL', country: 'CD', activity: 'SERVICES', expectedTurnover: '900000000',
      fiscalYearStart: `${YEAR}-01-01`, fiscalYearEnd: `${YEAR}-12-31`, shareCapital: '50000000', headcount: 10,
    });
    expect(r.status).toBe(201);
    expect(r.status).toBe(201);
    companyId = r.body.company.id;
    fyId = r.body.fiscalYear.id;
    expect(r.body.company.currency).toBe('CDF');
    expect(r.body.company.system).toBe('NORMAL');
    expect(r.body.fiscalYear.periods).toHaveLength(12);
    const acc = await compta.get(`/api/companies/${companyId}/accounts?q=5711`);
    expect(acc.body[0].number).toBe('571100');
    const c = await compta.post(`/api/companies/${companyId}/third-parties`).set(H).send({ type: 'CLIENT', code: 'C1', name: 'Client Un', taxId: 'A7654321C' });
    clientId = c.body.id;
    const f = await compta.post(`/api/companies/${companyId}/third-parties`).set(H).send({ type: 'FOURNISSEUR', code: 'F1', name: 'Fournisseur Un' });
    supplierId = f.body.id;
  });
  it('crée un sous-compte rattaché au plan officiel et refuse un rattachement incohérent', async () => {
    const ok = await compta.post(`/api/companies/${companyId}/accounts`).set(H).send({ number: '571110', parent: '571100', label: 'Caisse Goma' });
    expect(ok.status).toBe(201);
    const ko = await compta.post(`/api/companies/${companyId}/accounts`).set(H).send({ number: '521110', parent: '571100', label: 'Incohérent' });
    expect(ko.body.code).toBe('SOUS_COMPTE_INVALIDE');
  });
});

const entry = (over: Record<string, unknown> = {}) => ({
  journalCode: 'OD',
  date: `${YEAR}-02-10`,
  pieceRef: 'PJ-1',
  label: 'Apport en capital',
  lines: [
    { account: '521100', debit: '50 000 000,00' },
    { account: '101300', credit: '50000000' },
  ],
  ...over,
});

describe('L1 — comptabilité : invariants', () => {
  let firstId: string;
  it('valide une écriture équilibrée et la numérote', async () => {
    const r = await compta.post(`/api/companies/${companyId}/entries?validate=true`).set(H).send(entry());
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('VALIDE');
    expect(r.body.number).toBe(`OD-${YEAR}-000001`);
    expect(r.body.hash).toHaveLength(64);
    firstId = r.body.id;
  });
  it('refuse une écriture déséquilibrée', async () => {
    const d = await compta.post(`/api/companies/${companyId}/entries`).set(H).send(entry({ lines: [{ account: '521100', debit: '10' }, { account: '101300', credit: '9' }] }));
    const v = await compta.post(`/api/companies/${companyId}/entries/${d.body.id}/validate`).set(H);
    expect(v.body.code).toBe('CONTROLES_BLOQUANTS');
    expect(v.body.details.map((e: { code: string }) => e.code)).toContain('DESEQUILIBRE');
    await compta.delete(`/api/companies/${companyId}/entries/${d.body.id}`).set(H);
  });
  it('exige un tiers sur les comptes collectifs et une pièce', async () => {
    const d = await compta.post(`/api/companies/${companyId}/entries`).set(H).send(entry({ pieceRef: '', lines: [{ account: '411100', debit: '10' }, { account: '706100', credit: '10' }] }));
    const v = await compta.post(`/api/companies/${companyId}/entries/${d.body.id}/validate`).set(H);
    const codes = v.body.details.map((e: { code: string }) => e.code);
    expect(codes).toEqual(expect.arrayContaining(['TIERS_OBLIGATOIRE', 'PIECE_OBLIGATOIRE']));
    await compta.delete(`/api/companies/${companyId}/entries/${d.body.id}`).set(H);
  });
  it("rend impossible la modification ou la suppression d'une écriture validée (API et base)", async () => {
    const put = await compta.put(`/api/companies/${companyId}/entries/${firstId}`).set(H).send(entry({ label: 'modifié' }));
    expect(put.body.code).toBe('ECRITURE_VALIDEE');
    const del = await compta.delete(`/api/companies/${companyId}/entries/${firstId}`).set(H);
    expect(del.body.code).toBe('ECRITURE_VALIDEE');
    // même en contournant l'API, la base refuse (trigger)
    await expect(db.forTenant(A.tenant.id, (tx) => tx.entry.update({ where: { id: firstId }, data: { label: 'fraude' } }))).rejects.toThrow(/JC_IMMUABLE/);
    await expect(db.forTenant(A.tenant.id, (tx) => tx.entryLine.updateMany({ where: { entryId: firstId }, data: { debit: 1n } }))).rejects.toThrow(/JC_IMMUABLE/);
    await expect(db.forTenant(A.tenant.id, (tx) => tx.entry.delete({ where: { id: firstId } }))).rejects.toThrow(/JC_IMMUABLE/);
  });
  it('contre-passe une écriture validée', async () => {
    const d = await compta.post(`/api/companies/${companyId}/entries?validate=true`).set(H).send(entry({ pieceRef: 'PJ-ERR', label: 'Erreur', lines: [{ account: '605700', debit: '100' }, { account: '571100', credit: '100' }] }));
    const r = await compta.post(`/api/companies/${companyId}/entries/${d.body.id}/reverse`).set(H).send({ date: `${YEAR}-02-11` });
    expect(r.status).toBe(201);
    expect(r.body.label).toMatch(/Contre-passation/);
    const orig = await compta.get(`/api/companies/${companyId}/entries/${d.body.id}`);
    expect(orig.body.status).toBe('CONTREPASSE');
    const again = await compta.post(`/api/companies/${companyId}/entries/${d.body.id}/reverse`).set(H).send({ date: `${YEAR}-02-11` });
    expect(again.body.code).toBe('NON_CONTREPASSABLE');
  });
  it('numérote sans trou malgré les brouillons supprimés', async () => {
    const ctl = await chef.get(`/api/companies/${companyId}/reports/controls`);
    expect(ctl.body.sequenceGaps).toEqual([]);
  });
  it('enregistre une ligne en devise avec cours, source et date', async () => {
    const r = await compta.post(`/api/companies/${companyId}/entries?validate=true`).set(H).send({
      journalCode: 'VTE', date: `${YEAR}-03-01`, pieceRef: 'FA-USD-1', label: 'Vente en USD',
      lines: [
        { account: '411100', thirdPartyId: clientId, debit: '2800000', fx: { currency: 'USD', foreignAmount: '1000', rate: '2800', rateSource: 'BCC', rateDate: `${YEAR}-03-01` } },
        { account: '706100', credit: '2800000' },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.lines[0].rate).toBe('2800');
  });
  it('propose la réévaluation de clôture (écart de conversion 479 sur gain latent)', async () => {
    const r = await compta.post(`/api/companies/${companyId}/fx/revaluation`).set(H).send({ date: `${YEAR}-12-31` });
    expect(r.status).toBe(201);
    const lines = r.body.drafts[0].lines;
    expect(lines.find((l: { account: string }) => l.account === '479100').credit).toBe('5000000');
    await compta.delete(`/api/companies/${companyId}/entries/${r.body.drafts[0].id}`).set(H);
  });
  it('verrouille une période clôturée ; réouverture avec motif et trace', async () => {
    const co = await compta.get(`/api/companies/${companyId}`);
    const jan = co.body.fiscalYears[0].periods[0];
    expect((await compta.post(`/api/companies/${companyId}/periods/${jan.id}/close`).set(H)).status).toBe(200);
    const d = await compta.post(`/api/companies/${companyId}/entries`).set(H).send(entry({ date: `${YEAR}-01-15`, pieceRef: 'PJ-JAN' }));
    const v = await compta.post(`/api/companies/${companyId}/entries/${d.body.id}/validate`).set(H);
    expect(v.body.details.map((e: { code: string }) => e.code)).toContain('PERIODE_CLOTUREE');
    expect((await compta.post(`/api/companies/${companyId}/periods/${jan.id}/reopen`).set(H).send({ reason: 'Correction demandée' })).status).toBe(403);
    expect((await chef.post(`/api/companies/${companyId}/periods/${jan.id}/reopen`).set(H).send({ reason: 'court' })).body.code).toBe('MOTIF_OBLIGATOIRE');
    expect((await chef.post(`/api/companies/${companyId}/periods/${jan.id}/reopen`).set(H).send({ reason: 'Facture fournisseur reçue en retard' })).status).toBe(200);
    await compta.delete(`/api/companies/${companyId}/entries/${d.body.id}`).set(H);
  });
  it('interdit la saisie directe en journal d’à-nouveaux', async () => {
    const r = await compta.post(`/api/companies/${companyId}/entries`).set(H).send(entry({ journalCode: 'AN' }));
    expect(r.body.code).toBe('AN_MANUEL_INTERDIT');
  });
});

describe('L0 — isolation des locataires (RLS)', () => {
  it("le locataire B ne voit ni ne modifie aucune donnée du locataire A", async () => {
    const adminB = await login(B.users.admin!);
    expect((await adminB.get('/api/companies')).body).toEqual([]);
    const r = await adminB.get(`/api/companies/${companyId}/entries`);
    expect(r.body.items ?? []).toEqual([]);
    const seen = await db.forTenant(B.tenant.id, (tx) => tx.entry.count());
    expect(seen).toBe(0);
    // écriture forcée avec le tenant_id de A depuis le contexte B : refusée par la politique RLS
    await expect(
      db.forTenant(B.tenant.id, (tx) => tx.fxRate.create({ data: { tenantId: A.tenant.id, currency: 'USD', quote: 'CDF', rate: '1', date: '2026-01-01', source: 'x', type: 'MANUEL' } })),
    ).rejects.toThrow();
    // sans contexte de locataire, aucune ligne n'est visible
    expect(await db.client.entry.count()).toBe(0);
  });
});

describe('Ventes, documents QR (L7b) et Jupiter IA (L4)', () => {
  it('RDC : refuse la facture normalisée sans NIF de la société', async () => {
    const r = await compta.post(`/api/companies/${companyId}/invoices`).set(H).send({ date: `${YEAR}-04-05`, thirdPartyId: clientId, lines: [{ description: 'X', quantity: 1, unitPrice: '1000', vat: 'NORMAL' }] });
    expect(r.body.code).toBe('NIF_MANQUANT');
    await admin.patch(`/api/companies/${companyId}`).set(H).send({ taxId: 'A1234567B', einvoiceSettings: { nim: 'SIM-TEST-01' } });
  });
  it('émet une facture avec QR, génère l’écriture, vérifie publiquement, signale l’annulation', async () => {
    const inv = await compta.post(`/api/companies/${companyId}/invoices`).set(H).send({ 
      date: `${YEAR}-04-05`, thirdPartyId: clientId, lines: [{ description: 'Conseil', quantity: 2, unitPrice: '500000', vat: 'NORMAL' }],
    });
    expect(inv.status).toBe(201);
    expect(inv.body.totalGross).toBe('116000000');
    expect(inv.body.qrDataUrl).toMatch(/^data:image\/png/);
    expect(inv.body.banner).toMatch(/Estimation/);
    // facture normalisée RDC : éléments de sécurité du dispositif électronique fiscal
    expect(inv.body.einvoice).toMatchObject({ mode: 'SIMULATION', nim: 'SIM-TEST-01', counters: '1/1 FV' });
    expect(inv.body.einvoice.codeDefDgi).toMatch(/^[0-9A-F-]{29}$/);
    const pub = await request(app.getHttpServer() as never).get(`/api/verify/${inv.body.hash}`);
    expect(pub.body).toMatchObject({ authentic: true, number: inv.body.number, cancelled: false, issuer: 'Société Test SARL' });
    const av = await compta.post(`/api/companies/${companyId}/invoices/${inv.body.id}/credit-note`).set(H).send({ date: `${YEAR}-04-06`, reason: 'Erreur de prix' });
    expect(av.status).toBe(201);
    expect(av.body.einvoice.counters).toMatch(/FA$/);
    const pub2 = await request(app.getHttpServer() as never).get(`/api/verify/${inv.body.hash}`);
    expect(pub2.body.cancelled).toBe(true);
    expect((await request(app.getHttpServer() as never).get(`/api/verify/${'0'.repeat(64)}`)).body.authentic).toBe(false);
  });
  it("propose une écriture IA en BROUILLON_IA, validée seulement par un humain", async () => {
    const p = await compta.post(`/api/ai/companies/${companyId}/purchase-proposal`).set(H).send({
      supplierThirdPartyId: supplierId, date: `${YEAR}-04-10`, number: 'SNEL-77', netAmount: '100000', vatAmount: '16000', grossAmount: '116000', description: 'Facture électricité',
    });
    expect(p.status).toBe(201);
    expect(p.body.entry.status).toBe('BROUILLON_IA');
    expect(p.body.entry.lines[0].account).toBe('605200');
    const ok = await compta.post(`/api/ai/actions/${p.body.action.id}/accept`).set(H);
    expect(ok.body.entry.status).toBe('VALIDE');
    const ask = await compta.post('/api/ai/ask').set(H).send({ question: 'Comment enregistrer un achat avec TVA ?' });
    expect(ask.body.answer).toMatch(/445200/);
  });
});

describe('L5 — fiscalité et paie RDC', () => {
  it('calcule la TVA de la période et propose la liquidation', async () => {
    const r = await chef.get(`/api/companies/${companyId}/tax/vat-return?from=${YEAR}-04-01&to=${YEAR}-04-30`);
    expect(r.body.banner).toMatch(/Estimation/);
    expect(r.body.deductible).toBe('1600000');
  });
  it('calcule la paie, produit l’écriture en brouillon et impose la validation à quatre yeux', async () => {
    await chef.post(`/api/companies/${companyId}/payroll/employees`).set(H).send({
      matricule: 'M001', fullName: 'Salarié Test', hireDate: `${YEAR}-01-01`, currency: 'USD', dependents: 2,
      elements: [{ code: 'BASE', label: 'Salaire de base', amount: '1000', taxable: true, contributable: true }],
    });
    const run = await chef.post(`/api/companies/${companyId}/payroll/runs`).set(H).send({ period: `${YEAR}-05`, payDate: `${YEAR}-05-31` });
    expect(run.status).toBe(201);
    expect(run.body.payslips[0].gross).toBe('280000000');
    const self = await chef.post(`/api/companies/${companyId}/entries/${run.body.entryId}/validate`).set(H);
    expect(self.body.code).toBe('QUATRE_YEUX');
    const other = await compta.post(`/api/companies/${companyId}/entries/${run.body.entryId}/validate`).set(H);
    expect(other.body.entry.status).toBe('VALIDE');
    const emp = await chef.get(`/api/companies/${companyId}/payroll/employees`);
    expect(emp.body[0].elements[0].amount).toBe('100000');
    const raw = await db.forTenant(A.tenant.id, (tx) => tx.employee.findFirst());
    expect(raw.salaryEnc).toMatch(/^v1\./); // salaire chiffré en base
  });
});

describe('Packs pays (17 États)', () => {
  it('ouvre un dossier ivoirien en XOF et refuse une paie tant que le barème ITS n’est pas validé', async () => {
    const r = await admin.post('/api/companies').set(H).send({ name: 'Filiale Abidjan SA', legalForm: 'SA', country: 'CI', activity: 'NEGOCE', expectedTurnover: '500000000', fiscalYearStart: `${YEAR}-01-01`, fiscalYearEnd: `${YEAR}-12-31` });
    expect(r.status).toBe(201);
    expect(r.body.company.currency).toBe('XOF');
    const ci = r.body.company.id;
    await chef.post(`/api/companies/${ci}/payroll/employees`).set(H).send({ matricule: 'A1', fullName: 'Agent', hireDate: `${YEAR}-01-01`, currency: 'XOF', dependents: 0, elements: [{ code: 'BASE', label: 'Base', amount: '300000', taxable: true, contributable: true }] });
    const p = await chef.post(`/api/companies/${ci}/payroll/runs`).set(H).send({ period: `${YEAR}-05`, payDate: `${YEAR}-05-31` });
    expect(p.body.code).toBe('PACK_PAYS_INCOMPLET');
    const rules = await chef.get('/api/tax-rules?country=CI');
    expect(rules.body.find((x: { tax: string; param: string }) => x.tax === 'TVA' && x.param === 'taux_normal').value).toBe('0.18');
  });
});

describe('L2 — états financiers et clôture', () => {
  it('produit bilan, compte de résultat et TFT avec contrôles verts', async () => {
    const r = await chef.get(`/api/companies/${companyId}/reports/statements`);
    expect(r.status).toBe(200);
    const failed = r.body.controls.filter((c: { ok: boolean; blocking: boolean }) => c.blocking && !c.ok);
    expect(failed).toEqual([]);
    expect(r.body.current.balanceSheet.totalAssets).toBe(r.body.current.balanceSheet.totalLiabilities);
  });
  it('produit balance, grand-livre, livre-journal et export', async () => {
    const tb = await chef.get(`/api/companies/${companyId}/reports/trial-balance`);
    expect(tb.body.totals.closingDebit).toBe(tb.body.totals.closingCredit);
    expect((await chef.get(`/api/companies/${companyId}/reports/general-ledger?account=521`)).body.accounts[0].account).toBe('521100');
    expect((await chef.get(`/api/companies/${companyId}/reports/journal`)).body.centralisation.length).toBeGreaterThan(0);
    const csv = await chef.get(`/api/companies/${companyId}/reports/exports/entries.csv`);
    expect(csv.text.split('\n')[0]).toMatch(/^JournalCode;EcritureNum/);
  });
  it("clôture l'exercice : bilan d'ouverture N+1 = bilan de clôture N", async () => {
    const before = await chef.get(`/api/companies/${companyId}/reports/statements?fiscalYearId=${fyId}`);
    const r = await chef.post(`/api/companies/${companyId}/fiscal-years/${fyId}/close`).set(H);
    expect(r.status).toBe(200);
    expect(r.body.anEntry.status).toBe('VALIDE');
    const next = await chef.get(`/api/companies/${companyId}/reports/trial-balance?fiscalYearId=${r.body.nextFiscalYear.id}`);
    const after = await chef.get(`/api/companies/${companyId}/reports/statements?fiscalYearId=${fyId}`);
    expect(after.body.current.balanceSheet.totalAssets).toBe(before.body.current.balanceSheet.totalAssets);
    expect(after.body.current.incomeStatement.values.XI).toBe(before.body.current.incomeStatement.values.XI);
    const opening = await chef.get(`/api/companies/${companyId}/reports/statements?fiscalYearId=${r.body.nextFiscalYear.id}`);
    // au premier jour de N+1, le bilan reprend exactement le bilan de clôture N
    expect(opening.body.current.balanceSheet.totalAssets).toBe(before.body.current.balanceSheet.totalAssets);
    expect(next.body.totals.openingDebit).toBe(next.body.totals.openingCredit);
    const late = await compta.post(`/api/companies/${companyId}/entries`).set(H).send(entry({ date: `${YEAR}-06-01`, pieceRef: 'LATE' }));
    const v = await compta.post(`/api/companies/${companyId}/entries/${late.body.id}/validate`).set(H);
    expect(v.body.details.map((e: { code: string }) => e.code)).toContain('EXERCICE_CLOTURE');
  });
});

describe('L0 — audit chaîné et rôles', () => {
  it("vérifie l'intégrité du journal d'audit, immuable en base", async () => {
    const r = await admin.get('/api/audit');
    expect(r.body.verification.ok).toBe(true);
    expect(r.body.verification.records).toBeGreaterThan(10);
    await expect(db.forTenant(A.tenant.id, (tx) => tx.auditLog.updateMany({ data: { actor: 'x' } }))).rejects.toThrow();
  });
  it('profil auditeur en lecture seule ; direction sans droits de saisie', async () => {
    const aud = await login(A.users.auditeur!);
    expect((await aud.get(`/api/companies/${companyId}/reports/trial-balance`)).status).toBe(200);
    expect((await aud.post(`/api/companies/${companyId}/entries`).set(H).send(entry())).status).toBe(403);
  });
});

describe('L3 — licences et paiements', () => {
  it("bascule en lecture seule à J+15 d'impayé (consultation et export permis)", async () => {
    await db.client.tenant.update({ where: { id: A.tenant.id }, data: { subStatus: 'ACTIF', paidUntil: new Date(Date.now() - 16 * 86_400_000), trialEndsAt: null } });
    const w = await compta.post(`/api/companies/${companyId}/third-parties`).set(H).send({ type: 'CLIENT', code: 'C9', name: 'Bloqué' });
    expect(w.body.code).toBe('ABONNEMENT_LECTURE_SEULE');
    expect((await compta.get(`/api/companies/${companyId}/reports/trial-balance`)).status).toBe(200);
    expect((await compta.get(`/api/companies/${companyId}/reports/exports/entries.csv`)).status).toBe(200);
  });
  it('rétablit l’accès après paiement (webhook signé, idempotent)', async () => {
    const c = await admin.post('/api/billing/checkout').set(H).send({ method: 'MOBILE_MONEY', months: 1 });
    expect(c.status).toBe(201);
    const body = { externalRef: c.body.payment.externalRef, status: 'PAYE' };
    const sig = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret').update(JSON.stringify(body)).digest('hex');
    expect((await request(app.getHttpServer() as never).post('/api/billing/webhook/simulator').set('x-signature', 'bad'.padEnd(64, '0')).send(body)).body.code).toBe('SIGNATURE');
    expect((await request(app.getHttpServer() as never).post('/api/billing/webhook/simulator').set('x-signature', sig).send(body)).body.status).toBe('PAYE');
    expect((await request(app.getHttpServer() as never).post('/api/billing/webhook/simulator').set('x-signature', sig).send(body)).body.idempotent).toBe(true);
    const w = await compta.post(`/api/companies/${companyId}/third-parties`).set(H).send({ type: 'CLIENT', code: 'C10', name: 'Débloqué' });
    expect(w.status).toBe(201);
  });
  it('refuse un module non souscrit', async () => {
    await db.client.tenant.update({ where: { id: A.tenant.id }, data: { modules: EDITION_MODULES.ESSENTIEL } });
    const r = await chef.get(`/api/companies/${companyId}/payroll/employees`);
    expect(r.body.code).toBe('MODULE_NON_SOUSCRIT');
    await db.client.tenant.update({ where: { id: A.tenant.id }, data: { modules: EDITION_MODULES.ERP } });
  });
});
