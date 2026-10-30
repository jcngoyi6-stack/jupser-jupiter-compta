/**
 * Fusions et apports partiels d'actif (guide d'application, chapitre 37, applications 116 à 120).
 * Valeurs d'échange des titres (avec participations de l'absorbante dans l'absorbée, de l'absorbée dans
 * l'absorbante, ou réciproques), parité, augmentation de capital, prime et boni de fusion, écritures chez
 * l'absorbante et chez l'absorbée. Les apports sont à la valeur réelle en cas de prise de contrôle, à la valeur
 * comptable en cas d'absorption d'une filiale détenue à 100 %.
 */
import { C, D, entry, ratio, type OpEntry, type OpLine, type OpResult } from './core';

export interface MergerAsset { account: string; gross: bigint; accumulated?: bigint; accumulatedAccount?: string; value?: bigint }
export interface MergerLine { account: string; amount: bigint }

export interface MergerInput {
  date: string;
  absorbing: { shares: number; nominal: bigint; netAssets: bigint; shareValue?: bigint; holdsAbsorbedShares?: number; holdingCost?: bigint; holdingAccount?: string };
  absorbed: {
    shares: number; assets: MergerAsset[]; liabilities: MergerLine[]; equity: MergerLine[];
    holdsAbsorbingShares?: number; holdingAccount?: string; holdingCost?: bigint;
  };
  costs?: { fees: bigint; bankFees?: bigint; imputeOnPremium?: boolean };
  receivedSharesAccount?: string;
}

/** Valeurs des titres : système à deux équations en cas de participations (application 119). */
export function mergerShareValues(p: { naA: bigint; naB: bigint; sharesA: number; sharesB: number; aHoldsB?: number; bHoldsA?: number; valueA?: bigint }): { valueA: bigint; valueB: bigint } {
  const hA = BigInt(p.aHoldsB ?? 0);
  const hB = BigInt(p.bHoldsA ?? 0);
  const sA = BigInt(p.sharesA);
  const sB = BigInt(p.sharesB);
  if (p.valueA !== undefined) return { valueA: p.valueA, valueB: (p.naB + hB * p.valueA) / sB };
  const det = sA * sB - hA * hB;
  return { valueA: (p.naA * sB + hA * p.naB) / det, valueB: (sA * p.naB + hB * p.naA) / det };
}

