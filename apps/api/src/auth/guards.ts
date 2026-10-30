import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { accessMode, computeStatus, isAllowed, type ModuleCode, type SubscriptionStatus } from '@jupiter/licensing';
import type { Request, Response } from 'express';
import { config } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { verifyDeviceSignature } from '../security/device-signature';
import { AuthService } from './auth.service';
import { ALLOW_NO_MFA, IS_PUBLIC, MFA_ROLES, MODULE, ROLES, STAFF, type Role, type SessionUser } from './decorators';

export const SESSION_COOKIE = 'jc_session';

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    maxAge: config.sessionMinutes * 60_000,
    path: '/',
  });
}

/**
 * Garde globale : session (cookie httpOnly, 30 min glissantes), protection CSRF (en-tête personnalisé),
 * double authentification, rôles (refus par défaut), licence (module, lecture seule) et périmètre société.
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly db: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
    if (meta<boolean>(IS_PUBLIC)) return true;

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.header('x-requested-with') !== 'JupiterCompta') {
      throw new ForbiddenException({ code: 'CSRF', message: 'En-tête X-Requested-With manquant.' });
    }
    const token = req.cookies?.[SESSION_COOKIE] ?? (req.header('authorization') ?? '').replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException({ code: 'NON_CONNECTE', message: 'Connexion requise.' });
    const payload = this.auth.verifyToken(token);
    if (payload.stage !== 'session') throw new UnauthorizedException({ code: 'MFA_EN_ATTENTE', message: 'Code de vérification requis.' });
    const user = await this.auth.sessionUser(payload);
    req.user = user;
    setSessionCookie(res, this.auth.sign({ sub: payload.sub, tid: payload.tid, mfa: payload.mfa, stage: 'session' }));

    if (!user.mfa && user.roles.some((r) => MFA_ROLES.includes(r)) && !meta<boolean>(ALLOW_NO_MFA)) {
      throw new ForbiddenException({ code: 'MFA_REQUISE', message: 'Activez la double authentification pour continuer.' });
    }
    if (meta<boolean>(STAFF)) {
      if (!user.isStaff) throw new ForbiddenException({ code: 'RESERVE_JUPSER', message: 'Réservé au personnel JUPSER.' });
      return true;
    }
    const roles = meta<Role[]>(ROLES);
    if (roles && !user.roles.includes('ADMIN') && !roles.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException({ code: 'ROLE', message: "Vous n'avez pas les droits pour cette action." });
    }
    if (user.roles.length === 1 && user.roles[0] === 'AUDITEUR' && req.method !== 'GET' && !meta<boolean>(ALLOW_NO_MFA)) {
      throw new ForbiddenException({ code: 'LECTURE_SEULE', message: 'Profil auditeur : lecture seule.' });
    }

    const tenant = await this.db.client.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    const status = computeStatus(
      {
        status: tenant.subStatus as SubscriptionStatus,
        trialEndsAt: tenant.trialEndsAt?.toISOString().slice(0, 10),
        paidUntil: tenant.paidUntil?.toISOString().slice(0, 10),
      },
      new Date().toISOString().slice(0, 10),
    );
    const mode = accessMode(status);
    if (!isAllowed(mode, req.method, req.path) && !req.path.startsWith('/api/billing') && !meta<boolean>(ALLOW_NO_MFA)) {
      throw new ForbiddenException({
        code: mode === 'LECTURE_SEULE' ? 'ABONNEMENT_LECTURE_SEULE' : 'ABONNEMENT_SUSPENDU',
        message:
          mode === 'LECTURE_SEULE'
            ? 'Abonnement impayé : accès en lecture seule (consultation et exports permis).'
            : 'Abonnement suspendu. Contactez JUPSER.',
      });
    }
    // Postes enrôlés obligatoires : chaque requête est signée par la clé Ed25519 du poste (docs/08).
    if ((tenant.security as { requireEnrolledDevices?: boolean } | null)?.requireEnrolledDevices && !meta<boolean>(ALLOW_NO_MFA)) {
      const deviceId = req.header('x-device-id') ?? '';
      const device = /^[0-9a-f-]{36}$/.test(deviceId) ? await this.db.forTenant(user.tenantId, (tx) => tx.device.findUnique({ where: { id: deviceId } })) : null;
      const ok = !!device && device.status === 'ACTIF' && device.userId === user.userId &&
        verifyDeviceSignature({ publicKeyPem: device.publicKey, method: req.method, path: req.originalUrl.split('?')[0]!, ts: req.header('x-device-timestamp') ?? '', signature: req.header('x-device-signature') ?? '', nowSec: Math.floor(Date.now() / 1000) });
      if (!ok) throw new ForbiddenException({ code: 'POSTE_NON_AUTORISE', message: 'Ce poste n’est pas enrôlé ou sa signature est invalide.' });
      await this.db.forTenant(user.tenantId, (tx) => tx.device.update({ where: { id: device!.id }, data: { lastSeenAt: new Date() } }));
    }
    const mod = meta<ModuleCode>(MODULE);
    if (mod && !tenant.modules.includes(mod)) {
      throw new ForbiddenException({ code: 'MODULE_NON_SOUSCRIT', message: `Module ${mod} non souscrit.` });
    }
    const companyId = (req.params as Record<string, string>)?.companyId;
    if (companyId && user.companyIds.length > 0 && !user.companyIds.includes(companyId)) {
      throw new ForbiddenException({ code: 'PERIMETRE', message: 'Société hors de votre périmètre.' });
    }
    return true;
  }
}
