/** Opérations spécifiques du guide d'application : catalogue, aperçu et création d'écritures en brouillon. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let compta: Agent, lecteur: Agent, chef: Agent, admin: Agent;
let cid: string;
const M = 1_000_000;

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'OPSPEC', { admin: ['ADMIN'], compta: ['COMPTABLE'], lecteur: ['LECTEUR'], chef: ['CHEF_COMPTABLE'] });
  admin = await login(ctx, t.users.admin!);
  chef = await login(ctx, t.users.chef!);
  compta = await login(ctx, t.users.compta!);
  lecteur = await login(ctx, t.users.lecteur!);
  cid = (await makeCompany(admin)).company.id;
});
afterAll(async () => ctx?.app.close());

describe('opérations spécifiques', () => {
  it('catalogue avec exemples du guide convertis en centimes', async () => {
    const r = await compta.get(`/api/companies/${cid}/special-ops`);
    expect(r.status).toBe(200);
    const lease = r.body.find((o: any) => o.id === 'location-preneur');
    expect(lease.applications).toEqual([37]);
    expect(lease.example.value).toBe(String(450_000 * 100));
    expect(r.body.find((o: any) => o.id === 'fusion').example.absorbing.nominal).toBe(String(10_000 * 100));
  });

  it('aperçu d’une subvention d’investissement et comptes absents signalés', async () => {
    const r = await compta.post(`/api/companies/${cid}/special-ops/subvention-octroi/preview`).set(H)
      .send({ params: { amount: String(260 * M * 100), date: `${YEAR}-03-25`, receiptDate: `${YEAR}-05-12` } });
    expect(r.status).toBe(201);
    expect(r.body.entries).toHaveLength(2);
    expect(r.body.entries[0].lines[0]).toMatchObject({ account: '449400', debit: String(260 * M * 100) });
    expect(Array.isArray(r.body.missingAccounts)).toBe(true);
  });

  it('emprunt obligataire in fine : écritures créées en brouillon', async () => {
    const r = await compta.post(`/api/companies/${cid}/special-ops/emprunt-obligataire/drafts`).set(H).send({
      params: { count: 50, nominal: '1000000', issuePrice: '950000', redemptionPrice: '1050000', rate: 0.06, years: 1, mode: 'IN_FINE', issueDate: `${YEAR}-01-01` },
    });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(4);
    expect(r.body.entries.every((e: any) => e.status === 'BROUILLON')).toBe(true);
    const last = r.body.entries[3];
    expect(last.lines.find((l: any) => l.account === '161100').debit).toBe('47500000');
    expect(r.body.notes.length).toBeGreaterThan(0);
  });

  it('fusion : écritures de l’absorbante en brouillon, celles de l’absorbée restituées', async () => {
    const list = (await compta.get(`/api/companies/${cid}/special-ops`)).body;
    const ex = list.find((o: any) => o.id === 'fusion').example;
    const r = await compta.post(`/api/companies/${cid}/special-ops/fusion/drafts`).set(H).send({ params: { ...ex, date: `${YEAR}-06-30` }, only: [0, 1] });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(2);
    expect(r.body.counterpartEntries).toHaveLength(4);
  });

  it('erreurs : opération inconnue, paramètres invalides, date manquante, droits', async () => {
    expect((await compta.post(`/api/companies/${cid}/special-ops/inconnue/preview`).set(H).send({ params: {} })).body.code).toBe('OPERATION_INCONNUE');
    expect((await compta.post(`/api/companies/${cid}/special-ops/fusion/preview`).set(H).send({ params: {} })).body.code).toBe('PARAMETRES_INVALIDES');
    expect((await compta.post(`/api/companies/${cid}/special-ops/abandon-creance/drafts`).set(H).send({ params: { side: 'CREANCIER', nature: 'COMMERCIAL', amount: '100', date: 'x' } })).body.code).toBe('DATE_MANQUANTE');
    const ok = await compta.post(`/api/companies/${cid}/special-ops/abandon-creance/drafts`).set(H).send({ params: { side: 'CREANCIER', nature: 'COMMERCIAL', amount: '100', date: 'x' }, defaultDate: `${YEAR}-09-30` });
    expect(ok.status).toBe(201);
    expect((await lecteur.post(`/api/companies/${cid}/special-ops/abandon-creance/drafts`).set(H).send({ params: { side: 'CREANCIER', nature: 'COMMERCIAL', amount: '100', date: `${YEAR}-09-30` } })).status).toBe(403);
    // Compte de l'ancien plan absent du dossier : refus explicite
    const missing = await compta.post(`/api/companies/${cid}/special-ops/titres-non-liberes/drafts`).set(H)
      .send({ params: { quantity: 1, nominal: '100', paidFraction: 0.5, date: `${YEAR}-01-01`, account: '999999' } });
    expect(missing.body).toMatchObject({ code: 'COMPTES_ABSENTS', details: { missing: ['999999'] } });
  });
});

describe('consolidation : périmètre, entité ad hoc et comptes combinés (applications 128 à 131, 142)', () => {
  it('pourcentages calculés depuis l’organigramme, entité ad hoc intégrée, divergences signalées ; comptes combinés depuis les balances', async () => {
    const b = (await makeCompany(admin, { name: 'Filiale B' })).company.id;
    const adhoc = (await makeCompany(admin, { name: 'Entité ad hoc A' })).company.id;
    await compta.post(`/api/companies/${b}/entries?validate=true`).set(H).send({ journalCode: 'OD', date: `${YEAR}-02-01`, pieceRef: 'K', label: 'Capital', lines: [{ account: '521100', debit: '1000000' }, { account: '101300', credit: '1000000' }] });
    await compta.post(`/api/companies/${b}/entries?validate=true`).set(H).send({ journalCode: 'OD', date: `${YEAR}-03-01`, pieceRef: 'V', label: 'Vente', lines: [{ account: '521100', debit: '300000' }, { account: '701100', credit: '300000' }] });
    const g = await chef.post('/api/consolidation/groups').set(H).send({ name: 'Groupe OHADA', currency: 'CDF', members: [
      { companyId: cid, parent: true, method: 'IG', ownershipPct: '100' }, { companyId: b, method: 'IG', ownershipPct: '90' }, { companyId: adhoc, method: 'MEE', ownershipPct: '10' }] });
    expect(g.status).toBe(201);
    const p = await chef.post(`/api/consolidation/groups/${g.body.id}/perimeter`).set(H).send({
      holdings: [{ owner: cid, owned: b, capital: 0.9 }, { owner: cid, owned: adhoc, capital: 0.1 }],
      adHoc: { [adhoc]: { decisionPowers: true, majorityBenefits: false, majorityRisks: true } },
    });
    expect(p.status).toBe(201);
    const row = (id: string) => p.body.find((r: any) => r.entity === id);
    expect(row(b)).toMatchObject({ interest: 0.9, proposedMethod: 'IG', divergence: false });
    expect(row(adhoc)).toMatchObject({ proposedMethod: 'IG', configuredMethod: 'MEE', divergence: true });
    const c = await chef.post(`/api/consolidation/groups/${g.body.id}/combined`).set(H).send({ deferredTax: { [b]: '0' } });
    expect(c.status).toBe(201);
    expect(c.body.values.revenue).toBe('30000000'); // saisie en francs, stockage en centimes
    expect(c.body.values.minorities).toBe('13000000'); // (1 000 000 + 300 000) × 10 % en centimes
    expect((await chef.post(`/api/consolidation/groups/${g.body.id}/perimeter`).set(H).send({ holdings: [] })).status).toBe(400);
  });
});
