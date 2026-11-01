import type { AccountBalance } from './types';

/**
 * Notes annexes (système normal) : tableaux chiffrés générés depuis la comptabilité ; textes
 * (méthodes, événements postérieurs, engagements) proposés puis validés par le comptable.
 * Numérotation et intitulés conformes à la fiche récapitulative des notes annexes de l'AUDCIF.
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
  { number: '3A', title: 'Immobilisation brute', prefixes: [['21', 'Immobilisations incorporelles'], ['22', 'Terrains'], ['23', 'Bâtiments, installations et agencements'], ['24', 'Matériel, mobilier et actifs biologiques'], ['25', 'Avances et acomptes versés'], ['26', 'Titres de participation'], ['27', 'Autres immobilisations financières']] },
  { number: '3C', title: 'Immobilisations : amortissements', prefixes: [['281', 'Immobilisations incorporelles'], ['282', 'Terrains'], ['283', 'Bâtiments, installations et agencements'], ['284', 'Matériel, mobilier et actifs biologiques']] },
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
  { number: '3D', title: 'Immobilisations : plus-values et moins-values de cession', re: /^8[12]/, sign: -1n },
  { number: '4', title: 'Immobilisations financières', re: /^2[67]/, sign: 1n },
  { number: '5', title: 'Actif circulant HAO', re: /^48[58]/, sign: 1n },
  { number: '6', title: 'Stocks et encours', re: /^3[0-8]/, sign: 1n },
  { number: '7', title: 'Clients, produits à recevoir', re: /^41/, sign: 1n },
  { number: '8', title: 'Autres créances', re: /^4[2-7]/, sign: 1n },
  { number: '9', title: 'Titres de placement', re: /^50/, sign: 1n },
  { number: '10', title: 'Valeurs à encaisser', re: /^51/, sign: 1n },
  { number: '11', title: 'Disponibilités', re: /^5[2-8]/, sign: 1n },
  { number: '12', title: 'Écarts de conversion', re: /^47[89]/, sign: 1n },
  { number: '13', title: 'Capital : valeur nominale des actions ou parts', re: /^10[1-49]/, sign: -1n },
  { number: '14', title: 'Primes et réserves', re: /^(105|11)/, sign: -1n },
  { number: '15A', title: 'Subventions et provisions réglementées', re: /^1[45]/, sign: -1n },
  { number: '16A', title: 'Dettes financières et ressources assimilées', re: /^1[6-9]/, sign: -1n },
  { number: '17', title: "Fournisseurs d'exploitation", re: /^40/, sign: -1n },
  { number: '18', title: 'Dettes fiscales et sociales', re: /^4[2-4]/, sign: -1n },
  { number: '19', title: 'Autres dettes et provisions pour risques à court terme', re: /^(4[5-7]|499)/, sign: -1n },
  { number: '20', title: "Banques, crédit d'escompte et de trésorerie", re: /^56/, sign: -1n },
  { number: '21', title: "Chiffre d'affaires et autres produits", re: /^7[0-5]/, sign: -1n },
  { number: '22', title: 'Achats', re: /^60/, sign: 1n },
  { number: '23', title: 'Transports', re: /^61/, sign: 1n },
  { number: '24', title: 'Services extérieurs', re: /^6[23]/, sign: 1n },
  { number: '25', title: 'Impôts et taxes', re: /^64/, sign: 1n },
  { number: '26', title: 'Autres charges', re: /^65/, sign: 1n },
  { number: '27A', title: 'Charges de personnel', re: /^66/, sign: 1n },
  { number: '29', title: 'Charges et revenus financiers', re: /^(67|77)/, sign: 1n },
  { number: '30', title: 'Autres charges et produits HAO', re: /^8[3-8]/, sign: 1n },
];

/** Fiche récapitulative des notes annexes (AUDCIF) : intitulés officiels. */
export const OFFICIAL_NOTES: [string, string][] = [
  ['1', 'Dettes garanties par des sûretés réelles'], ['2', 'Informations obligatoires'], ['3A', 'Immobilisation brute'], ['3B', 'Biens pris en location acquisition'],
  ['3C', 'Immobilisations : amortissements'], ['3D', 'Immobilisations : plus-values et moins-values de cession'], ['3E', "Informations sur les réévaluations effectuées par l'entité"],
  ['3F', "Tableau d'étalement des charges immobilisées"], ['4', 'Immobilisations financières'], ['5', 'Actif circulant HAO'], ['6', 'Stocks et encours'], ['7', 'Clients, produits à recevoir'],
  ['8', 'Autres créances'], ['9', 'Titres de placement'], ['10', 'Valeurs à encaisser'], ['11', 'Disponibilités'], ['12', 'Écarts de conversion'], ['13', 'Capital : valeur nominale des actions ou parts'],
  ['14', 'Primes et réserves'], ['15A', 'Subventions et provisions réglementées'], ['15B', 'Autres fonds propres'], ['16A', 'Dettes financières et ressources assimilées'],
  ['16B', 'Engagements de retraite et avantages assimilés'], ['16B bis', 'Engagements de retraite et avantages assimilés (méthode actuarielle)'], ['16C', 'Actifs et passifs éventuels'],
  ['17', "Fournisseurs d'exploitation"], ['18', 'Dettes fiscales et sociales'], ['19', 'Autres dettes et provisions pour risques à court terme'], ['20', "Banques, crédit d'escompte et de trésorerie"],
  ['21', "Chiffre d'affaires et autres produits"], ['22', 'Achats'], ['23', 'Transports'], ['24', 'Services extérieurs'], ['25', 'Impôts et taxes'], ['26', 'Autres charges'],
  ['27A', 'Charges de personnel'], ['27B', 'Effectifs, masse salariale et personnel extérieur'], ['28', 'Provisions et dépréciations inscrites au bilan'], ['29', 'Charges et revenus financiers'],
  ['30', 'Autres charges et produits HAO'], ['31', 'Répartition du résultat et autres éléments caractéristiques des cinq derniers exercices'], ['32', "Production de l'exercice"],
  ['33', 'Achats destinés à la production'], ['34', 'Fiche de synthèse des principaux indicateurs financiers'], ['35', 'Liste des informations sociales, environnementales et sociétales à fournir'], ['36', 'Table des codes'],
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

/** Textes types proposés (à compléter et valider par le comptable ; Jupiter IA peut les enrichir). */
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
