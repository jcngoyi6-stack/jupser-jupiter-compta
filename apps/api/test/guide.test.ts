/** Relecture à la lumière du guide d'application du SYSCOHADA révisé : immobilisations de bout en bout. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let compta: Agent, chef: Agent;
let cid: string;
const M = 1_000_000;

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'GUIDE', { admin: ['ADMIN'], compta: ['COMPTABLE'], chef: ['CHEF_COMPTABLE'] });
  const admin = await login(ctx, t.users.admin!);
  compta = await login(ctx, t.users.compta!);
  chef = await login(ctx, t.users.chef!);
  cid = (await makeCompany(admin)).company.id;
});
afterAll(async () => ctx?.app.close());

describe('immobilisations (guide d’application, applications 18, 33 et 44)', () => {
  it('dotation, dérogatoires et dépréciation dans une écriture validable', async () => {
    const machine = await compta.post(`/api/companies/${cid}/assets`).set(H).send({
      code: 'MAC-01', label: 'Matériel industriel', account: '241100', acquisitionDate: `${YEAR}-01-01`, inServiceDate: `${YEAR}-01-01`,
      components: [{ label: 'Machine', cost: String(30 * M), method: 'LINEAIRE', years: 6 }],
    });
    const camion = await compta.post(`/api/companies/${cid}/assets`).set(H).send({
      code: 'VEH-01', label: 'Matériel de transport', account: '245100', acquisitionDate: `${YEAR}-01-01`, inServiceDate: `${YEAR}-01-01`,
      components: [{ label: 'Camion', cost: '600', method: 'LINEAIRE', years: 4, fiscal: { method: 'DEGRESSIF_COEFFICIENT', years: 4, degressiveCoefficient: '1.6' } }],
    });
    expect(camion.status).toBe(201);
    // Valeur actuelle 20 000 000 contre une VNC de 25 000 000 : dépréciation de 5 000 000
    expect((await compta.post(`/api/companies/${cid}/assets/${machine.body.id}/value-test`).set(H).send({ year: YEAR, actualValue: String(20 * M) })).status).toBe(201);
    const d = await compta.post(`/api/companies/${cid}/assets/depreciation`).set(H).send({ year: YEAR, date: `${YEAR}-12-31` });
    expect(d.status).toBe(201);
    const line = (acc: string) => d.body.lines.find((l: any) => l.account === acc);
    expect(line('284100').credit).toBe(String(5 * M * 100));
    expect(line('691400').debit).toBe(String(5 * M * 100));
    expect(line('294100').credit).toBe(String(5 * M * 100));
    expect(line('851000').debit).toBe('9000'); // 240 − 150 = 90 (centimes : × 100)
    expect(line('151000').credit).toBe('9000');
    expect(line('284500').credit).toBe('15000');
    const v = await chef.post(`/api/companies/${cid}/entries/${d.body.id}/validate`).set(H);
    expect(v.body.entry.status).toBe('VALIDE');
    expect((await compta.post(`/api/companies/${cid}/assets/${machine.body.id}/value-test`).set(H).send({ year: YEAR, actualValue: '1' })).body.code).toBe('EXERCICE_DEJA_DOTE');
    const list = (await compta.get(`/api/companies/${cid}/assets`)).body;
    const rows = list.find((a: any) => a.code === 'MAC-01').schedule[0].rows;
    expect(rows[1].dotation).toBe(String(4 * M * 100)); // 20 000 000 sur les 5 années restantes
  });

  it('renouvellement d’un composant : sortie du seul composant, ajout du nouveau', async () => {
    const b = await compta.post(`/api/companies/${cid}/assets`).set(H).send({
      code: 'BAT-01', label: 'Bâtiment administratif', account: '231300', acquisitionDate: `${YEAR}-01-01`, inServiceDate: `${YEAR}-01-01`,
      components: [{ label: 'Structure', cost: String(120 * M), method: 'LINEAIRE', years: 30 }, { label: 'Ascenseur', cost: String(30 * M), method: 'LINEAIRE', years: 10 }],
    });
    const out = await compta.post(`/api/companies/${cid}/assets/${b.body.id}/dispose`).set(H).send({ date: `${YEAR}-12-31`, price: '0', componentIndex: 1 });
    expect(out.status).toBe(201);
    expect(out.body.vnc).toBe(String(27 * M * 100));
    expect(out.body.draft.lines.find((l: any) => l.account === '231300').credit).toBe(String(30 * M * 100));
    const after = (await compta.get(`/api/companies/${cid}/assets`)).body.find((a: any) => a.code === 'BAT-01');
    expect(after.status).toBe('EN_SERVICE');
    expect(after.schedule).toHaveLength(1);
    const add = await compta.post(`/api/companies/${cid}/assets/${b.body.id}/components`).set(H).send({ label: 'Nouvel ascenseur', cost: String(25 * M), method: 'LINEAIRE', years: 10 });
    expect(add.body.components).toHaveLength(2);
    expect((await compta.post(`/api/companies/${cid}/assets/${b.body.id}/dispose`).set(H).send({ date: `${YEAR}-12-31`, price: '0', componentIndex: 9 })).body.code).toBe('COMPOSANT_INCONNU');
  });
});

describe('opérations courantes (guide d’application)', () => {
  const post = (lines: unknown[], date: string, ref: string) => compta.post(`/api/companies/${cid}/entries?validate=true`).set(H).send({ journalCode: 'OD', date, pieceRef: ref, label: ref, lines });
  it('application 7 : liquidation de TVA sous-compte par sous-compte', async () => {
    await post([{ account: '521100', debit: '35' }, { account: '443100', credit: '35' }], `${YEAR}-03-10`, 'T1');
    await post([{ account: '521100', debit: '19' }, { account: '443200', credit: '19' }], `${YEAR}-03-11`, 'T2');
    await post([{ account: '445100', debit: '15' }, { account: '521100', credit: '15' }], `${YEAR}-03-12`, 'T3');
    await post([{ account: '445200', debit: '18' }, { account: '521100', credit: '18' }], `${YEAR}-03-13`, 'T4');
    const r = await compta.post(`/api/companies/${cid}/tax/vat-settlement`).set(H).send({ from: `${YEAR}-03-01`, to: `${YEAR}-03-31` });
    expect(r.status).toBe(201);
    const acc = (a: string) => r.body.lines.find((l: any) => l.account === a);
    expect(acc('443100').debit).toBe('3500');
    expect(acc('443200').debit).toBe('1900');
    expect(acc('445100').credit).toBe('1500');
    expect(acc('444100').credit).toBe('2100');
  });
  it('applications 21 à 24 : régularisations en brouillon', async () => {
    const r = await compta.post(`/api/companies/${cid}/closing/accruals`).set(H).send({ date: `${YEAR}-12-31`, items: [
      { kind: 'CHARGE_CONSTATEE_AVANCE', account: '625200', amount: '12' },
      { kind: 'CHARGE_A_PAYER', account: '601100', amount: '50', vat: '5', counterparty: 'FOURNISSEUR' },
      { kind: 'PRODUIT_CONSTATE_AVANCE', account: '706100', amount: '9' },
    ] });
    expect(r.status).toBe(201);
    expect(r.body.entry.lines.map((l: any) => l.account)).toEqual(expect.arrayContaining(['476000', '408100', '445500', '477000']));
    expect(r.body.reversal).toBeNull();
    expect(r.body.message).toContain('contre-passation');
    expect((await compta.post(`/api/companies/${cid}/closing/accruals`).set(H).send({ date: `${YEAR}-12-31`, items: [{ kind: 'CHARGE_A_PAYER', account: '601100', amount: '1', counterparty: 'CLIENT' }] })).body.code).toBe('TIERS_INADAPTE');
  });
  it('applications 71 à 75 : provision pour litige ajustée au montant requis', async () => {
    const r = await compta.post(`/api/companies/${cid}/closing/provisions`).set(H).send({ date: `${YEAR}-12-31`, items: [{ account: '191000', required: '10000000' }] });
    expect(r.body.entry.lines[0]).toMatchObject({ account: '691100', debit: '1000000000' });
    expect((await compta.post(`/api/companies/${cid}/closing/provisions`).set(H).send({ date: `${YEAR}-12-31`, items: [{ account: '411100', required: '1' }] })).body.code).toBe('COMPTE_PROVISION_19_ATTENDU');
  });
  it('application 65 : affectation du résultat en instance', async () => {
    expect((await chef.post(`/api/companies/${cid}/closing/appropriation`).set(H).send({ date: `${YEAR}-06-10`, decision: 'AGO', dividends: '1' })).body.code).toBe('AUCUN_RESULTAT_EN_INSTANCE');
    await post([{ account: '521100', debit: '150000000' }, { account: '130100', credit: '150000000' }], `${YEAR}-01-02`, 'AN-RES');
    const bad = await chef.post(`/api/companies/${cid}/closing/appropriation`).set(H).send({ date: `${YEAR}-06-10`, decision: 'AGO du 10 juin', dividends: '1' });
    expect(bad.body.code).toBe('AFFECTATION_DESEQUILIBREE');
    const ok = await chef.post(`/api/companies/${cid}/closing/appropriation`).set(H).send({ date: `${YEAR}-06-10`, decision: 'AGO du 10 juin', legalReserve: '15000000', statutoryReserve: '20000000', optionalReserves: '25000000', dividends: '89000000', carryForward: '1000000' });
    expect(ok.status).toBe(201);
    expect(ok.body.entry.lines.map((l: any) => l.account)).toEqual(['130100', '111000', '112000', '118100', '465000', '121000']);
    expect((await compta.post(`/api/companies/${cid}/closing/appropriation`).set(H).send({ date: `${YEAR}-06-10`, decision: 'x' })).body.code).toBe('ROLE');
  });
  it('applications 53 et 54 : dépréciation des stocks à l’inventaire', async () => {
    const wh = (await compta.get(`/api/companies/${cid}/stock/warehouses`)).body[0].id;
    const m = (await compta.post(`/api/companies/${cid}/stock/items`).set(H).send({ code: 'MAR', label: 'Marchandise', kind: 'MARCHANDISE' })).body.id;
    await compta.post(`/api/companies/${cid}/stock/moves`).set(H).send({ type: 'ENTREE', itemId: m, warehouseId: wh, date: `${YEAR}-11-01`, qty: '100', unitCost: '100000', reference: 'BE-M' });
    const r = await compta.post(`/api/companies/${cid}/stock/impairment`).set(H).send({ date: `${YEAR}-12-31`, items: [{ itemId: m, contractPrice: '11500000', probablePrice: '10500000', costsToSell: '2000000' }] });
    expect(r.body.detail[0]).toMatchObject({ impairment: '50000000', account: '391000' });
    expect(r.body.entry.lines.map((l: any) => l.account)).toEqual(['659300', '391000']);
    expect((await compta.post(`/api/companies/${cid}/stock/impairment`).set(H).send({ date: `${YEAR}-12-31`, items: [{ itemId: m }] })).body.code).toBe('PRIX_DE_VENTE_REQUIS');
  });
});
