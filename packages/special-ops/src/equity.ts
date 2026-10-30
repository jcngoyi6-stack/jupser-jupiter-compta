/**
 * Capitaux propres (guide d'application, chapitre 16, applications 58 à 64) : constitution, libération
 * fractionnée, augmentations et réductions de capital, amortissement du capital.
 * L'affectation du résultat (application 65) est servie par le module de clôture (ledger/closing).
 */
import { C, D, entry, type OpLine, type AccountAmount, type OpResult } from './core';

/**
 * Constitution avec libération intégrale (application 58) : promesses (461x / 1011), exigibilité (4613),
 * appel (1011 / 1012), réalisation des apports en nature et en numéraire (via le notaire 4732), reclassement
 * en 1013, puis virement des fonds par le notaire sous déduction de ses honoraires et frais d'actes.
 */
export function incorporation(p: {
  capital: bigint; inKindAssets?: AccountAmount[]; inKindLiabilities?: AccountAmount[]; promiseDate: string; realisationDate: string;
  notaryTransferDate?: string; notaryFees?: bigint; actFees?: bigint;
}): OpResult {
  const assets = p.inKindAssets ?? [];
  const liabilities = p.inKindLiabilities ?? [];
  const inKind = assets.reduce((s, a) => s + a.amount, 0n) - liabilities.reduce((s, a) => s + a.amount, 0n);
  const cash = p.capital - inKind;
  if (cash < 0n) throw new Error('APPORTS_EN_NATURE_SUPERIEURS_AU_CAPITAL');
  const entries = [
    entry('Promesses d’apport', [D('461100', inKind), D('461200', cash), C('101100', p.capital)], p.promiseDate),
    entry('Exigibilité de la créance sur les apporteurs', [D('461300', p.capital), C('461100', inKind), C('461200', cash)], p.promiseDate),
    entry('Appel du capital', [D('101100', p.capital), C('101200', p.capital)], p.promiseDate),
  ];
  if (inKind !== 0n) {
    entries.push(entry('Réalisation des apports en nature', [
      ...assets.map((a) => D(a.account, a.amount)), ...liabilities.map((l) => C(l.account, l.amount)), C('461300', inKind),
    ], p.realisationDate));
  }
  if (cash > 0n) entries.push(entry('Réalisation des apports en numéraire (notaire)', [D('473200', cash), C('461300', cash)], p.realisationDate));
  entries.push(entry('Reclassement du capital', [D('101200', p.capital), C('101300', p.capital)], p.realisationDate));
  if (p.notaryTransferDate && cash > 0n) {
    const fees = (p.notaryFees ?? 0n) + (p.actFees ?? 0n);
    entries.push(entry('Versement des fonds par le notaire', [
      D('521100', cash - fees), D('632400', p.notaryFees ?? 0n), D('632500', p.actFees ?? 0n), C('473200', cash),
    ], p.notaryTransferDate));
  }
  return { entries, values: { inKind, cash } };
}

/**
 * Libération fractionnée du capital en numéraire (application 59) : promesse et premier appel, puis un appel
 * par fraction (109 / 4613 et 1011 / 1012), versement en banque et reclassement en 1013.
 */
export function fractionedCapital(p: {
  capital: bigint; subscriptionDate: string; calls: { amount: bigint; callDate: string; paymentDate?: string }[];
}): OpResult {
  const called = p.calls.reduce((s, c) => s + c.amount, 0n);
  if (called > p.capital) throw new Error('APPELS_SUPERIEURS_AU_CAPITAL');
  const [first, ...rest] = p.calls;
  if (!first) throw new Error('AUCUN_APPEL');
  const entries = [
    entry('Promesses d’apport', [D('461200', p.capital), C('101100', p.capital)], p.subscriptionDate),
    entry('Appel de la première fraction du capital', [D('101100', first.amount), C('101200', first.amount)], p.subscriptionDate),
    entry('Appel de la première fraction : créance sur les apporteurs', [
      D('109000', p.capital - first.amount), D('461300', first.amount), C('461200', p.capital),
    ], p.subscriptionDate),
  ];
  const pay = (c: { amount: bigint; paymentDate?: string }) => {
    if (!c.paymentDate) return;
    entries.push(entry('Versement des apporteurs', [D('521100', c.amount), C('461300', c.amount)], c.paymentDate));
    entries.push(entry('Reclassement du capital versé', [D('101200', c.amount), C('101300', c.amount)], c.paymentDate));
  };
  pay(first);
  for (const c of rest) {
    entries.push(entry('Appel d’une fraction du capital', [D('461300', c.amount), C('109000', c.amount)], c.callDate));
    entries.push(entry('Appel d’une fraction du capital', [D('101100', c.amount), C('101200', c.amount)], c.callDate));
    pay(c);
  }
  return { entries, values: { uncalled: p.capital - called } };
}

/** Augmentation de capital en numéraire (application 60) : 4732 / 4615, puis 1013 + 1051, puis banque. */
export function capitalIncreaseCash(p: {
  quantity: number; nominal: bigint; issuePrice: bigint; subscriptionDate: string; recordDate: string; transferDate: string;
}): OpResult {
  const q = BigInt(p.quantity);
  const total = p.issuePrice * q;
  const capital = p.nominal * q;
  return {
    entries: [
      entry('Souscriptions reçues par le notaire', [D('473200', total), C('461500', total)], p.subscriptionDate),
      entry('Augmentation du capital', [D('461500', total), C('101300', capital), C('105100', total - capital)], p.recordDate),
      entry('Virement des fonds par le notaire', [D('521100', total), C('473200', total)], p.transferDate),
    ],
    values: { capital, premium: total - capital },
  };
}

/** Augmentation par incorporation de réserves (application 61). */
export function capitalIncreaseReserves(p: { amount: bigint; reserveAccount?: string; date: string }): OpResult {
  return { entries: [entry('Augmentation de capital par incorporation de réserves', [D(p.reserveAccount ?? '118100', p.amount), C('101300', p.amount)], p.date)] };
}

/** Réduction de capital par imputation des pertes (application 62). */
export function capitalReductionLosses(p: { amount: bigint; date: string }): OpResult {
  return { entries: [entry('Apurement des pertes par réduction du capital', [D('101300', p.amount), C('129100', p.amount)], p.date)] };
}

/** Réduction de capital par remboursement (application 63) : 1013 / 4619 puis règlement. */
export function capitalReductionRepayment(p: { amount: bigint; date: string; paymentDate?: string }): OpResult {
  const entries = [entry('Réduction de capital', [D('101300', p.amount), C('461900', p.amount)], p.date)];
  if (p.paymentDate) entries.push(entry('Remboursement aux associés', [D('461900', p.amount), C('521100', p.amount)], p.paymentDate));
  return { entries };
}

/** Amortissement du capital (application 64) : 1013 / 1014, prélèvement sur réserves 11X / 4619, règlement. */
export function capitalAmortisation(p: { amount: bigint; reserveAccount?: string; date: string; paymentDate?: string }): OpResult {
  const lines: OpLine[] = [D('461900', p.amount), C('521100', p.amount)];
  return {
    entries: [
      entry('Constatation de l’amortissement du capital', [D('101300', p.amount), C('101400', p.amount)], p.date),
      entry('Capital à rembourser prélevé sur les réserves', [D(p.reserveAccount ?? '118800', p.amount), C('461900', p.amount)], p.date),
      entry('Remboursement aux associés', lines, p.paymentDate ?? p.date),
    ],
  };
}
