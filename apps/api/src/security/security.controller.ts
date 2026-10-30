import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { generateLicenseKeys, signLicense, verifyLicense, type EditionCode, type LicensePayload, type ModuleCode } from '@jupiter/licensing';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AllowWithoutMfa, CurrentUser, JupserStaff, Public, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { CryptoService } from '../common/crypto.service';
import { domainError, parse, zDate } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { assertEd25519, deviceFingerprint } from './device-signature';


export interface TenantSecurity {
  requireEnrolledDevices?: boolean;
  sso?: { issuer: string; clientId: string; clientSecretEnc?: string; emailDomains: string[]; enabled: boolean };
}

/** Clés de licence : en production, LICENSE_PRIVATE_KEY / LICENSE_PUBLIC_KEY (PEM) ; en développement, paire éphémère. */
const devKeys = config.isProd ? null : generateLicenseKeys();
export const licenseKeys = () => {
  const priv = process.env.LICENSE_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? devKeys?.privateKeyPem;
  const pub = process.env.LICENSE_PUBLIC_KEY?.replace(/\\n/g, '\n') ?? devKeys?.publicKeyPem;
  if (!priv || !pub) throw domainError('CLES_LICENCE', 'Clés de licence non configurées.');
  return { priv, pub };
};

@ApiTags('Sécurité : SSO, postes enrôlés, licences')
@Controller()
export class SecurityController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  // ---------------------------------------------------------------- Paramètres de sécurité du locataire
  @Roles('ADMIN')
  @Get('security/settings')
  async settings(@CurrentUser() u: SessionUser) {
    const t = await this.db.client.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const s = (t.security ?? {}) as TenantSecurity;
    return { slug: t.slug, requireEnrolledDevices: !!s.requireEnrolledDevices, sso: s.sso ? { ...s.sso, clientSecretEnc: undefined, hasSecret: !!s.sso.clientSecretEnc } : null };
  }

  @Roles('ADMIN')
  @Put('security/settings')
  async updateSettings(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({
      slug: z.string().regex(/^[a-z0-9-]{3,40}$/, 'Identifiant : minuscules, chiffres et tirets').optional(),
      requireEnrolledDevices: z.boolean().optional(),
      sso: z.object({ enabled: z.boolean(), issuer: z.string().url(), clientId: z.string().min(1), clientSecret: z.string().optional(), emailDomains: z.array(z.string().min(3)).default([]) }).nullable().optional(),
    }), body);
    const t = await this.db.client.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const cur = (t.security ?? {}) as TenantSecurity;
    const next: TenantSecurity = { ...cur };
    if (b.requireEnrolledDevices !== undefined) {
      if (b.requireEnrolledDevices) {
        const own = await this.db.forTenant(u.tenantId, (tx) => tx.device.count({ where: { userId: u.userId, status: 'ACTIF' } }));
        if (!own) throw domainError('AUCUN_POSTE', 'Enrôlez d’abord votre propre poste pour ne pas vous bloquer.');
      }
      next.requireEnrolledDevices = b.requireEnrolledDevices;
    }
    if (b.sso === null) delete next.sso;
    else if (b.sso) {
      const secret = b.sso.clientSecret ? await this.db.forTenant(u.tenantId, (tx) => this.crypto.encryptJson(tx, u.tenantId, b.sso!.clientSecret)) : cur.sso?.clientSecretEnc;
      next.sso = { enabled: b.sso.enabled, issuer: b.sso.issuer, clientId: b.sso.clientId, emailDomains: b.sso.emailDomains, clientSecretEnc: secret };
    }
    if (b.slug && (await this.db.client.tenant.findFirst({ where: { slug: b.slug, id: { not: u.tenantId } } }))) throw domainError('SLUG_PRIS', 'Identifiant déjà utilisé.');
    await this.db.client.tenant.update({ where: { id: u.tenantId }, data: { slug: b.slug ?? t.slug, security: next as never } });
    await this.db.forTenant(u.tenantId, (tx) => this.audit.log(tx, u.tenantId, u.userId, 'SECURITE_PARAMETRES', `tenant:${u.tenantId}`, { requireEnrolledDevices: next.requireEnrolledDevices, sso: !!next.sso?.enabled, slug: b.slug }));
    return this.settings(u);
  }

  // ---------------------------------------------------------------- Postes enrôlés
  @AllowWithoutMfa()
  @Get('devices')
  devices(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) => tx.device.findMany({ where: u.roles.includes('ADMIN') ? {} : { userId: u.userId }, orderBy: { createdAt: 'desc' }, select: { id: true, userId: true, name: true, fingerprint: true, status: true, lastSeenAt: true, createdAt: true } }));
  }

  /** Enrôlement : le poste génère sa paire Ed25519 et envoie sa clé publique ; un administrateur approuve. */
  @AllowWithoutMfa()
  @Post('devices/enroll')
  enroll(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().min(2).max(100), publicKeyPem: z.string().min(40).max(1000) }), body);
    try {
      assertEd25519(b.publicKeyPem);
    } catch {
      throw domainError('CLE_INVALIDE', 'Clé publique Ed25519 (PEM) attendue.');
    }
    const fingerprint = deviceFingerprint(b.publicKeyPem);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await tx.device.create({ data: { tenantId: u.tenantId, userId: u.userId, name: b.name, publicKey: b.publicKeyPem, fingerprint, status: u.roles.includes('ADMIN') ? 'ACTIF' : 'EN_ATTENTE' } });
      await this.audit.log(tx, u.tenantId, u.userId, 'POSTE_ENROLE', `device:${d.id}`, { name: b.name, fingerprint });
      return { id: d.id, status: d.status, fingerprint };
    });
  }

  @Roles('ADMIN')
  @Post('devices/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.setStatus(u, id, 'ACTIF', 'POSTE_APPROUVE');
  }

  /** Révocation (par l'administrateur, ou par l'utilisateur pour son propre poste perdu). */
  @AllowWithoutMfa()
  @Post('devices/:id/revoke')
  @HttpCode(200)
  async revoke(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    const d = await this.db.forTenant(u.tenantId, (tx) => tx.device.findUniqueOrThrow({ where: { id } }));
    if (d.userId !== u.userId && !u.roles.includes('ADMIN')) throw domainError('ROLE', 'Seul l’administrateur peut révoquer le poste d’un autre utilisateur.');
    return this.setStatus(u, id, 'REVOQUE', 'POSTE_REVOQUE');
  }

  private setStatus(u: SessionUser, id: string, status: string, action: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await tx.device.update({ where: { id }, data: { status }, select: { id: true, status: true, name: true } });
      await this.audit.log(tx, u.tenantId, u.userId, action, `device:${id}`);
      return d;
    });
  }

  // ---------------------------------------------------------------- Licences hors ligne (console JUPSER)
  @JupserStaff()
  @Post('console/tenants/:id/licenses')
  async issue(@CurrentUser() u: SessionUser, @Param('id') tenantId: string, @Body() body: unknown) {
    const b = parse(z.object({ expiresAt: zDate, fingerprint: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null) }), body);
    const t = await this.db.client.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const payload: LicensePayload = {
      v: 1, id: randomUUID(), tenantId, tenantName: t.name, edition: t.edition as EditionCode, modules: t.modules as ModuleCode[],
      maxUsers: t.maxUsers, maxCompanies: t.maxCompanies, issuedAt: new Date().toISOString().slice(0, 10), expiresAt: b.expiresAt, fingerprint: b.fingerprint,
    };
    const token = signLicense(payload, licenseKeys().priv);
    await this.db.forTenant(tenantId, async (tx) => {
      await tx.license.create({ data: { id: payload.id, tenantId, payload: payload as never, tokenHash: createHash('sha256').update(token).digest('hex'), issuedBy: u.userId } });
      await this.audit.log(tx, tenantId, u.userId, 'LICENCE_EMISE', `license:${payload.id}`, { expiresAt: b.expiresAt, bound: !!b.fingerprint });
    });
    return { token, payload };
  }

  @JupserStaff()
  @Get('console/tenants/:id/licenses')
  licenses(@Param('id') tenantId: string) {
    return this.db.forTenant(tenantId, (tx) => tx.license.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  @JupserStaff()
  @Post('console/licenses/:tenantId/:id/revoke')
  @HttpCode(200)
  revokeLicense(@CurrentUser() u: SessionUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.db.forTenant(tenantId, async (tx) => {
      const l = await tx.license.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, tenantId, u.userId, 'LICENCE_REVOQUEE', `license:${id}`);
      return l;
    });
  }

  /** Clé publique à embarquer dans les installations sur site. */
  @Public()
  @Get('licenses/public-key')
  publicKey() {
    return { algorithm: 'Ed25519', publicKeyPem: licenseKeys().pub };
  }

  /** Validation en ligne d'une installation sur site : signature, expiration, révocation. */
  @Public()
  @Post('licenses/check')
  @HttpCode(200)
  async check(@Body() body: unknown) {
    const b = parse(z.object({ token: z.string().min(20).max(10000), fingerprint: z.string().optional() }), body);
    const r = verifyLicense(b.token, licenseKeys().pub, { today: new Date().toISOString().slice(0, 10), fingerprint: b.fingerprint });
    if (!r.valid) return { valid: false, reason: r.reason };
    const l = await this.db.forTenant(r.payload.tenantId, (tx) => tx.license.findUnique({ where: { id: r.payload.id } }));
    if (!l || l.revokedAt) return { valid: false, reason: 'REVOQUEE' };
    return { valid: true, checkedAt: new Date().toISOString(), expiresAt: r.payload.expiresAt };
  }
}