export function merger(p: MergerInput): OpResult {
  const A = p.absorbing;
  const B = p.absorbed;
  const hA = A.holdsAbsorbedShares ?? 0;
  const hB = B.holdsAbsorbingShares ?? 0;
  const holdingB = B.holdingAccount ?? '263000';
  const assets = B.assets.filter((a) => a.account !== holdingB || hB === 0);
  const naB = assets.reduce((s, a) => s + (a.value ?? a.gross - (a.accumulated ?? 0n)), 0n) - B.liabilities.reduce((s, l) => s + l.amount, 0n);
  const { valueA, valueB } = mergerShareValues({ naA: A.netAssets, naB, sharesA: A.shares, sharesB: B.shares, aHoldsB: hA, bHoldsA: hB, valueA: A.shareValue });
  const contribution = naB + BigInt(hB) * valueA;
  const external = B.shares - hA;
  const externalPart = ratio(contribution, BigInt(external), BigInt(B.shares));
  const absorbingPart = contribution - externalPart;
  const issued = Number((BigInt(external) * valueB * 2n + valueA) / (2n * valueA));
  const capital = BigInt(issued) * A.nominal;
  const premium = externalPart - capital;
  const boni = absorbingPart - (A.holdingCost ?? 0n);
  const ownShares = BigInt(hB) * valueA;

  const absorbing: OpEntry[] = [
    entry('Augmentation de capital rémunérant les apports', [
      D('461400', contribution), C('101300', capital), C('105300', premium + boni), C(A.holdingAccount ?? '261000', A.holdingCost ?? 0n),
    ], p.date),
    entry('Réalisation des apports', [
      ...assets.map((a) => D(a.account, a.value ?? a.gross - (a.accumulated ?? 0n))), D('502100', ownShares),
      ...B.liabilities.map((l) => C(l.account, l.amount)), C('461400', contribution),
    ], p.date),
  ];
  if (hB) {
    const reduction = BigInt(hB) * A.nominal;
    absorbing.push(entry('Annulation des actions propres reçues par réduction de capital', [D('101300', reduction), D('105300', ownShares - reduction), C('502100', ownShares)], p.date));
  }
  if (p.costs) {
    const total = p.costs.fees + (p.costs.bankFees ?? 0n);
    absorbing.push(p.costs.imputeOnPremium
      ? entry('Frais de fusion imputés sur la prime de fusion', [D('105300', total), C('521100', total)], p.date)
      : entry('Frais de fusion en charges', [D('632400', p.costs.fees), D('631800', p.costs.bankFees ?? 0n), C('521100', total)], p.date));
  }

  const bookNet = B.assets.reduce((s, a) => s + a.gross - (a.accumulated ?? 0n), 0n) - B.liabilities.reduce((s, l) => s + l.amount, 0n);
  const result = contribution - bookNet;
  const received = BigInt(issued) * valueA;
  const recvAcc = p.receivedSharesAccount ?? '502300';
  const transfer: OpLine[] = [
    D('471800', contribution),
    ...B.assets.filter((a) => a.accumulated).map((a) => D(a.accumulatedAccount ?? `28${a.account.slice(1, 3)}00`, a.accumulated!)),
    ...B.liabilities.map((l) => D(l.account, l.amount)),
    ...B.assets.map((a) => C(a.account, a.gross)),
    C('138100', result),
  ];
  const absorbed: OpEntry[] = [
    entry('Transfert du patrimoine et résultat de fusion', transfer, p.date),
    entry('Rémunération des apports (titres reçus de l’absorbante)', [D(recvAcc, received), C('471800', received)], p.date),
    entry('Droits des associés sur l’actif net apporté', [
      ...B.equity.map((e) => D(e.account, e.amount)), D('138100', result), C('461800', received), C('471800', contribution - received),
    ], p.date),
    entry('Désintéressement des associés de l’absorbée', [D('461800', received), C(recvAcc, received)], p.date),
  ];
  return {
    entries: absorbing,
    values: { valueA, valueB, contribution, issued, capital, premium, boni, mergerResult: result },
    notes: [
      `Parité : ${valueB} / ${valueA} ; ${issued} titres à émettre.`,
      'Les coûts externes de fusion peuvent être portés en charges ou imputés sur la prime de fusion.',
    ],
    counterpartEntries: absorbed,
  };
}

/**
 * Apport partiel d'actif chez la bénéficiaire (application 120) : 4614 / 1013 + 1052, puis reprise des éléments
 * apportés (créances douteuses ventilées entre 411, 4162 et 4912).
 */
export function partialContribution(p: {
  items: MergerLine[]; liabilities: MergerLine[]; doubtful?: { gross: bigint; impairment: bigint; clientsGross: bigint };
  issuePrice: bigint; nominal: bigint; date: string;
}): OpResult {
  const doubtfulNet = p.doubtful ? p.doubtful.clientsGross - p.doubtful.impairment : 0n;
  const net = p.items.reduce((s, x) => s + x.amount, 0n) + doubtfulNet - p.liabilities.reduce((s, x) => s + x.amount, 0n);
  const shares = net / p.issuePrice;
  const capital = shares * p.nominal;
  const lines: OpLine[] = [...p.items.map((x) => D(x.account, x.amount))];
  if (p.doubtful) {
    lines.push(D('411100', p.doubtful.clientsGross - p.doubtful.gross), D('416200', p.doubtful.gross), C('491200', p.doubtful.impairment));
  }
  lines.push(...p.liabilities.map((x) => C(x.account, x.amount)), C('461400', net));
  return {
    entries: [
      entry('Émission des actions rémunérant l’apport partiel', [D('461400', net), C('101300', capital), C('105200', net - capital)], p.date),
      entry('Reprise des éléments apportés', lines, p.date),
    ],
    values: { net, shares, capital, premium: net - capital },
  };
}
