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
  buyerAccount?: string; buyerStockAccount?: string | null;
  /** Quantité restant en stock chez l'acheteur à la clôture (et à l'ouverture, pour une facture d'un exercice antérieur). */
  remainingQuantity?: number; openingRemainingQuantity?: number;
  /** Date de la facture (mise en service pour une immobilisation) ; absente : facture de l'exercice. */
  invoiceDate?: string;
  /** Immobilisation chez l'acheteur : durée d'utilité retenue pour l'amortissement de la marge. */
  usefulLifeYears?: number; depreciationAccount?: string;
}

/** Jours au prorata (convention 30/360) entre deux dates incluses. */
export function days360(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  return Math.max(0, (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30)) + 1);
}

/** Compte de consolidation des impôts différés (hors plan des comptes personnels) : solde débiteur actif, créditeur passif. */
export const DEFERRED_TAX_ASSET = 'IDA';
export const DEFERRED_TAX_LIABILITY = 'IDP';

const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Retraitements de consolidation des factures intragroupe acceptées, rattachés au vendeur.
 * - Factures de l'exercice : élimination du chiffre d'affaires du vendeur (l'achat de l'acheteur est éliminé avec les
 *   produits et charges réciproques).
 * - Stocks : marge interne (prix − coût) au prorata des quantités restant chez l'acheteur. Marge du stock d'ouverture
 *   (factures antérieures) imputée sur les réserves et reprise en résultat (603) ; marge du stock de clôture déduite du
 *   résultat et du stock.
 * - Immobilisations : marge éliminée de la valeur brute ; amortissements correspondants (durée d'utilité, prorata
 *   30/360 depuis la date de la facture) : cumul antérieur en réserves, dotation de l'exercice extournée (681).
 * - Impôt différé actif sur la marge restant au bilan à la clôture, au taux fourni.
 */
export function intercompanyEliminations(p: { lines: IntercompanyInvoiceLine[]; taxRate?: number; period?: { start: string; end: string } }): OpResult {
  const lines: ReturnType<typeof D>[] = [];
  let revenue = 0n;
  let closingStockMargin = 0n;
  let openingStockMargin = 0n;
  let assetMargin = 0n;
  let depreciationReversed = 0n;
  let reservesImpact = 0n;
  const RESERVES = '118800';
  for (const l of p.lines) {
    const current = !p.period || !l.invoiceDate || l.invoiceDate >= p.period.start;
    if (p.period && l.invoiceDate && l.invoiceDate > p.period.end) continue;
    if (current) { revenue += l.net; lines.push(D(l.sellerAccount, l.net), C('411200', l.net)); }
    if (l.cost === undefined || l.cost === null) continue;
    const unitMargin = l.net - l.cost;
    if (unitMargin <= 0n) continue; // une perte interne traduit en général une dépréciation : non éliminée
    if (l.buyerAccount?.startsWith('2')) {
      const asset = l.buyerAccount;
      const amort = l.depreciationAccount ?? `28${asset.slice(1, 3)}00`;
      const life = l.usefulLifeYears ?? 0;
      const depTo = (date: string) => (life > 0 && l.invoiceDate && p.period
        ? BigInt(Math.round(Number(unitMargin) * Math.min(1, days360(l.invoiceDate, date) / (life * 360)))) : 0n);
      const prior = current || !p.period ? 0n : depTo(dayBefore(p.period.start));
      const cumulative = p.period ? depTo(p.period.end) : 0n;
      assetMargin += unitMargin - cumulative;
      if (current) lines.push(D(l.sellerAccount, unitMargin), C(asset, unitMargin));
      else {
        reservesImpact += unitMargin - prior;
        lines.push(D(RESERVES, unitMargin - prior), D(amort, prior), C(asset, unitMargin));
      }
      const annual = cumulative - prior;
      if (annual > 0n) { depreciationReversed += annual; lines.push(D(amort, annual), C('681300', annual)); }
      continue;
    }
    const share = (q?: number) => BigInt(Math.round(Number(unitMargin) * Math.min(1, Math.max(0, (q ?? 0) / l.quantity))));
    const stockAccount = l.buyerStockAccount ?? '311100';
    if (!current) {
      const opening = share(l.openingRemainingQuantity);
      if (opening > 0n) { openingStockMargin += opening; reservesImpact += opening; lines.push(D(RESERVES, opening), C('603100', opening)); }
    }
    const closing = share(l.remainingQuantity);
    if (closing > 0n) { closingStockMargin += closing; lines.push(D('603100', closing), C(stockAccount, closing)); }
  }
  const remainingMargin = closingStockMargin + assetMargin;
  const deferredTax = pct(remainingMargin, p.taxRate ?? 0);
  // Impôt différé actif : solde de clôture au bilan consolidé (compte de consolidation IDA), part d'ouverture en
  // réserves, variation de l'exercice en charge d'impôt (891)
  const openingDeferredTax = pct(reservesImpact, p.taxRate ?? 0);
  const taxVariation = deferredTax - openingDeferredTax;
  if (deferredTax > 0n) lines.push(D(DEFERRED_TAX_ASSET, deferredTax));
  if (openingDeferredTax > 0n) lines.push(C(RESERVES, openingDeferredTax));
  if (taxVariation !== 0n) lines.push(C('891100', taxVariation));
  const resultEffect = openingStockMargin - closingStockMargin + depreciationReversed
    - assetMarginCurrent(p);
  return {
    entries: lines.length ? [entry('Retraitements intragroupe', lines)] : [],
    values: {
      revenueEliminated: revenue, unrealisedMargin: remainingMargin, closingStockMargin, openingStockMargin, assetMargin,
      depreciationReversed, reservesImpact: -reservesImpact, resultEffectBeforeTax: resultEffect, deferredTaxAsset: deferredTax,
      openingDeferredTax, taxVariation, resultEffectAfterTax: resultEffect + taxVariation,
    },
    notes: remainingMargin ? ['Impôt différé actif sur la marge interne restant au bilan : présenté au bilan consolidé (ligne « Impôts différés »).'] : [],
  };
}

/** Marge sur immobilisations cédées dans l'exercice (déduite du résultat de l'exercice). */
function assetMarginCurrent(p: { lines: IntercompanyInvoiceLine[]; period?: { start: string; end: string } }): bigint {
  return p.lines.filter((l) => l.buyerAccount?.startsWith('2') && l.cost != null && l.net > l.cost
    && (!p.period || !l.invoiceDate || (l.invoiceDate >= p.period.start && l.invoiceDate <= p.period.end)))
    .reduce((s, l) => s + (l.net - l.cost!), 0n);
}
