import { generateKeyPairSync, sign as cryptoSign, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { allowedEmail, authorizationUrl, discover, exchangeCode, newAuthRequest, OidcError, verifyIdToken, type FetchLike } from './index';

const ISS = 'https://idp.example.cd';
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwks = { keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'r1', alg: 'RS256' }, { ...ec.publicKey.export({ format: 'jwk' }), kid: 'e1' }] };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function token(claims: Record<string, unknown>, alg = 'RS256', kid = 'r1') {
  const h = b64({ alg, kid });
  const p = b64(claims);
  const data = Buffer.from(`${h}.${p}`);
  const sig = alg === 'RS256' ? cryptoSign('sha256', data, rsa.privateKey) : cryptoSign('sha256', data, { key: ec.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${sig.toString('base64url')}`;
}
const base = { iss: ISS, sub: 'u1', aud: 'jc', exp: 2000, nonce: 'n', email: 'a@societe.cd', email_verified: true };
const exp = { issuer: ISS, clientId: 'jc', nonce: 'n', nowSec: 1000 };

describe('OIDC', () => {
  it('découverte, URL d’autorisation PKCE, échange du code', async () => {
    const f: FetchLike = async (url, init) => ({
      ok: true, status: 200,
      json: async () => (url.endsWith('openid-configuration') ? { issuer: ISS, authorization_endpoint: `${ISS}/auth`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks` } : { id_token: 'tok', body: init?.body }),
    });
    const d = await discover(`${ISS}/`, f);
    const r = newAuthRequest();
    expect(r.challenge).toBe(createHash('sha256').update(r.verifier).digest('base64url'));
    const url = new URL(authorizationUrl(d, { issuer: ISS, clientId: 'jc', redirectUri: 'https://app/cb' }, r, 'a@societe.cd'));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('login_hint')).toBe('a@societe.cd');
    expect(new URL(authorizationUrl(d, { issuer: ISS, clientId: 'jc', redirectUri: 'x', scopes: ['openid'] }, r)).searchParams.get('scope')).toBe('openid');
    expect(await exchangeCode(d, { issuer: ISS, clientId: 'jc', clientSecret: 's', redirectUri: 'https://app/cb' }, 'code', r.verifier, f)).toBe('tok');
    expect(await exchangeCode(d, { issuer: ISS, clientId: 'jc', redirectUri: 'https://app/cb' }, 'code', r.verifier, f)).toBe('tok');
    const bad: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', issuer: 'autre' }) });
    await expect(exchangeCode(d, { issuer: ISS, clientId: 'jc', redirectUri: 'x' }, 'c', 'v', bad)).rejects.toThrow('invalid_grant');
    await expect(discover(ISS, bad)).rejects.toThrow('Découverte');
    const other: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ issuer: 'https://autre' }) });
    await expect(discover(ISS, other)).rejects.toThrow('Émetteur');
  });
  it('vérifie l’id_token (RS256 et ES256)', () => {
    expect(verifyIdToken(token(base), jwks, exp).email).toBe('a@societe.cd');
    expect(verifyIdToken(token({ ...base, aud: ['x', 'jc'] }, 'ES256', 'e1'), jwks, exp).sub).toBe('u1');
    const codes = (t: string, e = exp) => { try { verifyIdToken(t, jwks, e); return 'OK'; } catch (x) { return (x as OidcError).code; } };
    expect(codes('a.b')).toBe('FORMAT');
    expect(codes(`${b64({ alg: 'none' })}.${b64(base)}.`)).toBe('ALGORITHME');
    expect(codes(token(base, 'RS256', 'inconnue'))).toBe('CLE');
    const t = token(base);
    expect(codes(`${t.split('.')[0]}.${b64({ ...base, sub: 'pirate' })}.${t.split('.')[2]}`)).toBe('SIGNATURE');
    expect(codes(token({ ...base, iss: 'https://autre' }))).toBe('EMETTEUR');
    expect(codes(token({ ...base, aud: 'autre' }))).toBe('AUDIENCE');
    expect(codes(token({ ...base, exp: 100 }))).toBe('EXPIRE');
    expect(codes(token({ ...base, nonce: 'rejeu' }))).toBe('NONCE');
    expect(verifyIdToken(token(base), { keys: [jwks.keys[0]!] }, { ...exp, skewSec: 0 }).sub).toBe('u1');
    const noKid = `${b64({ alg: 'RS256' })}.${b64(base)}`;
    const sig = cryptoSign('sha256', Buffer.from(noKid), rsa.privateKey).toString('base64url');
    expect(verifyIdToken(`${noKid}.${sig}`, jwks, exp).sub).toBe('u1');
  });
  it('domaines et adresses autorisés', () => {
    expect(allowedEmail({ ...base, email: 'A@Societe.CD' }, ['societe.cd'])).toBe('a@societe.cd');
    expect(allowedEmail(base, [])).toBe('a@societe.cd');
    expect(() => allowedEmail({ ...base, email_verified: false }, [])).toThrow('vérifiée');
    expect(() => allowedEmail({ ...base, email: undefined }, [])).toThrow('vérifiée');
    expect(() => allowedEmail(base, ['autre.cd'])).toThrow('Domaine');
  });
});
