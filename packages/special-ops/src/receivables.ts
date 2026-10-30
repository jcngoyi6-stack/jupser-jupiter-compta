/**
 * Abandons de créances, affacturage et titrisation (guide d'application, chapitre 15, applications 55 à 57).
 */
import { C, D, entry, type OpResult } from './core';

/**
 * Abandon de créance (application 55) : charge HAO 836 chez le créancier, produit HAO 846 chez le débiteur.
 * Commercial : créance client 411 / dette fournisseur 401 ; financier : 2771 / 1811 (participations).
 */
export function debtWaiver(p: { side: 'CREANCIER' | 'DEBITEUR'; nature: 'COMMERCIAL' | 'FINANCIER'; amount: bigint; date: string; account?: string }): OpResult {
  const account = p.account ?? (p.side === 'CREANCIER' ? (p.nature === 'COMMERCIAL' ? '411100' : '277100') : (p.nature === 'COMMERCIAL' ? '401100' : '181100'));
  const lines = p.side === 'CREANCIER' ? [D('836000', p.amount), C(account, p.amount)] : [D(account, p.amount), C('846000', p.amount)];
  return {
    entries: [entry(`Abandon de créance ${p.nature === 'COMMERCIAL' ? 'à caractère commercial' : 'à caractère financier'}`, lines, p.date)],
    notes: ['La déductibilité fiscale de l’abandon dépend du pays et de sa nature (commerciale ou financière) : TODO(fiscaliste).'],
  };
}

/**
 * Affacturage classique (application 56, opération 1) : transfert de la créance au compte d'affacturage 4716,
 * puis bordereau : banque, commission d'affacturage (6314) et commission de financement (6745).
 */
export function factoring(p: { amount: bigint; factoringFee: bigint; financingFee: bigint; transferDate: string; settlementDate: string }): OpResult {
  const net = p.amount - p.factoringFee - p.financingFee;
  return {
    entries: [
      entry('Cession des créances au factor', [D('471600', p.amount), C('411100', p.amount)], p.transferDate),
      entry('Bordereau d’affacturage', [D('521100', net), D('631400', p.factoringFee), D('674500', p.financingFee), C('471600', p.amount)], p.settlementDate),
    ],
    values: { net },
  };
}

/**
 * Affacturage inversé (application 56, opération 2) : chez le fournisseur réglé par anticipation et chez le client
 * dont la dette fournisseur est transférée au factor, réglée à l'échéance avec la commission.
 */
export function reverseFactoring(p: {
  side: 'FOURNISSEUR' | 'CLIENT'; amount: bigint; financingFee?: bigint; factoringFee?: bigint; date: string; maturityDate?: string;
}): OpResult {
  if (p.side === 'FOURNISSEUR') {
    const fee = p.financingFee ?? 0n;
    return { entries: [entry('Règlement anticipé par le factor', [D('521100', p.amount - fee), D('674500', fee), C('411100', p.amount)], p.date)] };
  }
  const entries = [entry('Transfert de la dette fournisseur au factor', [D('401100', p.amount), C('471600', p.amount)], p.date)];
  if (p.maturityDate) {
    const fee = p.factoringFee ?? 0n;
    entries.push(entry('Règlement du factor à l’échéance', [D('471600', p.amount), D('631400', fee), C('521100', p.amount + fee)], p.maturityDate));
  }
  return { entries };
}

/** Titrisation (application 57) : cession au FCTC via 4716, perte sur opérations financières 6782 ou gain 7782. */
export function securitisation(p: { nominal: bigint; price: bigint; transferDate: string; settlementDate: string }): OpResult {
  const diff = p.price - p.nominal;
  return {
    entries: [
      entry('Cession des créances au fonds commun de titrisation', [D('471600', p.nominal), C('411100', p.nominal)], p.transferDate),
      entry('Encaissement du prix de cession', [D('521100', p.price), diff < 0n ? D('678200', -diff) : C('778200', diff), C('471600', p.nominal)], p.settlementDate),
    ],
    values: { result: diff },
  };
}
