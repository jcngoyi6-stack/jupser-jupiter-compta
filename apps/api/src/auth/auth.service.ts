import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../common/prisma.service';
import { MFA_ROLES, type Role, type SessionUser } from './decorators';

export const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

interface TokenPayload {
  sub: string;
  tid: string;
  mfa: boolean;
  stage: 'session' | 'mfa_pending';
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 12) return 'Le mot de passe doit comporter au moins 12 caractères.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return 'Le mot de passe doit contenir minuscules, majuscules et chiffres.';
  }
  return null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  sign(p: TokenPayload, minutes = config.sessionMinutes): string {
    return jwt.sign(p, config.jwtSecret, { expiresIn: `${minutes}m`, algorithm: 'HS256' });
  }

  verifyToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as TokenPayload;
    } catch {
      throw new UnauthorizedException({ code: 'SESSION_EXPIREE', message: 'Session expirée, reconnectez-vous.' });
    }
  }

  async hash(pw: string) {
    return argon2.hash(pw, ARGON2_OPTS);
  }

  async login(email: string, password: string, tenantId?: string) {
    const user = await this.db.client.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const generic = new UnauthorizedException({ code: 'IDENTIFIANTS', message: 'Identifiants incorrects.' });
    if (!user) {
      await argon2.hash(password, ARGON2_OPTS); // temps constant
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException({ code: 'COMPTE_VERROUILLE', message: 'Compte verrouillé temporairement après 5 échecs.' });
    }
    const ok = await argon2.verify(user.passwordHash, password);
    const membership = await this.db.client.membership.findFirst({
      where: { userId: user.id, ...(tenantId ? { tenantId } : {}) },
    });
    if (!ok || !membership) {
      const failed = user.failedLogins + 1;
      await this.db.client.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed >= config.maxFailedLogins ? 0 : failed,
          lockedUntil: failed >= config.maxFailedLogins ? new Date(Date.now() + config.lockMinutes * 60_000) : null,
        },
      });
      if (membership) {
        await this.db.forTenant(membership.tenantId, (tx) =>
          this.audit.log(tx, membership.tenantId, user.id, 'LOGIN_ECHEC', `user:${user.id}`, { failed }),
        );
      }
      throw generic;
    }
    await this.db.client.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    const needsMfa = membership.roles.some((r) => MFA_ROLES.includes(r as Role));
    if (user.mfaEnabled) {
      return { stage: 'mfa_pending' as const, token: this.sign({ sub: user.id, tid: membership.tenantId, mfa: false, stage: 'mfa_pending' }, 5) };
    }
    await this.db.forTenant(membership.tenantId, (tx) =>
      this.audit.log(tx, membership.tenantId, user.id, 'LOGIN', `user:${user.id}`, { mfa: false }),
    );
    return {
      stage: needsMfa ? ('mfa_setup_required' as const) : ('session' as const),
      token: this.sign({ sub: user.id, tid: membership.tenantId, mfa: false, stage: 'session' }),
    };
  }

  async verifyMfa(pendingToken: string, code: string) {
    const p = this.verifyToken(pendingToken);
    if (p.stage !== 'mfa_pending') throw new UnauthorizedException();
    const user = await this.db.client.user.findUniqueOrThrow({ where: { id: p.sub } });
    if (!user.mfaSecretEnc || !authenticator.check(code, this.crypto.openGlobal(user.mfaSecretEnc))) {
      await this.db.forTenant(p.tid, (tx) => this.audit.log(tx, p.tid, user.id, 'MFA_ECHEC', `user:${user.id}`));
      throw new UnauthorizedException({ code: 'CODE_INVALIDE', message: 'Code de vérification invalide.' });
    }
    await this.db.forTenant(p.tid, (tx) => this.audit.log(tx, p.tid, user.id, 'LOGIN', `user:${user.id}`, { mfa: true }));
    return this.sign({ sub: user.id, tid: p.tid, mfa: true, stage: 'session' });
  }

  async mfaSetup(u: SessionUser) {
    const user = await this.db.client.user.findUniqueOrThrow({ where: { id: u.userId } });
    if (user.mfaEnabled) throw new ForbiddenException({ code: 'MFA_DEJA_ACTIVE', message: 'Double authentification déjà active.' });
    const secret = authenticator.generateSecret();
    await this.db.client.user.update({ where: { id: u.userId }, data: { mfaSecretEnc: this.crypto.sealGlobal(secret) } });
    const otpauth = authenticator.keyuri(user.email, 'Jupiter Compta', secret);
    return { otpauth, secret, qrDataUrl: await QRCode.toDataURL(otpauth) };
  }

  async mfaEnable(u: SessionUser, code: string) {
    const user = await this.db.client.user.findUniqueOrThrow({ where: { id: u.userId } });
    if (!user.mfaSecretEnc || !authenticator.check(code, this.crypto.openGlobal(user.mfaSecretEnc))) {
      throw new UnauthorizedException({ code: 'CODE_INVALIDE', message: 'Code de vérification invalide.' });
    }
    await this.db.client.user.update({ where: { id: u.userId }, data: { mfaEnabled: true } });
    await this.db.forTenant(u.tenantId, (tx) => this.audit.log(tx, u.tenantId, u.userId, 'MFA_ACTIVEE', `user:${u.userId}`));
    return this.sign({ sub: u.userId, tid: u.tenantId, mfa: true, stage: 'session' });
  }

  async sessionUser(p: TokenPayload): Promise<SessionUser> {
    const m = await this.db.client.membership.findUnique({
      where: { tenantId_userId: { tenantId: p.tid, userId: p.sub } },
      include: { user: true },
    });
    if (!m) throw new UnauthorizedException();
    return {
      userId: p.sub,
      tenantId: p.tid,
      email: m.user.email,
      fullName: m.user.fullName,
      roles: m.roles as Role[],
      companyIds: m.companyIds,
      mfa: p.mfa,
      isStaff: m.user.isJupserStaff,
    };
  }
}
