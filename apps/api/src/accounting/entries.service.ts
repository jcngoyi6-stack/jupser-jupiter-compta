import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  budgetReport,
  buildReversal,
  checkBudget,
  entryHash,
  formatEntryNumber,
  GENESIS_HASH,
  isCollective,
  validateEntry,
  type EntryInput,
  type EntryLineInput,
  type JournalType,
} from '@jupiter/ledger';
import type { SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError } from '../common/http';
import type { Tx } from '../common/prisma.service';

export interface DraftInput {
  journalCode: string;
  date: string;
  pieceRef: string;
  pieceDate?: string | null;
  label: string;
  lines: EntryLineInput[];
}

type Origin = 'MANUEL' | 'IA' | 'PAIE' | 'STOCK' | 'VENTE' | 'IMPORT' | 'CONTREPASSATION' | 'CLOTURE' | 'AN' | 'FX' | 'TVA';

@Injectable()
export class EntriesService {
  constructor(private readonly audit: AuditService) {}

  async fiscalYearFor(tx: Tx, companyId: string, date: string) {
    const fy = await tx.fiscalYear.findFirst({ where: { companyId, startDate: { lte: date }, endDate: { gte: date } } });
    if (!fy) throw domainError('HORS_EXERCICE', `Aucun exercice ne couvre la date ${date}.`);
    return fy;
  }

  async createDraft(tx: Tx, u: SessionUser, companyId: string, input: DraftInput, origin: Origin = 'MANUEL', aiDraft = false) {
    const journal = await tx.journal.findUnique({ where: { companyId_code: { companyId, code: input.journalCode } } });
    if (!journal) throw domainError('JOURNAL_INCONNU', `Journal ${input.journalCode} inconnu.`);
    if (journal.type === 'AN' && origin !== 'AN') {
      throw domainError('AN_MANUEL_INTERDIT', "Saisie directe interdite dans le journal d'à-nouveaux.");
    }
    const fy = await this.fiscalYearFor(tx, companyId, input.date);
    const entry = await tx.entry.create({
      data: {
        tenantId: u.tenantId,
        companyId,
        fiscalYearId: fy.id,
        journalId: journal.id,
        date: input.date,
        pieceRef: input.pieceRef,
        pieceDate: input.pieceDate ?? null,
        label: input.label,
        status: aiDraft ? 'BROUILLON_IA' : 'BROUILLON',
        origin,
        createdBy: u.userId,
        lines: { create: input.lines.map((l, i) => this.lineData(u.tenantId, l, i)) },
      },
      include: { lines: true },
    });
    await this.audit.log(tx, u.tenantId, u.userId, aiDraft ? 'ECRITURE_PROPOSEE_IA' : 'ECRITURE_BROUILLON', `entry:${entry.id}`, {
      journal: input.journalCode,
      date: input.date,
      origin,
    });
    return entry;
  }

  private lineData(tenantId: string, l: EntryLineInput, i: number) {
    return {
      tenantId,
      lineNo: i + 1,
      account: l.account,
      thirdPartyId: l.thirdPartyId ?? null,
      label: l.label ?? null,
      debit: l.debit,
      credit: l.credit,
      currency: l.fx?.currency ?? null,
      foreignAmount: l.fx?.foreignAmount ?? null,
      rate: l.fx?.rate ?? null,
      rateSource: l.fx?.rateSource ?? null,
      rateDate: l.fx?.rateDate ?? null,
      vatCode: l.vatCode ?? null,
      analytic: l.analytic ?? null,
    };
  }

  async updateDraft(tx: Tx, u: SessionUser, companyId: string, id: string, input: DraftInput) {
    const e = await this.get(tx, companyId, id);
    if (e.status !== 'BROUILLON' && e.status !== 'BROUILLON_IA') {
      throw domainError('ECRITURE_VALIDEE', 'Une écriture validée est immuable : utilisez la contre-passation.');
    }
    const journal = await tx.journal.findUnique({ where: { companyId_code: { companyId, code: input.journalCode } } });
    if (!journal) throw domainError('JOURNAL_INCONNU', `Journal ${input.journalCode} inconnu.`);
    const fy = await this.fiscalYearFor(tx, companyId, input.date);
    await tx.entryLine.deleteMany({ where: { entryId: id } });
    const updated = await tx.entry.update({
      where: { id },
      data: {
        journalId: journal.id,
        fiscalYearId: fy.id,
        date: input.date,
        pieceRef: input.pieceRef,
        pieceDate: input.pieceDate ?? null,
        label: input.label,
        lines: { create: input.lines.map((l, i) => this.lineData(u.tenantId, l, i)) },
      },
      include: { lines: true },
    });
    await this.audit.log(tx, u.tenantId, u.userId, 'ECRITURE_MODIFIEE', `entry:${id}`);
    return updated;
  }

