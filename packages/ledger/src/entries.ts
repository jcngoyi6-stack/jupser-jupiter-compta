import { isCollective, isValidAccountNumber } from './accounts';
import { sum } from './money';

export type EntryStatus = 'BROUILLON' | 'BROUILLON_IA' | 'VALIDE' | 'CONTREPASSE';
export type JournalType = 'ACHATS' | 'VENTES' | 'BANQUE' | 'CAISSE' | 'MOBILE_MONEY' | 'OD' | 'PAIE' | 'AN' | 'IA';

export interface FxInfo {
  currency: string;
  foreignAmount: bigint; // unités mineures de la devise
  rate: string; // cours décimal (1 unité de devise = rate unités de la devise de tenue)
  rateSource: string;
  rateDate: string; // AAAA-MM-JJ
}

export interface EntryLineInput {
  account: string;
  thirdPartyId?: string | null;
  label?: string;
  debit: bigint; // devise de tenue, unités mineures
  credit: bigint;
  fx?: FxInfo | null;
  vatCode?: string | null;
  analytic?: string | null;
}

export interface EntryInput {
  journalCode: string;
  journalType: JournalType;
  date: string; // AAAA-MM-JJ
  pieceRef: string;
  pieceDate?: string | null;
  label: string;
  lines: EntryLineInput[];
}

export interface AccountInfo {
  number: string;
  active: boolean;
  imputable: boolean;
  collective?: boolean;
}

export interface ValidationContext {
  accounts: ReadonlyMap<string, AccountInfo>;
  fiscalYear: { start: string; end: string; closed: boolean };
  isPeriodOpen: (date: string) => boolean;
  /** Montant au-delà duquel une pièce numérisée est exigée (unités mineures). */
  attachmentThreshold?: bigint | null;
  hasAttachment?: boolean;
  /** true quand l'écriture est générée par le système (à-nouveaux, clôture). */
  systemGenerated?: boolean;
}

export interface Issue {
  code: string;
  message: string;
  line?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  totalDebit: bigint;
  totalCredit: bigint;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Σ D – Σ C, l'indicateur d'équilibre affiché en temps réel pendant la saisie. */
export function balanceGap(lines: Pick<EntryLineInput, 'debit' | 'credit'>[]): bigint {
  return sum(lines.map((l) => l.debit)) - sum(lines.map((l) => l.credit));
}

/**
 * Contrôles bloquants avant validation (docs/04 §3 et docs/12).
 * Aucune fonction — import, IA, paie — ne contourne ce contrôle.
 */
export function validateEntry(entry: EntryInput, ctx: ValidationContext): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  if (entry.journalType === 'AN' && !ctx.systemGenerated) {
    errors.push({
      code: 'AN_MANUEL_INTERDIT',
      message: "Saisie directe interdite dans le journal d'à-nouveaux (intangibilité du bilan d'ouverture).",
    });
  }
  if (!ISO_DATE.test(entry.date)) errors.push({ code: 'DATE_INVALIDE', message: 'Date invalide.' });
  if (!entry.pieceRef?.trim()) {
    errors.push({ code: 'PIECE_OBLIGATOIRE', message: 'La référence de la pièce justificative est obligatoire.' });
  }
  if (!entry.label?.trim()) errors.push({ code: 'LIBELLE_OBLIGATOIRE', message: 'Le libellé est obligatoire.' });
  if (ctx.fiscalYear.closed) {
    errors.push({ code: 'EXERCICE_CLOTURE', message: "L'exercice est clôturé." });
  }
  if (ISO_DATE.test(entry.date)) {
    if (entry.date < ctx.fiscalYear.start || entry.date > ctx.fiscalYear.end) {
      errors.push({ code: 'HORS_EXERCICE', message: "La date de l'écriture est hors de l'exercice." });
    } else if (!ctx.isPeriodOpen(entry.date)) {
      errors.push({ code: 'PERIODE_CLOTUREE', message: 'La période est clôturée (verrouillée).' });
    }
  }
  if (entry.pieceDate && entry.pieceDate > ctx.fiscalYear.end) {
    warnings.push({
      code: 'SPECIALISATION_EXERCICES',
      message: "Pièce datée de l'exercice suivant : vérifier le rattachement (spécialisation des exercices).",
    });
  }
  if (entry.lines.length < 2) {
    errors.push({ code: 'LIGNES_INSUFFISANTES', message: 'Une écriture comporte au moins deux lignes.' });
  }

