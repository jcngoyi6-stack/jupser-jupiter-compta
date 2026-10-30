import { Injectable } from '@nestjs/common';
import { applyMove, emptyValuation, valuate, valueOf, type Valuation } from '@jupiter/operations';
import type { SessionUser } from '../auth/decorators';
import { EntriesService } from '../accounting/entries.service';
import { domainError } from '../common/http';
import type { Tx } from '../common/prisma.service';

/** Stocks en inventaire permanent : chaque mouvement valorisé génère son écriture (31x/32x… ↔ 603x/73x). */
@Injectable()
export class StockService {
  constructor(private readonly entries: EntriesService) {}

  async valuation(tx: Tx, itemId: string): Promise<Valuation> {
    const item = await tx.stockItem.findUniqueOrThrow({ where: { id: itemId } });
    const moves = await tx.stockMove.findMany({ where: { itemId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    return valuate(moves.map((m) => ({ date: m.date, qtyMilli: m.qtyMilli, unitCost: m.qtyMilli > 0n ? m.unitCost : undefined })), item.method as 'CMUP' | 'FIFO').valuation;
  }

  async warehouseQty(tx: Tx, itemId: string, warehouseId: string) {
    const agg = await tx.stockMove.aggregate({ where: { itemId, warehouseId }, _sum: { qtyMilli: true } });
    return agg._sum.qtyMilli ?? 0n;
  }

  /**
   * Enregistre un mouvement. Entrée : coût fourni. Sortie : coût CMUP/FIFO calculé.
   * `post` : génère et valide l'écriture d'inventaire permanent.
   */
  async move(
    tx: Tx,
    u: SessionUser,
    companyId: string,
    m: { itemId: string; warehouseId: string; date: string; type: string; qtyMilli: bigint; unitCost?: bigint; reference: string; lot?: string; expiry?: string },
    post = true,
    counterpart?: string,
  ) {
    const item = await tx.stockItem.findFirst({ where: { id: m.itemId, companyId } });
    if (!item) throw domainError('ARTICLE_INCONNU', 'Article introuvable.');
    if (m.qtyMilli < 0n && (await this.warehouseQty(tx, m.itemId, m.warehouseId)) < -m.qtyMilli) {
      throw domainError('STOCK_INSUFFISANT', `Stock insuffisant pour ${item.label} dans ce dépôt.`);
    }
    const v = await this.valuation(tx, m.itemId);
    let cost: bigint;
    try {
      cost = applyMove(v, { date: m.date, qtyMilli: m.qtyMilli, unitCost: m.unitCost }, item.method as 'CMUP' | 'FIFO').cost;
    } catch (e) {
      throw domainError('STOCK', (e as Error).message);
    }
    const unitCost = m.qtyMilli > 0n ? m.unitCost! : (cost * 1000n) / -m.qtyMilli;
    let entryId: string | null = null;
    if (post && cost !== 0n && !m.type.startsWith('TRANSFERT')) {
      const contra = counterpart ?? item.variationAccount;
      const lines = m.qtyMilli > 0n
        ? [{ account: item.stockAccount, debit: cost, credit: 0n }, { account: contra, debit: 0n, credit: cost }]
        : [{ account: contra, debit: cost, credit: 0n }, { account: item.stockAccount, debit: 0n, credit: cost }];
      const d = await this.entries.createDraft(tx, u, companyId, { journalCode: 'OD', date: m.date, pieceRef: m.reference, label: `Stock ${m.type.toLowerCase()} — ${item.label}`, lines }, 'STOCK');
      entryId = (await this.entries.validate(tx, u, companyId, d.id)).entry.id;
    }
    return tx.stockMove.create({
      data: { tenantId: u.tenantId, companyId, itemId: m.itemId, warehouseId: m.warehouseId, date: m.date, type: m.type, qtyMilli: m.qtyMilli, unitCost, totalCost: m.qtyMilli > 0n ? cost : -cost, reference: m.reference, lot: m.lot, expiry: m.expiry, entryId },
    });
  }

  static value(q: bigint, c: bigint) {
    return valueOf(q, c);
  }

  static empty() {
    return emptyValuation();
  }
}
