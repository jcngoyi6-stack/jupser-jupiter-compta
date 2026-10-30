/**
 * Engagements hors bilan, événements postérieurs à la clôture et opérations pour le compte de tiers
 * (guide d'application, chapitres 30 à 32, applications 102 à 105).
 */
import { C, D, entry, type OpEntry, type OpResult } from './core';

/** Engagement de garantie (application 102) : donné 9062 / 9162, obtenu 9022 / 9122, annulé à l'échéance. */
export function guaranteeCommitment(p: { side: 'DONNE' | 'OBTENU'; amount: bigint; date: string; endDate?: string }): OpResult {
  const [debit, credit] = p.side === 'DONNE' ? ['916200', '906200'] : ['902200', '912200'];
  const entries = [entry(p.side === 'DONNE' ? 'Caution donnée' : 'Caution reçue', [D(debit, p.amount), C(credit, p.amount)], p.date)];
  if (p.endDate) entries.push(entry('Annulation de la caution', [D(credit, p.amount), C(debit, p.amount)], p.endDate));
  return { entries, notes: ['Information obligatoire en notes annexes (engagements financiers donnés ou reçus).'] };
}

export type PostClosingTreatment = 'AJUSTEMENT' | 'NOTE_ANNEXE' | 'RAPPORT_DE_GESTION' | 'AUCUN';

/**
 * Qualification d'un événement postérieur à la clôture (application 103) : seul un événement survenu avant
 * l'arrêté des comptes et lié à une situation existant à la clôture donne lieu à ajustement.
 */
export function classifyPostClosingEvent(p: {
  eventDate: string; closingDate: string; approvalDate: string; existedAtClosing: boolean; significant: boolean; threatensGoingConcern?: boolean;
}): { treatment: PostClosingTreatment; reason: string } {
  if (p.eventDate <= p.closingDate) return { treatment: 'AJUSTEMENT', reason: 'Événement de l’exercice : à comptabiliser.' };
  if (p.eventDate > p.approvalDate) return { treatment: 'AUCUN', reason: 'Postérieur à l’arrêté des comptes : les états financiers ne sont pas ajustés.' };
  if (p.existedAtClosing || p.threatensGoingConcern) return { treatment: 'AJUSTEMENT', reason: 'Situation existant à la clôture (ou continuité d’exploitation compromise) : ajuster les comptes.' };
  if (p.significant) return { treatment: 'NOTE_ANNEXE', reason: 'Situation née après la clôture, significative : information en notes annexes.' };
  return { treatment: 'RAPPORT_DE_GESTION', reason: 'Situation née après la clôture, peu significative : information dans le rapport de gestion.' };
}

/**
 * Commissionnaire (application 104) : l'intermédiaire comptabilise achats et ventes dans son résultat ;
 * le commettant enregistre l'achat commission comprise (ou la vente nette, commission en 6322).
 */
export function commissionAgent(p: { side: 'INTERMEDIAIRE' | 'COMMETTANT_ACHAT' | 'COMMETTANT_VENTE'; amount: bigint; commission: bigint; date: string }): OpResult {
  const entries: OpEntry[] = [];
  if (p.side === 'INTERMEDIAIRE') {
    entries.push(entry('Achat pour le compte du commettant', [D('601100', p.amount), C('401100', p.amount)], p.date));
    entries.push(entry('Revente au commettant', [D('411100', p.amount + p.commission), C('701100', p.amount + p.commission)], p.date));
  } else if (p.side === 'COMMETTANT_ACHAT') {
    entries.push(entry('Achat par l’intermédiaire (commission comprise)', [D('601100', p.amount + p.commission), C('401100', p.amount + p.commission)], p.date));
  } else {
    entries.push(entry('Vente par l’intermédiaire', [D('411100', p.amount - p.commission), D('632200', p.commission), C('701100', p.amount)], p.date));
  }
  return { entries };
}

/**
 * Mandataire (application 105) : opérations pour le mandant en 4731 / 4712 (achats) ou 4711 / 4731 (ventes),
 * seule la rémunération en résultat (706 si activité habituelle, 7072 si accessoire) ; débours remboursables en 4731.
 */
export function mandatary(p: {
  kind: 'ACHAT' | 'VENTE'; amount: bigint; date: string; settlementDate?: string; fee?: bigint; habitual?: boolean;
  disbursement?: { amount: bigint; date: string; reimbursed: boolean };
}): OpResult {
  const entries: OpEntry[] = [];
  if (p.kind === 'ACHAT') {
    entries.push(entry('Acquisition pour le compte du mandant', [D('473100', p.amount), C('471200', p.amount)], p.date));
    if (p.settlementDate) entries.push(entry('Dénouement de l’opération avec le mandant', [D('471200', p.amount), C('473100', p.amount)], p.settlementDate));
  } else {
    entries.push(entry('Vente pour le compte du mandant', [D('471100', p.amount), C('473100', p.amount)], p.date));
    if (p.settlementDate) entries.push(entry('Dénouement de l’opération avec le mandant', [D('473100', p.amount), C('471100', p.amount)], p.settlementDate));
  }
  if (p.fee) entries.push(entry('Rémunération du mandataire', [D('411100', p.fee), C(p.habitual === false ? '707200' : '706100', p.fee)], p.settlementDate ?? p.date));
  if (p.disbursement) {
    const d = p.disbursement;
    entries.push(entry(d.reimbursed ? 'Débours pour le compte du mandant' : 'Frais inclus dans la rémunération', [D(d.reimbursed ? '473100' : '601500', d.amount), C('521100', d.amount)], d.date));
  }
  return { entries };
}
