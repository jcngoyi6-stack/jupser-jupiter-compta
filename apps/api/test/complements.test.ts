/** Lot 3 — compléments comptables : immobilisations, imports, banque, budget, notes, SMT, DSF, consolidation. */
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let chef: Agent;
let compta: Agent;
let admin: Agent;
let cid: string;
let fyId: string;

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'Compléments', { admin: ['ADMIN'], chef: ['CHEF_COMPTABLE', 'DIRECTION'], compta: ['COMPTABLE'] });
  admin = await login(ctx, t.users.admin!);
  chef = await login(ctx, t.users.chef!);
  compta = await login(ctx, t.users.compta!);
  const c = await makeCompany(admin);
  cid = c.company.id;
  fyId = c.fiscalYear.id;
});
afterAll(async () => ctx?.app.close());

describe("reprise d'une société existante", () => {
  it('importe une balance (CSV), propose la correspondance et génère les à-nouveaux', async () => {
    const csv = 'Compte;Intitulé;Débit;Crédit\n5211;Banque;30 000 000;0\n2441;Matériel;12 000 000;0\n4011;Fournisseur X;0;2 000 000\n1013;Capital;0;40 000 000\n';
    const p = await chef.post(`/api/companies/${cid}/imports/balance/preview`).set(H).send({ content: csv });
    expect(p.status).toBe(200);
    expect(p.body.errors).toEqual([]);
    expect(p.body.lines.map((l: any) => l.suggestion.target.slice(0, 3))).toEqual(['521', '244', '401', '101']);
    const lines = p.body.lines.map((l: any) => ({ source: l.account, target: l.suggestion.target, debit: l.debit, credit: l.credit }));
    const c = await chef.post(`/api/companies/${cid}/imports/balance/commit`).set(H).send({ date: `${YEAR}-01-01`, lines: lines.map((l: any) => ({ ...l, debit: (BigInt(l.debit) / 100n).toString(), credit: (BigInt(l.credit) / 100n).toString() })) });
    expect(c.status).toBe(201);
    expect(c.body.entry.status).toBe('VALIDE');
    const again = await chef.post(`/api/companies/${cid}/imports/balance/commit`).set(H).send({ date: `${YEAR}-01-01`, lines: lines.map((l: any) => ({ ...l, debit: '0', credit: '0' })) });
    expect(again.body.code).toBe('AN_EXISTANTS');
  });
  it('importe un journal Excel en brouillons', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('J');
    ws.addRow(['Journal', 'Date', 'Pièce', 'Compte', 'Libellé', 'Débit', 'Crédit']);
    ws.addRow(['OD', `05/02/${YEAR}`, 'IMP-1', '6222', 'Loyer', 1000, 0]);
    ws.addRow(['OD', `05/02/${YEAR}`, 'IMP-1', '5211', 'Loyer', 0, 1000]);
    const base64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const r = await compta.post(`/api/companies/${cid}/imports/journal`).set(H).send({ base64, fileName: 'journal.xlsx' });
    expect(r.body.drafts).toBe(1);
  });
});

describe('immobilisations', () => {
  it('enregistre une immobilisation par composants, propose les dotations et la cession', async () => {
    const a = await compta.post(`/api/companies/${cid}/assets`).set(H).send({
      code: 'VEH-01', label: 'Véhicule de livraison', account: '245100', acquisitionDate: `${YEAR}-04-01`, inServiceDate: `${YEAR}-04-01`,
      components: [{ label: 'Véhicule', cost: '12000000', method: 'LINEAIRE', years: 5 }],
    });
    expect(a.status).toBe(201);
    const list = await compta.get(`/api/companies/${cid}/assets`);
    expect(list.body[0].schedule[0].rows[0].dotation).toBe('180000000');
    const d = await compta.post(`/api/companies/${cid}/assets/depreciation`).set(H).send({ year: YEAR, date: `${YEAR}-12-31` });
    expect(d.status).toBe(201);
    expect(d.body.lines.find((l: any) => l.account === '681300').debit).toBe('180000000');
    const again = await compta.post(`/api/companies/${cid}/assets/depreciation`).set(H).send({ year: YEAR, date: `${YEAR}-12-31` });
    expect(again.body.code).toBe('AUCUNE_DOTATION');
    const ces = await compta.post(`/api/companies/${cid}/assets/${a.body.id}/dispose`).set(H).send({ date: `${YEAR}-12-31`, price: '11000000' });
    expect(ces.status).toBe(201);
    expect(ces.body.vnc).toBe('1020000000');
    await compta.delete(`/api/companies/${cid}/entries/${ces.body.draft.id}`).set(H);
    await compta.post(`/api/companies/${cid}/entries/${d.body.id}/validate`).set(H);
  });
});

