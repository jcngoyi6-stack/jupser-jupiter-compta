import type { BalanceSheet } from './balance-sheet';
import type { IncomeStatement } from './income';
import type { ControlResult } from './types';

/** Ratio en points de base (×10 000) pour éviter les flottants dans les comparaisons. */
function ratioBp(num: bigint, den: bigint): number | null {
  if (den === 0n) return null;
  return Number((num * 10000n) / den);
}

export function financialAnalysis(bs: BalanceSheet, is: IncomeStatement, shareCapital: bigint) {
  const a = Object.fromEntries(bs.assets.map((r) => [r.ref, r.net]));
  const l = Object.fromEntries(bs.liabilities.map((r) => [r.ref, r.value]));
  const v = is.values;
  const frng = l.DF! - a.AZ!;
  const bfr = a.BK! - l.DP!;
  const tn = a.BT! - l.DT!;
  const dotations = -(v.RL! + v.RN!);
  const reprises = v.TJ! + v.TL!;
  const caf = v.XI! + dotations - reprises - v.TN! - v.RO!;
  return {
    sig: {
      margeCommerciale: v.XA!,
      chiffreAffaires: v.XB!,
      valeurAjoutee: v.XC!,
      ebe: v.XD!,
      resultatExploitation: v.XE!,
      resultatFinancier: v.XF!,
      rao: v.XG!,
      rhao: v.XH!,
      resultatNet: v.XI!,
      caf,
    },
    equilibre: { frng, bfr, tresorerieNette: tn, controle: frng - bfr === tn },
    ratiosBp: {
      autonomieFinanciere: ratioBp(l.CP!, l.DZ!),
      liquiditeGenerale: ratioBp(a.BK! + a.BT!, l.DP! + l.DT!),
      rentabiliteCapitauxPropres: ratioBp(v.XI!, l.CP!),
      margeNette: ratioBp(v.XI!, v.XB!),
      endettement: ratioBp(l.DD!, l.CP!),
    },
    goingConcernAlerts: goingConcern(l.CP!, shareCapital, tn, v.XI!),
  };
}

/** Continuité d'exploitation (docs/12) : capitaux propres < moitié du capital, trésorerie négative, perte. */
export function goingConcern(equity: bigint, shareCapital: bigint, netCash: bigint, result: bigint): ControlResult[] {
  return [
    {
      code: 'CONTINUITE_CP',
      label: 'Capitaux propres au moins égaux à la moitié du capital social',
      ok: shareCapital === 0n || equity * 2n >= shareCapital,
      blocking: false,
    },
    { code: 'CONTINUITE_TRESORERIE', label: 'Trésorerie nette positive', ok: netCash >= 0n, blocking: false },
    { code: 'CONTINUITE_RESULTAT', label: "Résultat de l'exercice non déficitaire", ok: result >= 0n, blocking: false },
  ];
}
