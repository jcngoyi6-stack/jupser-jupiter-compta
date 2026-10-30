/**
 * Contrats de location (guide d'application, chapitre 8, applications 37 et 38) et réserve de propriété
 * (chapitre 9, applications 39 et 40).
 */
import { C, D, entry, pct, solveRate, type OpResult } from './core';

export interface LeaseRow { period: number; payment: bigint; principal: bigint; interest: bigint; balance: bigint }

/** Taux implicite : valeur actuelle des loyers (terme échu) et de l'option = valeur du bien. */
export function implicitRate(value: bigint, payment: bigint, periods: number, residual = 0n): number {
  const v = Number(value);
  const p = Number(payment);
  const r = Number(residual);
  return solveRate((i) => (i === 0 ? p * periods + r : p * (1 - (1 + i) ** -periods) / i + r * (1 + i) ** -periods) - v, 1e-9, 5);
}

/** Tableau d'amortissement de la dette (preneur) ou de la créance (bailleur) de location. */
export function leaseSchedule(value: bigint, rate: number, payment: bigint, periods: number, residual = 0n, lastPayment?: bigint): LeaseRow[] {
  const rows: LeaseRow[] = [];
  let balance = value;
  for (let k = 1; k <= periods; k++) {
    const pay = k === periods && lastPayment !== undefined ? lastPayment : payment;
    let interest = pct(balance, rate);
    let principal = pay - interest;
    if (k === periods) {
      principal = balance - residual; // la dernière échéance absorbe les arrondis
      interest = pay - principal;
    }
    balance -= principal;
    rows.push({ period: k, payment: pay, principal, interest, balance });
  }
  return rows;
}

const DEBT_ACCOUNT = { IMMOBILIER: '172000', MOBILIER: '173000', LOCATION_VENTE: '174000' } as const;
const RENT_ACCOUNT = { IMMOBILIER: '623200', MOBILIER: '623300', LOCATION_VENTE: '623400' } as const;
const INTEREST_ACCOUNT = { IMMOBILIER: '672200', MOBILIER: '672300', LOCATION_VENTE: '672400' } as const;

/**
 * Preneur, location-acquisition (application 37) : immobilisation au montant de la dette + frais directs,
 * redevance en 623, éclatement en remboursement de dette (17x) et intérêts (672), levée ou non de l'option.
 */
export function lesseeLease(p: {
  assetAccount: string; nature: keyof typeof DEBT_ACCOUNT; value: bigint; payment: bigint; periods: number; optionPrice?: bigint;
  directCosts?: bigint; usefulLifeYears: number; startDate: string; rate?: number; exercised?: boolean;
}): OpResult<LeaseRow> {
  const debt = DEBT_ACCOUNT[p.nature];
  const rent = RENT_ACCOUNT[p.nature];
  const interestAcc = INTEREST_ACCOUNT[p.nature];
  const option = p.optionPrice ?? 0n;
  // taux implicite arrondi au 1/10 000 (le guide raisonne sur un taux exprimé en %)
  const rate = p.rate ?? Math.round(implicitRate(p.value, p.payment, p.periods, option) * 10_000) / 10_000;
  const schedule = leaseSchedule(p.value, rate, p.payment, p.periods, option);
  const cost = p.value + (p.directCosts ?? 0n);
  const amort = `28${p.assetAccount.slice(1, 3)}00`;
  const dotation = cost / BigInt(p.usefulLifeYears);
  const y0 = Number(p.startDate.slice(0, 4));
  const entries = [
    entry('Mise en place du contrat de location-acquisition', [D(p.assetAccount, cost), C(debt, p.value), C('481200', p.directCosts ?? 0n)], p.startDate),
    ...schedule.flatMap((r) => [
      entry(`Redevance n° ${r.period}`, [D(rent, r.payment), C('401100', r.payment)], `${y0 + r.period - 1}-12-31`),
      entry(`Éclatement de la redevance n° ${r.period}`, [D(debt, r.principal), D(interestAcc, r.interest), C(rent, r.payment)], `${y0 + r.period - 1}-12-31`),
    ]),
  ];
  const end = `${y0 + p.periods - 1}-12-31`;
  if (option > 0n && p.exercised !== false) {
    entries.push(entry('Levée de l’option d’achat', [D(rent, option), C('521100', option)], end));
    entries.push(entry('Retraitement de la levée d’option', [D(debt, option), C(rent, option)], end));
  } else if (option > 0n) {
    const accumulated = dotation * BigInt(p.periods);
    entries.push(entry('Sortie du bien repris par le bailleur (option non levée)', [D('812000', cost - accumulated), D(amort, accumulated), C(p.assetAccount, cost)], end));
    entries.push(entry('Annulation de la dette du prix de levée d’option', [D(debt, option), C('822000', option)], end));
  }
  return { entries, schedule, values: { rate, cost, annualDepreciation: dotation }, notes: ['Dotations annuelles : 6813 / 28 sur le coût d’acquisition (durée d’utilité du bien si l’option est raisonnablement certaine).'] };
}

