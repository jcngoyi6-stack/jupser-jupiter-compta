import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { decimalsOf } from '@jupiter/ledger';
import { costSheet, inventoryVariance, ITEM_ACCOUNTS, netRequirements, explode } from '@jupiter/operations';
import { applyRate } from '@jupiter/tax-engine';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError, parse, zAccount, zAmount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { loadRules } from '../tax/tax.controller';
import { StockService } from './stock.service';

const zQty = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Quantité : 3 décimales maximum' });
    return z.NEVER;
  }
  const [i, f = ''] = s.split('.');
  return BigInt(i! + f.padEnd(3, '0'));
});

async function dec(tx: Tx, companyId: string) {
  return decimalsOf((await tx.company.findUniqueOrThrow({ where: { id: companyId } })).currency);
}

const STOCK_ROLES = ['CHEF_COMPTABLE', 'COMPTABLE', 'COMMERCIAL', 'CAISSIER', 'DIRECTION'] as const;

@ApiTags('Stocks, achats, production')
@Controller('companies/:companyId')
export class StockController {
  constructor(
    private readonly db: PrismaService,
    private readonly stock: StockService,
    private readonly entries: EntriesService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Articles et dépôts ----------
  @RequiresModule('STOCKS')
  @Get('stock/items')
  items(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const items = await tx.stockItem.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
      return Promise.all(items.map(async (i) => {
        const v = await this.stock.valuation(tx, i.id);
        return { ...i, qtyMilli: v.qtyMilli, value: v.value, unitCost: v.unitCost, belowReorder: v.qtyMilli <= i.reorderLevel };
      }));
    });
  }

  @RequiresModule('STOCKS')
  @Roles(...STOCK_ROLES)
  @Post('stock/items')
  createItem(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(z.object({ code: z.string().min(1), label: z.string().min(2), unit: z.string().default('u'), kind: z.enum(['MARCHANDISE', 'MATIERE', 'FOURNITURE', 'SEMI_FINI', 'PRODUIT_FINI']), method: z.enum(['CMUP', 'FIFO']).optional(), salePrice: zAmount(await dec(tx, companyId)).default('0'), reorderLevel: zQty.default('0'), stockAccount: zAccount.optional(), variationAccount: zAccount.optional(), purchaseAccount: zAccount.optional(), salesAccount: zAccount.optional() }), body);
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const acc = ITEM_ACCOUNTS[b.kind]!;
      const method = b.method ?? ((company.methods as { stocks?: string }).stocks as 'CMUP' | 'FIFO') ?? 'CMUP';
      return tx.stockItem.create({ data: { tenantId: u.tenantId, companyId, code: b.code, label: b.label, unit: b.unit, kind: b.kind, method, stockAccount: b.stockAccount ?? acc.stock, purchaseAccount: b.purchaseAccount ?? acc.purchase, salesAccount: b.salesAccount ?? acc.sales, variationAccount: b.variationAccount ?? acc.variation, salePrice: b.salePrice, reorderLevel: b.reorderLevel } });
    });
  }

  @RequiresModule('STOCKS')
  @Get('stock/warehouses')
  warehouses(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const w = await tx.warehouse.findMany({ where: { companyId } });
      if (w.length) return w;
      return [await tx.warehouse.create({ data: { tenantId: u.tenantId, companyId, code: 'PRINCIPAL', label: 'Dépôt principal' } })];
    });
  }

  @RequiresModule('STOCKS')
  @Roles(...STOCK_ROLES)
  @Post('stock/warehouses')
  createWarehouse(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ code: z.string().min(1), label: z.string().min(2) }), body);
    return this.db.forTenant(u.tenantId, (tx) => tx.warehouse.create({ data: { ...b, tenantId: u.tenantId, companyId } }));
  }

  @RequiresModule('STOCKS')
  @Get('stock/items/:itemId/moves')
  moves(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('itemId') itemId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.stockMove.findMany({ where: { companyId, itemId }, orderBy: { date: 'asc' } }));
  }

  /** Bons d'entrée, de sortie et de transfert. */
  @RequiresModule('STOCKS')
  @Roles(...STOCK_ROLES)
  @Post('stock/moves')
  move(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(z.object({ type: z.enum(['ENTREE', 'SORTIE', 'TRANSFERT']), itemId: z.string().uuid(), warehouseId: z.string().uuid(), toWarehouseId: z.string().uuid().optional(), date: zDate, qty: zQty, unitCost: zAmount(await dec(tx, companyId)).optional(), reference: z.string().min(1), lot: z.string().optional(), expiry: zDate.optional(), counterpart: zAccount.optional() }), body);
      if (b.type === 'ENTREE') {
        if (b.unitCost === undefined) throw domainError('COUT_REQUIS', "Coût unitaire requis pour un bon d'entrée.");
        return this.stock.move(tx, u, companyId, { ...b, qtyMilli: b.qty, unitCost: b.unitCost }, true, b.counterpart);
      }
      if (b.type === 'SORTIE') return this.stock.move(tx, u, companyId, { ...b, qtyMilli: -b.qty }, true, b.counterpart);
      if (!b.toWarehouseId) throw domainError('DEPOT_DESTINATION', 'Dépôt de destination requis.');
      const out = await this.stock.move(tx, u, companyId, { ...b, type: 'TRANSFERT_SORTIE', qtyMilli: -b.qty }, false);
      const inn = await this.stock.move(tx, u, companyId, { ...b, type: 'TRANSFERT_ENTREE', warehouseId: b.toWarehouseId, qtyMilli: b.qty, unitCost: out.unitCost }, false);
      return { out, in: inn };
    });
  }

  /** Inventaire physique : écart comptabilisé (entrée ou sortie au coût courant). */
  @RequiresModule('STOCKS')
  @Roles('CHEF_COMPTABLE', 'COMPTABLE')
  @Post('stock/inventory')
  inventory(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ date: zDate, warehouseId: z.string().uuid(), counts: z.array(z.object({ itemId: z.string().uuid(), counted: zQty })) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const out = [];
      for (const c of b.counts) {
        const qty = await this.stock.warehouseQty(tx, c.itemId, b.warehouseId);
        const v = await this.stock.valuation(tx, c.itemId);
        const diff = c.counted - qty;
        if (diff === 0n) continue;
        const variance = inventoryVariance({ ...v, qtyMilli: qty }, c.counted);
        out.push({ itemId: c.itemId, ...variance, move: await this.stock.move(tx, u, companyId, { itemId: c.itemId, warehouseId: b.warehouseId, date: b.date, type: 'INVENTAIRE', qtyMilli: diff, unitCost: v.unitCost || 1n, reference: `INV-${b.date}` }) });
      }
      await this.audit.log(tx, u.tenantId, u.userId, 'INVENTAIRE', `company:${companyId}`, { lines: out.length });
      return out;
    });
  }

  // ---------- Achats ----------
  @RequiresModule('STOCKS')
  @Get('purchases')
  purchases(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.purchaseOrder.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }));
  }

  @RequiresModule('STOCKS')
  @Roles(...STOCK_ROLES)
  @Post('purchases')
  createPo(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({ supplierId: z.string().uuid(), date: zDate, expenseAccount: zAccount.default('601100'), analytic: z.string().optional(), lines: z.array(z.object({ itemId: z.string().uuid().optional(), description: z.string().min(1), qty: zQty, unitPrice: zAmount(d), vat: z.enum(['NORMAL', 'REDUIT', 'EXONERE']).default('NORMAL') })).min(1) }), body);
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const rules = await loadRules(tx);
      const lines = b.lines.map((l) => {
        const net = (l.unitPrice * l.qty + 500n) / 1000n;
        const rate = l.vat === 'EXONERE' ? '0' : (rules.tryFind<string | null>(company.country, 'TVA', l.vat === 'NORMAL' ? 'taux_normal' : 'taux_reduit', b.date)?.value ?? '0');
        return { ...l, qty: l.qty.toString(), unitPrice: l.unitPrice.toString(), net: net.toString(), vat: applyRate(net, rate).toString(), vatKind: l.vat };
      });
      const count = await tx.purchaseOrder.count({ where: { companyId } });
      return tx.purchaseOrder.create({
        data: {
          tenantId: u.tenantId, companyId, number: `BC-${b.date.slice(0, 4)}-${String(count + 1).padStart(5, '0')}`, supplierId: b.supplierId, date: b.date, lines,
          totalNet: lines.reduce((s, l) => s + BigInt(l.net), 0n), totalVat: lines.reduce((s, l) => s + BigInt(l.vat), 0n), expenseAccount: b.expenseAccount, analytic: b.analytic, createdBy: u.userId, status: 'A_APPROUVER',
        },
      });
    });
  }

  /** Circuit de validation : bon de commande → direction/finance (séparation des tâches). */
  @RequiresModule('STOCKS')
  @Roles('DIRECTION', 'CHEF_COMPTABLE')
  @Post('purchases/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirstOrThrow({ where: { id, companyId } });
      if (po.status !== 'A_APPROUVER') throw domainError('STATUT', 'Bon de commande non soumis à approbation.');
      if (po.createdBy === u.userId) throw domainError('QUATRE_YEUX', "L'émetteur du bon de commande ne peut pas l'approuver.");
      const r = await tx.purchaseOrder.update({ where: { id }, data: { status: 'VALIDE', approvals: [...(po.approvals as object[]), { by: u.userId, at: new Date().toISOString() }] } });
      await this.audit.log(tx, u.tenantId, u.userId, 'BC_APPROUVE', `purchase_order:${id}`);
      return r;
    });
  }

  /** Réception : bons de réception, entrées en stock valorisées au prix d'achat. */
  @RequiresModule('STOCKS')
  @Roles(...STOCK_ROLES)
  @Post('purchases/:id/receive')
  @HttpCode(200)
  receive(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ date: zDate, warehouseId: z.string().uuid() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirstOrThrow({ where: { id, companyId } });
      if (po.status !== 'VALIDE') throw domainError('STATUT', 'Bon de commande non approuvé.');
      for (const l of po.lines as { itemId?: string; qty: string; unitPrice: string }[]) {
        if (!l.itemId) continue;
        await this.stock.move(tx, u, companyId, { itemId: l.itemId, warehouseId: b.warehouseId, date: b.date, type: 'ENTREE', qtyMilli: BigInt(l.qty), unitCost: BigInt(l.unitPrice), reference: `BR-${po.number}` });
      }
      return tx.purchaseOrder.update({ where: { id }, data: { status: 'RECU' } });
    });
  }

  /** Facture fournisseur rattachée au bon de commande : écriture d'achat (60x / 445x / 401). */
  @RequiresModule('STOCKS')
  @Roles('COMPTABLE', 'CHEF_COMPTABLE')
  @Post('purchases/:id/invoice')
  @HttpCode(200)
  invoicePo(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ date: zDate, supplierInvoiceNumber: z.string().min(1) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirstOrThrow({ where: { id, companyId } });
      if (!['VALIDE', 'RECU'].includes(po.status)) throw domainError('STATUT', 'Bon de commande non approuvé.');
      const supplier = await tx.thirdParty.findUniqueOrThrow({ where: { id: po.supplierId } });
      const lines = po.lines as { itemId?: string; net: string; vat: string }[];
      const byAcc = new Map<string, bigint>();
      for (const l of lines) {
        const item = l.itemId ? await tx.stockItem.findUnique({ where: { id: l.itemId } }) : null;
        const acc = item?.purchaseAccount ?? po.expenseAccount;
        byAcc.set(acc, (byAcc.get(acc) ?? 0n) + BigInt(l.net));
      }
      const d = await this.entries.createDraft(tx, u, companyId, {
        journalCode: 'ACH', date: b.date, pieceRef: b.supplierInvoiceNumber, label: `Facture ${b.supplierInvoiceNumber} — ${supplier.name} (${po.number})`,
        lines: [
          ...[...byAcc].map(([account, v]) => ({ account, debit: v, credit: 0n, analytic: po.analytic })),
          ...(po.totalVat > 0n ? [{ account: '445200', debit: po.totalVat, credit: 0n }] : []),
          { account: supplier.account, thirdPartyId: supplier.id, debit: 0n, credit: po.totalNet + po.totalVat },
        ],
      }, 'MANUEL');
      const v = await this.entries.validate(tx, u, companyId, d.id);
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'FACTURE' } });
      return v.entry;
    });
  }

  // ---------- Production ----------
  @RequiresModule('PRODUCTION')
  @Get('production/boms')
  boms(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.bom.findMany({ where: { companyId } }));
  }

  @RequiresModule('PRODUCTION')
  @Roles('CHEF_COMPTABLE', 'COMPTABLE', 'DIRECTION')
  @Post('production/boms')
  createBom(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await dec(tx, companyId);
      const b = parse(z.object({ productId: z.string().uuid(), components: z.array(z.object({ itemId: z.string().uuid(), qty: zQty })).min(1), routing: z.array(z.object({ poste: z.string(), minutes: z.number().min(0), hourlyRate: zAmount(d) })).default([]), overheadRate: z.string().regex(/^\d+(\.\d{1,6})?$/).default('0') }), body);
      return tx.bom.create({ data: { tenantId: u.tenantId, companyId, productId: b.productId, components: b.components.map((c) => ({ itemId: c.itemId, qtyMilli: c.qty.toString() })), routing: b.routing.map((r) => ({ ...r, hourlyRate: r.hourlyRate.toString() })), overheadRate: b.overheadRate } });
    });
  }

  /** Ordre de fabrication : consommation des matières (CMUP/FIFO), entrée du produit au coût de revient. */
  @RequiresModule('PRODUCTION')
  @Roles('CHEF_COMPTABLE', 'COMPTABLE', 'DIRECTION')
  @Post('production/work-orders')
  workOrder(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ bomId: z.string().uuid(), qty: zQty, date: zDate, warehouseId: z.string().uuid(), simulate: z.boolean().default(false) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const bom = await tx.bom.findFirstOrThrow({ where: { id: b.bomId, companyId } });
      const comps = (bom.components as { itemId: string; qtyMilli: string }[]).map((c) => ({ itemId: c.itemId, qtyMilli: BigInt(c.qtyMilli) }));
      const costs = new Map<string, bigint>();
      for (const c of comps) costs.set(c.itemId, (await this.stock.valuation(tx, c.itemId)).unitCost);
      const routing = (bom.routing as { poste: string; minutes: number; hourlyRate: string }[]).map((r) => ({ ...r, hourlyRate: BigInt(r.hourlyRate) }));
      const sheet = costSheet(comps, routing, b.qty, (id) => costs.get(id) ?? 0n, bom.overheadRate);
      const needs = netRequirements(explode(comps, b.qty), () => 0n);
      if (b.simulate) return { sheet, needs };
      const count = await tx.workOrder.count({ where: { companyId } });
      const number = `OF-${b.date.slice(0, 4)}-${String(count + 1).padStart(5, '0')}`;
      for (const n of needs) {
        const item = await tx.stockItem.findUniqueOrThrow({ where: { id: n.itemId } });
        await this.stock.move(tx, u, companyId, { itemId: n.itemId, warehouseId: b.warehouseId, date: b.date, type: 'CONSOMMATION', qtyMilli: -n.grossMilli, reference: number }, true, item.variationAccount);
      }
      const product = await tx.stockItem.findUniqueOrThrow({ where: { id: bom.productId } });
      await this.stock.move(tx, u, companyId, { itemId: product.id, warehouseId: b.warehouseId, date: b.date, type: 'PRODUCTION', qtyMilli: b.qty, unitCost: sheet.unitCost, reference: number }, true, product.variationAccount);
      return tx.workOrder.create({ data: { tenantId: u.tenantId, companyId, number, bomId: bom.id, qtyMilli: b.qty, date: b.date, status: 'TERMINE', costSheet: JSON.parse(JSON.stringify(sheet, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) } });
    });
  }

  @RequiresModule('PRODUCTION')
  @Get('production/work-orders')
  workOrders(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.workOrder.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }));
  }
}
