import { splitCsvLine } from './accounts';
import { parseAmount } from './money';

/**
 * Imports (docs/14, docs/15) : reconnaissance des colonnes d'une balance, d'un journal ou d'un relevé,
 * correspondance des comptes du client vers le plan SYSCOHADA à 6 chiffres.
 */
export type Row = string[];

export function parseDelimited(text: string): Row[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0]!;
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0]!;
  return lines.map((l) => splitCsvLine(l, sep).map((c) => c.trim()));
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export interface BalanceColumns {
  account: number;
  label: number;
  debit: number; // solde ou mouvement débit
  credit: number;
  layout: '4' | '6' | '8';
}

/** Détecte les colonnes d'une balance à 4, 6 ou 8 colonnes (en-tête en français ou anglais). */
export function detectBalanceColumns(header: Row): BalanceColumns {
  const h = header.map(norm);
  const find = (...keys: string[]) => h.findIndex((c) => keys.some((k) => c.includes(k)));
  const account = find('compte', 'account', 'numero', 'n');
  const label = find('intitule', 'libelle', 'label', 'designation');
  const debitCols = h.map((c, i) => (c.includes('debit') ? i : -1)).filter((i) => i >= 0);
  const creditCols = h.map((c, i) => (c.includes('credit') ? i : -1)).filter((i) => i >= 0);
  if (account < 0 || !debitCols.length || !creditCols.length) {
    throw new Error('Colonnes non reconnues : il faut au moins Compte, Débit et Crédit.');
  }
  const layout = debitCols.length >= 4 ? '8' : debitCols.length === 3 ? '6' : '4';
  // le solde de clôture est la dernière paire débit/crédit
  return { account, label, debit: debitCols.at(-1)!, credit: creditCols.at(-1)!, layout };
}

export interface ImportedBalanceLine {
  account: string;
  label: string;
  debit: bigint;
  credit: bigint;
}

export function parseBalance(rows: Row[], decimals = 2): { cols: BalanceColumns; lines: ImportedBalanceLine[]; errors: string[] } {
  const [header, ...data] = rows;
  if (!header) throw new Error('Fichier vide.');
  const cols = detectBalanceColumns(header);
  const errors: string[] = [];
  const lines: ImportedBalanceLine[] = [];
  data.forEach((r, i) => {
    const acc = (r[cols.account] ?? '').replace(/\s/g, '');
    if (!/^\d+$/.test(acc)) return; // lignes de totaux / titres
    try {
      lines.push({
        account: acc,
        label: cols.label >= 0 ? r[cols.label] ?? '' : '',
        debit: parseAmount(r[cols.debit] || '0', decimals),
        credit: parseAmount(r[cols.credit] || '0', decimals),
      });
    } catch (e) {
      errors.push(`Ligne ${i + 2} : ${(e as Error).message}`);
    }
  });
  const d = lines.reduce((s, l) => s + l.debit, 0n);
  const c = lines.reduce((s, l) => s + l.credit, 0n);
  if (d !== c) errors.push(`Balance déséquilibrée : débit ${d} ≠ crédit ${c} (unités mineures).`);
  return { cols, lines, errors };
}

export interface MappingSuggestion {
  source: string;
  target: string | null;
  confidence: number; // 0..1
  reason: string;
}

/**
 * Correspondance vers le plan à 6 chiffres : préfixe officiel le plus long, sinon similarité du libellé.
 * `memory` : correspondances déjà validées pour ce client (réutilisées d'une année sur l'autre).
 */
