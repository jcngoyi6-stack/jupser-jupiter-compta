import { Injectable } from '@nestjs/common';
import { autoLetter, canLetter, nextLetter, openingEntryLinesByThirdParty, resultDeterminationLines, trialBalance } from '@jupiter/ledger';
import type { SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError } from '../common/http';
import type { Tx } from '../common/prisma.service';
import { CompanyService } from './company.service';
import { EntriesService } from './entries.service';



@Injectable()
export class ClosingService {
  constructor(
    private readonly entries: EntriesService,
    private readonly companies: CompanyService,
    private readonly audit: AuditService,
  ) {}

  async postedLines(tx: Tx, companyId: string, fiscalYearId: string) {
    const lines = await tx.entryLine.findMany({
      where: { entry: { companyId, fiscalYearId, status: { in: ['VALIDE', 'CONTREPASSE'] } } },
      include: { entry: { select: { date: true, number: true, journalId: true, label: true, pieceRef: true, origin: true } } },
    });
    const journals = new Map((await tx.journal.findMany({ where: { companyId } })).map((j) => [j.id, j]));
    return lines.map((l) => ({
      id: l.id,
      account: l.account,
      date: l.entry.date,
      debit: l.debit,
      credit: l.credit,
      journalCode: journals.get(l.entry.journalId)!.type === 'AN' ? 'AN' : journals.get(l.entry.journalId)!.code,
      journalType: journals.get(l.entry.journalId)!.type,
      entryNumber: l.entry.number ?? '',
      label: l.label ?? l.entry.label,
      pieceRef: l.entry.pieceRef,
      thirdPartyId: l.thirdPartyId,
      letter: l.letter,
      origin: l.entry.origin,
    }));
  }

  async closePeriod(tx: Tx, u: SessionUser, companyId: string, periodId: string) {
    const p = await tx.period.findFirst({ where: { id: periodId, fiscalYear: { companyId } } });
    if (!p) throw domainError('PERIODE_INCONNUE', 'Période introuvable.');
    const drafts = await tx.entry.count({
      where: { companyId, status: { in: ['BROUILLON', 'BROUILLON_IA'] }, date: { gte: p.startDate, lte: p.endDate } },
    });
    if (drafts > 0) throw domainError('BROUILLONS_EN_COURS', `${drafts} brouillon(s) à valider ou supprimer avant la clôture.`);
    await tx.period.update({ where: { id: periodId }, data: { status: 'CLOTUREE' } });
    await this.audit.log(tx, u.tenantId, u.userId, 'PERIODE_CLOTUREE', `period:${periodId}`, { label: p.label });
    return { closed: true };
  }

  /** Réouverture : rôle habilité, motif obligatoire, trace d'audit (invariant 3). */
  async reopenPeriod(tx: Tx, u: SessionUser, companyId: string, periodId: string, reason: string) {
    const p = await tx.period.findFirst({ where: { id: periodId, fiscalYear: { companyId } }, include: { fiscalYear: true } });
    if (!p) throw domainError('PERIODE_INCONNUE', 'Période introuvable.');
    if (p.fiscalYear.closed) throw domainError('EXERCICE_CLOTURE', 'Exercice clôturé : réouverture impossible.');
    if (reason.trim().length < 10) throw domainError('MOTIF_OBLIGATOIRE', 'Motif de réouverture obligatoire (10 caractères minimum).');
    await tx.period.update({ where: { id: periodId }, data: { status: 'OUVERTE' } });
    await this.audit.log(tx, u.tenantId, u.userId, 'PERIODE_ROUVERTE', `period:${periodId}`, { label: p.label, reason });
    return { reopened: true };
  }

