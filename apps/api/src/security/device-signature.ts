import { createHash, createPublicKey, verify } from 'node:crypto';

/** Empreinte d'une clé publique d'appareil (SHA-256 du SPKI DER). */
export function deviceFingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}

export function assertEd25519(publicKeyPem: string): void {
  if (createPublicKey(publicKeyPem).asymmetricKeyType !== 'ed25519') throw new Error('CLE_NON_ED25519');
}

/** Message signé par le poste : méthode, chemin, horodatage (secondes). */
export const deviceMessage = (method: string, path: string, ts: string) => `${method.toUpperCase()}\n${path}\n${ts}`;

/** Vérifie la signature Ed25519 d'une requête et la fraîcheur de l'horodatage (± 5 min). */
export function verifyDeviceSignature(p: { publicKeyPem: string; method: string; path: string; ts: string; signature: string; nowSec: number }): boolean {
  const t = Number(p.ts);
  if (!Number.isFinite(t) || Math.abs(p.nowSec - t) > 300) return false;
  try {
    return verify(null, Buffer.from(deviceMessage(p.method, p.path, p.ts)), createPublicKey(p.publicKeyPem), Buffer.from(p.signature, 'base64'));
  } catch {
    return false;
  }
}
