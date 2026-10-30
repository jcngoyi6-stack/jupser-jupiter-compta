/**
 * Subventions et aides publiques (guide d'application, chapitre 17, applications 66 à 70).
 * Reprise des subventions d'investissement en 799 au rythme des amortissements du bien subventionné ;
 * bien non amortissable : reprise linéaire sur la durée d'inaliénabilité, à défaut sur 10 ans.
 */
import { C, D, entry, ratio, type OpResult } from './core';

/** Répartit une subvention globale entre plusieurs biens au prorata de leur coût (application 66 : 13/30e). */
export function allocateGrant(grant: bigint, costs: bigint[]): bigint[] {
  const total = costs.reduce((s, c) => s + c, 0n);
  const parts = costs.map((c) => ratio(grant, c, total));
  const gap = grant - parts.reduce((s, x) => s + x, 0n);
  if (parts.length) parts[parts.length - 1]! += gap;
  return parts;
}

/** Octroi (4494 / 14x), réception en banque ou entrée du bien reçu en nature (application 66). */
export function grantAward(p: {
  amount: bigint; grantAccount?: string; date: string; receiptDate?: string; inKindAsset?: string;
}): OpResult {
  const grantAccount = p.grantAccount ?? '141100';
  const entries = [entry('Octroi de la subvention d’investissement', [D('449400', p.amount), C(grantAccount, p.amount)], p.date)];
  if (p.receiptDate) {
    entries.push(p.inKindAsset
      ? entry('Entrée du bien reçu en subvention', [D(p.inKindAsset, p.amount), C('449400', p.amount)], p.receiptDate)
      : entry('Réception des fonds', [D('521100', p.amount), C('449400', p.amount)], p.receiptDate));
  }
  return { entries };
}

export interface GrantReleaseRow { year: number; depreciation: bigint; release: bigint; remaining: bigint }

/**
 * Plan de reprise : reprise = dotation × part subventionnée / coût du bien (la dernière année solde la subvention).
 * Sans dotations (bien non amortissable), reprise linéaire sur `years` exercices (10 par défaut).
 */
export function grantReleaseSchedule(p: { grant: bigint; assetCost?: bigint; depreciations?: { year: number; amount: bigint }[]; firstYear?: number; years?: number }): GrantReleaseRow[] {
  const rows: GrantReleaseRow[] = [];
  let remaining = p.grant;
  const deps = p.depreciations?.length
    ? p.depreciations
    : Array.from({ length: p.years ?? 10 }, (_, k) => ({ year: (p.firstYear ?? 0) + k, amount: 0n }));
  deps.forEach((d, k) => {
    const last = k === deps.length - 1;
    const release = last ? remaining : p.depreciations?.length ? ratio(d.amount, p.grant, p.assetCost ?? 1n) : p.grant / BigInt(deps.length);
    remaining -= release;
    rows.push({ year: d.year, depreciation: d.amount, release, remaining });
  });
  return rows;
}

/** Écritures de reprise de l'exercice (14x / 799). */
export function grantRelease(p: { amount: bigint; grantAccount?: string; date: string; label?: string }): OpResult {
  return { entries: [entry(p.label ?? 'Reprise de subvention d’investissement', [D(p.grantAccount ?? '141100', p.amount), C('799000', p.amount)], p.date)] };
}

/** Cession du bien subventionné : le solde de la subvention non encore repris est rapporté en totalité. */
export function grantOnDisposal(p: { grant: bigint; alreadyReleased: bigint; grantAccount?: string; date: string }): OpResult {
  return grantRelease({ amount: p.grant - p.alreadyReleased, grantAccount: p.grantAccount, date: p.date, label: 'Reprise du solde de subvention (cession du bien)' });
}

/**
 * Subvention d'exploitation (application 67) : complément de prix en 71 (718X par défaut), ou remboursement
 * d'une charge porté en diminution de cette charge (`chargeAccount`).
 */
export function operatingGrant(p: { amount: bigint; date: string; account?: string; chargeAccount?: string }): OpResult {
  const credit = p.chargeAccount ?? p.account ?? '718100';
  return { entries: [entry('Subvention d’exploitation à recevoir', [D('449500', p.amount), C(credit, p.amount)], p.date)] };
}

/** Subvention d'équilibre (application 68) : produit HAO 88. */
export function equilibriumGrant(p: { amount: bigint; date: string; account?: string }): OpResult {
  return {
    entries: [entry('Subvention d’équilibre', [D('449600', p.amount), C(p.account ?? '881000', p.amount)], p.date)],
    notes: ['La subvention d’équilibre peut ne pas couvrir la totalité du déficit.'],
  };
}

/**
 * Avance conditionnée de l'État (application 69) : encaissement en 163 ; à chaque échéance, remboursement
 * du capital et des intérêts (6748), la part abandonnée par l'État devenant subvention d'exploitation.
 */
export function stateAdvance(p: {
  amount: bigint; date: string;
  settlements?: { date: string; principal: bigint; interest?: bigint; waived?: bigint; grantAccount?: string }[];
}): OpResult {
  const entries = [entry('Encaissement de l’avance de l’État', [D('521100', p.amount), C('163000', p.amount)], p.date)];
  let outstanding = p.amount;
  for (const s of p.settlements ?? []) {
    const waived = s.waived ?? 0n;
    outstanding -= s.principal + waived;
    if (outstanding < 0n) throw new Error('AVANCE_SURSOLDEE');
    entries.push(entry(waived > 0n ? 'Remboursement partiel, solde transformé en subvention' : 'Remboursement de l’avance de l’État', [
      D('163000', s.principal + waived), D('674800', s.interest ?? 0n), C('521100', s.principal + (s.interest ?? 0n)), C(s.grantAccount ?? '718100', waived),
    ], s.date));
  }
  return { entries, values: { outstanding } };
}

/**
 * Dépréciation d'une immobilisation subventionnée (application 70).
 * Méthode 1 : (VNC − subvention non reprise) − valeur actuelle ; méthode 2 : VNC − valeur actuelle, avec
 * reprise de la subvention à hauteur de la dépréciation. L'incidence sur le résultat est identique.
 */
export function subsidisedAssetImpairment(p: {
  assetAccount: string; netBookValue: bigint; grantBalance: bigint; recoverable: bigint; method: 1 | 2; date: string; grantAccount?: string;
}): OpResult {
  const impAccount = `29${p.assetAccount.slice(1, 3)}00`;
  const charge = p.assetAccount.startsWith('21') ? '691300' : '691400';
  if (p.method === 1) {
    const imp = p.netBookValue - p.grantBalance - p.recoverable;
    const amount = imp > 0n ? imp : 0n;
    return { entries: amount ? [entry('Dépréciation (VNC nette de subvention)', [D(charge, amount), C(impAccount, amount)], p.date)] : [], values: { impairment: amount, release: 0n, impact: -amount } };
  }
  const imp = p.netBookValue > p.recoverable ? p.netBookValue - p.recoverable : 0n;
  const release = imp < p.grantBalance ? imp : p.grantBalance;
  const entries = imp ? [entry('Dépréciation de l’immobilisation subventionnée', [D(charge, imp), C(impAccount, imp)], p.date)] : [];
  if (release) entries.push(entry('Reprise de subvention à hauteur de la dépréciation', [D(p.grantAccount ?? '141100', release), C('799000', release)], p.date));
  return { entries, values: { impairment: imp, release, impact: release - imp } };
}
