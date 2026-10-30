import { divRound } from '@jupiter/ledger';

/**
 * Stocks : quantités en milli-unités (bigint), coûts en unités mineures. Méthodes CMUP (coût moyen
 * unitaire pondéré après chaque entrée) et FIFO (premier entré, premier sorti).
 */
export interface Move {
  date: string;
  qtyMilli: bigint; // + entrée, – sortie
  unitCost?: bigint; // obligatoire pour une entrée
  ref?: string;
}

export interface Valuation {
  qtyMilli: bigint;
  value: bigint;
  unitCost: bigint; // CMUP courant
  layers: { qtyMilli: bigint; unitCost: bigint }[];
}

export const MILLI = 1000n;

/** Valeur d'une quantité au coût unitaire : qté(milli) × coût / 1000, arrondi. */
export function valueOf(qtyMilli: bigint, unitCost: bigint): bigint {
  return divRound(qtyMilli * unitCost, MILLI);
}

export function emptyValuation(): Valuation {
  return { qtyMilli: 0n, value: 0n, unitCost: 0n, layers: [] };
}

/** Applique un mouvement ; renvoie la nouvelle valorisation et le coût de la sortie éventuelle. */
export function applyMove(v: Valuation, m: Move, method: 'CMUP' | 'FIFO'): { valuation: Valuation; cost: bigint } {
  if (m.qtyMilli === 0n) return { valuation: v, cost: 0n };
  if (m.qtyMilli > 0n) {
    if (m.unitCost === undefined) throw new Error('Coût unitaire requis pour une entrée en stock.');
    const value = v.value + valueOf(m.qtyMilli, m.unitCost);
    const qty = v.qtyMilli + m.qtyMilli;
    return {
      valuation: { qtyMilli: qty, value, unitCost: qty > 0n ? divRound(value * MILLI, qty) : 0n, layers: [...v.layers, { qtyMilli: m.qtyMilli, unitCost: m.unitCost }] },
      cost: valueOf(m.qtyMilli, m.unitCost),
    };
  }
  const out = -m.qtyMilli;
  if (out > v.qtyMilli) throw new Error(`Stock insuffisant : disponible ${v.qtyMilli / MILLI}, demandé ${out / MILLI}.`);
  let cost: bigint;
  let layers = v.layers.map((l) => ({ ...l }));
  if (method === 'CMUP') {
    // Sortie au prorata de la valeur du stock (et non coût unitaire arrondi × quantité) : pas de dérive
    // d'arrondi sur les grandes quantités (guide d'application, application 101).
    cost = out === v.qtyMilli ? v.value : divRound(v.value * out, v.qtyMilli);
    // les couches ne servent qu'au FIFO ; on les consomme quand même pour rester cohérent
    let rest = out;
    for (const l of layers) {
      const take = l.qtyMilli < rest ? l.qtyMilli : rest;
      l.qtyMilli -= take;
      rest -= take;
    }
  } else {
    cost = 0n;
    let rest = out;
    for (const l of layers) {
      if (rest === 0n) break;
      const take = l.qtyMilli < rest ? l.qtyMilli : rest;
      cost += valueOf(take, l.unitCost);
      l.qtyMilli -= take;
      rest -= take;
    }
  }
  layers = layers.filter((l) => l.qtyMilli > 0n);
  const qty = v.qtyMilli - out;
  const value = qty === 0n ? 0n : v.value - cost;
  return { valuation: { qtyMilli: qty, value, unitCost: qty > 0n ? divRound(value * MILLI, qty) : 0n, layers }, cost };
}

export function valuate(moves: Move[], method: 'CMUP' | 'FIFO') {
  let v = emptyValuation();
  const costs: bigint[] = [];
  for (const m of [...moves].sort((a, b) => a.date.localeCompare(b.date))) {
    const r = applyMove(v, m, method);
    v = r.valuation;
    costs.push(r.cost);
  }
  return { valuation: v, costs };
}

/** Écart d'inventaire physique : quantité comptée – quantité théorique, valorisé au coût courant. */
export function inventoryVariance(v: Valuation, countedMilli: bigint) {
  const diff = countedMilli - v.qtyMilli;
  return { diffMilli: diff, value: valueOf(diff, v.unitCost) };
}

/** Comptes SYSCOHADA par nature d'article (inventaire permanent), modifiables article par article. */
export const ITEM_ACCOUNTS: Record<string, { stock: string; purchase: string; variation: string; sales: string }> = {
  MARCHANDISE: { stock: '311100', purchase: '601100', variation: '603100', sales: '701100' },
  MATIERE: { stock: '321000', purchase: '602100', variation: '603200', sales: '701100' },
  FOURNITURE: { stock: '331000', purchase: '604100', variation: '603300', sales: '701100' },
  SEMI_FINI: { stock: '371100', purchase: '602100', variation: '736000', sales: '702100' },
  PRODUIT_FINI: { stock: '361000', purchase: '602100', variation: '736000', sales: '702100' },
};
