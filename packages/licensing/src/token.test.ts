import { describe, expect, it } from 'vitest';
import { generateLicenseKeys, installationFingerprint, signLicense, verifyLicense, type LicensePayload } from './token';

const keys = generateLicenseKeys();
const fp = installationFingerprint(['HOST-1', ' AA:BB:CC ']);
const payload: LicensePayload = {
  v: 1, id: 'lic-1', tenantId: 't', tenantName: 'Client', edition: 'PRO', modules: ['COMPTABILITE'], maxUsers: 5, maxCompanies: 1,
  issuedAt: '2026-01-01', expiresAt: '2026-12-31', fingerprint: fp,
};

describe('jetons de licence Ed25519', () => {
  const token = signLicense(payload, keys.privateKeyPem);
  it('valide en ligne et hors ligne dans la tolérance', () => {
    expect(installationFingerprint(['host-1', 'aa:bb:cc'])).toBe(fp);
    expect(verifyLicense(token, keys.publicKeyPem, { today: '2026-06-01', fingerprint: fp })).toMatchObject({ valid: true, mode: 'EN_LIGNE' });
    expect(verifyLicense(token, keys.publicKeyPem, { today: '2026-06-11', fingerprint: fp, lastOnlineCheck: '2026-06-01T08:00:00Z' })).toMatchObject({ valid: true, mode: 'HORS_LIGNE_TOLERE', offlineDaysLeft: 20 });
  });
  it('refuse les jetons invalides', () => {
    expect(verifyLicense('abc', keys.publicKeyPem, { today: '2026-06-01' })).toMatchObject({ reason: 'FORMAT' });
    const [h, b, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, maxUsers: 500 })).toString('base64url');
    expect(verifyLicense(`${h}.${forged}.${s}`, keys.publicKeyPem, { today: '2026-06-01', fingerprint: fp })).toMatchObject({ reason: 'SIGNATURE' });
    expect(verifyLicense(token, generateLicenseKeys().publicKeyPem, { today: '2026-06-01', fingerprint: fp })).toMatchObject({ reason: 'SIGNATURE' });
    expect(verifyLicense(token, 'pas une clé', { today: '2026-06-01' })).toMatchObject({ reason: 'SIGNATURE' });
    expect(verifyLicense(token, keys.publicKeyPem, { today: '2027-01-01', fingerprint: fp })).toMatchObject({ reason: 'EXPIREE' });
    expect(verifyLicense(token, keys.publicKeyPem, { today: '2026-06-01', fingerprint: 'autre' })).toMatchObject({ reason: 'AUTRE_INSTALLATION' });
    expect(verifyLicense(token, keys.publicKeyPem, { today: '2026-08-01', fingerprint: fp, lastOnlineCheck: '2026-06-01' })).toMatchObject({ reason: 'HORS_LIGNE_TROP_LONG' });
    expect(b).toBeTruthy();
  });
  it('licence non liée à une installation ; corps illisible', () => {
    const t = signLicense({ ...payload, fingerprint: null }, keys.privateKeyPem);
    expect(verifyLicense(t, keys.publicKeyPem, { today: '2026-06-01' }).valid).toBe(true);
    const { sign, createPrivateKey } = require('node:crypto');
    const body = Buffer.from('pas du json');
    const sig = sign(null, body, createPrivateKey(keys.privateKeyPem));
    expect(verifyLicense(`JCL1.${body.toString('base64url')}.${sig.toString('base64url')}`, keys.publicKeyPem, { today: '2026-06-01' })).toMatchObject({ reason: 'FORMAT' });
  });
});
