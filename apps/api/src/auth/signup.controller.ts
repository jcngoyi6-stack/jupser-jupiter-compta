import { Body, Controller, ForbiddenException, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EDITION_MODULES } from '@jupiter/licensing';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { domainError, parse } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { MessagingService } from '../erp/messaging.service';
import { AuthService, validatePasswordStrength } from './auth.service';
import { Public } from './decorators';

const WINDOW_MS = 3_600_000;
const MAX_PER_WINDOW = 5;

/**
 * Inscription en libre-service à l'essai gratuit de 30 jours : un locataire (entreprise ou cabinet) et son
 * administrateur. La société, le pays et la monnaie se paramètrent ensuite avec l'assistant de création de société ;
 * la double authentification est exigée à la première connexion. Protections : en-tête anti-falsification, champ piège
 * pour les robots, 5 inscriptions par heure et par adresse IP, acceptation des conditions obligatoire.
 */
@ApiTags('Inscription')
@Controller('signup')
export class SignupController {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly db: PrismaService, private readonly auth: AuthService, private readonly audit: AuditService, private readonly messaging: MessagingService) {}

  private throttle(ip: string) {
    const now = Date.now();
    const recent = (this.attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) throw new HttpException({ code: 'TROP_DE_TENTATIVES', message: 'Trop d’inscriptions depuis cette adresse : réessayez dans une heure.' }, HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.attempts.set(ip, recent);
  }

  @Public()
  @Post()
  async signup(@Req() req: Request, @Body() body: unknown) {
    if (req.header('x-requested-with') !== 'JupiterCompta') throw new ForbiddenException({ code: 'CSRF', message: 'En-tête X-Requested-With manquant.' });
    this.throttle(req.ip ?? 'inconnue');
    const b = parse(z.object({
      organisation: z.string().trim().min(2).max(120),
      type: z.enum(['ENTREPRISE', 'CABINET']).default('ENTREPRISE'),
      edition: z.enum(['TPE', 'ESSENTIEL', 'PRO', 'ERP']).default('PRO'),
      fullName: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(200),
      phone: z.string().trim().max(30).optional(),
      password: z.string().max(200),
      acceptTerms: z.literal(true),
      website: z.string().max(0).optional(), // champ piège : invisible pour un humain
    }), body);
    const weak = validatePasswordStrength(b.password);
    if (weak) throw domainError('MOT_DE_PASSE_FAIBLE', weak);
    const email = b.email.toLowerCase();
    if (await this.db.client.user.findUnique({ where: { email } })) {
      throw domainError('ADRESSE_DEJA_UTILISEE', 'Un compte existe déjà avec cette adresse : connectez-vous ou réinitialisez votre mot de passe.');
    }
    const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
    const { tenant } = await this.db.client.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: b.organisation, type: b.type, edition: b.edition, modules: EDITION_MODULES[b.edition], subStatus: 'ESSAI', trialEndsAt, maxCompanies: b.edition === 'ERP' ? 10 : 1, maxUsers: b.edition === 'TPE' ? 2 : 50 },
      });
      const user = await tx.user.create({ data: { email, fullName: b.fullName, passwordHash: await this.auth.hash(b.password) } });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, roles: ['ADMIN', 'CHEF_COMPTABLE'] } });
      return { tenant, user };
    });
    await this.db.forTenant(tenant.id, (tx) => this.audit.log(tx, tenant.id, 'INSCRIPTION', 'ESSAI_DEMARRE', `tenant:${tenant.id}`, { edition: b.edition, type: b.type }));
    await this.messaging.send('EMAIL', email, `Bienvenue dans Jupiter Compta, ${b.fullName}.\n\nVotre essai gratuit de l’édition ${b.edition} est ouvert jusqu’au ${trialEndsAt.toISOString().slice(0, 10)}.\nConnectez-vous, activez la double authentification, puis créez votre société avec l’assistant.\n\nL’équipe JUPSER`, 'Votre essai Jupiter Compta').catch(() => 'ECHEC');
    return { tenantId: tenant.id, edition: b.edition, trialEndsAt: trialEndsAt.toISOString().slice(0, 10), next: '/connexion' };
  }
}
