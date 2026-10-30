/**
 * Dépréciation des stocks à l'inventaire (guide d'application, applications 53 et 54).
 * - Valeur nette de réalisation : prix du contrat de vente ferme s'il existe, sinon prix de vente probable,
 *   diminué des frais restant à engager ; une plus-value latente n'est jamais constatée (prudence).
 * - Matières et approvisionnements dont les produits seront vendus à perte : coût actuel de remplacement.
 * Le compte 39x est ajusté au niveau requis (charge 6593 ou reprise 7593).
 */
import type { EntryLineInput } from '@jupiter/ledger';

export const IMPAIRMENT_ACCOUNTS: Record<string, string> = {
  MARCHANDISE: '391000',
  MATIERE: '392000',
  FOURNITURE: '393000',
  SEMI_FINI: '396000',
  PRODUIT_FINI: '396000',
};

export type WriteDownBasis =
  | { mode: 'VNR'; contractPrice?: bigint; probablePrice?: bigint; costsToSell: bigint }
  | { mode: 'COUT_REMPLACEMENT'; replacementValue: bigint };

export function actualValue(b: WriteDownBasis): bigint {
  if (b.mode === 'COUT_REMPLACEMENT') return b.replacementValue;
  const price = b.contractPrice ?? b.probablePrice;
  if (price === undefined) throw new Error('PRIX_DE_VENTE_REQUIS');
  return price - b.costsToSell;
}

/** Dépréciation requise pour un article : coût d'entrée − valeur actuelle, jamais négative. */
export function requiredImpairment(cost: bigint, basis: WriteDownBasis): { actual: bigint; impairment: bigint } {
  const actual = actualValue(basis);
  return { actual, impairment: actual < cost ? cost - actual : 0n };
}

/** Ajustement des comptes 39x : `required` et `booked` par compte de dépréciation. */
export function impairmentAdjustmentLines(required: Record<string, bigint>, booked: Record<string, bigint>): EntryLineInput[] {
  const lines: EntryLineInput[] = [];
  for (const acc of [...new Set([...Object.keys(required), ...Object.keys(booked)])].sort()) {
    const delta = (required[acc] ?? 0n) - (booked[acc] ?? 0n);
    if (delta > 0n) lines.push({ account: '659300', debit: delta, credit: 0n }, { account: acc, debit: 0n, credit: delta });
    if (delta < 0n) lines.push({ account: acc, debit: -delta, credit: 0n }, { account: '759300', debit: 0n, credit: -delta });
  }
  return lines;
}
