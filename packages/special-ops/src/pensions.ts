/**
 * Engagements de retraite (guide d'application, chapitre 21, applications 81 à 83) : méthode des unités de
 * crédit projetées, coût des services (6911) et coût financier (6971), écarts actuariels, régimes couverts.
 * Les hypothèses actuarielles (taux, tables, convention collective) sont des paramètres : TODO(actuaire).
 */
import { C, D, entry, type OpResult } from './core';

export interface PbcInput {
  salary: bigint; salaryGrowth: number; benefitRate: number; yearsServed: number; totalYears: number; yearsToRetirement: number;
  discountRate: number; probability: number; chargesRate?: number;
}

/** Valeur actuelle de l'obligation (unités de crédit projetées). */
export function projectedObligation(p: PbcInput): bigint {
  const n = p.yearsToRetirement;
  const future = Number(p.salary) * (1 + p.salaryGrowth) ** n * p.benefitRate * (p.yearsServed / p.totalYears);
  return BigInt(Math.round(future * p.probability * (1 + p.discountRate) ** -n * (1 + (p.chargesRate ?? 0))));
}

/**
 * Dotation de l'exercice : coût des services (droits acquis dans l'exercice) en 6911, coût financier
 * (obligation d'ouverture × taux d'actualisation) en 6971, écart actuariel (attendu − réel) en 7971 ou 6971.
 */
export function pensionYearEnd(p: { opening: bigint; serviceCost: bigint; discountRate: number; closing?: bigint; date: string }): OpResult {
  const financialCost = BigInt(Math.round(Number(p.opening) * p.discountRate));
  const expected = p.opening + p.serviceCost + financialCost;
  const entries = [entry('Dotation à la provision pour engagements de retraite', [D('691100', p.serviceCost), D('697100', financialCost), C('196100', p.serviceCost + financialCost)], p.date)];
  const gap = p.closing === undefined ? 0n : expected - p.closing;
  if (gap > 0n) entries.push(entry('Gain actuariel', [D('196100', gap), C('797100', gap)], p.date));
  if (gap < 0n) entries.push(entry('Perte actuarielle', [D('697100', -gap), C('196100', -gap)], p.date));
  return { entries, values: { financialCost, expected, actuarialGap: gap } };
}

/**
 * Régime couvert par une assurance (application 83).
 * Méthode 1 : primes en charges (6686), provision limitée à l'engagement non couvert ;
 * méthode 2 : primes à l'actif (1962), provision pour l'engagement total.
 */
export function insuredPensionPremium(p: { method: 1 | 2; premium: bigint; obligation: bigint; existingProvision?: bigint; date: string }): OpResult {
  const existing = p.existingProvision ?? 0n;
  const target = p.method === 1 ? p.obligation - p.premium : p.obligation;
  const delta = target - existing;
  return {
    entries: [
      entry('Versement des primes à l’assurance', [D(p.method === 1 ? '668600' : '196200', p.premium), C('521100', p.premium)], p.date),
      ...(delta > 0n ? [entry('Complément d’engagement de retraite', [D('691100', delta), C('196100', delta)], p.date)] : []),
    ],
    values: { provision: target },
  };
}

/** Départ à la retraite : versement par l'assureur (au salarié ou à l'entité), complément payé par l'entité, reprise. */
export function retirementPayment(p: {
  method: 1 | 2; obligation: bigint; insurerPays: bigint; paidTo?: 'SALARIE' | 'ENTITE'; provision: bigint; date: string; closingDate: string;
}): OpResult {
  const complement = p.obligation - p.insurerPays;
  const entries = [];
  if (p.method === 1) {
    entries.push(entry('Complément d’indemnité réglé par l’entité', [D('661800', complement), C('521100', complement)], p.date));
  } else if (p.paidTo === 'ENTITE') {
    entries.push(entry('Versement des fonds par l’assurance à l’entité', [D('521100', p.insurerPays), C('196200', p.insurerPays)], p.date));
    entries.push(entry('Indemnités de départ réglées par l’entité', [D('661800', p.obligation), C('521100', p.obligation)], p.date));
  } else {
    entries.push(entry('Indemnités versées par l’assurance et complément de l’entité', [D('661800', p.obligation), C('196200', p.insurerPays), C('521100', complement)], p.date));
  }
  entries.push(entry('Reprise de la provision pour retraite', [D('196100', p.provision), C('791100', p.provision)], p.closingDate));
  return { entries };
}
