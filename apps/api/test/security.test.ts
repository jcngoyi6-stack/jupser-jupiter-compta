/** Infrastructure : prestataires de paiement, licences Ed25519, postes enrôlés, SSO OIDC, OCR, cours de change. */
process.env.FLUTTERWAVE_SECRET_KEY = 'sk_test';
process.env.FLUTTERWAVE_WEBHOOK_HASH = 'hash-secret';
process.env.FX_BCC_URL = 'https://bcc.test/cours';

import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AiController } = require('../dist/ai/ai.controller');
import { boot, H, login, makeCompany, makeTenant, YEAR, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let admin: Agent, compta: Agent, staff: Agent;
let tenantId: string;
let cid: string;
const fetchRoutes = new Map<string, (init?: any) => unknown>();

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url: string, init?: any) => {
    const key = [...fetchRoutes.keys()].find((k) => String(url).includes(k));
    const body = key ? fetchRoutes.get(key)!(init) : { error: 'introuvable' };
    return { ok: !!key, status: key ? 200 : 404, json: async () => body };
  });
  ctx = await boot();
  const t = await makeTenant(ctx, 'SEC', { admin: ['ADMIN'], compta: ['COMPTABLE'], staff: ['ADMIN'] });
  tenantId = t.tenant.id;
  await ctx.db.client.user.update({ where: { id: t.users.staff!.id }, data: { isJupserStaff: true } });
  admin = await login(ctx, t.users.admin!);
  compta = await login(ctx, t.users.compta!);
  staff = await login(ctx, t.users.staff!);
  cid = (await makeCompany(admin)).company.id;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await ctx?.app.close();
});

describe('paiement par prestataire réel (Flutterwave)', () => {
  it('redirection, notification signée, statut revérifié et montant contrôlé', async () => {
    fetchRoutes.set('/v3/payments', () => ({ status: 'success', data: { link: 'https://checkout.flutterwave.test/abc' } }));
    const c = await admin.post('/api/billing/checkout').set(H).send({ method: 'CARTE', months: 1 });
    expect(c.body.redirectUrl).toBe('https://checkout.flutterwave.test/abc');
    expect(c.body.payment.provider).toBe('FLUTTERWAVE');
    const ref = c.body.payment.externalRef;
    const hook = (hash: string) => request(ctx.server).post('/api/billing/webhook/flutterwave').set('verif-hash', hash).send({ data: { tx_ref: ref } });
    expect((await hook('mauvais')).body.code).toBe('SIGNATURE');
    fetchRoutes.set('verify_by_reference', () => ({ data: { status: 'successful', amount: 0.01, currency: 'USD' } }));
    expect((await hook('hash-secret')).body.code).toBe('MONTANT_INCOHERENT');
    const due = Number(c.body.payment.amountCents) / 100;
    fetchRoutes.set('verify_by_reference', () => ({ data: { status: 'successful', amount: due, currency: 'USD' } }));
    expect((await hook('hash-secret')).body.status).toBe('PAYE');
    expect((await hook('hash-secret')).body.idempotent).toBe(true);
    expect((await request(ctx.server).post('/api/billing/webhook/inconnu').send({})).body.code).toBe('PRESTATAIRE_INCONNU');
  });
});

describe('licences hors ligne', () => {
  it('émission par JUPSER, vérification en ligne, révocation', async () => {
    expect((await admin.post(`/api/console/tenants/${tenantId}/licenses`).set(H).send({ expiresAt: `${YEAR + 1}-12-31` })).body.code).toBe('RESERVE_JUPSER');
    const l = await staff.post(`/api/console/tenants/${tenantId}/licenses`).set(H).send({ expiresAt: `${YEAR + 1}-12-31` });
    expect(l.body.token).toMatch(/^JCL1\./);
    expect((await request(ctx.server).get('/api/licenses/public-key')).body.algorithm).toBe('Ed25519');
    expect((await request(ctx.server).post('/api/licenses/check').send({ token: l.body.token })).body.valid).toBe(true);
    expect((await request(ctx.server).post('/api/licenses/check').send({ token: l.body.token.slice(0, -4) + 'AAAA' })).body.reason).toBe('SIGNATURE');
    expect((await staff.get(`/api/console/tenants/${tenantId}/licenses`)).body).toHaveLength(1);
    await staff.post(`/api/console/licenses/${tenantId}/${l.body.payload.id}/revoke`).set(H);
    expect((await request(ctx.server).post('/api/licenses/check').send({ token: l.body.token })).body.reason).toBe('REVOQUEE');
  });
});

