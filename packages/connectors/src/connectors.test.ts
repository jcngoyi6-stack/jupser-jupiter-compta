import { describe, expect, it } from 'vitest';
import {
  CinetPayProvider, FlutterwaveProvider, SimulatorProvider, PaymentError, pickProvider, DEFAULT_COVERAGE, toMajor, fromMajor,
  FixedPegProvider, HttpJsonFxProvider, bccProvider, fetchWithFallback, manualRate, normalizeRate, type FetchLike,
} from './index';

function fakeFetch(routes: Record<string, { ok?: boolean; status?: number; body: unknown }>) {
  const calls: { url: string; init?: any }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key]! : { ok: false, status: 404, body: {} };
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body };
  };
  return { f, calls };
}

const req = { reference: 'ref-1', amountMinor: 12345n, currency: 'USD', description: 'Abonnement Jupiter Compta (PRO) !', customer: { name: 'A', email: 'a@b.cd' }, returnUrl: 'https://x/retour', notifyUrl: 'https://x/notif' };

describe('montants', () => {
  it('conversion mineur/majeur', () => {
    expect(toMajor(12345n, 'USD')).toBe('123.45');
    expect(toMajor(5n, 'CDF')).toBe('0.05');
    expect(toMajor(5000n, 'XOF')).toBe('5000');
    expect(fromMajor('123.4', 'USD')).toBe(12340n);
    expect(fromMajor(100, 'USD')).toBe(10000n);
    expect(fromMajor('5000', 'XOF')).toBe(5000n);
  });
});

describe('CinetPay', () => {
  it('crée le paiement puis vérifie le statut auprès du prestataire', async () => {
    const { f, calls } = fakeFetch({
      '/payment/check': { body: { data: { status: 'ACCEPTED', amount: '123.45', currency: 'USD' } } },
      '/payment': { body: { code: '201', data: { payment_url: 'https://pay/xyz' } } },
    });
    const p = new CinetPayProvider({ apiKey: 'k', siteId: 's', fetch: f });
    const c = await p.createCheckout({ ...req, method: 'MOBILE_MONEY' });
    expect(c.redirectUrl).toBe('https://pay/xyz');
    const sent = JSON.parse(calls[0]!.init.body);
    expect(sent).toMatchObject({ amount: 123.45, channels: 'MOBILE_MONEY', transaction_id: 'ref-1' });
    expect(sent.description).not.toContain('!');
    expect(p.parseNotification({ cpm_trans_id: 'ref-1' })).toBe('ref-1');
    expect(() => p.parseNotification({})).toThrow(PaymentError);
    expect(await p.verify('ref-1')).toMatchObject({ status: 'PAYE', amountMinor: 12345n });
    await p.createCheckout({ ...req, method: 'CARTE' });
    expect(JSON.parse(calls[2]!.init.body).channels).toBe('CREDIT_CARD');
  });
  it('erreurs et statuts', async () => {
    const refused = fakeFetch({ '/payment/check': { body: { data: { status: 'REFUSED' } } }, '/payment': { body: { code: '608', message: 'Montant invalide' } } });
    const p = new CinetPayProvider({ apiKey: 'k', siteId: 's', fetch: refused.f });
    await expect(p.createCheckout(req)).rejects.toThrow('Montant invalide');
    await expect(p.createCheckout({ ...req, currency: 'EUR' })).rejects.toThrow('non acceptée');
    expect((await p.verify('x')).status).toBe('ECHEC');
    const pending = new CinetPayProvider({ apiKey: 'k', siteId: 's', baseUrl: 'https://sandbox', fetch: fakeFetch({ '/payment/check': { body: {} } }).f });
    expect(await pending.verify('x')).toMatchObject({ status: 'EN_ATTENTE', amountMinor: null });
  });
});

describe('Flutterwave', () => {
  it('lien de paiement, signature du webhook et vérification', async () => {
    const { f, calls } = fakeFetch({
      '/payments': { body: { status: 'success', data: { link: 'https://fw/abc' } } },
      'verify_by_reference': { body: { data: { status: 'successful', amount: 123.45, currency: 'USD' } } },
    });
    const p = new FlutterwaveProvider({ secretKey: 'sk', webhookHash: 'secret-hash', fetch: f });
    expect((await p.createCheckout({ ...req, method: 'MOBILE_MONEY' })).redirectUrl).toBe('https://fw/abc');
    expect(calls[0]!.init.headers.Authorization).toBe('Bearer sk');
    await p.createCheckout(req);
    expect(JSON.parse(calls[1]!.init.body).payment_options).toBe('card');
    expect(p.parseNotification({ data: { tx_ref: 'ref-1' } }, { 'verif-hash': 'secret-hash' })).toBe('ref-1');
    expect(() => p.parseNotification({ data: { tx_ref: 'ref-1' } }, { 'verif-hash': 'bad' })).toThrow('Signature');
    expect(() => p.parseNotification({}, { 'verif-hash': 'secret-hash' })).toThrow('Référence');
    expect(await p.verify('ref-1')).toMatchObject({ status: 'PAYE', amountMinor: 12345n });
  });
  it('erreurs et statuts', async () => {
    const p = new FlutterwaveProvider({ secretKey: 'sk', webhookHash: 'h', baseUrl: 'https://sb', fetch: fakeFetch({ '/payments': { ok: false, status: 401, body: {} }, verify_by_reference: { body: { data: { status: 'failed' } } } }).f });
    await expect(p.createCheckout(req)).rejects.toThrow('401');
    await expect(p.createCheckout({ ...req, currency: 'KMF' })).rejects.toThrow('non acceptée');
    expect((await p.verify('r')).status).toBe('ECHEC');
    const q = new FlutterwaveProvider({ secretKey: 'sk', webhookHash: 'h', fetch: fakeFetch({ verify_by_reference: { body: {} } }).f });
    expect((await q.verify('r')).status).toBe('EN_ATTENTE');
  });
});