  async deleteDraft(tx: Tx, u: SessionUser, companyId: string, id: string) {
    const e = await this.get(tx, companyId, id);
    if (e.status !== 'BROUILLON' && e.status !== 'BROUILLON_IA') {
      throw domainError('ECRITURE_VALIDEE', 'Une écriture validée ne peut pas être supprimée.');
    }
    await tx.entry.delete({ where: { id } });
    await this.audit.log(tx, u.tenantId, u.userId, 'BROUILLON_SUPPRIME', `entry:${id}`);
    return { deleted: true };
  }

  async get(tx: Tx, companyId: string, id: string) {
    const e = await tx.entry.findFirst({ where: { id, companyId }, include: { lines: { orderBy: { lineNo: 'asc' } }, attachments: { select: { id: true, fileName: true, sha256: true } } } });
    if (!e) throw new NotFoundException({ code: 'ECRITURE_INCONNUE', message: 'Écriture introuvable.' });
    return e;
  }

  /** Contrôles applicables à une écriture (mêmes contrôles pour la saisie, l'import, la paie et JUPSER IA). */
  async check(tx: Tx, companyId: string, id: string, systemGenerated = false) {
    const e = await this.get(tx, companyId, id);
    const journal = await tx.journal.findUniqueOrThrow({ where: { id: e.journalId } });
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const fy = await tx.fiscalYear.findUniqueOrThrow({ where: { id: e.fiscalYearId }, include: { periods: true } });
    const numbers = [...new Set(e.lines.map((l) => l.account))];
    const accs = await tx.account.findMany({ where: { companyId, number: { in: numbers } } });
    const accounts = new Map(
      accs.map((a) => [a.number, { number: a.number, active: a.active, imputable: a.imputable, collective: a.collective || isCollective(a.number) }]),
    );
    const input: EntryInput = {
      journalCode: journal.code,
      journalType: journal.type as JournalType,
      date: e.date,
      pieceRef: e.pieceRef,
      pieceDate: e.pieceDate,
      label: e.label,
      lines: e.lines.map((l) => ({
        account: l.account,
        thirdPartyId: l.thirdPartyId,
        debit: l.debit,
        credit: l.credit,
        analytic: l.analytic,
        fx: l.currency
          ? { currency: l.currency, foreignAmount: l.foreignAmount ?? 0n, rate: l.rate ?? '', rateSource: l.rateSource ?? '', rateDate: l.rateDate ?? '' }
          : null,
      })),
    };
    const result = validateEntry(input, {
      accounts,
      fiscalYear: { start: fy.startDate, end: fy.endDate, closed: fy.closed },
      isPeriodOpen: (d) => fy.periods.some((p) => p.status === 'OUVERTE' && d >= p.startDate && d <= p.endDate),
      attachmentThreshold: company.attachmentThreshold,
      hasAttachment: e.attachments.length > 0,
      systemGenerated,
    });
    return { entry: e, journal, fy, company, input, result };
  }

