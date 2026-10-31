/**
 * Opérations intragroupe : une opération saisie une fois par la société émettrice produit ses écritures et les
 * écritures miroirs de la société réceptrice, sur les comptes « groupe » (4112 / 4012, 2771 / 1811) que la
 * consolidation élimine. Le taux de TVA est un paramètre (pack fiscal du pays).
 */
import { C, D, entry, pct, type OpResult } from './core';

export const INTERCOMPANY_KINDS = ['PRESTATION', 'VENTE_MARCHANDISES', 'PRET', 'REMBOURSEMENT_PRET', 'INTERETS', 'DIVIDENDE', 'REGLEMENT'] as const;
export type IntercompanyKind = (typeof INTERCOMPANY_KINDS)[number];

/** Comptes groupe éliminés en consolidation (en plus des comptes de liaison 181, 185 à 188 et 463). */
export const INTERCOMPANY_ACCOUNT_PREFIXES = ['4112', '4012', '2771', '1811'];

/**
 * `entries` : écritures de la société émettrice (celle qui facture, prête, distribue ou encaisse) ;
 * `counterpartEntries` : écritures miroirs de la société réceptrice.
 */
export function intercompanyOperation(p: {
  kind: IntercompanyKind; amount: bigint; date: string; label?: string; vatRate?: number;
  revenueAccount?: string; expenseAccount?: string;
}): OpResult {
  const a = p.amount;
  const vat = pct(a, p.vatRate ?? 0);
  const label = p.label ?? p.kind;
  const make = (issuer: ReturnType<typeof D>[], receiver: ReturnType<typeof D>[]): OpResult => ({
    entries: [entry(label, issuer, p.date)], counterpartEntries: [entry(label, receiver, p.date)],
  });
  switch (p.kind) {
    case 'PRESTATION':
      return make([D('411200', a + vat), C(p.revenueAccount ?? '706100', a), C('443100', vat)], [D(p.expenseAccount ?? '632800', a), D('445200', vat), C('401200', a + vat)]);
    case 'VENTE_MARCHANDISES':
      return make([D('411200', a + vat), C(p.revenueAccount ?? '701100', a), C('443100', vat)], [D(p.expenseAccount ?? '601100', a), D('445200', vat), C('401200', a + vat)]);
    case 'PRET':
      return make([D('277100', a), C('521100', a)], [D('521100', a), C('181100', a)]);
    case 'REMBOURSEMENT_PRET':
      return make([D('521100', a), C('277100', a)], [D('181100', a), C('521100', a)]);
    case 'INTERETS':
      return make([D('277100', a), C('771200', a)], [D('671300', a), C('181100', a)]);
    case 'DIVIDENDE':
      return make([D('465000', a), C('521100', a)], [D('521100', a), C('772100', a)]);
    case 'REGLEMENT':
      return make([D('521100', a), C('411200', a)], [D('401200', a), C('521100', a)]);
  }
}

export interface IntercompanyInvoiceLine {
  net: bigint; quantity: number; cost?: bigint | null; sellerAccount: string;
  buyerAccount?: string; buyerStockAccount?: string | null; remainingQuantity?: number;
}

/**
 * Retraitements de consolidation d'une facture intragroupe acceptée.
 * - Élimination du chiffre d'affaires chez le vendeur (l'achat de l'acheteur, saisi en écriture intragroupe, est
 *   éliminé avec les produits et charges réciproques).
 * - Marge interne non réalisée : (prix − coût) × quantité restant en stock chez l'acheteur, ou totalité si le bien a
 *   été immobilisé ; elle minore le résultat du vendeur (part des minoritaires du vendeur comprise) et la valeur du stock
 *   ou de l'immobilisation ; l'impôt différé actif correspondant est calculé au taux fourni.
 * Les lignes produites sont équilibrées et rattachées au vendeur.
 */
export function intercompanyEliminations(p: { lines: IntercompanyInvoiceLine[]; taxRate?: number }): OpResult {
  const lines: ReturnType<typeof D>[] = [];
  let revenue = 0n;
  let margin = 0n;
  for (const l of p.lines) {
    revenue += l.net;
    lines.push(D(l.sellerAccount, l.net), C('411200', l.net));
    if (l.cost === undefined || l.cost === null) continue;
    const unitMargin = l.net - l.cost;
    if (unitMargin <= 0n) continue; // une perte interne traduit en général une dépréciation : non éliminée
    const asset = l.buyerAccount?.startsWith('2');
    const ratio = asset ? 1 : Math.min(1, Math.max(0, (l.remainingQuantity ?? 0) / l.quantity));
    const m = BigInt(Math.round(Number(unitMargin) * ratio));
    if (m === 0n) continue;
    margin += m;
    lines.push(asset ? D(l.sellerAccount, m) : D('603100', m), C(asset ? l.buyerAccount! : l.buyerStockAccount ?? '311100', m));
  }
  const deferredTax = pct(margin, p.taxRate ?? 0);
  return {
    entries: lines.length ? [entry('Retraitements intragroupe', lines)] : [],
    values: { revenueEliminated: revenue, unrealisedMargin: margin, deferredTaxAsset: deferredTax, netEffectOnResult: -(margin - deferredTax) },
    notes: margin ? ['Impôt différé actif sur la marge interne éliminée : à présenter au bilan consolidé (impôts différés).'] : [],
  };
}