describe('simulateur et choix du prestataire', () => {
  it('signature HMAC', async () => {
    const s = new SimulatorProvider('k');
    expect((await s.createCheckout({ ...req, method: 'MOBILE_MONEY' })).instructions).toContain('téléphone');
    expect((await s.createCheckout(req)).redirectUrl).toBeNull();
    const body = { externalRef: 'r', status: 'PAYE' };
    expect(await s.verify('r')).toMatchObject({ status: 'EN_ATTENTE' });
    expect(s.parseNotification(body, { 'x-signature': s.sign(body) })).toBe('r');
    expect((await s.verify('r')).status).toBe('PAYE');
    expect(() => s.parseNotification(body, {})).toThrow('Signature');
    const bad = { externalRef: 'r' };
    expect(() => s.parseNotification(bad, { 'x-signature': s.sign(bad) })).toThrow('incomplète');
  });
  it('pickProvider', () => {
    const cp = new CinetPayProvider({ apiKey: 'k', siteId: 's' });
    const fw = new FlutterwaveProvider({ secretKey: 'k', webhookHash: 'h' });
    expect(pickProvider([cp, fw], 'CD', 'USD', DEFAULT_COVERAGE)?.code).toBe('CINETPAY');
    expect(pickProvider([cp, fw], 'GQ', 'XAF', DEFAULT_COVERAGE)?.code).toBe('FLUTTERWAVE');
    expect(pickProvider([cp], 'GQ', 'XAF', DEFAULT_COVERAGE)?.code).toBe('CINETPAY');
    expect(pickProvider([cp, fw], 'KM', 'KMF', DEFAULT_COVERAGE)).toBeNull();
  });
});

describe('cours de change', () => {
  it('parités fixes, BCC, secours, manuel', async () => {
    expect(await new FixedPegProvider().fetchRates('XOF', '2026-01-02')).toEqual([expect.objectContaining({ currency: 'EUR', rate: '655.957', type: 'OFFICIEL' })]);
    expect(await new FixedPegProvider().fetchRates('CDF', '2026-01-02')).toEqual([]);
    const { f, calls } = fakeFetch({ 'bcc.test': { body: { rates: { USD: '2 850,1234', EUR: 'x', CDF: '1' } } } });
    const bcc = bccProvider('https://bcc.test/cours', f);
    const r = await bcc.fetchRates('CDF', '2026-01-02');
    expect(calls[0]!.url).toBe('https://bcc.test/cours?date=2026-01-02');
    expect(r).toEqual([expect.objectContaining({ currency: 'USD', rate: '2850.1234', quote: 'CDF' })]);
    expect(await bcc.fetchRates('XOF', '2026-01-02')).toEqual([]);
    expect(bccProvider('https://bcc.test/c?k=1', f)).toBeDefined();
    const down = new HttpJsonFxProvider('BCEAO', { url: () => 'https://down', extract: (j) => j, source: 'x', quotes: ['XOF'], fetch: fakeFetch({}).f });
    const market = new HttpJsonFxProvider('MARCHE', { url: () => 'https://mkt', extract: (j) => j, source: 'commercial', quotes: ['XOF'], type: 'MARCHE', fetch: fakeFetch({ mkt: { body: { USD: '600.5', EUR: '650' } } }).f });
    const all = await fetchWithFallback([down, new FixedPegProvider(), market], 'XOF', '2026-01-02');
    expect(all.errors).toEqual([{ provider: 'BCEAO', message: 'BCEAO : HTTP 404' }]);
    expect(all.rates.find((x) => x.currency === 'EUR')!.rate).toBe('655.957');
    expect(all.rates.find((x) => x.currency === 'USD')!.type).toBe('MARCHE');
    expect(manualRate({ currency: 'USD', quote: 'CDF', rate: '2800', date: '2026-01-02', userName: 'Chef', reason: 'BCC indisponible' }).source).toContain('BCC indisponible');
    expect(() => manualRate({ currency: 'USD', quote: 'CDF', rate: '-1', date: 'd', userName: 'u', reason: 'motif long' })).toThrow('COURS_INVALIDE');
    expect(() => manualRate({ currency: 'USD', quote: 'CDF', rate: '1', date: 'd', userName: 'u', reason: '' })).toThrow('MOTIF_OBLIGATOIRE');
    expect(normalizeRate(null)).toBeNull();
  });
});
