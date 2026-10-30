import { Injectable } from '@nestjs/common';
import {
  abnormalBalances,
  balanceTotals,
  benfordAnalysis,
  decimalsOf,
  toDecimalString,
  findSequenceGaps,
  generalLedger,
  netByAccount,
  trialBalance,
} from '@jupiter/ledger';
import { buildBalanceSheet, buildCashFlow, buildIncomeStatement, financialAnalysis, isTreasury } from '@jupiter/statements';
import { ClosingService } from '../accounting/closing.service';
import { domainError } from '../common/http';
import type { Tx } from '../common/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly closing: ClosingService) {}

  async fiscalYear(tx: Tx, companyId: string, fiscalYearId?: string) {
    const fy = fiscalYearId
      ? await tx.fiscalYear.findFirst({ where: { id: fiscalYearId, companyId } })
      : await tx.fiscalYear.findFirst({ where: { companyId, closed: false }, orderBy: { startDate: 'asc' } }) ??
        (await tx.fiscalYear.findFirst({ where: { companyId }, orderBy: { startDate: 'desc' } }));
    if (!fy) throw domainError('EXERCICE_INCONNU', 'Exercice introuvable.');
    return fy;
  }

  async lines(tx: Tx, companyId: string, fiscalYearId: string, to?: string) {
    const all = await this.closing.postedLines(tx, companyId, fiscalYearId);
    return to ? all.filter((l) => l.date <= to) : all;
  }

  async trialBalance(tx: Tx, companyId: string, fiscalYearId?: string, to?: string) {
    const fy = await this.fiscalYear(tx, companyId, fiscalYearId);
    const rows = trialBalance(await this.lines(tx, companyId, fy.id, to));
    const labels = new Map((await tx.account.findMany({ where: { companyId, number: { in: rows.map((r) => r.account) } } })).map((a) => [a.number, a.usageLabel ?? a.label]));
    return { fiscalYear: fy, rows: rows.map((r) => ({ ...r, label: labels.get(r.account) ?? '' })), totals: balanceTotals(rows) };
  }

  async generalLedger(tx: Tx, companyId: string, fiscalYearId?: string, account?: string) {
    const fy = await this.fiscalYear(tx, companyId, fiscalYearId);
    let lines = await this.lines(tx, companyId, fy.id);
    if (account) lines = lines.filter((l) => l.account.startsWith(account));
    return { fiscalYear: fy, accounts: generalLedger(lines) };
  }

  /** Livre-journal : écritures validées par journal, avec centralisation mensuelle. */
  async journalBook(tx: Tx, companyId: string, fiscalYearId?: string, journalCode?: string) {
    const fy = await this.fiscalYear(tx, companyId, fiscalYearId);
    const journals = await tx.journal.findMany({ where: { companyId, ...(journalCode ? { code: journalCode } : {}) } });
    const entries = await tx.entry.findMany({
      where: { companyId, fiscalYearId: fy.id, status: { in: ['VALIDE', 'CONTREPASSE'] }, journalId: { in: journals.map((j) => j.id) } },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
      orderBy: [{ journalId: 'asc' }, { seq: 'asc' }],
    });
    const centralisation = new Map<string, { journal: string; month: string; debit: bigint; credit: bigint }>();
    for (const e of entries) {
      const j = journals.find((x) => x.id === e.journalId)!;
      const key = `${j.code}|${e.date.slice(0, 7)}`;
      const c = centralisation.get(key) ?? { journal: j.code, month: e.date.slice(0, 7), debit: 0n, credit: 0n };
      for (const l of e.lines) {
        c.debit += l.debit;
        c.credit += l.credit;
      }
      centralisation.set(key, c);
    }
    return {
      fiscalYear: fy,
      entries: entries.map((e) => ({ ...e, journalCode: journals.find((x) => x.id === e.journalId)!.code })),
      centralisation: [...centralisation.values()].sort((a, b) => a.month.localeCompare(b.month) || a.journal.localeCompare(b.journal)),
    };
  }

  /** Les états excluent l'écriture de détermination du résultat (sinon les classes 6 à 8 seraient soldées). */
  private async balances(tx: Tx, companyId: string, fyId: string, to?: string) {
    const lines = (await this.lines(tx, companyId, fyId, to)).filter((l) => l.origin !== 'CLOTURE');
    return { lines, balances: [...netByAccount(lines).entries()].map(([account, net]) => ({ account, net })) };
  }

  /** États financiers du système normal, colonnes N et N-1, avec contrôles bloquants. */
  async statements(tx: Tx, companyId: string, fiscalYearId?: string) {
    const fy = await this.fiscalYear(tx, companyId, fiscalYearId);
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const prev = await tx.fiscalYear.findFirst({ where: { companyId, endDate: { lt: fy.startDate } }, orderBy: { endDate: 'desc' } });
    const build = async (id: string) => {
      const { lines, balances } = await this.balances(tx, companyId, id);
      const bs = buildBalanceSheet(balances);
      const is = buildIncomeStatement(balances);
      const closingTreasury = balances.filter((b) => isTreasury(b.account)).reduce((s, b) => s + b.net, 0n);
      const cf = buildCashFlow(lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, journalType: l.journalType })), closingTreasury);
      const unallocated = balances.filter((b) => b.account.startsWith('13')).reduce((s, b) => s - b.net, 0n);
      return { balanceSheet: bs, incomeStatement: is, cashFlow: cf, analysis: financialAnalysis(bs, is, company.shareCapital), unallocated };
    };
    const current = await build(fy.id);
    const previous = prev ? await build(prev.id) : null;
    const pending = await tx.entry.count({ where: { companyId, fiscalYearId: fy.id, status: { in: ['BROUILLON', 'BROUILLON_IA'] } } });
    const controls = [
      ...current.balanceSheet.controls,
      ...current.incomeStatement.controls,
      ...current.cashFlow.controls,
      {
        code: 'BILAN_RESULTAT_XI',
        label: 'Résultat du bilan (CJ) = résultat du compte de résultat (XI) + résultat antérieur non encore affecté',
        ok: current.balanceSheet.liabilities.find((l) => l.ref === 'CJ')!.value === current.incomeStatement.values.XI! + current.unallocated,
        blocking: true,
      },
      { code: 'BROUILLONS', label: 'Aucun brouillon en attente sur l’exercice', ok: pending === 0, detail: pending ? `${pending} brouillon(s)` : undefined, blocking: false },
      ...current.analysis.goingConcernAlerts,
    ];
    const blocked = controls.some((c) => c.blocking && !c.ok);
    return { company: { id: company.id, name: company.name, currency: company.currency, system: company.system, taxId: company.taxId, rccm: company.rccm }, fiscalYear: fy, previousFiscalYear: prev, current, previous, controls, blocked };
  }

  /** Contrôles de cohérence (docs/07 §2.3) : soldes anormaux, ruptures de séquence, Benford, comptes d'attente. */
  async controls(tx: Tx, companyId: string, fiscalYearId?: string) {
    const fy = await this.fiscalYear(tx, companyId, fiscalYearId);
    const lines = await this.lines(tx, companyId, fy.id);
    const rows = trialBalance(lines);
    const seqs = await tx.entry.findMany({ where: { companyId, fiscalYearId: fy.id, seq: { not: null } }, select: { journalId: true, seq: true } });
    const journals = await tx.journal.findMany({ where: { companyId } });
    const gaps = journals
      .map((j) => ({ journal: j.code, gaps: findSequenceGaps(seqs.filter((s) => s.journalId === j.id).map((s) => s.seq!)) }))
      .filter((g) => g.gaps.length > 0);
    const suspense = rows.filter((r) => /^47[01]/.test(r.account) && r.closingDebit !== r.closingCredit);
    const dupes = await tx.$queryRaw<{ piece_ref: string; n: bigint }[]>`
      SELECT piece_ref, COUNT(*) AS n FROM entry WHERE company_id = ${companyId}::uuid AND fiscal_year_id = ${fy.id}::uuid
      AND status IN ('VALIDE','BROUILLON','BROUILLON_IA') GROUP BY piece_ref, journal_id HAVING COUNT(*) > 1`;
    return {
      fiscalYear: fy,
      abnormalBalances: abnormalBalances(rows),
      sequenceGaps: gaps,
      suspenseAccounts: suspense,
      possibleDuplicates: dupes.map((d) => ({ pieceRef: d.piece_ref, count: Number(d.n) })),
      benford: benfordAnalysis(lines.filter((l) => l.journalCode !== 'AN').map((l) => l.debit + l.credit)),
    };
  }

  /** Export des écritures (format proche du FEC) — réversibilité des données. */
  async exportCsv(tx: Tx, companyId: string, fiscalYearId?: string) {
    const fy = await this.fiscalYear(tx, companyId, fiscalYearId);
    const lines = await this.lines(tx, companyId, fy.id);
    const header = 'JournalCode;EcritureNum;EcritureDate;CompteNum;PieceRef;EcritureLib;Debit;Credit;EcritureLet';
    const dec = decimalsOf((await tx.company.findUniqueOrThrow({ where: { id: companyId } })).currency);
    const fmt = (v: bigint) => toDecimalString(v, dec).replace('.', ',');
    const body = lines
      .sort((a, b) => a.date.localeCompare(b.date) || a.entryNumber.localeCompare(b.entryNumber))
      .map((l) => [l.journalCode, l.entryNumber, l.date.replace(/-/g, ''), l.account, l.pieceRef, (l.label ?? '').replace(/;/g, ','), fmt(l.debit), fmt(l.credit), l.letter ?? ''].join(';'));
    return [header, ...body].join('\n');
  }
}