describe('postes enrôlés', () => {
  const kp = generateKeyPairSync('ed25519');
  const pem = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const signed = (agent: Agent, path: string, deviceId: string) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(null, Buffer.from(`GET\n${path}\n${ts}`), createPrivateKey(kp.privateKey.export({ type: 'pkcs8', format: 'pem' }))).toString('base64');
    return agent.get(path).set({ 'x-device-id': deviceId, 'x-device-timestamp': ts, 'x-device-signature': sig });
  };
  it('enrôlement, approbation, signature des requêtes, révocation', async () => {
    expect((await admin.put('/api/security/settings').set(H).send({ requireEnrolledDevices: true })).body.code).toBe('AUCUN_POSTE');
    expect((await compta.post('/api/devices/enroll').set(H).send({ name: 'Poste', publicKeyPem: '-----BEGIN PUBLIC KEY-----\nce n’est pas une clé\n-----END PUBLIC KEY-----' })).body.code).toBe('CLE_INVALIDE');
    const own = generateKeyPairSync('ed25519');
    await admin.post('/api/devices/enroll').set(H).send({ name: 'Poste admin', publicKeyPem: own.publicKey.export({ type: 'spki', format: 'pem' }).toString() });
    const d = await compta.post('/api/devices/enroll').set(H).send({ name: 'Portable comptable', publicKeyPem: pem });
    expect(d.body.status).toBe('EN_ATTENTE');
    expect((await compta.post(`/api/devices/${d.body.id}/approve`).set(H)).body.code).toBe('ROLE');
    await admin.post(`/api/devices/${d.body.id}/approve`).set(H);
    expect((await admin.put('/api/security/settings').set(H).send({ requireEnrolledDevices: true })).body.requireEnrolledDevices).toBe(true);
    expect((await compta.get('/api/companies')).body.code).toBe('POSTE_NON_AUTORISE');
    expect((await signed(compta, '/api/companies', d.body.id)).status).toBe(200);
    expect((await compta.get('/api/devices')).body).toHaveLength(1);
    await compta.post(`/api/devices/${d.body.id}/revoke`).set(H);
    expect((await signed(compta, '/api/companies', d.body.id)).body.code).toBe('POSTE_NON_AUTORISE');
    await ctx.db.client.tenant.update({ where: { id: tenantId }, data: { security: {} } });
  });
});

