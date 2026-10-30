import type { AccountBalance, ControlResult } from './types';

/**
 * Compte de résultat SYSCOHADA révisé (références TA…XI, data/mapping_compte_resultat.csv).
 * Chaque ligne vaut Σ (crédit – débit) de ses comptes : produits positifs, charges négatives,
 * comme dans la présentation officielle ; les soldes intermédiaires sont des sommes de lignes.
 */
export const INCOME_LINES: { ref: string; label: string; prefixes: string[] }[] = [
  { ref: 'TA', label: 'Ventes de marchandises', prefixes: ['701'] },
  { ref: 'RA', label: 'Achats de marchandises', prefixes: ['601'] },
  { ref: 'RB', label: 'Variation de stocks de marchandises', prefixes: ['6031'] },
  { ref: 'TB', label: 'Ventes de produits fabriqués', prefixes: ['702', '703', '704'] },
  { ref: 'TC', label: 'Travaux, services vendus', prefixes: ['705', '706'] },
  { ref: 'TD', label: 'Produits accessoires', prefixes: ['707'] },
  { ref: 'TE', label: 'Production stockée (ou déstockage)', prefixes: ['73'] },
  { ref: 'TF', label: 'Production immobilisée', prefixes: ['72'] },
  { ref: 'TG', label: "Subventions d'exploitation", prefixes: ['71'] },
  { ref: 'TH', label: 'Autres produits', prefixes: ['75'] },
  { ref: 'TI', label: "Transferts de charges d'exploitation", prefixes: ['781'] },
  { ref: 'RC', label: 'Achats de matières premières et fournitures liées', prefixes: ['602'] },
  { ref: 'RD', label: 'Variation de stocks de matières premières et fournitures liées', prefixes: ['6032'] },
  { ref: 'RE', label: 'Autres achats', prefixes: ['604', '605', '608'] },
  { ref: 'RF', label: "Variation de stocks d'autres approvisionnements", prefixes: ['6033'] },
  { ref: 'RG', label: 'Transports', prefixes: ['61'] },
  { ref: 'RH', label: 'Services extérieurs', prefixes: ['62', '63'] },
  { ref: 'RI', label: 'Impôts et taxes', prefixes: ['64'] },
  { ref: 'RJ', label: 'Autres charges', prefixes: ['65'] },
  { ref: 'RK', label: 'Charges de personnel', prefixes: ['66'] },
  { ref: 'TJ', label: "Reprises d'amortissements, provisions et dépréciations", prefixes: ['791', '798', '799'] },
  { ref: 'RL', label: 'Dotations aux amortissements, aux provisions et dépréciations', prefixes: ['681', '691'] },
  { ref: 'TK', label: 'Revenus financiers et assimilés', prefixes: ['77'] },
  { ref: 'TL', label: 'Reprises de provisions et dépréciations financières', prefixes: ['797'] },
  { ref: 'TM', label: 'Transferts de charges financières', prefixes: ['787'] },
  { ref: 'RM', label: 'Frais financiers et charges assimilées', prefixes: ['67'] },
  { ref: 'RN', label: 'Dotations aux provisions et aux dépréciations financières', prefixes: ['697'] },
  { ref: 'TN', label: "Produits des cessions d'immobilisations", prefixes: ['82'] },
  { ref: 'TO', label: 'Autres produits HAO', prefixes: ['84', '86', '88'] },
  { ref: 'RO', label: "Valeurs comptables des cessions d'immobilisations", prefixes: ['81'] },
  { ref: 'RP', label: 'Autres charges HAO', prefixes: ['83', '85'] },
  { ref: 'RQ', label: 'Participation des travailleurs', prefixes: ['87'] },
  { ref: 'RS', label: 'Impôts sur le résultat', prefixes: ['89'] },
];

