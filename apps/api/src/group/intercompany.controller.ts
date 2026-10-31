import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { ACCOUNTING_WRITE, CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError, parse, zAccount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { StockService } from '../erp/stock.service';

interface IcLine { description: string; quantity: number; net: string; vat: string; account: string; itemId: string | null; cost: string | null }

/**
 * Interconnexion des sociétés d'un même groupe : liaison (tiers « société du groupe » dans chaque dossier), boîte de
 * réception des factures intragroupe et circuit d'acceptation. L'acceptation crée l'écriture d'achat (brouillon) et,
 * pour les articles stockés, l'entrée en stock chez la société destinataire ; le refus est motivé et renvoyé à
 * l'émetteur, qui annule par avoir.
 */
@ApiTags('Groupe — opérations intragroupe')
@RequiresModule('COMPTABILITE')
@Controller('companies/:companyId')
export class IntercompanyController {
  constructor(private readonly db: PrismaService, private readonly entries: EntriesService, private readonly stock: StockService, private readonly audit: AuditService) {}

  private async sister(tx: Tx, u: SessionUser, companyId: string, other: string) {
    if (other === companyId) throw domainError('SOCIETE_IDENTIQUE', 'Choisissez une autre société du groupe.');
    if (u.companyIds.length > 0 && !u.companyIds.includes(other)) throw domainError('SOCIETE_NON_AUTORISEE', 'Vous n’avez pas accès à la société liée.');
    const c = await tx.company.findUnique({ where: { id: other } });
    if (!c) throw domainError('SOCIETE_INCONNUE', 'Société liée introuvable.');
    return c;
  }

  /** Tiers « société du groupe » (client 4112 ou fournisseur 4012) dans `companyId`, représentant `other`. */
  static async groupParty(tx: Tx, tenantId: string, companyId: string, other: { id: string; name: string; taxId?: string | null }, type: 'CLIENT' | 'FOURNISSEUR') {
    const code = `GRP-${type === 'CLIENT' ? 'C' : 'F'}-${other.id.slice(0, 8)}`;
    const found = await tx.thirdParty.findUnique({ where: { companyId_code: { companyId, code } } });
    // NIF de la société du groupe repris (obligatoire sur la facture normalisée d'une personne morale)
    if (found) return tx.thirdParty.update({ where: { id: found.id }, data: { groupCompanyId: other.id, taxId: other.taxId ?? found.taxId } });
    return tx.thirdParty.create({ data: { tenantId, companyId, type, code, name: `${other.name} (groupe)`, account: type === 'CLIENT' ? '411200' : '401200', groupCompanyId: other.id, taxId: other.taxId ?? null } });
  }

  /** Relie deux sociétés du groupe : chacune devient client et fournisseur de l'autre. */
  @Post('group-links')
  @Roles(...ACCOUNTING_WRITE, 'ADMIN')
  link(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ sisterCompanyId: z.string().uuid() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const other = await this.sister(tx, u, companyId, b.sisterCompanyId);
      const me = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const parties = [];
      for (const [cid, o] of [[companyId, other], [other.id, me]] as const) {
        for (const t of ['CLIENT', 'FOURNISSEUR'] as const) parties.push(await IntercompanyController.groupParty(tx, u.tenantId, cid, o, t));
      }
      await this.audit.log(tx, u.tenantId, u.userId, 'LIEN_GROUPE', `company:${companyId}`, { sister: other.id });
      return { parties };
    });
  }

  @Get('intercompany-invoices')
  list(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const [incoming, outgoing] = await Promise.all([
        tx.intercompanyInvoice.findMany({ where: { buyerCompanyId: companyId }, orderBy: { createdAt: 'desc' } }),
        tx.intercompanyInvoice.findMany({ where: { sellerCompanyId: companyId }, orderBy: { createdAt: 'desc' } }),
      ]);
      const names = new Map((await tx.company.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
      const view = (x: (typeof incoming)[number]) => ({ ...x, sellerName: names.get(x.sellerCompanyId) ?? '', buyerName: names.get(x.buyerCompanyId) ?? '' });
      return { incoming: incoming.map(view), outgoing: outgoing.map(view) };
    });
  }

  private async pending(tx: Tx, companyId: string, id: string) {
    const inv = await tx.intercompanyInvoice.findFirst({ where: { id, buyerCompanyId: companyId } });
    if (!inv) throw domainError('FACTURE_INCONNUE', 'Facture intragroupe introuvable.');
    if (inv.status !== 'EN_ATTENTE') throw domainError('DEJA_TRAITEE', `Facture déjà ${inv.status === 'ANNULEE' ? 'annulée par l’émetteur' : 'traitée'}.`);
    return inv;
  }

  /**
   * Acceptation : compte de charge, de stock ou d'immobilisation par ligne (et article / dépôt pour une entrée en
   * stock), TVA déductible au compte choisi ; écriture d'achat en brouillon référencée `IG-<vendeur>-<numéro>`.
   */
  @Post('intercompany-invoices/:id/accept')
  @Roles(...ACCOUNTING_WRITE)
  accept(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({
      date: zDate.optional(),
      vatAccount: zAccount.default('445200'),
      lines: z.array(z.object({ account: zAccount, itemId: z.string().uuid().optional(), warehouseId: z.string().uuid().optional(), usefulLifeYears: z.number().int().min(1).max(100).optional() })).optional(),
    }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const inv = await this.pending(tx, companyId, id);
      const seller = await tx.company.findUniqueOrThrow({ where: { id: inv.sellerCompanyId } });
      const lines = inv.lines as unknown as IcLine[];
      if (b.lines && b.lines.length !== lines.length) throw domainError('LIGNES', 'Indiquez un compte pour chaque ligne de la facture.');
      const choice = lines.map((l, i) => b.lines?.[i] ?? { account: l.account.startsWith('701') ? '601100' : '632800' });
      // Immobilisation : la durée d'utilité sert à amortir la marge interne en consolidation
      const missing = choice.findIndex((c) => c.account.startsWith('2') && !('usefulLifeYears' in c && c.usefulLifeYears));
      if (missing >= 0) throw domainError('DUREE_UTILITE_REQUISE', `Ligne ${missing + 1} immobilisée : indiquez la durée d’utilité (années).`);
      const supplier = await IntercompanyController.groupParty(tx, u.tenantId, companyId, seller, 'FOURNISSEUR');
      const date = b.date ?? inv.date;
      const byAccount = new Map<string, bigint>();
      lines.forEach((l, i) => byAccount.set(choice[i]!.account, (byAccount.get(choice[i]!.account) ?? 0n) + BigInt(l.net)));
      const entry = await this.entries.createDraft(tx, u, companyId, {
        journalCode: 'ACH', date, pieceRef: `IG-${seller.id.slice(0, 8)}-${inv.number}`.slice(0, 40), label: `Facture intragroupe ${inv.number} — ${seller.name}`,
        lines: [
          ...[...byAccount.entries()].map(([account, v]) => ({ account, debit: v, credit: 0n })),
          ...(inv.totalVat > 0n ? [{ account: b.vatAccount, debit: inv.totalVat, credit: 0n }] : []),
          { account: '401200', thirdPartyId: supplier.id, debit: 0n, credit: inv.totalGross },
        ],
      }, 'INTRAGROUPE');
      for (const [i, c] of choice.entries()) {
        if (!('itemId' in c) || !c.itemId) continue;
        if (!c.warehouseId) throw domainError('DEPOT_REQUIS', 'Dépôt requis pour une entrée en stock.');
        const qtyMilli = BigInt(Math.round(lines[i]!.quantity * 1000));
        await this.stock.move(tx, u, companyId, { itemId: c.itemId, warehouseId: c.warehouseId, date, type: 'ENTREE', qtyMilli, unitCost: (BigInt(lines[i]!.net) * 1000n) / qtyMilli, reference: `IG-${inv.number}` });
      }
      const updated = await tx.intercompanyInvoice.update({ where: { id }, data: { status: 'ACCEPTEE', decision: { lines: choice, vatAccount: b.vatAccount, date } as never, buyerEntryId: entry.id, decidedBy: u.userId, decidedAt: new Date() } });
      await this.audit.log(tx, u.tenantId, u.userId, 'FACTURE_INTRAGROUPE_ACCEPTEE', `intercompany_invoice:${id}`, { number: inv.number });
      return { invoice: updated, entry };
    });
  }

  @Post('intercompany-invoices/:id/reject')
  @Roles(...ACCOUNTING_WRITE)
  reject(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ reason: z.string().min(5).max(500) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      await this.pending(tx, companyId, id);
      const updated = await tx.intercompanyInvoice.update({ where: { id }, data: { status: 'REJETEE', reason: b.reason, decidedBy: u.userId, decidedAt: new Date() } });
      await this.audit.log(tx, u.tenantId, u.userId, 'FACTURE_INTRAGROUPE_REJETEE', `intercompany_invoice:${id}`, { reason: b.reason });
      return { invoice: updated, message: 'Facture refusée : l’émetteur en est informé et doit l’annuler par un avoir.' };
    });
  }
}
