/**
 * Titres (guide d'application, chapitre 13, applications 48 à 51) : acquisition selon la catégorie,
 * titres non libérés, cession de titres immobilisés et de titres de placement (PEPS ou coût moyen pondéré).
 */
import { C, D, entry, pct, ratio, type OpResult } from './core';

/**
 * Catégories et comptes : les frais d'acquisition sont incorporés au coût des titres immobilisés,
 * mais isolés en 50X6 pour les titres de placement (Acte uniforme, art. 44 ; application 48).
 */
export const SECURITY_CATEGORIES = {
  PARTICIPATION: { account: '261000', feesAccount: null },
  TIAP: { account: '274100', feesAccount: null },
  OBLIGATIONS_IMMOBILISEES: { account: '274500', feesAccount: null },
  AUTRES_TITRES_IMMOBILISES: { account: '274800', feesAccount: null },
  PLACEMENT_ACTIONS_COTEES: { account: '502200', feesAccount: '502600' },
  TITRES_TRESOR: { account: '501100', feesAccount: '501600' },
} as const;
export type SecurityCategory = keyof typeof SECURITY_CATEGORIES;

export function acquireSecurities(p: {
  category: SecurityCategory; quantity: number; unitPrice: bigint; feeRate?: number; fees?: bigint; date: string; account?: string; bankAccount?: string;
}): OpResult {
  const cat = SECURITY_CATEGORIES[p.category];
  const price = p.unitPrice * BigInt(p.quantity);
  const fees = p.fees ?? pct(price, p.feeRate ?? 0);
  const account = p.account ?? cat.account;
  const lines = cat.feesAccount
    ? [D(account, price), D(cat.feesAccount, fees), C(p.bankAccount ?? '521100', price + fees)]
    : [D(account, price + fees), C(p.bankAccount ?? '521100', price + fees)];
  return { entries: [entry(`Acquisition de titres (${p.category})`, lines, p.date)], values: { price, fees, cost: cat.feesAccount ? price : price + fees } };
}

/**
 * Souscription de titres partiellement libérés (application 49) : le titre est inscrit pour sa valeur totale,
 * la fraction non appelée en 4813 (titres immobilisés) ou 4726 (titres de placement), soldée à la libération.
 */
export function subscribeUnpaidSecurities(p: {
  quantity: number; nominal: bigint; premium?: bigint; paidFraction: number; fees?: bigint; date: string; account?: string; placement?: boolean;
  callDate?: string;
}): OpResult {
  const q = BigInt(p.quantity);
  const unpaid = pct(p.nominal * q, 1 - p.paidFraction);
  const total = (p.nominal + (p.premium ?? 0n)) * q + (p.fees ?? 0n);
  const unpaidAccount = p.placement ? '472600' : '481300';
  const account = p.account ?? (p.placement ? '502200' : '274800');
  const entries = [entry('Souscription de titres partiellement libérés', [D(account, total), C(unpaidAccount, unpaid), C('521100', total - unpaid)], p.date)];
  if (p.callDate) entries.push(entry('Libération du solde des titres', [D(unpaidAccount, unpaid), C('521100', unpaid)], p.callDate));
  return { entries, values: { total, unpaid } };
}

/**
 * Cession de titres immobilisés (application 50) : sortie à la valeur d'origine (816 / 26-27),
 * produit de cession (826), reprise de la dépréciation (29X / 7972).
 */
export function disposeFinancialAsset(p: {
  account: string; cost: bigint; impairment?: bigint; price: bigint; date: string; receivableAccount?: string;
}): OpResult {
  const imp = p.impairment ?? 0n;
  const entries = [
    entry('Sortie de titres immobilisés du patrimoine', [D('816000', p.cost), C(p.account, p.cost)], p.date),
    entry('Cession des titres immobilisés', [D(p.receivableAccount ?? '521100', p.price), C('826000', p.price)], p.date),
  ];
  if (imp > 0n) entries.push(entry('Reprise de la dépréciation des titres cédés', [D(`29${p.account.slice(1, 3)}00`, imp), C('797200', imp)], p.date));
  return {
    entries,
    values: { hao: p.price - p.cost, financial: imp, total: p.price - p.cost + imp },
    notes: ['La cession à crédit se porte au compte de créance sur cession d’immobilisations que vous choisissez (le compte 4856 cité par le guide n’existe pas dans le plan de l’Acte uniforme).'],
  };
}

export interface SecurityLot { date: string; quantity: number; unitPrice: bigint }

/** Dépréciation du portefeuille de titres de placement à la clôture (application 51) : 6795 / 590. */
export function placementImpairment(p: { cost: bigint; marketValue: bigint; existing?: bigint; date: string }): OpResult {
  const target = p.cost > p.marketValue ? p.cost - p.marketValue : 0n;
  const delta = target - (p.existing ?? 0n);
  const lines = delta >= 0n ? [D('679500', delta), C('590000', delta)] : [D('590000', -delta), C('779500', -delta)];
  return { entries: delta === 0n ? [] : [entry('Ajustement de la dépréciation des titres de placement', lines, p.date)], values: { target, delta } };
}

/**
 * Cession de titres de placement (application 51) : valeur d'entrée des titres cédés par PEPS ou coût moyen
 * pondéré (art. 44 AUDCIF) ; perte en 677, gain en 777, créance en 4721.
 */
export function disposePlacementSecurities(p: {
  lots: SecurityLot[]; quantity: number; price: bigint; method: 'PEPS' | 'CMP'; date: string; account?: string; onCredit?: boolean;
}): OpResult {
  const held = p.lots.reduce((s, l) => s + l.quantity, 0);
  if (p.quantity > held) throw new Error('QUANTITE_TITRES_INSUFFISANTE');
  const totalCost = p.lots.reduce((s, l) => s + l.unitPrice * BigInt(l.quantity), 0n);
  let cost = 0n;
  let remainingLots: SecurityLot[];
  if (p.method === 'CMP') {
    cost = ratio(totalCost, BigInt(p.quantity), BigInt(held));
    remainingLots = [{ date: p.date, quantity: held - p.quantity, unitPrice: held === p.quantity ? 0n : (totalCost - cost) / BigInt(held - p.quantity) }];
  } else {
    let left = p.quantity;
    remainingLots = [];
    for (const l of [...p.lots].sort((a, b) => a.date.localeCompare(b.date))) {
      const used = Math.min(left, l.quantity);
      cost += l.unitPrice * BigInt(used);
      left -= used;
      if (l.quantity > used) remainingLots.push({ ...l, quantity: l.quantity - used });
    }
  }
  const diff = p.price - cost;
  const account = p.account ?? '502200';
  const lines = [D(p.onCredit === false ? '521100' : '472100', p.price), diff < 0n ? D('677100', -diff) : C('777000', diff), C(account, cost)];
  return {
    entries: [entry('Cession de titres de placement', lines, p.date)],
    values: { cost, result: diff, remainingCost: totalCost - cost },
    schedule: remainingLots,
    notes: ['Respecter la permanence de la méthode (PEPS ou coût moyen pondéré) pour tout le portefeuille ; la dépréciation est ajustée à la clôture.'],
  } as OpResult;
}
