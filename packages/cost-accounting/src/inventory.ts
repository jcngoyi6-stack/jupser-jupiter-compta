/**
 * Comptes d'inventaire permanent (CAGE). Méthodes admises par le SYSCOHADA révisé : coût moyen pondéré
 * (en fin de période ou après chaque entrée) et premier entré, premier sorti. Le DEPS (LIFO) n'est pas admis.
 */
export type ValuationMethod = 'CMUP_PERIODE' | 'CMUP_ENTREE' | 'PEPS';

export interface StockMovement { date?: string; label?: string; kind: 'ENTREE' | 'SORTIE'; quantity: number; unitCost?: number }

export interface InventoryAccount {
  method: ValuationMethod;
  opening: { quantity: number; value: number };
  entries: { quantity: number; value: number };
  outputs: { quantity: number; value: number; unitCost: number | null };
  closing: { quantity: number; value: number };
  /** Coût moyen pondéré de la période (méthode CMUP_PERIODE). */
  averageCost: number | null;
  lines: { label: string; kind: string; quantity: number; unitCost: number; value: number; stockQty: number; stockValue: number }[];
  /** Écart entre stock réel inventorié et stock théorique, valorisé au coût de sortie. */
  inventoryDifference: { quantity: number; value: number } | null;
}

export function inventoryAccount(method: ValuationMethod, opening: { quantity: number; value: number }, moves: StockMovement[], physicalQty?: number): InventoryAccount {
  if ((method as string) === 'DEPS' || (method as string) === 'LIFO') throw new Error('METHODE_NON_ADMISE');
  const lines: InventoryAccount['lines'] = [];
  let qty = opening.quantity;
  let val = opening.value;
  let layers: { q: number; c: number }[] = opening.quantity > 0 ? [{ q: opening.quantity, c: opening.value / opening.quantity }] : [];
  const ins = moves.filter((m) => m.kind === 'ENTREE');
  const inQty = ins.reduce((s, m) => s + m.quantity, 0);
  const inVal = ins.reduce((s, m) => s + m.quantity * (m.unitCost ?? 0), 0);
  const periodAvg = opening.quantity + inQty > 0 ? (opening.value + inVal) / (opening.quantity + inQty) : null;
  let outQty = 0;
  let outVal = 0;
  for (const m of moves) {
    if (m.kind === 'ENTREE') {
      const c = m.unitCost ?? 0;
      qty += m.quantity;
      val += m.quantity * c;
      layers.push({ q: m.quantity, c });
      lines.push({ label: m.label ?? 'Entrée', kind: 'ENTREE', quantity: m.quantity, unitCost: c, value: m.quantity * c, stockQty: qty, stockValue: val });
      continue;
    }
    if (m.quantity > qty + 1e-9) throw new Error('STOCK_INSUFFISANT');
    let cost: number;
    if (method === 'PEPS') {
      let rest = m.quantity;
      cost = 0;
      const next: typeof layers = [];
      for (const l of layers) {
        const take = Math.min(rest, l.q);
        cost += take * l.c;
        rest -= take;
        if (l.q - take > 1e-9) next.push({ q: l.q - take, c: l.c });
      }
      layers = next;
    } else {
      const avg = method === 'CMUP_PERIODE' ? (periodAvg ?? 0) : qty > 0 ? val / qty : 0;
      cost = m.quantity * avg;
    }
    qty -= m.quantity;
    val -= cost;
    outQty += m.quantity;
    outVal += cost;
    lines.push({ label: m.label ?? 'Sortie', kind: 'SORTIE', quantity: m.quantity, unitCost: m.quantity ? cost / m.quantity : 0, value: cost, stockQty: qty, stockValue: val });
  }
  let inventoryDifference: InventoryAccount['inventoryDifference'] = null;
  if (physicalQty !== undefined) {
    const dq = physicalQty - qty;
    const unit = qty > 0 ? val / qty : (periodAvg ?? 0);
    inventoryDifference = { quantity: dq, value: dq * unit };
    qty = physicalQty;
    val += dq * unit;
  }
  return {
    method, opening, entries: { quantity: inQty, value: inVal }, outputs: { quantity: outQty, value: outVal, unitCost: outQty ? outVal / outQty : null },
    closing: { quantity: qty, value: val }, averageCost: method === 'CMUP_PERIODE' ? periodAvg : null, lines, inventoryDifference,
  };
}
