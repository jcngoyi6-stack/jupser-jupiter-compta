/**
 * Authentification unique OpenID Connect (docs/08, édition Entreprise) : code d'autorisation + PKCE S256,
 * vérification de la signature de l'id_token (RS256/ES256 via JWKS), de l'émetteur, de l'audience,
 * de l'expiration et du nonce. Aucune dépendance externe.
 */
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import type { FetchLike } from './payments';

export interface OidcConfig { issuer: string; clientId: string; clientSecret?: string; redirectUri: string; scopes?: string[] }
export interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }

export class OidcError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const b64u = (b: Buffer) => b.toString('base64url');

export async function discover(issuer: string, f: FetchLike = fetch as unknown as FetchLike): Promise<Discovery> {
  const res = await f(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
  if (!res.ok) throw new OidcError('DECOUVERTE', `Découverte OIDC impossible (${res.status}).`);
  const d = (await res.json()) as Discovery;
  if (d.issuer.replace(/\/$/, '') !== issuer.replace(/\/$/, '')) throw new OidcError('EMETTEUR', 'Émetteur annoncé différent de l’émetteur configuré.');
  return d;
}

/** Paramètres à conserver côté serveur (cookie signé) entre l'aller et le retour. */
export function newAuthRequest() {
  const verifier = b64u(randomBytes(32));
  return { state: b64u(randomBytes(16)), nonce: b64u(randomBytes(16)), verifier, challenge: b64u(createHash('sha256').update(verifier).digest()) };
}

export function authorizationUrl(d: Discovery, c: OidcConfig, r: { state: string; nonce: string; challenge: string }, loginHint?: string): string {
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', c.clientId);
  u.searchParams.set('redirect_uri', c.redirectUri);
  u.searchParams.set('scope', (c.scopes ?? ['openid', 'email', 'profile']).join(' '));
  u.searchParams.set('state', r.state);
  u.searchParams.set('nonce', r.nonce);
  u.searchParams.set('code_challenge', r.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (loginHint) u.searchParams.set('login_hint', loginHint);
  return u.toString();
}

export async function exchangeCode(d: Discovery, c: OidcConfig, code: string, verifier: string, f: FetchLike = fetch as unknown as FetchLike): Promise<string> {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: c.redirectUri, client_id: c.clientId, code_verifier: verifier });
  if (c.clientSecret) form.set('client_secret', c.clientSecret);
  const res = await f(d.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  const data = await res.json();
  if (!res.ok || typeof data?.id_token !== 'string') throw new OidcError('JETON', `Échange du code refusé : ${data?.error ?? res.status}.`);
  return data.id_token;
}

export interface IdClaims { iss: string; sub: string; aud: string | string[]; exp: number; iat?: number; nonce?: string; email?: string; email_verified?: boolean; name?: string }

/** Vérifie l'id_token avec les clés publiques (JWKS) du fournisseur d'identité. */
export function verifyIdToken(idToken: string, jwks: { keys: (JsonWebKey & { kid?: string; alg?: string })[] }, expect: { issuer: string; clientId: string; nonce: string; nowSec: number; skewSec?: number }): IdClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OidcError('FORMAT', 'id_token mal formé.');
  const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()) as { alg: string; kid?: string };
  if (header.alg !== 'RS256' && header.alg !== 'ES256') throw new OidcError('ALGORITHME', `Algorithme ${header.alg} refusé.`);
  const jwk = jwks.keys.find((k) => (header.kid ? k.kid === header.kid : true) && (!k.alg || k.alg === header.alg));
  if (!jwk) throw new OidcError('CLE', 'Clé de signature inconnue.');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2]!, 'base64url');
  const ok = header.alg === 'RS256' ? cryptoVerify('sha256', data, key, sig) : cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok) throw new OidcError('SIGNATURE', 'Signature de l’id_token invalide.');
  const c = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as IdClaims;
  const skew = expect.skewSec ?? 60;
  if (c.iss.replace(/\/$/, '') !== expect.issuer.replace(/\/$/, '')) throw new OidcError('EMETTEUR', 'Émetteur inattendu.');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(expect.clientId)) throw new OidcError('AUDIENCE', 'Audience inattendue.');
  if (c.exp + skew < expect.nowSec) throw new OidcError('EXPIRE', 'id_token expiré.');
  if (c.nonce !== expect.nonce) throw new OidcError('NONCE', 'Nonce invalide (rejeu possible).');
  return c;
}

/** L'adresse doit être vérifiée par le fournisseur et appartenir à un domaine autorisé du locataire. */
export function allowedEmail(c: IdClaims, domains: string[]): string {
  const email = (c.email ?? '').toLowerCase();
  if (!email || c.email_verified === false) throw new OidcError('EMAIL', 'Adresse non communiquée ou non vérifiée par le fournisseur d’identité.');
  if (domains.length && !domains.some((d) => email.endsWith(`@${d.toLowerCase()}`))) throw new OidcError('DOMAINE', 'Domaine de messagerie non autorisé pour ce locataire.');
  return email;
}
