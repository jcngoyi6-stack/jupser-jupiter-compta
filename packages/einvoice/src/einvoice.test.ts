import { describe, expect, it, vi } from 'vitest';
import { HttpEmcf, itemsTotal, SimulatedDef, validateNormalizedInvoice, type NormalizedInvoice } from './index';

const inv: NormalizedInvoice = {
  sellerTaxId: 'A1234567B',
  sellerName: 'Démo SARL',
  type: 'FV',
  client: { type: 'PM', name: 'Client SA', taxId: 'A7654321C' },
  operator: { id: 'u1', name: 'Caissier' },
  items: [{ name: 'Conseil', quantity: '2', unitPriceTtc: 116_000_00n, taxGroup: 'B' }],
  payment: [{ method: 'VIREMENT', amount: 232_000_00n }],
  internalNumber: 'FA-2026-00001',
  date: '2026-10-30',
};

describe('facture normalisée RDC', () => {
  it('valide les champs obligatoires', () => {
    expect(validateNormalizedInvoice(inv)).toEqual([]);
    const bad = validateNormalizedInvoice({ ...inv, sellerTaxId: '', type: 'FA', items: [{ name: 'x', quantity: '0', unitPriceTtc: -1n, taxGroup: 'Z' }], client: { type: 'PM', name: 'x' } });
    expect(bad.length).toBeGreaterThanOrEqual(6);
    expect(validateNormalizedInvoice({ ...inv, items: [] })).toContain('Au moins un article.');
    expect(itemsTotal([{ name: 'x', quantity: '1.5', unitPriceTtc: 1000n, taxGroup: 'B' }])).toBe(1500n);
  });
  it('produit des éléments de sécurité simulés, marqués SIMULATION, avec compteurs', async () => {
    const def = new SimulatedDef('secret');
    const a = await def.submit(inv);
    const b = await def.submit({ ...inv, internalNumber: 'FA-2026-00002' });
    expect(a.mode).toBe('SIMULATION');
    expect(a.codeDefDgi).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){5}$/);
    expect(a.counters).toBe('1/1 FV');
    expect(b.counters).toBe('2/2 FV');
    expect(a.qrCode).toMatch(/^DEF-SIMULATION;/);
    await expect(def.submit({ ...inv, sellerTaxId: '' })).rejects.toThrow(/NIF/);
  });
  it('dialogue avec le e-MCF en deux temps (demande puis confirmation)', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method!, body: init.body as string });
      const body = url.endsWith('/confirm') ? { codeDEFDGI: 'ABCD-EFGH', nim: 'NIM01', counters: '5/9 FV', dateTime: '2026-10-30T10:00:00', qrCode: 'F;NIM01;ABCD' } : { uid: 'u-1', total: 232000 };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const emcf = new HttpEmcf({ baseUrl: 'https://emcf.example/', token: 't', fetchImpl: fetchImpl as never });
    const r = await emcf.submit(inv);
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PUT']);
    expect(JSON.parse(calls[0]!.body!).items[0].price).toBe(116000);
    expect(r).toMatchObject({ mode: 'PRODUCTION', codeDefDgi: 'ABCD-EFGH', nim: 'NIM01', counters: '5/9 FV' });
  });
  it('remonte les erreurs du dispositif', async () => {
    const fetchImpl = async () => new Response('NIF inconnu', { status: 400 });
    await expect(new HttpEmcf({ baseUrl: 'https://x', token: 't', fetchImpl: fetchImpl as never }).submit(inv)).rejects.toThrow(/e-MCF 400/);
    const noUid = async () => new Response('{}', { status: 200 });
    await expect(new HttpEmcf({ baseUrl: 'https://x', token: 't', fetchImpl: noUid as never }).submit(inv)).rejects.toThrow(/identifiant/);
  });
});

describe('e-MCF — variantes de réponse', () => {
  it('tolère des réponses minimales et des chemins paramétrés', async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return new Response(url.includes('valider') ? JSON.stringify({ code: 'X1' }) : url.includes('vide') ? '' : JSON.stringify({ uid: 9 }), { status: 200 });
    };
    const e = new HttpEmcf({ baseUrl: 'https://x', token: 't', submitPath: '/factures', confirmPath: (u) => `/factures/${u}/valider`, fetchImpl: fetchImpl as never });
    const r = await e.submit({ ...inv, nim: 'N9', type: 'FA', reference: 'ORIG', payment: [] });
    expect(urls).toEqual(['https://x/factures', 'https://x/factures/9/valider']);
    expect(r).toMatchObject({ codeDefDgi: 'X1', nim: 'N9', counters: '', totals: { ht: '', tva: '', ttc: '' } });
    await expect(new SimulatedDef('s', 'N1').submit({ ...inv, nim: 'N7' })).resolves.toMatchObject({ nim: 'N7' });
    const def = new HttpEmcf({ baseUrl: 'https://x', token: 't', fetchImpl: (async () => new Response('', { status: 200 })) as never });
    await expect(def.submit(inv)).rejects.toThrow(/identifiant/);
  });
});
