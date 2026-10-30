import type { AccountBalance } from './types';

/**
 * Notes annexes (système normal) : tableaux chiffrés générés depuis la comptabilité ; textes
 * (méthodes, événements postérieurs, engagements) proposés puis validés par le comptable.
 * TODO(expert-comptable, L2) : numérotation et contenu à confronter à l'AUDCIF (notes 1 à 36).
 */
export interface MovementLine {
  account: string;
  debit: bigint;
  credit: bigint;
  journalType: string; // AN = ouverture
}

export interface NoteTable {
  number: string;
  title: string;
  columns: string[];
  rows: { label: string; values: (bigint | string | null)[] }[];
}

const NOTE_DEFS: { number: string; title: string; prefixes: [string, string][] }[] = [
  { number: '3A', title: 'Immobilisations brutes', prefixes: [['21', 'Immobilisations incorporelles'], ['22', 'Terrains'], ['23', 'Bâtiments, installations et agencements'], ['24', 'Matériel, mobilier et actifs biologiques'], ['25', 'Avances et acomptes versés'], ['26', 'Titres de participation'], ['27', 'Autres immobilisations financières']] },
  { number: '3C', title: 'Amortissements', prefixes: [['281', 'Immobilisations incorporelles'], ['282', 'Terrains'], ['283', 'Bâtiments, installations et agencements'], ['284', 'Matériel, mobilier et actifs biologiques']] },
  { number: '28', title: 'Provisions et dépréciations inscrites au bilan', prefixes: [['29', 'Dépréciations des immobilisations'], ['19', 'Provisions pour risques et charges'], ['39', 'Dépréciations des stocks'], ['49', 'Dépréciations des créances'], ['59', 'Dépréciations de la trésorerie']] },
];

/** Tableau de mouvements : ouverture, augmentations, diminutions, clôture. */
export function movementNote(lines: MovementLine[], number: string): NoteTable {
  const def = NOTE_DEFS.find((d) => d.number === number);
  if (!def) throw new Error(`Note inconnue : ${number}`);
  const credit = number !== '3A';
  const rows = def.prefixes.map(([p, label]) => {
    const ls = lines.filter((l) => l.account.startsWith(p));
    const sign = (l: MovementLine) => (credit ? l.credit - l.debit : l.debit - l.credit);
    const opening = ls.filter((l) => l.journalType === 'AN').reduce((s, l) => s + sign(l), 0n);
    const plus = ls.filter((l) => l.journalType !== 'AN').reduce((s, l) => s + (credit ? l.credit : l.debit), 0n);
    const minus = ls.filter((l) => l.journalType !== 'AN').reduce((s, l) => s + (credit ? l.debit : l.credit), 0n);
    return { label, values: [opening, plus, minus, opening + plus - minus] as (bigint | null)[] };
  });
  rows.push({ label: 'TOTAL', values: [0, 1, 2, 3].map((i) => rows.reduce((s, r) => s + (r.values[i] as bigint), 0n)) });
  return { number, title: def.title, columns: ['Ouverture', 'Augmentations', 'Diminutions', 'Clôture'], rows };
}

/** Notes de détail : solde par compte d'un groupe de comptes, N et N-1. */
const DETAIL_DEFS: { number: string; title: string; re: RegExp; sign: 1n | -1n }[] = [
  { number: '6', title: 'Stocks et encours', re: /^3[0-8]/, sign: 1n },
  { number: '7', title: 'Clients', re: /^41/, sign: 1n },
  { number: '8', title: 'Autres créances', re: /^4[2-7]/, sign: 1n },
  { number: '11', title: 'Disponibilités', re: /^5[2-8]/, sign: 1n },
  { number: '13', title: 'Capital', re: /^10/, sign: -1n },
  { number: '16A', title: 'Dettes financières et ressources assimilées', re: /^1[6-8]/, sign: -1n },
  { number: '17', title: 'Fournisseurs d’exploitation', re: /^40/, sign: -1n },
  { number: '18', title: 'Dettes fiscales et sociales', re: /^4[2-4]/, sign: -1n },
  { number: '21', title: 'Chiffre d’affaires et autres produits', re: /^7[0-5]/, sign: -1n },
  { number: '22', title: 'Achats', re: /^60/, sign: 1n },
  { number: '23', title: 'Transports', re: /^61/, sign: 1n },
  { number: '24', title: 'Services extérieurs', re: /^6[23]/, sign: 1n },
  { number: '25', title: 'Impôts et taxes', re: /^64/, sign: 1n },
  { number: '27A', title: 'Charges de personnel', re: /^66/, sign: 1n },
  { number: '29', title: 'Charges et revenus financiers', re: /^(67|77)/, sign: 1n },
  { number: '30', title: 'Autres charges et produits HAO', re: /^8[1-8]/, sign: 1n },
];

export function detailNote(number: string, current: AccountBalance[], previous: AccountBalance[] = [], labels: Record<string, string> = {}): NoteTable {
  const def = DETAIL_DEFS.find((d) => d.number === number);
  if (!def) throw new Error(`Note inconnue : ${number}`);
  const accounts = [...new Set([...current, ...previous].filter((b) => def.re.test(b.account)).map((b) => b.account))].sort();
  const val = (set: AccountBalance[], a: string) => def.sign * (set.find((b) => b.account === a)?.net ?? 0n);
  const rows = accounts.map((a) => {
    const n = val(current, a);
    const p = val(previous, a);
    return { label: `${a} ${labels[a] ?? ''}`.trim(), values: [n, p, n - p] as bigint[] };
  });
  rows.push({ label: 'TOTAL', values: [0, 1, 2].map((i) => rows.reduce((s, r) => s + (r.values[i] as bigint), 0n)) });
  return { number, title: def.title, columns: ['Exercice N', 'Exercice N-1', 'Variation'], rows };
}

export const NOTE_NUMBERS = { movements: NOTE_DEFS.map((d) => d.number), details: DETAIL_DEFS.map((d) => d.number) };

/** Textes types proposés (à compléter et valider par le comptable ; JUPSER IA peut les enrichir). */
export function textNoteTemplates(ctx: { companyName: string; system: string; depreciation: string; stockMethod: string; currency: string; fiscalYear: string }) {
  return [
    {
      number: '2',
      title: 'Informations obligatoires — règles et méthodes comptables',
      text:
        `Les états financiers de ${ctx.companyName} pour l'exercice ${ctx.fiscalYear} sont établis conformément à l'Acte uniforme relatif au droit comptable et à l'information financière et au SYSCOHADA révisé (système ${ctx.system === 'SMT' ? 'minimal de trésorerie' : 'normal'}), en ${ctx.currency}. ` +
        `Les immobilisations sont inscrites au coût historique et amorties selon le mode ${ctx.depreciation.toLowerCase()} par composants sur leur durée d'utilité. Les stocks sont évalués selon la méthode ${ctx.stockMethod}. ` +
        `Les créances et dettes en devises sont converties au cours de clôture ; les écarts de conversion sont inscrits en 478/479 et les pertes latentes sont provisionnées.`,
    },
    { number: '2B', title: 'Événements postérieurs à la clôture', text: "Aucun événement significatif postérieur à la clôture n'est à signaler à la date d'arrêté des comptes. [À confirmer par la direction]" },
    { number: '16C', title: 'Engagements hors bilan, actifs et passifs éventuels', text: '[À compléter : cautions données et reçues, sûretés, litiges en cours, engagements de crédit-bail.]' },
  ];
}