  /**
   * Clôture d'exercice : détermination du résultat (131/139), verrouillage des périodes,
   * création de l'exercice suivant et génération des à-nouveaux depuis le bilan de clôture.
   */
  async closeFiscalYear(tx: Tx, u: SessionUser, companyId: string, fiscalYearId: string) {
    const fy = await tx.fiscalYear.findFirst({ where: { id: fiscalYearId, companyId } });
    if (!fy) throw domainError('EXERCICE_INCONNU', 'Exercice introuvable.');
    if (fy.closed) throw domainError('EXERCICE_CLOTURE', 'Exercice déjà clôturé.');
    const drafts = await tx.entry.count({ where: { fiscalYearId, status: { in: ['BROUILLON', 'BROUILLON_IA'] } } });
    if (drafts > 0) throw domainError('BROUILLONS_EN_COURS', `${drafts} brouillon(s) en cours.`);
    // la détermination du résultat est datée du dernier jour : la dernière période doit être ouverte
    await tx.period.updateMany({
      where: { fiscalYearId, startDate: { lte: fy.endDate }, endDate: { gte: fy.endDate } },
      data: { status: 'OUVERTE' },
    });

    const rows = trialBalance(await this.postedLines(tx, companyId, fiscalYearId));
    const resultLines = resultDeterminationLines(rows);
    let resultEntry = null;
    if (resultLines.length > 1) {
      const d = await this.entries.createDraft(
        tx,
        u,
        companyId,
        { journalCode: 'OD', date: fy.endDate, pieceRef: `CLOT-${fy.label}`, label: `Détermination du résultat ${fy.label}`, lines: resultLines },
        'CLOTURE',
      );
      resultEntry = (await this.entries.validate(tx, u, companyId, d.id, { systemGenerated: true })).entry;
    }
    await tx.period.updateMany({ where: { fiscalYearId }, data: { status: 'CLOTUREE' } });
    await tx.fiscalYear.update({ where: { id: fiscalYearId }, data: { closed: true, closedAt: new Date() } });

    const nextStart = new Date(Date.parse(fy.endDate) + 86_400_000).toISOString().slice(0, 10);
    let next = await tx.fiscalYear.findFirst({ where: { companyId, startDate: nextStart } });
    next ??= await this.companies.createFiscalYear(tx, u.tenantId, companyId, nextStart, `${nextStart.slice(0, 4)}-12-31`);
    const an = openingEntryLinesByThirdParty(await this.postedLines(tx, companyId, fiscalYearId));
    let anEntry = null;
    if (an.length > 0) {
      const d = await this.entries.createDraft(
        tx,
        u,
        companyId,
        { journalCode: 'AN', date: nextStart, pieceRef: `AN-${next.label}`, label: `À-nouveaux ${next.label}`, lines: an },
        'AN',
      );
      anEntry = (await this.entries.validate(tx, u, companyId, d.id, { systemGenerated: true })).entry;
    }
    await this.audit.log(tx, u.tenantId, u.userId, 'EXERCICE_CLOTURE', `fiscal_year:${fiscalYearId}`, {
      result: resultEntry?.number,
      openingEntry: anEntry?.number,
    });
    return { resultEntry, anEntry, nextFiscalYear: next };
  }

  async autoLettering(tx: Tx, u: SessionUser, companyId: string, account: string) {
    const lines = await tx.entryLine.findMany({
      where: { account, letter: null, entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] } } },
      include: { entry: { select: { date: true, pieceRef: true } } },
    });
    const last = await tx.entryLine.findFirst({ where: { account, letter: { not: null }, entry: { companyId } }, orderBy: { letter: 'desc' } });
    const groups = autoLetter(
      lines.map((l) => ({ id: l.id, thirdPartyId: l.thirdPartyId, account: l.account, date: l.entry.date, reference: l.entry.pieceRef, debit: l.debit, credit: l.credit })),
      last?.letter ?? null,
    );
    for (const g of groups) await tx.entryLine.updateMany({ where: { id: { in: g.ids } }, data: { letter: g.letter } });
    await this.audit.log(tx, u.tenantId, u.userId, 'LETTRAGE_AUTO', `account:${account}`, { groups: groups.length });
    return { groups };
  }

  async manualLettering(tx: Tx, u: SessionUser, companyId: string, ids: string[]) {
    const lines = await tx.entryLine.findMany({
      where: { id: { in: ids }, entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] } } },
      include: { entry: { select: { date: true, pieceRef: true } } },
    });
    if (lines.length !== ids.length) throw domainError('LIGNES_INCONNUES', 'Lignes introuvables ou non validées.');
    const check = canLetter(lines.map((l) => ({ id: l.id, thirdPartyId: l.thirdPartyId, account: l.account, date: l.entry.date, reference: l.entry.pieceRef, debit: l.debit, credit: l.credit, letter: l.letter })));
    if (!check.ok) throw domainError('LETTRAGE_IMPOSSIBLE', check.reason ?? 'Lettrage impossible.');
    const last = await tx.entryLine.findFirst({ where: { account: lines[0]!.account, letter: { not: null }, entry: { companyId } }, orderBy: { letter: 'desc' } });
    const letter = nextLetter(last?.letter ?? null);
    await tx.entryLine.updateMany({ where: { id: { in: ids } }, data: { letter } });
    await this.audit.log(tx, u.tenantId, u.userId, 'LETTRAGE', `account:${lines[0]!.account}`, { letter, ids });
    return { letter };
  }
}
