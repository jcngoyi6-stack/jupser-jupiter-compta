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
