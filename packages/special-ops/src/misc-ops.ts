/**
 * Comptabilité pluri-monétaire, entités agricoles et liquidation (guide d'application, chapitres 36, 37 et 40,
 * applications 113 à 115 et 122).
 */
import { C, D, entry, type OpEntry, type OpLine, type OpResult } from './core';

export interface FxMovement { side: 'D' | 'C'; foreign: number; local: bigint }

/**
 * Ajustement d'un compte tenu en devises à la clôture (applications 113 et 114) : écart entre le solde en monnaie
 * locale et le solde en devises au cours d'inventaire. Trésorerie : perte ou gain de change réalisé (676 / 776) ;
 * créances et dettes : écart de conversion (478x / 479x), la provision relevant de `fxPosition`.
 */
export function foreignAccountAdjustment(p: {
  account: string; kind: 'TRESORERIE' | 'CREANCE' | 'DETTE'; nature?: 'EXPLOITATION' | 'FINANCIER'; movements: FxMovement[]; closingRate: number; date: string;
}): OpResult {
  const sign = (m: FxMovement) => (m.side === 'D' ? 1 : -1);
  const foreign = p.movements.reduce((s, m) => s + sign(m) * m.foreign, 0);
  const local = p.movements.reduce((s, m) => s + BigInt(sign(m)) * m.local, 0n);
  const target = BigInt(Math.round(foreign * p.closingRate));
  const gap = target - local; // > 0 : le compte doit être débité
  const fin = p.nature === 'FINANCIER';
  let other: string;
  if (p.kind === 'TRESORERIE') other = gap > 0n ? '776000' : '676000';
  else if (p.kind === 'CREANCE') other = gap > 0n ? (fin ? '479200' : '479100') : (fin ? '478200' : '478100');
  else other = gap > 0n ? (fin ? '479400' : '479300') : (fin ? '478400' : '478300');
  const abs = gap < 0n ? -gap : gap;
  const lines: OpLine[] = gap > 0n ? [D(p.account, abs), C(other, abs)] : [D(other, abs), C(p.account, abs)];
  return { entries: gap === 0n ? [] : [entry('Ajustement du compte en devises au cours d’inventaire', lines, p.date)], values: { foreignBalance: foreign, localBalance: local, target, gap } };
}

/**
 * Opérations agricoles (application 115) : amélioration du fonds (2245), entrée en production d'une plantation
 * (2465 / 2496) et amortissement (2846), autoconsommation (1047 / 724), cession courante d'un animal reproducteur.
 */
export function agriculturalOps(p: {
  soilImprovement?: { amount: bigint; date: string };
  plantation?: { value: bigint; productiveYears: number; date: string; closingDate: string };
  selfConsumption?: { amount: bigint; date: string };
  livestockSale?: { cost: bigint; productiveYears: number; acquisitionDate: string; saleDate: string; price: bigint; previousAccumulated: bigint; account?: string };
}): OpResult {
  const entries: OpEntry[] = [];
  if (p.soilImprovement) entries.push(entry('Amélioration du fonds (fumures)', [D('224500', p.soilImprovement.amount), C('481200', p.soilImprovement.amount)], p.soilImprovement.date));
  if (p.plantation) {
    const pl = p.plantation;
    const dot = pl.value / BigInt(pl.productiveYears);
    entries.push(entry('Entrée en production de la plantation', [D('246500', pl.value), C('249600', pl.value)], pl.date));
    entries.push(entry('Amortissement de la plantation', [D('681300', dot), C('284600', dot)], pl.closingDate));
  }
  if (p.selfConsumption) entries.push(entry('Autoconsommation de l’exploitant', [D('104700', p.selfConsumption.amount), C('724000', p.selfConsumption.amount)], p.selfConsumption.date));
  if (p.livestockSale) {
    const l = p.livestockSale;
    const acc = l.account ?? '246200';
    const startOfYear = `${l.saleDate.slice(0, 4)}-01-01`;
    const months = (Number(l.saleDate.slice(0, 4)) - Number(startOfYear.slice(0, 4))) * 12 + Number(l.saleDate.slice(5, 7)) - 1;
    const complement = BigInt(Math.round(Number(l.cost) / l.productiveYears * months / 12));
    const accumulated = l.previousAccumulated + complement;
    entries.push(entry('Dotation complémentaire jusqu’à la cession', [D('681300', complement), C('284600', complement)], l.saleDate));
    entries.push(entry('Sortie de l’animal (cession courante)', [D('654200', l.cost - accumulated), D('284600', accumulated), C(acc, l.cost)], l.saleDate));
    entries.push(entry('Prix de cession', [D('414200', l.price), C('754200', l.price)], l.saleDate));
  }
  return { entries };
}

