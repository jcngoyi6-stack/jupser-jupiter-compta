import { Body, Controller, ForbiddenException, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { domainError, parse } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { MessagingService } from '../erp/messaging.service';
import { AuthService, validatePasswordStrength } from './auth.service';
import { Public } from './decorators';

const TTL_MS = 3_600_000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Mot de passe oublié : lien à usage unique valable une heure envoyé par courriel. Réponse identique que l'adresse
 * existe ou non (pas de divulgation des comptes) ; seule l'empreinte du jeton est conservée ; après changement, les
 * anciens liens sont invalidés, le verrouillage levé et les sessions ouvertes révoquées. La double authentification
 * reste exigée à la connexion suivante.
 */
@ApiTags('Authentification')
@Controller('auth/password')
export class PasswordResetController {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly db: PrismaService, private readonly auth: AuthService, private readonly audit: AuditService, private readonly messaging: MessagingService) {}

  private guard(req: Request, key: string, max: number) {
    if (req.header('x-requested-with') !== 'JupiterCompta') throw new ForbiddenException({ code: 'CSRF', message: 'En-tête X-Requested-With manquant.' });
    const now = Date.now();
    const recent = (this.attempts.get(key) ?? []).filter((t) => now - t < TTL_MS);
    if (recent.length >= max) throw new HttpException({ code: 'TROP_DE_TENTATIVES', message: 'Trop de demandes : réessayez dans une heure.' }, HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.attempts.set(key, recent);
  }

  @Public()
  @Post('forgot')
  @HttpCode(200)
  async forgot(@Req() req: Request, @Body() body: unknown) {
    const b = parse(z.object({ email: z.string().trim().email().max(200) }), body);
    const email = b.email.toLowerCase();
    this.guard(req, `ip:${req.ip}`, 10);
    this.guard(req, `mail:${email}`, 3);
    const user = await this.db.client.user.findUnique({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await this.db.client.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await this.db.client.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS), ip: req.ip ?? null } });
      const base = process.env.PUBLIC_APP_URL ?? 'http://localhost:3000';
      await this.messaging.send('EMAIL', email,
        `Bonjour ${user.fullName},\n\nPour choisir un nouveau mot de passe Jupiter Compta, ouvrez ce lien (valable une heure, utilisable une seule fois) :\n${base}/reinitialisation?jeton=${token}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n\nL’équipe JUPSER`,
        'Réinitialisation de votre mot de passe').catch(() => 'ECHEC');
    }
    return { message: 'Si un compte correspond à cette adresse, un lien de réinitialisation vient d’être envoyé.' };
  }

  @Public()
  @Post('reset')
  @HttpCode(200)
  async reset(@Req() req: Request, @Body() body: unknown) {
    this.guard(req, `reset:${req.ip}`, 20);
    const b = parse(z.object({ token: z.string().min(20).max(200), password: z.string().max(200) }), body);
    const row = await this.db.client.passwordReset.findUnique({ where: { tokenHash: sha256(b.token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw domainError('LIEN_INVALIDE', 'Lien expiré ou déjà utilisé : faites une nouvelle demande.');
    const weak = validatePasswordStrength(b.password);
    if (weak) throw domainError('MOT_DE_PASSE_FAIBLE', weak);
    const changedAt = new Date();
    await this.db.client.$transaction([
      this.db.client.user.update({ where: { id: row.userId }, data: { passwordHash: await this.auth.hash(b.password), passwordChangedAt: changedAt, failedLogins: 0, lockedUntil: null } }),
      this.db.client.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: changedAt } }),
    ]);
    for (const m of await this.db.client.membership.findMany({ where: { userId: row.userId } })) {
      await this.db.forTenant(m.tenantId, (tx) => this.audit.log(tx, m.tenantId, row.userId, 'MOT_DE_PASSE_REINITIALISE', `user:${row.userId}`, { ip: req.ip ?? null }));
    }
    return { message: 'Mot de passe modifié : connectez-vous avec le nouveau mot de passe.' };
  }
}