describe('authentification unique OIDC', () => {
  it('paramétrage, redirection PKCE, retour avec id_token vérifié', async () => {
    const ISS = 'https://idp.test';
    const slug = `sec-${Date.now().toString(36)}`;
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    fetchRoutes.set('idp.test/.well-known', () => ({ issuer: ISS, authorization_endpoint: `${ISS}/authorize`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks` }));
    fetchRoutes.set('idp.test/jwks', () => ({ keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] }));
    const s = await admin.put('/api/security/settings').set(H).send({ slug, sso: { enabled: true, issuer: ISS, clientId: 'jupiter', clientSecret: 'secret', emailDomains: ['test.cd'] } });
    expect(s.body, JSON.stringify(s.body)).toHaveProperty('sso.hasSecret', true);
    expect(s.body.sso).not.toHaveProperty('clientSecretEnc');
    const start = await request(ctx.server).get(`/api/auth/sso/${slug}/start`);
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.location!);
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = (start.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('jc_sso='))!;
    const saved = jwt.decode(decodeURIComponent(cookie.split(';')[0]!.slice(7))) as { nonce: string };
    const email = (await ctx.db.client.user.findFirst({ where: { memberships: { some: { tenantId } }, fullName: 'compta' } }))!.email;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({ iss: ISS, aud: 'jupiter', sub: 'x', exp: now + 300, nonce: saved.nonce, email, email_verified: true })}`;
    const idToken = `${head}.${sign('sha256', Buffer.from(head), rsa.privateKey).toString('base64url')}`;
    let tokenRequest = '';
    fetchRoutes.set('idp.test/token', (init) => { tokenRequest = init.body; return { id_token: idToken }; });
    const cb = await request(ctx.server).get(`/api/auth/sso/callback?code=abc&state=${loc.searchParams.get('state')}`).set('Cookie', cookie.split(';')[0]!);
    expect(cb.headers.location).toBe('http://localhost:3000/');
    expect(tokenRequest).toContain('code_verifier=');
    expect(tokenRequest).toContain('client_secret=secret');
    expect((cb.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('jc_session='))).toBe(true);
    const bad = await request(ctx.server).get(`/api/auth/sso/callback?code=abc&state=autre`).set('Cookie', cookie.split(';')[0]!);
    expect(bad.headers.location).toContain('sso_erreur=ETAT');
    expect((await request(ctx.server).get('/api/auth/sso/inconnu/start')).headers.location).toContain('sso_erreur=SSO_INACTIF');
  });
});

describe('OCR des pièces et cours de change', () => {
  it('lit une pièce, reconnaît le fournisseur et signale les incohérences', async () => {
    await compta.post(`/api/companies/${cid}/third-parties`).set(H).send({ type: 'FOURNISSEUR', code: 'SNEL', name: 'SNEL', taxId: 'A0700000X' });
    expect((await compta.post(`/api/ai/companies/${cid}/ocr`).set(H).send({ base64: 'aGVsbG8gd29ybGQ=', mediaType: 'image/png' })).body.code).toBe('OCR_INDISPONIBLE');
    AiController.reader = async () => '{"documentType":"FACTURE","supplierName":"S.N.E.L.","supplierTaxId":"a0700000x","number":"F1","date":"2026-02-03","currency":"CDF","netAmount":"1000","vatAmount":"160","grossAmount":"1160","description":"électricité","confidence":0.9}';
    const r = await compta.post(`/api/ai/companies/${cid}/ocr`).set(H).send({ base64: 'aGVsbG8gd29ybGQ=', mediaType: 'application/pdf', fileName: 'f.pdf' });
    expect(r.body).toMatchObject({ supplier: { name: 'SNEL' }, grossAmount: '116000', status: 'A_VERIFIER', warnings: [] });
    AiController.reader = async () => 'désolé';
    expect((await compta.post(`/api/ai/companies/${cid}/ocr`).set(H).send({ base64: 'aGVsbG8gd29ybGQ=', mediaType: 'image/jpeg' })).body.code).toBe('OCR_REPONSE_ILLISIBLE');
    AiController.reader = null;
  });
  it('récupère les cours (BCC) et signale les échecs', async () => {
    fetchRoutes.set('bcc.test', () => ({ rates: { USD: '2850.50', EUR: '3100' } }));
    const r = await compta.post('/api/fx-rates/fetch').set(H).send({ quote: 'CDF', date: `${YEAR}-03-01` });
    expect(r.body.saved.map((x: { currency: string }) => x.currency).sort()).toEqual(['EUR', 'USD']);
    expect((await compta.post('/api/fx-rates/fetch').set(H).send({ quote: 'CDF', date: `${YEAR}-03-01` })).body.saved).toHaveLength(0);
    const x = await compta.post('/api/fx-rates/fetch').set(H).send({ quote: 'XOF', date: `${YEAR}-03-01` });
    expect(x.body.saved[0]).toMatchObject({ currency: 'EUR', rate: '655.957' });
    fetchRoutes.delete('bcc.test');
    const down = await compta.post('/api/fx-rates/fetch').set(H).send({ quote: 'CDF', date: `${YEAR}-03-02` });
    expect(down.body).toMatchObject({ manualNeeded: true, errors: [{ provider: 'BCC' }] });
  });
});