  async validate(tx: Tx, u: SessionUser, companyId: string, id: string, opts: { systemGenerated?: boolean } = {}) {
    const { entry, journal, fy, company, input, result } = await this.check(tx, companyId, id, opts.systemGenerated);
    if (entry.status !== 'BROUILLON' && entry.status !== 'BROUILLON_IA') {
      throw domainError('DEJA_VALIDEE', 'Écriture déjà validée.');
    }
    if (!result.ok) throw domainError('CONTROLES_BLOQUANTS', 'Contrôles bloquants non satisfaits.', result.errors);
    if (u.userId === 'SYSTEME' || u.userId === 'JUPSER_IA') {
      if (!opts.systemGenerated) throw new ForbiddenException('Validation humaine obligatoire.');
    }
    // Séparation des tâches (docs/08) : paie, et décaissements au-delà du seuil, validés par une autre personne.
    const disbursement = input.lines.filter((l) => /^5/.test(l.account)).reduce((s, l) => s + l.credit, 0n);
    const fourEyes =
      entry.origin === 'PAIE' || (company.fourEyesThreshold != null && disbursement >= company.fourEyesThreshold);
    if (fourEyes && !opts.systemGenerated && entry.createdBy === u.userId) {
      throw domainError('QUATRE_YEUX', 'Validation à quatre yeux : la personne qui a saisi ne peut pas valider.');
    }
    const budget = await this.budgetCheck(tx, companyId, fy.id, company.budgetMode as 'ALERTE' | 'BLOQUANT', input.lines, opts.systemGenerated);
    if (budget.blocked) throw domainError('BUDGET_DEPASSE', budget.warnings.join(' '));
    result.warnings.push(...budget.warnings.map((w) => ({ code: 'BUDGET', message: w })));
    await tx.journalSequence.upsert({
      where: { journalId_fiscalYearId: { journalId: journal.id, fiscalYearId: fy.id } },
      create: { tenantId: u.tenantId, journalId: journal.id, fiscalYearId: fy.id, last: 0 },
      update: {},
    });
    const rows = await tx.$queryRaw<{ last: number }[]>`
      UPDATE journal_sequence SET last = last + 1
      WHERE journal_id = ${journal.id}::uuid AND fiscal_year_id = ${fy.id}::uuid RETURNING last`;
    const seq = rows[0]!.last;
    const number = formatEntryNumber(journal.code, fy.label, seq);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'chain:' + companyId}))`;
    const prev = await tx.entry.findFirst({
      where: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] } },
      orderBy: { validatedAt: 'desc' },
      select: { hash: true },
    });
    const prevHash = prev?.hash ?? GENESIS_HASH;
    const hash = entryHash({
      number,
      date: entry.date,
      journalCode: journal.code,
      pieceRef: entry.pieceRef,
      label: entry.label,
      lines: input.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, thirdPartyId: l.thirdPartyId ?? null })),
      prevHash,
    });
    const validated = await tx.entry.update({
      where: { id },
      data: { status: 'VALIDE', seq, number, hash, prevHash, validatedBy: u.userId, validatedAt: new Date() },
      include: { lines: true },
    });
    await this.audit.log(tx, u.tenantId, u.userId, 'ECRITURE_VALIDEE', `entry:${id}`, { number, hash, origin: entry.origin });
    return { entry: validated, warnings: result.warnings };
  }

  /** Contrôle budgétaire (docs/13 §4) : charges et investissements comparés au budget de l'exercice. */
  private async budgetCheck(tx: Tx, companyId: string, fyId: string, mode: 'ALERTE' | 'BLOQUANT', lines: EntryLineInput[], system?: boolean) {
    const out = { blocked: false, warnings: [] as string[] };
    if (system) return out;
    const relevant = lines.filter((l) => /^[26]/.test(l.account) && l.debit > l.credit);
    if (!relevant.length) return out;
    const versions = await tx.budgetLine.findMany({ where: { companyId, fiscalYearId: fyId }, select: { version: true }, distinct: ['version'] });
    if (!versions.length) return out;
    const version = versions.some((v) => v.version === 'REVISE') ? 'REVISE' : 'INITIAL';
    const budget = await tx.budgetLine.findMany({ where: { companyId, fiscalYearId: fyId, version } });
    const actual = await tx.entryLine.findMany({ where: { entry: { companyId, fiscalYearId: fyId, status: { in: ['VALIDE', 'CONTREPASSE'] } } }, select: { account: true, analytic: true, debit: true, credit: true } });
    const report = budgetReport(
      budget.map((b) => ({ prefix: b.prefix, analytic: b.analytic || null, amount: b.amount })),
      actual.filter((a) => /^[26]/.test(a.account)).map((a) => ({ account: a.account, analytic: a.analytic, net: a.debit - a.credit })),
    );
    for (const l of relevant) {
      const r = checkBudget(report, l.account, l.debit - l.credit, l.analytic ?? null, mode);
      if (r.warning) out.warnings.push(r.warning);
      if (!r.ok) out.blocked = true;
    }
    return out;
  }

  async reverse(tx: Tx, u: SessionUser, companyId: string, id: string, date: string) {
    const orig = await this.get(tx, companyId, id);
    if (orig.status !== 'VALIDE') throw domainError('NON_CONTREPASSABLE', 'Seule une écriture validée non contre-passée peut être contre-passée.');
    const journal = await tx.journal.findUniqueOrThrow({ where: { id: orig.journalId } });
    const rev = buildReversal(
      {
        journalCode: journal.code,
        journalType: journal.type as JournalType,
        date: orig.date,
        pieceRef: orig.pieceRef,
        label: orig.label,
        lines: orig.lines.map((l) => ({
          account: l.account,
          thirdPartyId: l.thirdPartyId,
          label: l.label ?? undefined,
          debit: l.debit,
          credit: l.credit,
          fx: l.currency
            ? { currency: l.currency, foreignAmount: l.foreignAmount ?? 0n, rate: l.rate ?? '', rateSource: l.rateSource ?? '', rateDate: l.rateDate ?? '' }
            : null,
        })),
      },
      date,
      orig.number ?? '',
    );
    const draft = await this.createDraft(tx, u, companyId, rev, 'CONTREPASSATION');
    await tx.entry.update({ where: { id: draft.id }, data: { reversalOfId: orig.id } });
    const v = await this.validate(tx, u, companyId, draft.id);
    await tx.entry.update({ where: { id: orig.id }, data: { status: 'CONTREPASSE', reversedById: draft.id } });
    await this.audit.log(tx, u.tenantId, u.userId, 'ECRITURE_CONTREPASSEE', `entry:${orig.id}`, { reversal: v.entry.number });
    return v.entry;
  }
}
