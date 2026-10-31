/** Factures intragroupe : circuit d'acceptation et retraitement de la marge interne en consolidation. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let compta: Agent, chef: Agent;
let seller: string, buyer: string;

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'GROUPE', { admin: ['ADMIN'], compta: ['COMPTABLE'], chef: ['CHEF_COMPTABLE'] });
  const admin = await login(ctx, t.users.admin!);
  compta = await login(ctx, t.users.compta!);
  chef = await login(ctx, t.users.chef!);
  seller = (await makeCompany(admin, { name: 'Négoce mère' })).company.id;
  buyer = (await makeCompany(admin, { name: 'Distribution filiale' })).company.id;
  await admin.patch(`/api/companies/${seller}`).set(H).send({ einvoiceSettings: { mode: 'SIMULATION' } });
  await admin.patch(`/api/companies/${buyer}`).set(H).send({ taxId: 'A0000002B' });
});
afterAll(async () => ctx?.app.close());

describe('factures intragroupe', () => {
  it('émission, acceptation avec entrée en stock, élimination du chiffre d’affaires et de la marge en stock', async () => {
    const link = await compta.post(`/api/companies/${seller}/group-links`).set(H).send({ sisterCompanyId: buyer });
    expect(link.status).toBe(201);
    expect(link.body.parties).toHaveLength(4);
    const client = link.body.parties.find((p: any) => p.companyId === seller && p.type === 'CLIENT');
    expect(client).toMatchObject({ account: '411200', groupCompanyId: buyer });

    const swh = (await compta.get(`/api/companies/${seller}/stock/warehouses`)).body[0].id;
    const bwh = (await compta.get(`/api/companies/${buyer}/stock/warehouses`)).body[0].id;
    const sItem = (await compta.post(`/api/companies/${seller}/stock/items`).set(H).send({ code: 'SAC', label: 'Sac de ciment', kind: 'MARCHANDISE' })).body.id;
    const bItem = (await compta.post(`/api/companies/${buyer}/stock/items`).set(H).send({ code: 'SAC', label: 'Sac de ciment', kind: 'MARCHANDISE' })).body.id;
    await compta.post(`/api/companies/${seller}/stock/moves`).set(H).send({ type: 'ENTREE', itemId: sItem, warehouseId: swh, date: `${YEAR}-03-01`, qty: '100', unitCost: '10000', reference: 'BE-1' });

    const inv = await compta.post(`/api/companies/${seller}/invoices`).set(H).send({
      date: `${YEAR}-03-10`, thirdPartyId: client.id, warehouseId: swh, lines: [{ itemId: sItem, description: 'Sac de ciment', quantity: 40, unitPrice: '15000', vat: 'NORMAL', account: '701100' }],
    });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);

    const box = (await compta.get(`/api/companies/${buyer}/intercompany-invoices`)).body;
    expect(box.incoming).toHaveLength(1);
    const ic = box.incoming[0];
    expect(ic).toMatchObject({ status: 'EN_ATTENTE', sellerName: 'Négoce mère', totalNet: String(40 * 15000 * 100) });
    expect(ic.lines[0].cost).toBe(String(40 * 10000 * 100));
    expect((await compta.get(`/api/companies/${seller}/intercompany-invoices`)).body.outgoing).toHaveLength(1);

    const acc = await compta.post(`/api/companies/${buyer}/intercompany-invoices/${ic.id}/accept`).set(H).send({ lines: [{ account: '601100', itemId: bItem, warehouseId: bwh }] });
    expect(acc.status).toBe(201);
    expect(acc.body.invoice.status).toBe('ACCEPTEE');
    expect(acc.body.entry.lines.find((l: any) => l.account === '401200').credit).toBe(String(ic.totalGross));
    expect((await compta.post(`/api/companies/${buyer}/intercompany-invoices/${ic.id}/accept`).set(H).send({})).body.code).toBe('DEJA_TRAITEE');
    expect((await chef.post(`/api/companies/${buyer}/entries/${acc.body.entry.id}/validate`).set(H)).body.entry.status).toBe('VALIDE');

    // 30 sacs revendus hors groupe : 10 restent en stock chez la filiale
    await compta.post(`/api/companies/${buyer}/stock/moves`).set(H).send({ type: 'SORTIE', itemId: bItem, warehouseId: bwh, date: `${YEAR}-03-20`, qty: '30', reference: 'BS-1' });

    const g = await chef.post('/api/consolidation/groups').set(H).send({ name: 'Groupe Négoce', currency: 'CDF', members: [{ companyId: seller, parent: true, method: 'IG', ownershipPct: '100' }, { companyId: buyer, method: 'IG', ownershipPct: '100' }] });
    const st = await chef.get(`/api/consolidation/groups/${g.body.id}/statements`);
    expect(st.status).toBe(200);
    expect(st.body.intercompany).toHaveLength(1);
    // marge (15 000 − 10 000) × 10 sacs restants, en centimes
    expect(st.body.intercompany[0]).toMatchObject({ revenueEliminated: String(60_000_000), unrealisedMargin: String(5_000_000) });
  });

  it('immobilisation cédée dans le groupe : durée d’utilité exigée, marge éliminée et dotation extournée', async () => {
    const client = (await compta.post(`/api/companies/${seller}/group-links`).set(H).send({ sisterCompanyId: buyer })).body.parties.find((p: any) => p.companyId === seller && p.type === 'CLIENT');
    const inv = await compta.post(`/api/companies/${seller}/invoices`).set(H).send({
      date: `${YEAR}-07-01`, thirdPartyId: client.id, lines: [{ description: 'Camion', quantity: 1, unitPrice: '30000000', vat: 'NORMAL', account: '701100', costOfSale: '24000000' }],
    });
    expect(inv.status).toBe(201);
    expect(JSON.stringify(inv.body.lines)).not.toContain('costOfSale');
    const ic = (await compta.get(`/api/companies/${buyer}/intercompany-invoices`)).body.incoming.find((x: any) => x.number === inv.body.number);
    expect(ic.lines[0].cost).toBe(String(24_000_000 * 100));
    expect((await compta.post(`/api/companies/${buyer}/intercompany-invoices/${ic.id}/accept`).set(H).send({ lines: [{ account: '245100' }] })).body.code).toBe('DUREE_UTILITE_REQUISE');
    const acc = await compta.post(`/api/companies/${buyer}/intercompany-invoices/${ic.id}/accept`).set(H).send({ lines: [{ account: '245100', usefulLifeYears: 5 }] });
    expect(acc.status).toBe(201);
    await chef.post(`/api/companies/${buyer}/entries/${acc.body.entry.id}/validate`).set(H);
    const g = await chef.post('/api/consolidation/groups').set(H).send({ name: 'Groupe Camion', currency: 'CDF', members: [{ companyId: seller, parent: true, method: 'IG', ownershipPct: '100' }, { companyId: buyer, method: 'IG', ownershipPct: '100' }] });
    const st = (await chef.get(`/api/consolidation/groups/${g.body.id}/statements`)).body;
    const x = st.intercompany[0];
    // marge 6 000 000 F ; dotation extournée : 6 000 000 × 180 / 1 800 = 600 000 F (en centimes)
    expect(x.depreciationReversed).toBe(String(600_000 * 100));
    expect(x.assetMargin).toBe(String(5_400_000 * 100));
  });

  it('refus motivé puis annulation par avoir chez l’émetteur', async () => {
    const client = (await compta.post(`/api/companies/${seller}/group-links`).set(H).send({ sisterCompanyId: buyer })).body.parties.find((p: any) => p.companyId === seller && p.type === 'CLIENT');
    const inv = await compta.post(`/api/companies/${seller}/invoices`).set(H).send({ date: `${YEAR}-04-02`, thirdPartyId: client.id, lines: [{ description: 'Frais de siège', quantity: 1, unitPrice: '100000', vat: 'NORMAL', account: '706100' }] });
    const ic = (await compta.get(`/api/companies/${buyer}/intercompany-invoices`)).body.incoming.find((x: any) => x.number === inv.body.number);
    const rej = await compta.post(`/api/companies/${buyer}/intercompany-invoices/${ic.id}/reject`).set(H).send({ reason: 'Prestation non conforme à la convention' });
    expect(rej.body.invoice).toMatchObject({ status: 'REJETEE', reason: 'Prestation non conforme à la convention' });
    await chef.post(`/api/companies/${seller}/invoices/${inv.body.id}/credit-note`).set(H).send({ date: `${YEAR}-04-03`, reason: 'Refus de la filiale' });
    const out = (await compta.get(`/api/companies/${seller}/intercompany-invoices`)).body.outgoing.find((x: any) => x.id === ic.id);
    expect(out.status).toBe('ANNULEE');
    expect((await compta.post(`/api/companies/${buyer}/intercompany-invoices/${ic.id}/reject`).set(H).send({ reason: 'encore une fois' })).body.code).toBe('DEJA_TRAITEE');
    expect((await compta.post(`/api/companies/${seller}/group-links`).set(H).send({ sisterCompanyId: seller })).body.code).toBe('SOCIETE_IDENTIQUE');
  });
});
