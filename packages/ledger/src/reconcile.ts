import type { StatementLine } from './imports';

/** Rapprochement bancaire / mobile money assisté : correspondances proposées avec score de confiance. */
export interface BookLine {
  id: string;
  date: string;
  label: string;
  pieceRef: string;
  amount: bigint; // + débit du compte 52/55/57 (entrée), – crédit (sortie)
}

export interface Match {
  statementIndex: number;
  bookId: string;
  score: number;
  reasons: string[];
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

export function proposeMatches(statement: StatementLine[], book: BookLine[], maxDays = 10): Match[] {
  const candidates: Match[] = [];
  statement.forEach((s, i) => {
    for (const b of book) {
      if (b.amount !== s.amount) continue;
      const d = dayDiff(s.date, b.date);
      if (d > maxDays) continue;
      const reasons = ['Montant identique'];
      let score = 0.6 + (1 - d / maxDays) * 0.2;
      const ref = (s.reference ?? '') + ' ' + s.label;
      if (b.pieceRef && ref.toLowerCase().includes(b.pieceRef.toLowerCase())) {
        score += 0.2;
        reasons.push('Référence retrouvée');
      }
      if (d === 0) reasons.push('Même date');
      candidates.push({ statementIndex: i, bookId: b.id, score: Math.min(1, Number(score.toFixed(2))), reasons });
    }
  });
  // affectation gloutonne par score décroissant, chaque ligne utilisée une fois
  candidates.sort((a, b) => b.score - a.score);
  const usedS = new Set<number>();
  const usedB = new Set<string>();
  const out: Match[] = [];
  for (const c of candidates) {
    if (usedS.has(c.statementIndex) || usedB.has(c.bookId)) continue;
    usedS.add(c.statementIndex);
    usedB.add(c.bookId);
    out.push(c);
  }
  return out.sort((a, b) => a.statementIndex - b.statementIndex);
}

/** État de rapprochement : solde comptable ajusté = solde du relevé ajusté. */
export function reconciliationStatement(bookBalance: bigint, statementBalance: bigint, unmatchedBook: BookLine[], unmatchedStatement: StatementLine[]) {
  const inBookNotBank = unmatchedBook.reduce((s, b) => s + b.amount, 0n);
  const inBankNotBook = unmatchedStatement.reduce((s, l) => s + l.amount, 0n);
  const adjustedBook = bookBalance + inBankNotBook;
  const adjustedBank = statementBalance + inBookNotBank;
  return { bookBalance, statementBalance, inBookNotBank, inBankNotBook, adjustedBook, adjustedBank, reconciled: adjustedBook === adjustedBank };
}