export function suggestMapping(
  source: { account: string; label: string },
  chart: { number: string; official: string; label: string; imputable: boolean }[],
  memory: Record<string, string> = {},
): MappingSuggestion {
  if (memory[source.account]) return { source: source.account, target: memory[source.account]!, confidence: 1, reason: 'Correspondance mémorisée' };
  const imputable = chart.filter((c) => c.imputable);
  const padded = source.account.slice(0, 6).padEnd(6, '0');
  if (imputable.some((c) => c.number === padded)) return { source: source.account, target: padded, confidence: 0.95, reason: 'Numéro identique au plan SYSCOHADA' };
  for (let len = Math.min(4, source.account.length); len >= 2; len--) {
    const p = source.account.slice(0, len);
    const cands = imputable.filter((c) => c.number.startsWith(p));
    if (cands.length) {
      const best = bestLabel(source.label, cands);
      return { source: source.account, target: best.number, confidence: 0.5 + len * 0.1, reason: `Préfixe ${p}` };
    }
  }
  if (source.label) {
    const best = bestLabel(source.label, imputable);
    return { source: source.account, target: best.number, confidence: 0.3, reason: 'Similarité du libellé' };
  }
  return { source: source.account, target: null, confidence: 0, reason: 'Aucune correspondance' };
}

function bestLabel(label: string, cands: { number: string; label: string }[]) {
  const words = new Set(norm(label).match(/[a-z]{4,}/g) ?? []);
  const tokens = (s: string) => new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const score = (s: string) => {
    const t = tokens(s);
    let n = 0;
    for (const w of t) if ([...words].some((x) => x.includes(w) || w.includes(x))) n++;
    return n;
  };
  return [...cands].sort((a, b) => score(b.label) - score(a.label) || a.number.localeCompare(b.number))[0]!;
}

export interface ImportedJournalLine {
  journal: string;
  date: string;
  piece: string;
  account: string;
  label: string;
  debit: bigint;
  credit: bigint;
}

/** Journal d'écritures (Journal;Date;Pièce;Compte;Libellé;Débit;Crédit), regroupé par pièce. */
export function parseJournal(rows: Row[], decimals = 2) {
  const [header, ...data] = rows;
  if (!header) throw new Error('Fichier vide.');
  const h = header.map(norm);
  const idx = (...k: string[]) => h.findIndex((c) => k.some((x) => c.includes(x)));
  const col = { journal: idx('journal', 'jnl'), date: idx('date'), piece: idx('piece', 'ref'), account: idx('compte', 'account'), label: idx('libelle', 'label'), debit: idx('debit'), credit: idx('credit') };
  if (Object.values(col).some((v) => v < 0)) throw new Error('Colonnes attendues : Journal, Date, Pièce, Compte, Libellé, Débit, Crédit.');
  const lines: ImportedJournalLine[] = data.map((r) => ({
    journal: r[col.journal]!,
    date: toIsoDate(r[col.date]!),
    piece: r[col.piece]!,
    account: r[col.account]!.replace(/\s/g, '').padEnd(6, '0'),
    label: r[col.label] ?? '',
    debit: parseAmount(r[col.debit] || '0', decimals),
    credit: parseAmount(r[col.credit] || '0', decimals),
  }));
  const groups = new Map<string, ImportedJournalLine[]>();
  for (const l of lines) {
    const k = `${l.journal}|${l.date}|${l.piece}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.values()];
}

/** JJ/MM/AAAA ou AAAA-MM-JJ → AAAA-MM-JJ */
export function toIsoDate(s: string): string {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (!m) throw new Error(`Date invalide : ${s}`);
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

export interface StatementLine {
  date: string;
  label: string;
  amount: bigint; // + crédit en banque (encaissement), – débit (décaissement)
  reference?: string;
}

export function parseBankStatement(rows: Row[], decimals = 2): StatementLine[] {
  const [header, ...data] = rows;
  if (!header) return [];
  const h = header.map(norm);
  const idx = (...k: string[]) => h.findIndex((c) => k.some((x) => c.includes(x)));
  const date = idx('date');
  const label = idx('libelle', 'label', 'description', 'operation');
  const amount = idx('montant', 'amount');
  const debit = idx('debit', 'retrait');
  const credit = idx('credit', 'depot');
  const ref = idx('reference', 'ref', 'transaction');
  return data.map((r) => {
    let v: bigint;
    if (amount >= 0) v = parseAmount(r[amount] || '0', decimals);
    else v = parseAmount(r[credit] || '0', decimals) - parseAmount(r[debit] || '0', decimals);
    return { date: toIsoDate(r[date]!), label: r[label] ?? '', amount: v, reference: ref >= 0 ? r[ref] : undefined };
  });
}
