import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { convert, pickRate, type FxRate } from '@jupiter/fx';
import { decimalsOf } from '@jupiter/ledger';
import { RuleSet, RuleTrace, type TaxRule } from '@jupiter/tax-engine';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { JUPSER_TENANT_NAME } from '../common/jupser-tenant';
import { PrismaService } from '../common/prisma.service';
import { SalesController } from '../sales/sales.controller';


/**
 * Facture d'abonnement émise par JUPSER dans son propre dossier (espace interne) à chaque paiement confirmé :
 * client = locataire abonné, prestation au compte 706, montant payé (TTC, USD) converti dans la monnaie de tenue de
 * JUPSER au cours officiel du jour, TVA du pack pays, facture normalisée en RDC. En cas d'impossibilité (dossier JUPSER
 * non créé, cours manquant, refus du dispositif fiscal), le motif est conservé et la facture peut être émise ensuite
 * depuis la console ; le paiement, lui, n'est jamais bloqué.
 */
@Injectable()
export class SubscriptionInvoicingService {
  private readonly log = new Logger('FacturationJUPSER');

  constructor(private readonly db: PrismaService, private readonly auth: AuthService, private readonly audit: AuditService, private readonly moduleRef: ModuleRef) {}

  private async pending(tenantId: string, paymentId: string, reason: string) {
    await this.db.forTenant(tenantId, async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { invoice: { status: 'EN_ATTENTE', reason } } });
      await this.audit.log(tx, tenantId, 'SYSTEME', 'FACTURE_JUPSER_EN_ATTENTE', `payment:${paymentId}`, { reason });
    });
    this.log.warn(`Facture d'abonnement en attente (${paymentId}) : ${reason}`);
    return { status: 'EN_ATTENTE' as const, reason };
  }

  async issue(clientTenantId: string, paymentId: string) {
    const payment = await this.db.forTenant(clientTenantId, (tx) => tx.payment.findUniqueOrThrow({ where: { id: paymentId } }));
    if (payment.status !== 'PAYE') return { status: 'IGNORE' as const, reason: 'Paiement non confirmé.' };
    if ((payment.invoice as { status?: string } | null)?.status === 'EMISE') return payment.invoice;
    const internal = await this.db.client.tenant.findFirst({ where: { name: JUPSER_TENANT_NAME } });
    const admin = internal ? await this.db.client.membership.findFirst({ where: { tenantId: internal.id, roles: { has: 'ADMIN' } }, orderBy: { userId: 'asc' } }) : null;
    const issuer = internal ? await this.db.forTenant(internal.id, (tx) => tx.company.findFirst({ orderBy: { createdAt: 'asc' } })) : null;
    if (!internal || !admin || !issuer) return this.pending(clientTenantId, paymentId, 'Dossier comptable de JUPSER non créé dans l’espace interne.');
    const client = await this.db.client.tenant.findUniqueOrThrow({ where: { id: clientTenantId } });
    const clientCompany = await this.db.forTenant(clientTenantId, (tx) => tx.company.findFirst({ orderBy: { createdAt: 'asc' } }));
    const date = (payment.paidAt ?? new Date()).toISOString().slice(0, 10);
    // Montant payé (USD, TTC) dans la monnaie de tenue de JUPSER
    let grossLocal = payment.amountCents;
    const dec = decimalsOf(issuer.currency);
    if (issuer.currency !== 'USD') {
      const rates = (await this.db.forTenant(internal.id, (tx) => tx.fxRate.findMany({ where: { currency: 'USD', quote: issuer.currency } }))) as unknown as FxRate[];
      const rate = pickRate(rates, 'USD', issuer.currency, date);
      if (!rate) return this.pending(clientTenantId, paymentId, `Cours USD/${issuer.currency} du ${date} absent (saisir le cours BCC dans le dossier JUPSER).`);
      grossLocal = convert(payment.amountCents, rate.rate, 2, dec);
    }
    const rules = new RuleSet((await this.db.forTenant(internal.id, (tx) => tx.taxRule.findMany())).map((r) => ({ ...r, value: r.value }) as TaxRule));
    let vatRate = 0;
    try { vatRate = Number(new RuleTrace().use(rules.find<string>(issuer.country, 'TVA', 'taux_normal', date)) ?? 0); } catch { vatRate = 0; }
    const net = BigInt(Math.round(Number(grossLocal) / (1 + vatRate)));
    const major = (v: bigint) => (dec === 0 ? v.toString() : `${v / 10n ** BigInt(dec)}.${(v % 10n ** BigInt(dec)).toString().padStart(dec, '0')}`);
    try {
      const code = `ABO-${clientTenantId.slice(0, 8)}`;
      const party = await this.db.forTenant(internal.id, async (tx) =>
        (await tx.thirdParty.findUnique({ where: { companyId_code: { companyId: issuer.id, code } } }))
        ?? tx.thirdParty.create({ data: { tenantId: internal.id, companyId: issuer.id, type: 'CLIENT', code, name: clientCompany?.name ?? client.name, account: '411100', taxId: clientCompany?.taxId ?? null, address: clientCompany?.address ?? null, clientType: clientCompany?.taxId ? 'PM' : 'PP' } }));
      const user = await this.auth.sessionUser({ sub: admin.userId, tid: internal.id, mfa: true, stage: 'session' } as never);
      const sales = this.moduleRef.get(SalesController, { strict: false });
      const doc = await sales.invoice(user, issuer.id, {
        date, thirdPartyId: party.id, paymentMethod: payment.method === 'CARTE' ? 'CARTE' : payment.method === 'VIREMENT' ? 'VIREMENT' : 'MOBILE_MONEY',
        lines: [{ description: `Abonnement Jupiter Compta — édition ${payment.edition ?? client.edition} — ${payment.months} mois (paiement ${payment.externalRef.slice(0, 8)})`, quantity: 1, unitPrice: major(net), vat: vatRate > 0 ? 'NORMAL' : 'EXONERE', account: '706100' }],
      }) as { number: string; date: string; totalNet: bigint; totalVat: bigint; totalGross: bigint; currency: string; hash: string };
      const invoice = {
        status: 'EMISE', number: doc.number, date: doc.date, currency: doc.currency, totalNet: doc.totalNet.toString(), totalVat: doc.totalVat.toString(), totalGross: doc.totalGross.toString(),
        hash: doc.hash, verifyUrl: `${config.verifyBaseUrl}/${doc.hash}`,
      };
      await this.db.forTenant(clientTenantId, async (tx) => {
        await tx.payment.update({ where: { id: paymentId }, data: { invoice } });
        await this.audit.log(tx, clientTenantId, 'SYSTEME', 'FACTURE_JUPSER_EMISE', `payment:${paymentId}`, { number: doc.number });
      });
      return invoice;
    } catch (e) {
      const err = e as { response?: { message?: string }; message?: string };
      return this.pending(clientTenantId, paymentId, err.response?.message ?? err.message ?? 'Erreur inconnue');
    }
  }
}
