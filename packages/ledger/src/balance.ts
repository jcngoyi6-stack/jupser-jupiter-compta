import { normalSide } from './accounts';

export interface PostedLine {
  account: string;
  date: string;
  debit: bigint;
  credit: bigint;
  journalCode?: string;
  entryNumber?: string;
  label?: string;
  thirdPartyId?: string | null;
  letter?: string | null;
}

export interface BalanceRow {
  account: string;
  openingDebit: bigint;
  openingCredit: bigint;
  movementDebit: bigint;
  movementCredit: bigint;
  closingDebit: bigint;
  closingCredit: bigint;
}

/**
 * Balance générale à 6 colonnes : soldes d'ouverture (journal AN), mouvements de la période, soldes de clôture.
 */
export function trialBalance(lines: PostedLine[], opts: { openingJournal?: string } = {}): BalanceRow[] {
  const an = opts.openingJournal ?? 'AN';
  const map = new Map<string, { od: bigint; oc: bigint; md: bigint; mc: bigint }>();
  for (const l of lines) {
    const r = map.get(l.account) ?? { od: 0n, oc: 0n, md: 0n, mc: 0n };
    if (l.journalCode === an) {
      r.od += l.debit;
      r.oc += l.credit;
    } else {
      r.md += l.debit;
      r.mc += l.credit;
    }
    map.set(l.account, r);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, r]) => {
      const openNet = r.od - r.oc;
      const closeNet = openNet + r.md - r.mc;
      return {
        account,
        openingDebit: openNet > 0n ? openNet : 0n,
        openingCredit: openNet < 0n ? -openNet : 0n,
        movementDebit: r.md,
        movementCredit: r.mc,
        closingDebit: closeNet > 0n ? closeNet : 0n,
        closingCredit: closeNet < 0n ? -closeNet : 0n,
      };
    });
}

export function balanceTotals(rows: BalanceRow[]) {
  const t = {
    openingDebit: 0n,
    openingCredit: 0n,
    movementDebit: 0n,
    movementCredit: 0n,
    closingDebit: 0n,
    closingCredit: 0n,
  };
  for (const r of rows) {
    t.openingDebit += r.openingDebit;
    t.openingCredit += r.openingCredit;
    t.movementDebit += r.movementDebit;
    t.movementCredit += r.movementCredit;
    t.closingDebit += r.closingDebit;
    t.closingCredit += r.closingCredit;
  }
  return t;
}

/** Solde net (débit – crédit) par compte, sur des lignes quelconques. */
export function netByAccount(lines: Pick<PostedLine, 'account' | 'debit' | 'credit'>[]): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const l of lines) m.set(l.account, (m.get(l.account) ?? 0n) + l.debit - l.credit);
  return m;
}

export interface LedgerAccount {
  account: string;
  lines: (PostedLine & { runningBalance: bigint })[];
  totalDebit: bigint;
  totalCredit: bigint;
  balance: bigint;
}

/** Grand-livre : lignes par compte, triées par date, avec solde progressif. */
export function generalLedger(lines: PostedLine[]): LedgerAccount[] {
  const by = new Map<string, PostedLine[]>();
  for (const l of lines) by.set(l.account, [...(by.get(l.account) ?? []), l]);
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, ls]) => {
      let run = 0n;
      let td = 0n;
      let tc = 0n;
      const sorted = [...ls].sort(
        (a, b) => a.date.localeCompare(b.date) || (a.entryNumber ?? '').localeCompare(b.entryNumber ?? ''),
      );
      return {
        account,
        lines: sorted.map((l) => {
          run += l.debit - l.credit;
          td += l.debit;
          tc += l.credit;
          return { ...l, runningBalance: run };
        }),
        totalDebit: td,
        totalCredit: tc,
        balance: run,
      };
    });
}

export interface AbnormalBalance {
  account: string;
  balance: bigint;
  expected: 'D' | 'C';
}

/** Comptes à solde anormal (ex. caisse créditrice, fournisseur débiteur). */
export function abnormalBalances(rows: BalanceRow[]): AbnormalBalance[] {
  const out: AbnormalBalance[] = [];
  for (const r of rows) {
    const net = r.closingDebit - r.closingCredit;
    const side = normalSide(r.account);
    if (side === 'D' && net < 0n) out.push({ account: r.account, balance: net, expected: 'D' });
    if (side === 'C' && net > 0n) out.push({ account: r.account, balance: net, expected: 'C' });
  }
  return out;
}
