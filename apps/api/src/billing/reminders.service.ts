import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { computeStatus, reminderDue, trialReminderDue, type SubscriptionStatus } from '@jupiter/licensing';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { MessagingService } from '../erp/messaging.service';

const TEXTS: Record<string, (end: string) => string> = {
  'ESSAI_J-7': (d) => `Votre essai gratuit de Jupiter Compta se termine le ${d}. Pour continuer sans interruption, souscrivez depuis le menu Abonnement : vos données et votre paramétrage sont conservés, et la période payée commence à la fin de l’essai.`,
  'ESSAI_J-1': (d) => `Votre essai gratuit se termine demain (${d}). Souscrivez depuis le menu Abonnement pour garder l’accès complet.`,
  ESSAI_J0: (d) => `Votre essai gratuit se termine aujourd’hui (${d}). Sans souscription, l’accès passera en lecture seule (consultation et exports) dans 15 jours.`,
  'J-7': (d) => `Votre abonnement Jupiter Compta arrive à échéance le ${d}. Pensez à le renouveler depuis le menu Abonnement.`,
  J0: (d) => `Votre abonnement arrive à échéance aujourd’hui (${d}).`,
  'J+3': (d) => `Votre abonnement est échu depuis le ${d}. Régularisez pour éviter le passage en lecture seule à J+15.`,
  'J+7': (d) => `Rappel : abonnement échu depuis le ${d}. L’accès passera en lecture seule à J+15 (consultation et exports conservés).`,
};

/**
 * Rappels d'abonnement (fin d'essai J-7, J-1, J0 ; échéance J-7, J0, J+3, J+7) envoyés aux administrateurs du
 * locataire, une seule fois par échéance (trace dans la piste d'audit). Exécution quotidienne en production.
 */
@Injectable()
export class SubscriptionRemindersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Rappels');
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: PrismaService, private readonly messaging: MessagingService, private readonly audit: AuditService) {}

  onApplicationBootstrap() {
    if (!config.isProd) return;
    const tick = () => this.run().catch((e) => this.log.error(e));
    setTimeout(tick, 60_000);
    this.timer = setInterval(tick, 6 * 3_600_000); // toutes les 6 heures ; chaque rappel n'est envoyé qu'une fois
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(today = new Date().toISOString().slice(0, 10)) {
    const sent: { tenantId: string; key: string; to: string[] }[] = [];
    for (const t of await this.db.client.tenant.findMany()) {
      const status = computeStatus({ status: t.subStatus as SubscriptionStatus, trialEndsAt: t.trialEndsAt?.toISOString().slice(0, 10), paidUntil: t.paidUntil?.toISOString().slice(0, 10) }, today);
      const end = (t.paidUntil ?? t.trialEndsAt)?.toISOString().slice(0, 10);
      if (!end || status === 'ARCHIVE' || status === 'SUSPENDU') continue;
      const key = t.paidUntil ? reminderDue(end, today) : trialReminderDue(end, today);
      if (!key) continue;
      const ref = `tenant:${t.id}:${key}:${end}`;
      const already = await this.db.forTenant(t.id, (tx) => tx.auditLog.findFirst({ where: { action: 'RAPPEL_ABONNEMENT', object: ref } }));
      if (already) continue;
      const admins = await this.db.client.membership.findMany({ where: { tenantId: t.id, roles: { has: 'ADMIN' } }, include: { user: { select: { email: true } } } });
      const human = end.split('-').reverse().join('/');
      for (const a of admins) await this.messaging.send('EMAIL', a.user.email, `${TEXTS[key]!(human)}\n\nL’équipe JUPSER`, 'Votre abonnement Jupiter Compta');
      await this.db.forTenant(t.id, (tx) => this.audit.log(tx, t.id, 'SYSTEME', 'RAPPEL_ABONNEMENT', ref, { key, admins: admins.length }));
      sent.push({ tenantId: t.id, key, to: admins.map((a) => a.user.email) });
    }
    return sent;
  }
}