export const INCOME_TOTALS: { ref: string; label: string; of: string[] }[] = [
  { ref: 'XA', label: 'MARGE COMMERCIALE', of: ['TA', 'RA', 'RB'] },
  { ref: 'XB', label: "CHIFFRE D'AFFAIRES", of: ['TA', 'TB', 'TC', 'TD'] },
  {
    ref: 'XC',
    label: 'VALEUR AJOUTÉE',
    of: ['XB', 'RA', 'RB', 'TE', 'TF', 'TG', 'TH', 'TI', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ'],
  },
  { ref: 'XD', label: "EXCÉDENT BRUT D'EXPLOITATION", of: ['XC', 'RK'] },
  { ref: 'XE', label: "RÉSULTAT D'EXPLOITATION", of: ['XD', 'TJ', 'RL'] },
  { ref: 'XF', label: 'RÉSULTAT FINANCIER', of: ['TK', 'TL', 'TM', 'RM', 'RN'] },
  { ref: 'XG', label: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES', of: ['XE', 'XF'] },
  { ref: 'XH', label: 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES', of: ['TN', 'TO', 'RO', 'RP'] },
  { ref: 'XI', label: 'RÉSULTAT NET', of: ['XG', 'XH', 'RQ', 'RS'] },
];

/** Ordre officiel d'affichage. */
export const INCOME_ORDER = [
  'TA', 'RA', 'RB', 'XA', 'TB', 'TC', 'TD', 'XB', 'TE', 'TF', 'TG', 'TH', 'TI', 'RC', 'RD', 'RE', 'RF', 'RG',
  'RH', 'RI', 'RJ', 'XC', 'RK', 'XD', 'TJ', 'RL', 'XE', 'TK', 'TL', 'TM', 'RM', 'RN', 'XF', 'XG', 'TN', 'TO',
  'RO', 'RP', 'XH', 'RQ', 'RS', 'XI',
];

/** Rattache un compte à la ligne dont le préfixe est le plus long. */
export function incomeRefOf(account: string): string | null {
  let best: { ref: string; len: number } | null = null;
  for (const l of INCOME_LINES) {
    for (const p of l.prefixes) {
      if (account.startsWith(p) && (!best || p.length > best.len)) best = { ref: l.ref, len: p.length };
    }
  }
  return best?.ref ?? null;
}

export interface IncomeStatement {
  values: Record<string, bigint>;
  rows: { ref: string; label: string; total: boolean; value: bigint }[];
  unmapped: AccountBalance[];
  controls: ControlResult[];
}

export function buildIncomeStatement(balances: AccountBalance[]): IncomeStatement {
  const values: Record<string, bigint> = {};
  for (const l of INCOME_LINES) values[l.ref] = 0n;
  const unmapped: AccountBalance[] = [];
  let classResult = 0n;
  for (const b of balances) {
    const c = b.account[0];
    if (c !== '6' && c !== '7' && c !== '8') continue;
    classResult += -b.net;
    const ref = incomeRefOf(b.account);
    if (!ref) {
      if (b.net !== 0n) unmapped.push(b);
      continue;
    }
    values[ref] = values[ref]! - b.net;
  }
  for (const t of INCOME_TOTALS) values[t.ref] = t.of.reduce((s, r) => s + (values[r] ?? 0n), 0n);
  const labels = new Map<string, { label: string; total: boolean }>([
    ...INCOME_LINES.map((l) => [l.ref, { label: l.label, total: false }] as const),
    ...INCOME_TOTALS.map((l) => [l.ref, { label: l.label, total: true }] as const),
  ]);
  const rows = INCOME_ORDER.map((ref) => ({ ref, ...labels.get(ref)!, value: values[ref]! }));
  const controls: ControlResult[] = [
    {
      code: 'CR_COMPTES_MAPPES',
      label: 'Tous les comptes de gestion sont rattachés à une ligne du compte de résultat',
      ok: unmapped.length === 0,
      detail: unmapped.map((u) => u.account).join(', ') || undefined,
      blocking: true,
    },
    {
      code: 'CR_RESULTAT',
      label: 'Résultat net (XI) = solde des comptes de gestion',
      ok: values.XI === classResult,
      blocking: true,
    },
  ];
  return { values, rows, unmapped, controls };
}
