import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { PaymentError, type PaymentProvider } from '@jupiter/connectors';
import { ApiTags } from '@nestjs/swagger';
import { computeStatus, EDITION_MODULES, quoteEnterprise, type EditionCode, type PriceGrid, type SubscriptionStatus } from '@jupiter/licensing';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { AllowWithoutMfa, CurrentUser, JupserStaff, Public, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { readData } from '../common/data';
import { domainError, parse } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { PaymentsService } from './payments.service';

const grid = (): PriceGrid => (JSON.parse(readData('tarifs_modules.json')) as { entreprises: PriceGrid }).entreprises;

/**
 * Abonnements et paiements (docs/09). Le prestataire réel (agrégateur mobile money / carte) se branche
 * derrière le port PaymentProvider ; V0 : prestataire factice avec webhook signé HMAC et idempotent.
 */
@ApiTags('Licences, paiements et console JUPSER')
@Controller()
export class BillingController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly payments: PaymentsService,
  ) {}

  @AllowWithoutMfa()
  @Get('billing/subscription')
  async subscription(@CurrentUser() u: SessionUser) {
    const t = await this.db.client.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const status = computeStatus(
      { status: t.subStatus as SubscriptionStatus, trialEndsAt: t.trialEndsAt?.toISOString().slice(0, 10), paidUntil: t.paidUntil?.toISOString().slice(0, 10) },
      new Date().toISOString().slice(0, 10),
    );
    const users = await this.db.client.membership.count({ where: { tenantId: t.id } });
    return { tenant: { ...t, computedStatus: status }, users, quote: quoteEnterprise(grid(), t.edition as EditionCode, [], Math.max(users, 1)) };
  }

  @Get('billing/prices')
  prices() {
    return JSON.parse(readData('tarifs_modules.json'));
  }

  @Roles('ADMIN')
  @Post('billing/checkout')
  async checkout(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ method: z.enum(['MOBILE_MONEY', 'CARTE', 'VIREMENT']), months: z.union([z.literal(1), z.literal(12)]), operator: z.string().optional() }), body);
    const t = await this.db.client.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const users = await this.db.client.membership.count({ where: { tenantId: t.id } });
    const q = quoteEnterprise(grid(), t.edition as EditionCode, [], Math.max(users, 1));
    const amount = b.months === 12 ? q.annualUsdCents : q.monthlyUsdCents;
    const company = await this.db.forTenant(u.tenantId, (tx) => tx.company.findFirst({ select: { country: true } }));
    let provider: PaymentProvider;
    try {
      provider = this.payments.choose(company?.country ?? 'CD', 'USD');
    } catch {
      throw domainError('AUCUN_PRESTATAIRE', 'Aucun prestataire de paiement configuré.');
    }
    const ref = randomUUID();
    let checkout;
    try {
      checkout = await provider.createCheckout({
        reference: ref, amountMinor: BigInt(amount), currency: 'USD', description: `Abonnement Jupiter Compta ${t.edition} ${b.months} mois`,
        customer: { name: t.name, email: u.email, phone: b.operator }, method: b.method,
        returnUrl: `${process.env.PUBLIC_APP_URL ?? 'http://localhost:3000'}/abonnement?paiement=${ref}`,
        notifyUrl: `${process.env.PUBLIC_API_URL ?? 'http://localhost:4000'}/api/billing/webhook/${provider.code.toLowerCase()}`,
      });
    } catch (e) {
      throw domainError(e instanceof PaymentError ? e.code : 'PRESTATAIRE', (e as Error).message);
    }
    const p = await this.db.forTenant(u.tenantId, async (tx) => {
      const pay = await tx.payment.create({ data: { tenantId: u.tenantId, provider: provider.code, method: b.method, amountCents: amount, months: b.months, externalRef: ref } });
      await this.audit.log(tx, u.tenantId, u.userId, 'PAIEMENT_INITIE', `payment:${pay.id}`, { method: b.method, amount, provider: provider.code });
      return pay;
    });
    return { payment: p, redirectUrl: checkout.redirectUrl, instructions: checkout.instructions };
  }

  /**
   * Notification d'un prestataire : signature contrôlée, statut revérifié auprès du prestataire
   * (montant et devise comparés), traitement idempotent.
   */
  @Public()
  @Post('billing/webhook/:provider')
  @HttpCode(200)
  async webhook(@Param('provider') code: string, @Body() body: unknown, @Headers() headers: Record<string, string | undefined>) {
    const provider = this.payments.byCode(code);
    if (!provider) throw domainError('PRESTATAIRE_INCONNU', 'Prestataire inconnu.');
    let ref: string;
    try {
      ref = provider.parseNotification(body, headers);
    } catch (e) {
      throw domainError(e instanceof PaymentError ? e.code : 'NOTIFICATION_INVALIDE', (e as Error).message);
    }
    const tenantId = await this.findPaymentTenant(ref);
    if (!tenantId) throw domainError('PAIEMENT_INCONNU', 'Paiement inconnu.');
    const verified = await provider.verify(ref);
    return this.db.forTenant(tenantId, async (tx) => {
      const p = await tx.payment.findUniqueOrThrow({ where: { externalRef: ref } });
      if (p.provider !== provider.code) throw domainError('PRESTATAIRE_INCOHERENT', 'Notification d’un autre prestataire.');
      if (p.status !== 'EN_ATTENTE') return { idempotent: true, status: p.status };
      if (verified.status === 'EN_ATTENTE') return { status: 'EN_ATTENTE' };
      if (verified.status === 'PAYE' && verified.amountMinor !== null && (verified.amountMinor < p.amountCents || verified.currency !== 'USD')) {
        await this.audit.log(tx, tenantId, 'PRESTATAIRE', 'PAIEMENT_MONTANT_INCOHERENT', `payment:${p.id}`, { expected: p.amountCents.toString(), received: verified.amountMinor.toString(), currency: verified.currency });
        throw domainError('MONTANT_INCOHERENT', 'Montant payé différent du montant attendu.');
      }
      await tx.payment.update({ where: { id: p.id }, data: { status: verified.status, paidAt: verified.status === 'PAYE' ? new Date() : null } });
      if (verified.status === 'PAYE') {
        const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const base = t.paidUntil && t.paidUntil > new Date() ? t.paidUntil : new Date();
        const until = new Date(base);
        until.setUTCMonth(until.getUTCMonth() + p.months);
        await tx.tenant.update({ where: { id: tenantId }, data: { paidUntil: until, subStatus: 'ACTIF' } });
      }
      await this.audit.log(tx, tenantId, 'PRESTATAIRE', 'PAIEMENT_' + verified.status, `payment:${p.id}`);
      return { status: verified.status };
    });
  }

  private async findPaymentTenant(ref: string): Promise<string | null> {
    for (const t of await this.db.client.tenant.findMany({ select: { id: true } })) {
      const found = await this.db.forTenant(t.id, (tx) => tx.payment.findUnique({ where: { externalRef: ref }, select: { tenantId: true } }));
      if (found) return found.tenantId;
    }
    return null;
  }

  // ---------- Console JUPSER ----------
  @JupserStaff()
  @Get('console/tenants')
  async tenants() {
    const tenants = await this.db.client.tenant.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { memberships: true, companies: true } } } });
    const today = new Date().toISOString().slice(0, 10);
    const g = grid();
    const rows = tenants.map((t) => {
      const status = computeStatus({ status: t.subStatus as SubscriptionStatus, trialEndsAt: t.trialEndsAt?.toISOString().slice(0, 10), paidUntil: t.paidUntil?.toISOString().slice(0, 10) }, today);
      const mrr = status === 'ACTIF' ? quoteEnterprise(g, t.edition as EditionCode, [], Math.max(1, Math.min(50, t._count.memberships))).monthlyUsdCents : 0n;
      return { ...t, computedStatus: status, mrrUsdCents: mrr };
    });
    return { tenants: rows, mrrUsdCents: rows.reduce((s, r) => s + r.mrrUsdCents, 0n), byStatus: rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.computedStatus]: (m[r.computedStatus] ?? 0) + 1 }), {}) };
  }

  @JupserStaff()
  @Post('console/tenants')
  async createTenant(@Body() body: unknown) {
    const b = parse(
      z.object({ name: z.string().min(2), type: z.enum(['ENTREPRISE', 'CABINET']), edition: z.enum(['TPE', 'ESSENTIEL', 'PRO', 'ERP']), adminEmail: z.string().email(), adminName: z.string().min(2), adminPassword: z.string().min(12) }),
      body,
    );
    const trial = new Date(Date.now() + 30 * 86_400_000);
    const tenant = await this.db.client.tenant.create({
      data: { name: b.name, type: b.type, edition: b.edition, modules: EDITION_MODULES[b.edition], subStatus: 'ESSAI', trialEndsAt: trial, maxCompanies: b.edition === 'ERP' ? 10 : 1, maxUsers: b.edition === 'TPE' ? 2 : 50 },
    });
    const user = await this.db.client.user.upsert({
      where: { email: b.adminEmail.toLowerCase() },
      create: { email: b.adminEmail.toLowerCase(), fullName: b.adminName, passwordHash: await this.auth.hash(b.adminPassword) },
      update: {},
    });
    await this.db.client.membership.create({ data: { tenantId: tenant.id, userId: user.id, roles: ['ADMIN'] } });
    await this.db.forTenant(tenant.id, (tx) => this.audit.log(tx, tenant.id, 'JUPSER', 'LOCATAIRE_CREE', `tenant:${tenant.id}`, { edition: b.edition }));
    return tenant;
  }

  @JupserStaff()
  @Post('console/tenants/:id/subscription')
  @HttpCode(200)
  async setSubscription(@Param('id') id: string, @Body() body: unknown) {
    const b = parse(
      z.object({ edition: z.enum(['TPE', 'ESSENTIEL', 'PRO', 'ERP']).optional(), addModules: z.array(z.string()).default([]), paidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), trialEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), aiCredits: z.number().int().min(0).optional() }),
      body,
    );
    const t = await this.db.client.tenant.findUniqueOrThrow({ where: { id } });
    const edition = (b.edition ?? t.edition) as EditionCode;
    const r = await this.db.client.tenant.update({
      where: { id },
      data: {
        edition,
        modules: [...new Set([...EDITION_MODULES[edition], ...b.addModules])],
        ...(b.paidUntil !== undefined ? { paidUntil: b.paidUntil ? new Date(b.paidUntil) : null, subStatus: b.paidUntil ? 'ACTIF' : t.subStatus } : {}),
        ...(b.trialEndsAt !== undefined ? { trialEndsAt: b.trialEndsAt ? new Date(b.trialEndsAt) : null } : {}),
        ...(b.aiCredits !== undefined ? { aiCredits: b.aiCredits } : {}),
      },
    });
    await this.db.forTenant(id, (tx) => this.audit.log(tx, id, 'JUPSER', 'ABONNEMENT_MODIFIE', `tenant:${id}`, b));
    return r;
  }

  // ---------- Utilisateurs du locataire ----------
  @Roles('ADMIN')
  @Get('users')
  users(@CurrentUser() u: SessionUser) {
    return this.db.client.membership.findMany({ where: { tenantId: u.tenantId }, include: { user: { select: { id: true, email: true, fullName: true, mfaEnabled: true } } } });
  }

  @Roles('ADMIN')
  @Post('users')
  async addUser(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const { ROLE_LIST } = await import('../auth/decorators');
    const { validatePasswordStrength } = await import('../auth/auth.service');
    const b = parse(
      z.object({ email: z.string().email(), fullName: z.string().min(2), password: z.string(), roles: z.array(z.enum(ROLE_LIST)).min(1), companyIds: z.array(z.string().uuid()).default([]) }),
      body,
    );
    const weak = validatePasswordStrength(b.password);
    if (weak) throw domainError('MOT_DE_PASSE_FAIBLE', weak);
    const t = await this.db.client.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const count = await this.db.client.membership.count({ where: { tenantId: u.tenantId } });
    if (count >= t.maxUsers) throw domainError('QUOTA', `Quota d'utilisateurs atteint (${t.maxUsers}).`);
    const user = await this.db.client.user.upsert({
      where: { email: b.email.toLowerCase() },
      create: { email: b.email.toLowerCase(), fullName: b.fullName, passwordHash: await this.auth.hash(b.password) },
      update: {},
    });
    const m = await this.db.client.membership.create({ data: { tenantId: u.tenantId, userId: user.id, roles: b.roles, companyIds: b.companyIds } });
    await this.db.forTenant(u.tenantId, (tx) => this.audit.log(tx, u.tenantId, u.userId, 'DROITS_ATTRIBUES', `user:${user.id}`, { roles: b.roles }));
    return m;
  }
}