export interface LiquidationAsset { account: string; gross: bigint; reduction?: bigint; reductionAccount?: string; proceeds: bigint }
export interface LiquidationReceivable { account: string; gross: bigint; impairment?: bigint; impairmentAccount?: string; collected: bigint; discount?: bigint }

/**
 * Liquidation (application 122) : réalisation de l'actif, encaissement des créances, paiement du passif et des frais,
 * en résultat de liquidation 1384 directement ou via 837 / 847 ; puis partage (4619).
 */
export function liquidation(p: {
  method: 'DIRECT' | 'HAO'; date: string; assets: LiquidationAsset[]; receivables: LiquidationReceivable[]; liabilities: { account: string; amount: bigint }[];
  fees: bigint; equity: { account: string; amount: bigint }[]; openingCash: bigint;
}): OpResult {
  const gain = p.method === 'DIRECT' ? '138400' : '847000';
  const loss = p.method === 'DIRECT' ? '138400' : '837000';
  const entries: OpEntry[] = [];
  let charges = 0n;
  let products = 0n;
  let cash = p.openingCash;
  for (const a of p.assets) {
    const red = a.reduction ?? 0n;
    const redAcc = a.reductionAccount ?? `28${a.account.slice(1, 3)}00`;
    entries.push(entry('Cession d’un élément d’actif', [D('521100', a.proceeds), C(gain, a.proceeds)], p.date));
    entries.push(entry('Sortie de l’élément d’actif', [D(loss, a.gross - red), D(redAcc, red), C(a.account, a.gross)], p.date));
    products += a.proceeds;
    charges += a.gross - red;
    cash += a.proceeds;
  }
  for (const r of p.receivables) {
    const disc = r.discount ?? 0n;
    const imp = r.impairment ?? 0n;
    const lost = r.gross - r.collected - disc;
    entries.push(entry('Encaissement des créances', [D('521100', r.collected), D(loss, disc), C(r.account, r.collected + disc)], p.date));
    if (imp) entries.push(entry('Reprise des dépréciations', [D(r.impairmentAccount ?? '491200', imp), C(gain, imp)], p.date));
    if (lost > 0n) entries.push(entry('Perte sur créances', [D(loss, lost), C(r.account, lost)], p.date));
    charges += disc + (lost > 0n ? lost : 0n);
    products += imp;
    cash += r.collected;
  }
  for (const l of p.liabilities) {
    entries.push(entry('Règlement du passif', [D(l.account, l.amount), C('521100', l.amount)], p.date));
    cash -= l.amount;
  }
  entries.push(entry('Frais de liquidation', [D(loss, p.fees), C('521100', p.fees)], p.date));
  charges += p.fees;
  cash -= p.fees;
  const result = products - charges;
  if (p.method === 'HAO') {
    entries.push(entry('Regroupement en résultat de liquidation', [D('847000', products), C('837000', charges), C('138400', result)], p.date));
  }
  const equity = p.equity.reduce((s, e) => s + e.amount, 0n);
  entries.push(entry('Restitution du capital et répartition du boni', [...p.equity.map((e) => D(e.account, e.amount)), D('138400', result), C('461900', equity + result)], p.date));
  entries.push(entry('Remboursement des associés', [D('461900', equity + result), C('521100', equity + result)], p.date));
  return { entries, values: { result, cash, toShareholders: equity + result } };
}
