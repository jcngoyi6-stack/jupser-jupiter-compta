/**
 * Jetons de licence signés Ed25519 pour l'édition sur site / hors ligne (docs/09) :
 * locataire, modules, limites, expiration, empreinte de l'installation ; tolérance hors connexion de 30 jours.
 * La clé privée reste chez JUPSER (console) ; l'installation ne détient que la clé publique.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { EditionCode, ModuleCode } from './index';

export const OFFLINE_TOLERANCE_DAYS = 30;

export interface LicensePayload {
  v: 1;
  id: string;
  tenantId: string;
  tenantName: string;
  edition: EditionCode;
  modules: ModuleCode[];
  maxUsers: number;
  maxCompanies: number;
  issuedAt: string;
  /** Date de fin (AAAA-MM-JJ, incluse). */
  expiresAt: string;
  /** Empreinte de l'installation (SHA-256 hexadécimal) ; null = non liée à un poste. */
  fingerprint: string | null;
}

const b64u = (b: Buffer) => b.toString('base64url');

export function generateLicenseKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

/** Empreinte d'installation à partir d'éléments stables du poste ou du serveur. */
export function installationFingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.map((p) => p.trim().toLowerCase()).join('|')).digest('hex');
}

export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const body = Buffer.from(JSON.stringify(payload));
  const sig = sign(null, body, createPrivateKey(privateKeyPem));
  return `JCL1.${b64u(body)}.${b64u(sig)}`;
}

export type LicenseCheck =
  | { valid: true; mode: 'EN_LIGNE' | 'HORS_LIGNE_TOLERE'; payload: LicensePayload; offlineDaysLeft: number | null }
  | { valid: false; reason: 'FORMAT' | 'SIGNATURE' | 'EXPIREE' | 'AUTRE_INSTALLATION' | 'HORS_LIGNE_TROP_LONG'; payload?: LicensePayload };

/**
 * Vérification locale. `lastOnlineCheck` : date de la dernière validation réussie auprès de JUPSER
 * (null si le serveur de licences vient d'être joint).
 */
export function verifyLicense(token: string, publicKeyPem: string, ctx: { today: string; fingerprint?: string; lastOnlineCheck?: string | null }): LicenseCheck {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'JCL1') return { valid: false, reason: 'FORMAT' };
  const body = Buffer.from(parts[1]!, 'base64url');
  const sig = Buffer.from(parts[2]!, 'base64url');
  let ok = false;
  try {
    ok = verify(null, body, createPublicKey(publicKeyPem), sig);
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'SIGNATURE' };
  let payload: LicensePayload;
  try {
    payload = JSON.parse(body.toString()) as LicensePayload;
  } catch {
    return { valid: false, reason: 'FORMAT' };
  }
  if (payload.expiresAt < ctx.today) return { valid: false, reason: 'EXPIREE', payload };
  if (payload.fingerprint && payload.fingerprint !== ctx.fingerprint) return { valid: false, reason: 'AUTRE_INSTALLATION', payload };
  if (!ctx.lastOnlineCheck) return { valid: true, mode: 'EN_LIGNE', payload, offlineDaysLeft: null };
  const days = Math.floor((Date.parse(`${ctx.today}T00:00:00Z`) - Date.parse(`${ctx.lastOnlineCheck.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (days > OFFLINE_TOLERANCE_DAYS) return { valid: false, reason: 'HORS_LIGNE_TROP_LONG', payload };
  return { valid: true, mode: 'HORS_LIGNE_TOLERE', payload, offlineDaysLeft: OFFLINE_TOLERANCE_DAYS - days };
}