/**
 * Bailleur, location-financement (application 38) : créance 2714 au prix de vente, sortie du stock,
 * loyers encaissés ventilés en remboursement de créance et intérêts (775).
 */
export function lessorLease(p: { salePrice: bigint; productionCost: bigint; payment: bigint; periods: number; rate: number; lastPayment?: bigint; startDate: string; commission?: bigint }): OpResult<LeaseRow> {
  const schedule = leaseSchedule(p.salePrice, p.rate, p.payment, p.periods, 0n, p.lastPayment);
  const y0 = Number(p.startDate.slice(0, 4));
  return {
    schedule,
    entries: [
      entry('Vente du bien en location-financement', [D('271400', p.salePrice), C('702100', p.salePrice)], p.startDate),
      entry('Sortie du stock de produits finis', [D('736000', p.productionCost), C('361000', p.productionCost)], p.startDate),
      entry('Commission d’intermédiaire', [D('632200', p.commission ?? 0n), C('401100', p.commission ?? 0n)], p.startDate),
      ...schedule.map((r) => entry(`Loyer n° ${r.period}`, [D('521100', r.payment), C('271400', r.principal), C('775000', r.interest)], `${y0 + r.period - 1}-12-31`)),
    ].filter((e) => e.lines.length),
  };
}

/** Réserve de propriété — acheteur (application 39) : immobilisation identifiée, engagement accordé (9083/9183). */
export function retentionBuyer(p: { assetAccount: string; amount: bigint; date: string; paymentDate?: string }): OpResult {
  return {
    entries: [
      entry('Acquisition avec clause de réserve de propriété', [D(p.assetAccount, p.amount), C('481600', p.amount)], p.date),
      entry('Engagement accordé (achat avec réserve de propriété)', [D('918300', p.amount), C('908300', p.amount)], p.date),
      ...(p.paymentDate
        ? [
          entry('Règlement du fournisseur', [D('481600', p.amount), C('521100', p.amount)], p.paymentDate),
          entry('Annulation de l’engagement accordé', [D('908300', p.amount), C('918300', p.amount)], p.paymentDate),
        ]
        : []),
    ],
    notes: ['Le bien est inscrit à l’actif dès le transfert des risques et avantages, malgré la clause.'],
  };
}

/**
 * Réserve de propriété — vendeur (application 40) : créance 4116, engagement obtenu (9043/9143) ;
 * défaillance : créance douteuse, dépréciation, reprise du bien à sa valeur actuelle (601), ajustement au prix définitif.
 */
export function retentionSeller(p: {
  amount: bigint; salesAccount?: string; date: string;
  default?: { outstanding: bigint; recoverable: bigint; date: string; reposessionValue?: bigint; finalNetPrice?: bigint };
}): OpResult {
  const entries = [
    entry('Vente avec clause de réserve de propriété', [D('411600', p.amount), C(p.salesAccount ?? '701100', p.amount)], p.date),
    entry('Engagement obtenu (vente avec réserve de propriété)', [D('904300', p.amount), C('914300', p.amount)], p.date),
  ];
  if (p.default) {
    const f = p.default;
    entries.push(entry('Créance devenue douteuse', [D('416200', f.outstanding), C('411600', f.outstanding)], f.date));
    entries.push(entry('Dépréciation de la créance (perte probable)', [D('659400', f.outstanding - f.recoverable), C('491200', f.outstanding - f.recoverable)], f.date));
    if (f.reposessionValue !== undefined) {
      entries.push(entry('Reprise du bien à sa valeur actuelle', [D('601100', f.reposessionValue), C('416200', f.reposessionValue)], f.date));
      if (f.finalNetPrice !== undefined && f.finalNetPrice !== f.reposessionValue) {
        entries.push(entry('Rectification de la valeur d’entrée au prix définitif', [D('601100', f.finalNetPrice - f.reposessionValue), C('416200', f.finalNetPrice - f.reposessionValue)], f.date));
      }
    }
  }
  return { entries };
}
