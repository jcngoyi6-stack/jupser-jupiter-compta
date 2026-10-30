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
 * À l'ouverture, le résultat de l'exercice précédent est repris « en instance d'affectation »
 * (1301 bénéfice, 1309 perte) jusqu'à la décision de l'assemblée (guide d'application, application 65).
 */
export function openingAccount(account: string): string {
  if (account.startsWith('131')) return '130100';
  if (account.startsWith('139')) return '130900';
  return account;
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
    .map((r) => ({ account: openingAccount(r.account), debit: r.closingDebit, credit: r.closingCredit }));
}

/**
 * À-nouveaux détaillés : un solde par compte et, pour les comptes de tiers, par tiers
 * (les comptes collectifs exigent un tiers sur chaque ligne).
 */
export function openingEntryLinesByThirdParty(
  closingLines: { account: string; debit: bigint; credit: bigint; thirdPartyId?: string | null }[],
): EntryLineInput[] {
  const byAcc = new Map<string, bigint>();
  for (const l of closingLines.filter((x) => ['6', '7', '8'].includes(x.account[0]!))) {
    byAcc.set(l.account, (byAcc.get(l.account) ?? 0n) + l.debit - l.credit);
  }
  if ([...byAcc.values()].some((v) => v !== 0n)) {
    throw new Error('Les comptes de gestion (classes 6 à 8) doivent être soldés avant les à-nouveaux.');
  }
  const m = new Map<string, { account: string; thirdPartyId: string | null; net: bigint }>();
  for (const l of closingLines) {
    if (!['1', '2', '3', '4', '5'].includes(l.account[0]!)) continue;
    const account = openingAccount(l.account);
    const key = `${account}|${l.thirdPartyId ?? ''}`;
    const g = m.get(key) ?? { account, thirdPartyId: l.thirdPartyId ?? null, net: 0n };
    g.net += l.debit - l.credit;
    m.set(key, g);
  }
  return [...m.values()]
    .filter((g) => g.net !== 0n)
    .sort((a, b) => a.account.localeCompare(b.account))
    .map((g) => ({
      account: g.account,
      thirdPartyId: g.thirdPartyId,
      debit: g.net > 0n ? g.net : 0n,
      credit: g.net < 0n ? -g.net : 0n,
    }));
}

export interface Appropriation {
  legalReserve?: bigint;
  statutoryReserve?: bigint;
  optionalReserves?: bigint;
  dividends?: bigint;
  /** Report à nouveau : positif = créditeur (121), négatif = débiteur (1291). */
  carryForward?: bigint;
}

/**
 * Affectation du résultat selon la décision de l'assemblée (guide d'application, application 65) :
 * le résultat en instance d'affectation (1301 / 1309) est réparti en réserves (111, 112, 1181),
 * dividendes (465) et report à nouveau (121 / 1291). Une perte est reportée à nouveau (1291).
 */
export function appropriationLines(result: bigint, a: Appropriation): EntryLineInput[] {
  if (result < 0n) {
    return [{ account: '129100', debit: -result, credit: 0n }, { account: '130900', debit: 0n, credit: -result }];
  }
  const parts: [string, bigint][] = [
    ['111000', a.legalReserve ?? 0n], ['112000', a.statutoryReserve ?? 0n], ['118100', a.optionalReserves ?? 0n], ['465000', a.dividends ?? 0n],
  ];
  const carry = a.carryForward ?? 0n;
  const allocated = parts.reduce((s, [, v]) => s + v, 0n) + carry;
  if (allocated !== result) throw new Error('AFFECTATION_DESEQUILIBREE');
  const lines: EntryLineInput[] = [{ account: '130100', debit: result, credit: 0n }];
  for (const [account, v] of parts) if (v > 0n) lines.push({ account, debit: 0n, credit: v });
  if (carry > 0n) lines.push({ account: '121000', debit: 0n, credit: carry });
  if (carry < 0n) lines.push({ account: '129100', debit: -carry, credit: 0n });
  return lines;
}
