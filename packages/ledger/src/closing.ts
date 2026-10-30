import type { BalanceRow } from './balance';
import type { EntryLineInput } from './entries';

export const RESULT_PROFIT_ACCOUNT = '131000';
export const RESULT_LOSS_ACCOUNT = '139000';

/** Résultat net = produits (crédit des classes 7 et 8 paires) – charges (6 et 8 impaires) ; > 0 = bénéfice. */
export function netResult(rows: BalanceRow[]): bigint {
  let r = 0n;
  for (const row of rows) {
    const c = row.account[0];
    if (c === '6' || c === '7' || c === '8') r += row.closingCredit - row.closingDebit;
  }
  return r;
}

/**
 * Écriture de détermination du résultat : solde les comptes de gestion (6, 7, 8) vers 131 / 139.
 */
export function resultDeterminationLines(rows: BalanceRow[]): EntryLineInput[] {
  const lines: EntryLineInput[] = [];
  for (const row of rows) {
    const c = row.account[0];
    if (c !== '6' && c !== '7' && c !== '8') continue;
    const net = row.closingDebit - row.closingCredit;
    if (net > 0n) lines.push({ account: row.account, debit: 0n, credit: net });
    if (net < 0n) lines.push({ account: row.account, debit: -net, credit: 0n });
  }
  const result = netResult(rows);
  if (result > 0n) lines.push({ account: RESULT_PROFIT_ACCOUNT, debit: 0n, credit: result });
  if (result < 0n) lines.push({ account: RESULT_LOSS_ACCOUNT, debit: -result, credit: 0n });
  return lines;
}

/**
 * À-nouveaux : reprise des soldes des comptes de bilan (classes 1 à 5) du bilan de clôture verrouillé.
 * Les comptes de gestion doivent avoir été soldés au préalable.
 */
export function openingEntryLines(closingRows: BalanceRow[]): EntryLineInput[] {
  const gestion = closingRows.filter(
    (r) => ['6', '7', '8'].includes(r.account[0]!) && r.closingDebit !== r.closingCredit,
  );
  if (gestion.length > 0) {
    throw new Error('Les comptes de gestion (classes 6 à 8) doivent être soldés avant les à-nouveaux.');
  }
  return closingRows
    .filter((r) => ['1', '2', '3', '4', '5'].includes(r.account[0]!))
    .filter((r) => r.closingDebit !== r.closingCredit)
    .map((r) => ({ account: r.account, debit: r.closingDebit, credit: r.closingCredit }));
}
