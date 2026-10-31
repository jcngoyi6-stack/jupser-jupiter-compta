import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { canonicalJson, decimalsOf, sha256 } from '@jupiter/ledger';
import { applyRate, RuleSet, RuleTrace, vatFromNet, type TaxRule } from '@jupiter/tax-engine';
import QRCode from 'qrcode';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { CurrentUser, Public, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { domainError, parse, zAccount, zAmount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { EInvoiceService } from './einvoice.service';
import { StockService } from '../erp/stock.service';

/**
 * Documents commerciaux avec QR (docs/13) : facture → écriture comptable automatique (journal VTE),
 * annulation uniquement par avoir, vérification publique par empreinte SHA-256.
 */
@ApiTags('Ventes et documents QR')
@Controller()
export class SalesController {
  constructor(
    private readonly db: PrismaService,
    private readonly entries: EntriesService,
    private readonly audit: AuditService,
    private readonly einvoice: EInvoiceService,
    private readonly stock: StockService,
  ) {}

  private async nextNumber(tx: Tx, companyId: string, type: string, year: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + type + year}))`;
    const c = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const seqs = (c.docSequences ?? {}) as Record<string, number>;
    const key = `${type}-${year}`;
    const n = (seqs[key] ?? 0) + 1;
    await tx.company.update({ where: { id: companyId }, data: { docSequences: { ...seqs, [key]: n } } });
    return `${type === 'AVOIR' ? 'AV' : 'FA'}-${year}-${String(n).padStart(5, '0')}`;
  }

  private async qr(hash: string) {
    const url = `${config.verifyBaseUrl}/${hash}`;
    return { url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 180 }) };
  }

  @RequiresModule('DOCUMENTS_QR')
  @Get('companies/:companyId/sales-documents')
  list(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.salesDocument.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }));
  }

  @RequiresModule('DOCUMENTS_QR')
  @Get('companies/:companyId/sales-documents/:id')
  one(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await tx.salesDocument.findFirstOrThrow({ where: { id, companyId } });
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const client = await tx.thirdParty.findUniqueOrThrow({ where: { id: d.thirdPartyId } });
      const def = d.einvoice as { qrCode?: string } | null;
      const defQr = def?.qrCode ? await QRCode.toDataURL(def.qrCode, { margin: 1, width: 180 }) : null;
      return { ...d, company, client, defQrDataUrl: defQr, ...(await this.qr(d.hash)) };
    });
  }

  @RequiresModule('DOCUMENTS_QR')
  @Roles('COMMERCIAL', 'COMPTABLE', 'CHEF_COMPTABLE', 'CAISSIER')
  @Post('companies/:companyId/invoices')
  invoice(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const dec = decimalsOf(company.currency);
      const b = parse(
        z.object({
          date: zDate,
          thirdPartyId: z.string().uuid(),
          paymentMethod: z.enum(['ESPECES', 'VIREMENT', 'CARTE', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT', 'AUTRE']).default('CREDIT'),
          exportSale: z.boolean().default(false),
          sourceDocumentId: z.string().uuid().optional(), // devis / commande transformé(e) en facture
          warehouseId: z.string().uuid().optional(), // sortie de stock des articles livrés
          lines: z
            .array(z.object({ itemId: z.string().uuid().optional(), description: z.string().min(1), quantity: z.number().positive().max(1e9), unitPrice: zAmount(dec), vat: z.enum(['NORMAL', 'REDUIT', 'EXONERE', 'EXPORT']), account: zAccount.default('706100') }))
            .min(1),
        }),
        body,
      );
      const client = await tx.thirdParty.findFirst({ where: { id: b.thirdPartyId, companyId, type: 'CLIENT' } });
      if (!client) throw domainError('CLIENT_INCONNU', 'Client introuvable.');
      const rules = new RuleSet((await tx.taxRule.findMany()).map((r) => ({ ...r, value: r.value }) as TaxRule));
      const trace = new RuleTrace();
      const rateOf = (k: 'NORMAL' | 'REDUIT' | 'EXONERE' | 'EXPORT') => {
        if (k === 'EXONERE' || k === 'EXPORT') return '0';
        const r = trace.use(rules.find<string | null>(company.country, 'TVA', k === 'NORMAL' ? 'taux_normal' : 'taux_reduit', b.date));
        if (r === null) throw domainError('PACK_PAYS_INCOMPLET', `Taux de TVA ${k === 'NORMAL' ? 'normal' : 'réduit'} non renseigné pour ${company.country} (à saisir par le fiscaliste).`);
        return r;
      };
      const computed = b.lines.map((l) => {
        if (!Number.isInteger(l.quantity * 1000)) throw domainError('QUANTITE', 'Quantité : 3 décimales maximum.');
        const net = (l.unitPrice * BigInt(Math.round(l.quantity * 1000)) + 500n) / 1000n;
        const v = vatFromNet(net, rateOf(l.vat));
        return { ...l, unitPrice: l.unitPrice.toString(), net: v.net, vat: v.vat, vatRate: rateOf(l.vat), vatKind: l.vat };
      });
      const totalNet = computed.reduce((s, l) => s + l.net, 0n);
      const totalVat = computed.reduce((s, l) => s + l.vat, 0n);
      const number = await this.nextNumber(tx, companyId, 'FACTURE', b.date.slice(0, 4));
      const hash = sha256(canonicalJson({ issuer: companyId, number, date: b.date, client: client.id, totalNet, totalVat, lines: computed }));
      const revenue = new Map<string, bigint>();
      for (const l of computed) revenue.set(l.account, (revenue.get(l.account) ?? 0n) + l.net);
      const draft = await this.entries.createDraft(
        tx,
        u,
        companyId,
        {
          journalCode: 'VTE',
          date: b.date,
          pieceRef: number,
          label: `Facture ${number} — ${client.name}`,
          lines: [
            { account: client.account, thirdPartyId: client.id, debit: totalNet + totalVat, credit: 0n },
            ...[...revenue.entries()].map(([account, v]) => ({ account, debit: 0n, credit: v })),
            ...(totalVat > 0n ? [{ account: '443100', debit: 0n, credit: totalVat }] : []),
          ],
        },
        'VENTE',
      );
      const posted = await this.entries.validate(tx, u, companyId, draft.id);
      // RDC : facture normalisée — éléments de sécurité du DEF obtenus avant l'émission (sinon annulation de la transaction)
      const def = this.einvoice.required(company)
        ? await this.einvoice.certify(company, {
            type: EInvoiceService.typeFor('FACTURE', b.exportSale),
            reference: null,
            client: { type: client.clientType as never, name: client.name, taxId: client.taxId, address: client.address },
            operator: { id: u.userId, name: u.fullName },
            items: computed.map((l) => ({
              name: l.description,
              quantity: (Math.round(l.quantity * 1000) / 1000).toString(),
              unitPriceTtc: BigInt(l.unitPrice) + applyRate(BigInt(l.unitPrice), l.vatRate),
              taxGroup: this.einvoice.taxGroup(l.vatKind),
            })),
            payment: [],
            internalNumber: number,
            date: b.date,
          })
        : null;
      const doc = await tx.salesDocument.create({
        data: {
          tenantId: u.tenantId,
          companyId,
          type: 'FACTURE',
          number,
          date: b.date,
          thirdPartyId: client.id,
          lines: JSON.parse(canonicalJson(computed)),
          totalNet,
          totalVat,
          totalGross: totalNet + totalVat,
          currency: company.currency,
          hash,
          entryId: posted.entry.id,
          paymentMethod: b.paymentMethod,
          einvoice: def ? (def as never) : undefined,
        },
      });
      if (b.sourceDocumentId) await tx.salesDocument.updateMany({ where: { id: b.sourceDocumentId, companyId }, data: { status: 'TRANSFORME' } });
      // ERP : la vente d'articles stockés sort le stock au coût (inventaire permanent)
      const costs = new Map<number, bigint>();
      for (const [i, l] of computed.entries()) {
        if (!l.itemId) continue;
        if (!b.warehouseId) throw domainError('DEPOT_REQUIS', 'Dépôt requis pour les articles stockés.');
        const qtyMilli = BigInt(Math.round(l.quantity * 1000));
        const mv = await this.stock.move(tx, u, companyId, { itemId: l.itemId!, warehouseId: b.warehouseId, date: b.date, type: 'SORTIE', qtyMilli: -qtyMilli, reference: number });
        costs.set(i, -mv.totalCost);
      }
      // Client « société du groupe » : la facture est transmise à la société destinataire pour acceptation
      if (client.groupCompanyId) {
        await tx.intercompanyInvoice.create({
          data: {
            tenantId: u.tenantId, sellerCompanyId: companyId, buyerCompanyId: client.groupCompanyId, salesDocumentId: doc.id, number, date: b.date,
            lines: computed.map((l, i) => ({ description: l.description, quantity: l.quantity, net: l.net.toString(), vat: l.vat.toString(), account: l.account, itemId: l.itemId ?? null, cost: costs.has(i) ? costs.get(i)!.toString() : null })),
            totalNet, totalVat, totalGross: totalNet + totalVat,
          },
        });
      }
      await this.audit.log(tx, u.tenantId, u.userId, 'FACTURE_EMISE', `sales_document:${doc.id}`, { number, hash });
      return { ...doc, entryNumber: posted.entry.number, banner: trace.banner, ...(await this.qr(hash)) };
    });
  }

  /** Annulation par avoir : la facture reste, marquée ANNULEE ; le QR le signale (critère L7b). */
  @RequiresModule('DOCUMENTS_QR')
  @Roles('COMPTABLE', 'CHEF_COMPTABLE')
  @Post('companies/:companyId/invoices/:id/credit-note')
  creditNote(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ date: zDate, reason: z.string().min(5) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const inv = await tx.salesDocument.findFirst({ where: { id, companyId, type: 'FACTURE' } });
      if (!inv) throw domainError('FACTURE_INCONNUE', 'Facture introuvable.');
      if (inv.status === 'ANNULEE') throw domainError('DEJA_ANNULEE', 'Facture déjà annulée.');
      // Facture intragroupe en attente d'acceptation : retirée de la boîte de la société destinataire
      await tx.intercompanyInvoice.updateMany({ where: { salesDocumentId: inv.id, status: { in: ['EN_ATTENTE', 'REJETEE'] } }, data: { status: 'ANNULEE', reason: b.reason } });
      const entry = await this.entries.get(tx, companyId, inv.entryId!);
      const number = await this.nextNumber(tx, companyId, 'AVOIR', b.date.slice(0, 4));
      const draft = await this.entries.createDraft(
        tx,
        u,
        companyId,
        {
          journalCode: 'VTE',
          date: b.date,
          pieceRef: number,
          label: `Avoir ${number} sur ${inv.number} — ${b.reason}`,
          lines: entry.lines.map((l) => ({ account: l.account, thirdPartyId: l.thirdPartyId, debit: l.credit, credit: l.debit })),
        },
        'VENTE',
      );
      const posted = await this.entries.validate(tx, u, companyId, draft.id);
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const orig = inv.einvoice as { codeDefDgi?: string } | null;
      const client = await tx.thirdParty.findUniqueOrThrow({ where: { id: inv.thirdPartyId } });
      const def = orig && this.einvoice.required(company)
        ? await this.einvoice.certify(company, {
            type: EInvoiceService.typeFor('AVOIR', (inv.lines as { vatKind?: string }[]).some((l) => l.vatKind === 'EXPORT')),
            reference: orig.codeDefDgi ?? null,
            client: { type: client.clientType as never, name: client.name, taxId: client.taxId, address: client.address },
            operator: { id: u.userId, name: u.fullName },
            items: (inv.lines as { description: string; quantity: number; net: string; vat: string; vatKind: string }[]).map((l) => ({
              name: l.description,
              quantity: '1',
              unitPriceTtc: BigInt(l.net) + BigInt(l.vat),
              taxGroup: this.einvoice.taxGroup(l.vatKind),
            })),
            payment: [],
            internalNumber: number,
            date: b.date,
          })
        : null;
      const hash = sha256(canonicalJson({ issuer: companyId, number, date: b.date, cancels: inv.hash, total: inv.totalGross }));
      const avoir = await tx.salesDocument.create({
        data: {
          tenantId: u.tenantId,
          companyId,
          type: 'AVOIR',
          number,
          date: b.date,
          thirdPartyId: inv.thirdPartyId,
          lines: inv.lines as never,
          totalNet: -inv.totalNet,
          totalVat: -inv.totalVat,
          totalGross: -inv.totalGross,
          currency: inv.currency,
          hash,
          entryId: posted.entry.id,
          einvoice: def ? (def as never) : undefined,
        },
      });
      await tx.salesDocument.update({ where: { id: inv.id }, data: { status: 'ANNULEE', cancelledById: avoir.id } });
      await this.audit.log(tx, u.tenantId, u.userId, 'FACTURE_ANNULEE', `sales_document:${inv.id}`, { avoir: number, reason: b.reason });
      return { ...avoir, ...(await this.qr(hash)) };
    });
  }

  /** Vérification publique (scan du QR) : authenticité, émetteur, date, montant, statut. */
  @Public()
  @Get('verify/:hash')
  async verify(@Param('hash') hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) return { authentic: false };
    const rows = await this.db.client.$queryRaw<
      { doc_type: string; number: string; doc_date: string; total_gross: bigint; currency: string; status: string; issuer: string; issuer_tax_id: string | null }[]
    >`SELECT * FROM jc_verify_document(${hash})`;
    const d = rows[0];
    if (!d) return { authentic: false };
    return {
      authentic: true,
      type: d.doc_type,
      number: d.number,
      date: d.doc_date,
      total: d.total_gross,
      currency: d.currency,
      status: d.status,
      cancelled: d.status === 'ANNULEE',
      issuer: d.issuer,
      issuerTaxId: d.issuer_tax_id,
    };
  }
}
