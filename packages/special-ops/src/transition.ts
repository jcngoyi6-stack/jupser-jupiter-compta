/**
 * Première application du SYSCOHADA révisé (guide d'application, chapitre 41, applications 123 à 126).
 * Les comptes de l'ancien plan à solder (201X frais d'établissement, 206 primes de remboursement, 352…) sont des
 * paramètres : ils doivent exister dans le plan de reprise du dossier (balance d'ouverture migrée).
 */
import { C, D, entry, ratio, type OpEntry, type OpResult } from './core';

export interface AccountAmount { account: string; amount: bigint }

/**
 * Frais d'établissement (application 123, opération 1) : solde viré en 4751 au bilan d'ouverture puis repris par
 * les charges par nature d'origine sur la durée restant à amortir (cinq ans au plus).
 */
export function establishmentCostsTransition(p: {
  legacyAccount: string; originalCharges: AccountAmount[]; originalYears: number; yearsElapsed: number; transitionDate: string; spreadYears?: number;
}): OpResult {
  const remaining = p.originalYears - p.yearsElapsed;
  const years = Math.min(p.spreadYears ?? remaining, 5);
  const parts = p.originalCharges.map((c) => ({ account: c.account, amount: ratio(c.amount, BigInt(remaining), BigInt(p.originalYears)) }));
  const balance = parts.reduce((s, x) => s + x.amount, 0n);
  const y0 = Number(p.transitionDate.slice(0, 4));
  const entries: OpEntry[] = [entry('Bilan d’ouverture : frais d’établissement virés au compte transitoire', [D('475100', balance), C(p.legacyAccount, balance)], p.transitionDate)];
  const spent = parts.map(() => 0n);
  for (let k = 1; k <= years; k++) {
    const lines = parts.map((x, i) => {
      const amount = k === years ? x.amount - spent[i]! : x.amount / BigInt(years);
      spent[i]! += amount;
      return D(x.account, amount);
    });
    const total = lines.reduce((s, l) => s + l.debit, 0n);
    entries.push(entry('Étalement des frais d’établissement', [...lines, C('475100', total)], `${y0 + k - 1}-12-31`));
  }
  return { entries, values: { balance, years } };
}

/**
 * Primes de remboursement des obligations (application 123, opération 2) : le solde du 206 est imputé sur la dette
 * (161), puis rattaché en 6714 / 1661 au prorata des intérêts restant à courir.
 */
export function bondPremiumTransition(p: { legacyAccount?: string; balance: bigint; remainingInterests: bigint[]; transitionDate: string; debtAccount?: string }): OpResult {
  const total = p.remainingInterests.reduce((s, x) => s + x, 0n);
  const y0 = Number(p.transitionDate.slice(0, 4));
  const entries: OpEntry[] = [entry('Bilan d’ouverture : prime de remboursement imputée sur l’emprunt', [D(p.debtAccount ?? '161100', p.balance), C(p.legacyAccount ?? '206000', p.balance)], p.transitionDate)];
  let left = p.balance;
  p.remainingInterests.forEach((i, k) => {
    const part = k === p.remainingInterests.length - 1 ? left : ratio(p.balance, i, total);
    left -= part;
    entries.push(entry('Rattachement de la prime de remboursement', [D('671400', part), C('166100', part)], `${y0 + k}-12-31`));
  });
  return { entries };
}

/**
 * Approche par composants (application 124) : réallocation de la valeur brute et des amortissements au prorata des
 * VNC des composants, sans incidence sur les capitaux propres ; nouvelles annuités sur les durées résiduelles.
 */
export function componentReallocation(p: {
  assetAccount: string; gross: bigint; accumulated: bigint; date: string;
  components: { account: string; depreciationAccount: string; share: number; remainingYears: number }[]; depreciationAccount?: string;
}): OpResult {
  const amort = p.depreciationAccount ?? `28${p.assetAccount.slice(1, 3)}00`;
  const rows = p.components.map((c) => {
    const gross = BigInt(Math.round(Number(p.gross) * c.share));
    const acc = BigInt(Math.round(Number(p.accumulated) * c.share));
    return { ...c, gross, accumulated: acc, annual: (gross - acc) / BigInt(c.remainingYears) };
  });
  return {
    entries: [entry('Bilan d’ouverture : ventilation par composants', [
      ...rows.map((r) => D(r.account, r.gross)), D(amort, p.accumulated), C(p.assetAccount, p.gross), ...rows.map((r) => C(r.depreciationAccount, r.accumulated)),
    ], p.date)],
    values: Object.fromEntries([...rows.map((r) => [`annuite_${r.account}`, r.annual] as const), ['annualTotal', rows.reduce((s, r) => s + r.annual, 0n)] as const]),
    notes: ['Sans comptes de composants distincts dans le plan, utiliser des sous-comptes du dossier ou le registre des composants des immobilisations.'],
  };
}

/**
 * Engagements de retraite non comptabilisés antérieurement (application 125) : 4751 / 196 au bilan d'ouverture, puis
 * étalement linéaire sur cinq ans au plus (6911 / 4751) ; la variation de l'exercice suit `pensionYearEnd`.
 */
export function pensionTransition(p: { priorObligation: bigint; spreadYears: number; transitionDate: string }): OpResult {
  const years = Math.min(p.spreadYears, 5);
  const y0 = Number(p.transitionDate.slice(0, 4));
  const entries: OpEntry[] = [entry('Bilan d’ouverture : engagements de retraite antérieurs', [D('475100', p.priorObligation), C('196100', p.priorObligation)], p.transitionDate)];
  let left = p.priorObligation;
  for (let k = 1; k <= years; k++) {
    const part = k === years ? left : p.priorObligation / BigInt(years);
    left -= part;
    entries.push(entry('Étalement des engagements antérieurs', [D('691100', part), C('475100', part)], `${y0 + k - 1}-12-31`));
  }
  return { entries };
}

/** Contrat à long terme passé à l'avancement (application 126) : en-cours de l'ancien plan soldé par 4181. */
export function longTermContractTransition(p: { workInProgress: bigint; legacyAccount?: string; transitionDate: string }): OpResult {
  return { entries: [entry('Changement de méthode : solde des en-cours', [D('418100', p.workInProgress), C(p.legacyAccount ?? '352100', p.workInProgress)], p.transitionDate)] };
}