  entry.lines.forEach((l, i) => {
    const line = i + 1;
    if (l.debit < 0n || l.credit < 0n) {
      errors.push({ code: 'MONTANT_NEGATIF', message: 'Montant négatif interdit.', line });
    }
    if ((l.debit > 0n && l.credit > 0n) || (l.debit === 0n && l.credit === 0n)) {
      errors.push({ code: 'LIGNE_DC', message: 'Chaque ligne porte soit un débit, soit un crédit.', line });
    }
    if (!isValidAccountNumber(l.account)) {
      errors.push({ code: 'COMPTE_FORMAT', message: `Compte ${l.account} : 6 chiffres attendus.`, line });
      return;
    }
    const acc = ctx.accounts.get(l.account);
    if (!acc) {
      errors.push({ code: 'COMPTE_INCONNU', message: `Compte ${l.account} absent du plan.`, line });
      return;
    }
    if (!acc.active) errors.push({ code: 'COMPTE_INACTIF', message: `Compte ${l.account} désactivé.`, line });
    if (!acc.imputable) {
      errors.push({ code: 'COMPTE_NON_IMPUTABLE', message: `Compte ${l.account} non imputable (rubrique).`, line });
    }
    const collective = acc.collective ?? isCollective(l.account);
    if (collective && !l.thirdPartyId) {
      errors.push({ code: 'TIERS_OBLIGATOIRE', message: `Tiers obligatoire sur le compte collectif ${l.account}.`, line });
    }
    if (l.fx) {
      const f = l.fx;
      if (!f.currency || !f.rate || !f.rateSource || !ISO_DATE.test(f.rateDate ?? '') || f.foreignAmount <= 0n) {
        errors.push({
          code: 'DEVISE_INCOMPLETE',
          message: 'Ligne en devise : devise, montant, cours, source et date du cours obligatoires.',
          line,
        });
      }
    }
  });

  const totalDebit = sum(entry.lines.map((l) => l.debit));
  const totalCredit = sum(entry.lines.map((l) => l.credit));
  if (totalDebit !== totalCredit) {
    errors.push({
      code: 'DESEQUILIBRE',
      message: `Écriture déséquilibrée : débit ${totalDebit} ≠ crédit ${totalCredit} (unités mineures).`,
    });
  }
  if (
    ctx.attachmentThreshold != null &&
    totalDebit >= ctx.attachmentThreshold &&
    !ctx.hasAttachment &&
    !ctx.systemGenerated
  ) {
    errors.push({
      code: 'PIECE_NUMERISEE_REQUISE',
      message: 'Pièce numérisée obligatoire au-delà du seuil paramétré.',
    });
  }

  return { ok: errors.length === 0, errors, warnings, totalDebit, totalCredit };
}

/** Écriture de contre-passation : mêmes lignes, sens inversé. */
export function buildReversal(entry: EntryInput, date: string, originalNumber: string): EntryInput {
  return {
    ...entry,
    date,
    pieceRef: entry.pieceRef,
    label: `Contre-passation de ${originalNumber} — ${entry.label}`,
    lines: entry.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
}

/** Numéro continu par journal et par exercice : JRN-AAAA-000001. */
export function formatEntryNumber(journalCode: string, fiscalYearLabel: string, seq: number): string {
  return `${journalCode}-${fiscalYearLabel}-${String(seq).padStart(6, '0')}`;
}

/** Détecte les trous dans une séquence de numéros (contrôle de non-rupture). */
export function findSequenceGaps(seqs: number[]): number[] {
  const sorted = [...seqs].sort((a, b) => a - b);
  const gaps: number[] = [];
  let expected = 1;
  for (const s of sorted) {
    while (expected < s) gaps.push(expected++);
    expected = s + 1;
  }
  return gaps;
}