describe('banque, budget, prévision', () => {
  it('importe un relevé, propose le rapprochement et régularise les frais', async () => {
    await compta.post(`/api/companies/${cid}/entries?validate=true`).set(H).send({ journalCode: 'BQ1', date: `${YEAR}-03-01`, pieceRef: 'VIR-77', label: 'Encaissement', lines: [{ account: '521100', debit: '500000' }, { account: '758800', credit: '500000' }] });
    const st = await compta.post(`/api/companies/${cid}/bank/521100/statement`).set(H).send({ content: `Date;Libellé;Débit;Crédit;Référence\n02/03/${YEAR};VIR VIR-77;0;500000;X\n05/03/${YEAR};FRAIS TENUE;25000;0;` });
    expect(st.body.imported).toBe(2);
    const r = await compta.get(`/api/companies/${cid}/bank/521100/reconciliation`);
    expect(r.body.proposals).toHaveLength(1);
    const m = await compta.post(`/api/companies/${cid}/bank/match`).set(H).send({ pairs: [{ statementLineId: r.body.proposals[0].statementLineId, entryLineId: r.body.proposals[0].bookId }] });
    expect(m.body.matched).toBe(1);
    const fees = r.body.statement.find((s: any) => s.label === 'FRAIS TENUE');
    const reg = await compta.post(`/api/companies/${cid}/bank/521100/regularize`).set(H).send({ statementLineIds: [fees.id], counterpartAccount: '631800' });
    expect(reg.body.drafts[0].lines[0]).toMatchObject({ account: '631800', debit: '2500000' });
  });
  it('bloque une dépense au-delà du budget en mode bloquant', async () => {
    const b = await chef.put(`/api/companies/${cid}/budget`).set(H).send({ fiscalYearId: fyId, mode: 'BLOQUANT', lines: [{ prefix: '6222', amount: '1500', label: 'Loyers' }] });
    expect(b.body.saved).toBe(1);
    const ok = await compta.post(`/api/companies/${cid}/entries?validate=true`).set(H).send({ journalCode: 'BQ1', date: `${YEAR}-04-01`, pieceRef: 'L-1', label: 'Loyer', lines: [{ account: '622200', debit: '1000' }, { account: '521100', credit: '1000' }] });
    expect(ok.body.status).toBe('VALIDE');
    const ko = await compta.post(`/api/companies/${cid}/entries?validate=true`).set(H).send({ journalCode: 'BQ1', date: `${YEAR}-05-01`, pieceRef: 'L-2', label: 'Loyer', lines: [{ account: '622200', debit: '1000' }, { account: '521100', credit: '1000' }] });
    expect(ko.body.code).toBe('BUDGET_DEPASSE');
    const rep = await chef.get(`/api/companies/${cid}/budget`);
    expect(rep.body.report[0].realized).toBe('100000');
    await chef.put(`/api/companies/${cid}/budget`).set(H).send({ fiscalYearId: fyId, mode: 'ALERTE', lines: [] });
  });
  it('projette la trésorerie sur 13 semaines et 12 mois', async () => {
    await compta.post(`/api/companies/${cid}/treasury/forecast/items`).set(H).send({ date: `${YEAR}-06-15`, amount: '-1000000', category: 'EMPRUNT', label: 'Échéance prêt' });
    const f = await compta.get(`/api/companies/${cid}/treasury/forecast?start=${YEAR}-06-01`);
    expect(f.body.weeks).toHaveLength(13);
    expect(f.body.months).toHaveLength(12);
  });
});

describe('états complémentaires', () => {
  it('produit les notes annexes et fige une note validée', async () => {
    const n = await chef.get(`/api/companies/${cid}/reports/notes`);
    expect(n.body.tables.find((t: any) => t.number === '3A').rows.length).toBeGreaterThan(3);
    expect(n.body.texts[0].status).toBe('PROPOSITION');
    const v = await chef.put(`/api/companies/${cid}/reports/notes/2`).set(H).send({ fiscalYearId: fyId, title: 'Règles et méthodes', text: 'Texte validé par le chef comptable.', validate: true });
    expect(v.body.status).toBe('VALIDE');
    const again = await chef.put(`/api/companies/${cid}/reports/notes/2`).set(H).send({ fiscalYearId: fyId, title: 'Modif', text: 'modification', validate: false });
    expect(again.body.code).toBe('NOTE_FIGEE');
  });
  it('produit les états SMT, le livre d’inventaire et la DSF Excel', async () => {
    const s = await chef.get(`/api/companies/${cid}/reports/smt`);
    expect(s.body.controls[0].ok).toBe(true);
    const ib = await chef.get(`/api/companies/${cid}/reports/inventory-book`);
    expect(ib.body.trialBalance.rows.length).toBeGreaterThan(0);
    await chef.post(`/api/companies/${cid}/tax/adjustments`).set(H).send({ fiscalYearId: fyId, kind: 'REINTEGRATION', label: 'Amendes non déductibles', amount: '50000' });
    const x = await chef.get(`/api/companies/${cid}/reports/dsf.xlsx`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(x.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Identification', 'Bilan actif', 'Bilan passif', 'Compte de résultat', 'TFT', 'Résultat fiscal', 'Contrôles']);
  });
});

describe('consolidation', () => {
  it('consolide une mère et sa filiale (IG) et calcule les intérêts minoritaires', async () => {
    const f = await makeCompany(admin, { name: 'Filiale Lubumbashi' });
    await compta.post(`/api/companies/${f.company.id}/entries?validate=true`).set(H).send({ journalCode: 'OD', date: `${YEAR}-02-01`, pieceRef: 'K', label: 'Capital', lines: [{ account: '521100', debit: '1000000' }, { account: '101300', credit: '1000000' }] });
    const g = await chef.post('/api/consolidation/groups').set(H).send({ name: 'Groupe Démo', currency: 'CDF', members: [{ companyId: cid, parent: true, method: 'IG', ownershipPct: '100' }, { companyId: f.company.id, method: 'IG', ownershipPct: '60' }] });
    expect(g.status).toBe(201);
    const s = await chef.get(`/api/consolidation/groups/${g.body.id}/statements`);
    expect(s.status).toBe(200);
    expect(s.body.minorityEquity).toBe('40000000');
  });
});
