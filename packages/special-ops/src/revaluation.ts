/**
 * Réévaluation des bilans (guide d'application, chapitre 28, applications 99 et 100).
 * Légale : valeur réévaluée = min(VNC × indice, valeur actuelle), écart en 1061 (ou 154 si la loi fiscale impose
 * la neutralité, repris en 861 à hauteur du supplément de dotation). Libre : écart en 1062.
 */
import { C, D, entry, ratio, type OpEntry, type OpResult } from './core';

export interface RevaluedItem { assetAccount: string; cost: bigint; accumulated?: bigint; currentValue: bigint; depreciationAccount?: string }

const amortOf = (it: { assetAccount: string; depreciationAccount?: string }) => it.depreciationAccount ?? `28${it.assetAccount.slice(1, 3)}00`;

export function legalRevaluation(p: { items: RevaluedItem[]; index: number; date: string; taxNeutral?: boolean }): OpResult {
  const reserve = p.taxNeutral ? '154000' : '106100';
  const nonDep: { account: string; gap: bigint }[] = [];
  const entries: OpEntry[] = [];
  const rows: Record<string, bigint | number | string | null> = {};
  let total = 0n;
  for (const it of p.items) {
    const acc = it.accumulated ?? 0n;
    const nbv = it.cost - acc;
    const indexed = BigInt(Math.round(Number(nbv) * p.index));
    const revalued = indexed < it.currentValue ? indexed : it.currentValue;
    const gap = revalued - nbv;
    total += gap;
    rows[it.assetAccount] = revalued;
    if (gap === 0n) continue;
    if (acc === 0n) { nonDep.push({ account: it.assetAccount, gap }); continue; }
    const grossGap = ratio(it.cost, revalued, nbv) - it.cost;
    const accGap = grossGap - gap;
    entries.push(entry('Écart de réévaluation (bien amortissable)', [D(it.assetAccount, grossGap), C(amortOf(it), accGap), C(reserve, gap)], p.date));
  }
  if (nonDep.length) {
    const sum = nonDep.reduce((s, x) => s + x.gap, 0n);
    entries.unshift(entry('Écarts de réévaluation (biens non amortis)', [...nonDep.map((x) => D(x.account, x.gap)), C(reserve, sum)], p.date));
  }
  return { entries, values: { ...rows, total }, notes: ['Valeur retenue : la plus faible de la valeur indiciaire et de la valeur actuelle. Les dotations ultérieures se calculent sur la VNC réévaluée et la durée résiduelle.'] };
}

/** Dotation sur base réévaluée ; en cas de neutralité fiscale, reprise de la provision spéciale (154 / 861). */
export function revaluedDepreciation(p: {
  assetAccount: string; revaluedNbv: bigint; remainingYears: number; historicalAnnual?: bigint; taxNeutral?: boolean; date: string; depreciationAccount?: string;
}): OpResult {
  const annual = p.revaluedNbv / BigInt(p.remainingYears);
  const entries = [entry('Dotation aux amortissements sur base réévaluée', [D('681300', annual), C(amortOf(p), annual)], p.date)];
  const supplement = p.taxNeutral && p.historicalAnnual !== undefined ? annual - p.historicalAnnual : 0n;
  if (supplement > 0n) entries.push(entry('Reprise de la provision spéciale de réévaluation', [D('154000', supplement), C('861000', supplement)], p.date));
  return { entries, values: { annual, supplement } };
}

/**
 * Réévaluation libre d'un bien amortissable (application 100). Méthode 1 : ajustement proportionnel de la valeur
 * brute et des amortissements ; méthode 2 : élimination du cumul des amortissements puis inscription de l'écart.
 */
export function freeRevaluation(p: {
  assetAccount: string; cost: bigint; accumulated: bigint; currentValue: bigint; method: 1 | 2; date: string; depreciationAccount?: string;
}): OpResult {
  const nbv = p.cost - p.accumulated;
  const gap = p.currentValue - nbv;
  const amort = amortOf(p);
  if (p.method === 1) {
    const gross = ratio(p.cost, p.currentValue, nbv);
    const accRevalued = gross - p.currentValue;
    return {
      entries: [entry('Réévaluation libre par ajustement des amortissements', [D(p.assetAccount, gross - p.cost), C(amort, accRevalued - p.accumulated), C('106200', gap)], p.date)],
      values: { gap, revaluedGross: gross, revaluedAccumulated: accRevalued },
    };
  }
  return {
    entries: [
      entry('Annulation des amortissements antérieurs', [D(amort, p.accumulated), C(p.assetAccount, p.accumulated)], p.date),
      entry('Écart de réévaluation libre', [D(p.assetAccount, gap), C('106200', gap)], p.date),
    ],
    values: { gap, revaluedGross: p.currentValue, revaluedAccumulated: 0n },
  };
}
