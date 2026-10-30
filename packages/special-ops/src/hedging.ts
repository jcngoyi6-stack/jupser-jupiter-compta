/**
 * Position globale de change et couvertures (guide d'application, chapitre 22, applications 88 à 91 ;
 * AUDCIF art. 57 et 58). Cours exprimés en unités mineures de la monnaie de tenue de compte par unité de devise.
 */
import { C, D, entry, type OpEntry, type OpLine, type OpResult } from './core';

export interface FxItem {
  account: string; kind: 'CREANCE' | 'DETTE'; nature: 'EXPLOITATION' | 'FINANCIER'; foreign: number; historicalRate: number; closingRate: number; label?: string;
}

/** Comptes d'écart de conversion selon le sens de la variation et la nature de l'élément. */
function gapAccount(item: FxItem, loss: boolean): string {
  const fin = item.nature === 'FINANCIER';
  if (item.kind === 'CREANCE') return loss ? (fin ? '478200' : '478100') : (fin ? '479200' : '479100');
  return loss ? (fin ? '478400' : '478300') : (fin ? '479400' : '479300');
}

/**
 * Conversion des créances et dettes en devises à la clôture et provision pour risque de change limitée au
 * risque non couvert : position globale (art. 57, même devise et échéances voisines) ou couverture (art. 58),
 * où la fraction compensée de l'écart actif est reclassée en 4788.
 */
export function fxPosition(p: { items: FxItem[]; date: string; mode: 'POSITION_GLOBALE' | 'COUVERTURE' }): OpResult {
  const entries: OpEntry[] = [];
  let losses = 0n;
  let gains = 0n;
  let lossItem: FxItem | undefined;
  for (const it of p.items) {
    const delta = BigInt(Math.round(it.foreign * (it.closingRate - it.historicalRate)));
    if (delta === 0n) continue;
    // créance : hausse du cours = gain ; dette : hausse du cours = perte
    const loss = it.kind === 'CREANCE' ? delta < 0n : delta > 0n;
    const abs = delta < 0n ? -delta : delta;
    const gap = gapAccount(it, loss);
    const lines: OpLine[] = it.kind === 'CREANCE'
      ? (delta > 0n ? [D(it.account, abs), C(gap, abs)] : [D(gap, abs), C(it.account, abs)])
      : (delta > 0n ? [D(gap, abs), C(it.account, abs)] : [D(it.account, abs), C(gap, abs)]);
    entries.push(entry(`Écart de conversion ${loss ? 'actif (perte latente)' : 'passif (gain latent)'}${it.label ? ` — ${it.label}` : ''}`, lines, p.date));
    if (loss) { losses += abs; lossItem ??= it; } else gains += abs;
  }
  const compensated = gains < losses ? gains : losses;
  if (p.mode === 'COUVERTURE' && compensated > 0n && lossItem) {
    entries.push(entry('Différences compensées par couverture de change', [D('478800', compensated), C(gapAccount(lossItem, true), compensated)], p.date));
  }
  const provision = losses - compensated;
  if (provision > 0n && lossItem) {
    const lines = lossItem.nature === 'EXPLOITATION' ? [D('659100', provision), C('499100', provision)] : [D('697100', provision), C('194000', provision)];
    entries.push(entry('Provision pour risque de change non couvert', lines, p.date));
  }
  return { entries, values: { losses, gains, provision } };
}

/**
 * Couverture fixant définitivement le cours (application 89) : l'opération est enregistrée au cours garanti,
 * sans écart de conversion ni provision.
 */
export function fixedRateHedgedPurchase(p: { foreign: number; hedgedRate: number; date: string; paymentDate?: string; account?: string; supplierAccount?: string }): OpResult {
  const amount = BigInt(Math.round(p.foreign * p.hedgedRate));
  const supplier = p.supplierAccount ?? '401100';
  const entries = [entry('Achat au cours de couverture', [D(p.account ?? '601100', amount), C(supplier, amount)], p.date)];
  if (p.paymentDate) entries.push(entry('Règlement de la dette', [D(supplier, amount), C('521100', amount)], p.paymentDate));
  return { entries, values: { amount } };
}

/**
 * Vente à terme couvrant une vente export future (application 91) : étalement du report/déport (6784 / 54),
 * dénouement (résultat de couverture en 4797 puis 756 à la vente), écart de conversion et provision à la
 * clôture, contrepassation et règlement.
 */
export function forwardSaleHedge(p: {
  foreign: number; spotAtInception: number; forwardRate: number; inceptionDate: string; maturityDate: string; coverMonths: number;
  closingDate?: string; monthsToClosing?: number; spotAtMaturity: number;
  saleDate: string; saleRate: number; saleClosingDate?: string; saleClosingRate?: number; settlementDate?: string; settlementRate?: number;
}): OpResult {
  const f = p.foreign;
  const swap = BigInt(Math.round(f * (p.spotAtInception - p.forwardRate)));
  const accrued = p.closingDate && p.monthsToClosing ? BigInt(Math.round(Number(swap) * p.monthsToClosing / p.coverMonths)) : 0n;
  const hedgeResult = BigInt(Math.round(f * (p.spotAtInception - p.spotAtMaturity)));
  const entries: OpEntry[] = [];
  if (accrued) entries.push(entry('Étalement du report/déport', [D('678400', accrued), C('544000', accrued)], p.closingDate));
  entries.push(entry('Résultat de couverture au dénouement', [D('521100', hedgeResult), C('479700', hedgeResult)], p.maturityDate));
  entries.push(entry('Report/déport payé au dénouement', [D('544000', accrued), D('678400', swap - accrued), C('521100', swap)], p.maturityDate));
  const sale = BigInt(Math.round(f * p.saleRate));
  entries.push(entry('Vente en devises', [D('411100', sale), C('701100', sale)], p.saleDate));
  entries.push(entry('Résultat de couverture rapporté au résultat d’exploitation', [D('479700', hedgeResult), C('756000', hedgeResult)], p.saleDate));
  let provision = 0n;
  if (p.saleClosingDate && p.saleClosingRate !== undefined) {
    const gap = BigInt(Math.round(f * (p.saleRate - p.saleClosingRate)));
    if (gap > 0n) {
      provision = gap;
      entries.push(entry('Écart de conversion actif', [D('478100', gap), C('411100', gap)], p.saleClosingDate));
      entries.push(entry('Provision pour perte de change', [D('659100', gap), C('499100', gap)], p.saleClosingDate));
      entries.push(entry('Contrepassation de l’écart de conversion à la réouverture', [D('411100', gap), C('478100', gap)], `${Number(p.saleClosingDate.slice(0, 4)) + 1}-01-01`));
    }
  }
  if (p.settlementDate && p.settlementRate !== undefined) {
    const cash = BigInt(Math.round(f * p.settlementRate));
    const diff = cash - sale;
    entries.push(entry('Règlement de la créance', [D('521100', cash), diff < 0n ? D('656000', -diff) : C('756000', diff), C('411100', sale)], p.settlementDate));
    if (provision) entries.push(entry('Reprise de la provision pour perte de change', [D('499100', provision), C('759100', provision)], p.settlementDate));
  }
  return { entries, values: { swap, accrued, hedgeResult, provision } };
}
