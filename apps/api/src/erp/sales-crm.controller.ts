import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { canonicalJson, decimalsOf, sha256 } from '@jupiter/ledger';
import { eligibleRecipients, loyaltyPoints, personalize, rfm, unsubscribeToken } from '@jupiter/operations';
import { applyRate } from '@jupiter/tax-engine';
import QRCode from 'qrcode';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { CurrentUser, Public, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { domainError, parse, zAmount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { loadRules } from '../tax/tax.controller';
import { MessagingService } from './messaging.service';

const PREFIX: Record<string, string> = { DEVIS: 'DV', PROFORMA: 'PF', COMMANDE: 'BC', LIVRAISON: 'BL' };

@ApiTags('Ventes et CRM')
@Controller('companies/:companyId')
export class SalesCrmController {
  constructor(
    private readonly db: PrismaService,
    private readonly entries: EntriesService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  private async number(tx: Tx, companyId: string, type: string, year: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + type + year}))`;
    const c = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const seqs = (c.docSequences ?? {}) as Record<string, number>;
    const key = `${type}-${year}`;
    const n = (seqs[key] ?? 0) + 1;
    await tx.company.update({ where: { id: companyId }, data: { docSequences: { ...seqs, [key]: n } } });
    return `${PREFIX[type]}-${year}-${String(n).padStart(5, '0')}`;
  }

  /** Devis, facture proforma, bon de commande client, bon de livraison — tous avec QR, sans écriture. */
  @RequiresModule('DOCUMENTS_QR')
  @Roles('COMMERCIAL', 'COMPTABLE', 'CHEF_COMPTABLE', 'CAISSIER')
  @Post('sales-docs')
  create(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const dec = decimalsOf(company.currency);
      const b = parse(z.object({ type: z.enum(['DEVIS', 'PROFORMA', 'COMMANDE', 'LIVRAISON']), date: zDate, thirdPartyId: z.string().uuid(), validUntil: zDate.optional(), lines: z.array(z.object({ itemId: z.string().uuid().optional(), description: z.string().min(1), quantity: z.number().positive(), unitPrice: zAmount(dec), vat: z.enum(['NORMAL', 'REDUIT', 'EXONERE', 'EXPORT']) })).min(1) }), body);
      const rules = await loadRules(tx);
      const lines = b.lines.map((l) => {
        const net = (l.unitPrice * BigInt(Math.round(l.quantity * 1000)) + 500n) / 1000n;
        const rate = ['EXONERE', 'EXPORT'].includes(l.vat) ? '0' : rules.tryFind<string | null>(company.country, 'TVA', l.vat === 'NORMAL' ? 'taux_normal' : 'taux_reduit', b.date)?.value ?? '0';
        return { ...l, unitPrice: l.unitPrice.toString(), net: net.toString(), vat: applyRate(net, rate).toString(), vatRate: rate, vatKind: l.vat };
      });
      const totalNet = lines.reduce((s, l) => s + BigInt(l.net), 0n);
      const totalVat = lines.reduce((s, l) => s + BigInt(l.vat), 0n);
      const number = await this.number(tx, companyId, b.type, b.date.slice(0, 4));
      const hash = sha256(canonicalJson({ issuer: companyId, type: b.type, number, date: b.date, client: b.thirdPartyId, totalNet, totalVat }));
      return tx.salesDocument.create({ data: { tenantId: u.tenantId, companyId, type: b.type, number, date: b.date, thirdPartyId: b.thirdPartyId, lines, totalNet, totalVat, totalGross: totalNet + totalVat, currency: company.currency, hash } });
    });
  }

  /** Encaissement d'une facture (banque, caisse, mobile money) : écriture, lettrage, points de fidélité. */
  @RequiresModule('DOCUMENTS_QR')
  @Roles('CAISSIER', 'COMPTABLE', 'CHEF_COMPTABLE')
  @Post('invoices/:id/payment')
  pay(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const b = parse(z.object({ date: zDate, journalCode: z.string().default('BQ1'), amount: zAmount(decimalsOf(company.currency)).optional(), reference: z.string().optional() }), body);
      const inv = await tx.salesDocument.findFirst({ where: { id, companyId, type: 'FACTURE' } });
      if (!inv || inv.status !== 'EMISE') throw domainError('FACTURE', 'Facture introuvable ou annulée.');
      const journal = await tx.journal.findUniqueOrThrow({ where: { companyId_code: { companyId, code: b.journalCode } } });
      if (!journal.counterpartAccount) throw domainError('JOURNAL', 'Journal de trésorerie attendu.');
      const client = await tx.thirdParty.findUniqueOrThrow({ where: { id: inv.thirdPartyId } });
      const amount = b.amount ?? inv.totalGross;
      const d = await this.entries.createDraft(tx, u, companyId, {
        journalCode: b.journalCode, date: b.date, pieceRef: b.reference ?? inv.number, label: `Règlement ${inv.number} — ${client.name}`,
        lines: [{ account: journal.counterpartAccount, debit: amount, credit: 0n }, { account: client.account, thirdPartyId: client.id, debit: 0n, credit: amount }],
      });
      const v = await this.entries.validate(tx, u, companyId, d.id);
      // lettrage automatique si la facture est intégralement réglée
      if (amount === inv.totalGross && inv.entryId) {
        const invLine = await tx.entryLine.findFirst({ where: { entryId: inv.entryId, account: client.account, letter: null } });
        const payLine = v.entry.lines.find((l) => l.account === client.account);
        if (invLine && payLine) {
          const last = await tx.entryLine.findFirst({ where: { account: client.account, letter: { not: null }, entry: { companyId } }, orderBy: { letter: 'desc' } });
          const { nextLetter } = await import('@jupiter/ledger');
          await tx.entryLine.updateMany({ where: { id: { in: [invLine.id, payLine.id] } }, data: { letter: nextLetter(last?.letter ?? null) } });
        }
      }
      const pts = loyaltyPoints(amount, 10n ** BigInt(decimalsOf(company.currency)) * 1000n);
      if (pts) await tx.thirdParty.update({ where: { id: client.id }, data: { loyaltyPoints: { increment: pts } } });
      return { entry: v.entry, loyaltyPoints: pts };
    });
  }

  // ---------- CRM ----------
  @RequiresModule('MARKETING_CRM')
  @Get('crm/leads')
  leads(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.lead.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }));
  }

  @RequiresModule('MARKETING_CRM')
  @Roles('COMMERCIAL', 'DIRECTION')
  @Post('crm/leads')
  createLead(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(z.object({ name: z.string().min(2), org: z.string().optional(), phone: z.string().optional(), email: z.string().email().optional(), source: z.string().optional(), value: zAmount(decimalsOf((await tx.company.findUniqueOrThrow({ where: { id: companyId } })).currency)).default('0'), consent: z.boolean().default(false) }), body);
      return tx.lead.create({ data: { ...b, tenantId: u.tenantId, companyId, ownerId: u.userId } });
    });
  }

  @RequiresModule('MARKETING_CRM')
  @Roles('COMMERCIAL', 'DIRECTION')
  @Post('crm/leads/:id/stage')
  @HttpCode(200)
  stage(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ stage: z.enum(['PROSPECT', 'QUALIFIE', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU']) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const l = await tx.lead.findFirstOrThrow({ where: { id, companyId } });
      const r = await tx.lead.update({ where: { id }, data: { stage: b.stage } });
      // une affaire gagnée devient un client
      if (b.stage === 'GAGNE' && l.stage !== 'GAGNE') {
        await tx.thirdParty.create({ data: { tenantId: u.tenantId, companyId, type: 'CLIENT', code: `CL-${id.slice(0, 8)}`, name: l.org ?? l.name, phone: l.phone, email: l.email, account: '411100', consentMarketing: l.consent } });
      }
      return r;
    });
  }

  @RequiresModule('MARKETING_CRM')
  @Get('crm/dashboard')
  dashboard(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const leads = await tx.lead.findMany({ where: { companyId } });
      const pipeline = ['PROSPECT', 'QUALIFIE', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU'].map((s) => ({ stage: s, count: leads.filter((l) => l.stage === s).length, value: leads.filter((l) => l.stage === s).reduce((a, l) => a + l.value, 0n) }));
      const invoices = await tx.salesDocument.findMany({ where: { companyId, type: 'FACTURE', status: 'EMISE' } });
      const clients = await tx.thirdParty.findMany({ where: { companyId, type: 'CLIENT' } });
      const segments = rfm(clients.map((c) => {
        const inv = invoices.filter((i) => i.thirdPartyId === c.id);
        return { id: c.id, lastPurchase: inv.map((i) => i.date).sort().at(-1) ?? null, frequency: inv.length, monetary: inv.reduce((s, i) => s + i.totalGross, 0n) };
      }), new Date().toISOString().slice(0, 10)).map((s) => ({ ...s, name: clients.find((c) => c.id === s.id)!.name }));
      const byMonth = new Map<string, bigint>();
      for (const i of invoices) byMonth.set(i.date.slice(0, 7), (byMonth.get(i.date.slice(0, 7)) ?? 0n) + i.totalNet);
      return { pipeline, segments, salesByMonth: [...byMonth].sort().map(([month, total]) => ({ month, total })) };
    });
  }

  @RequiresModule('MARKETING_CRM')
  @Get('crm/campaigns')
  campaigns(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.campaign.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }));
  }

  /** Campagne SMS / WhatsApp / e-mail : consentement obligatoire, lien de désinscription dans chaque message. */
  @RequiresModule('MARKETING_CRM')
  @Roles('COMMERCIAL', 'DIRECTION')
  @Post('crm/campaigns')
  campaign(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().min(2), channel: z.enum(['SMS', 'WHATSAPP', 'EMAIL']), message: z.string().min(5).max(2000), audience: z.enum(['CLIENTS', 'PROSPECTS', 'TOUS']).default('TOUS'), send: z.boolean().default(true) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const c = await tx.campaign.create({ data: { tenantId: u.tenantId, companyId, name: b.name, channel: b.channel, message: b.message, segment: { audience: b.audience } } });
      if (!b.send) return c;
      const tps = b.audience !== 'PROSPECTS' ? (await tx.thirdParty.findMany({ where: { companyId, type: 'CLIENT' } })).map((t) => ({ id: t.id, type: 'TIERS', name: t.name, phone: t.phone, email: t.email, consent: t.consentMarketing, unsubscribed: t.unsubscribed })) : [];
      const leads = b.audience !== 'CLIENTS' ? (await tx.lead.findMany({ where: { companyId } })).map((l) => ({ id: l.id, type: 'PROSPECT', name: l.name, phone: l.phone, email: l.email, consent: l.consent, unsubscribed: l.unsubscribed })) : [];
      const all = [...tps, ...leads];
      const targets = eligibleRecipients(all, b.channel);
      let sent = 0;
      for (const t of targets) {
        const token = unsubscribeToken();
        const text = personalize(b.message, { nom: t.name }, `${config.verifyBaseUrl.replace('/verifier', '')}/desinscription/${token}`, b.channel);
        const to = b.channel === 'EMAIL' ? t.email! : t.phone!;
        const status = await this.messaging.send(b.channel, to, text, b.name);
        await tx.campaignMessage.create({ data: { tenantId: u.tenantId, campaignId: c.id, recipient: to, contactType: t.type, contactId: t.id, status, token } });
        if (status === 'ENVOYE') sent++;
      }
      return tx.campaign.update({ where: { id: c.id }, data: { status: 'ENVOYEE', stats: { audience: all.length, eligible: targets.length, sent, excludedNoConsent: all.length - targets.length } } });
    });
  }
}

/** Désinscription publique (lien présent dans chaque message). */
@ApiTags('Ventes et CRM')
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly db: PrismaService) {}

  @Public()
  @Post(':token')
  @HttpCode(200)
  async unsubscribe(@Param('token') token: string) {
    if (!/^[a-f0-9]{40}$/.test(token)) return { ok: false };
    const rows = await this.db.client.$queryRaw<{ tenant_id: string; contact_type: string; contact_id: string }[]>`SELECT * FROM jc_unsubscribe(${token})`;
    return { ok: rows.length > 0 };
  }

  @Public()
  @Get('qr')
  async qr(@Query('text') text: string) {
    return { dataUrl: await QRCode.toDataURL(String(text ?? '').slice(0, 500)) };
  }
}
