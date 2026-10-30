import { divRound } from './money';
import type { EntryLineInput } from './entries';

/**
 * Immobilisations (SYSCOHADA révisé) : approche par composants, amortissement linéaire, dégressif
 * ou par unités d'œuvre, prorata temporis en jours (base 360 jours, mois de 30 jours),
 * cessions (81x / 82x).
 * TODO(expert-comptable) : confirmer la convention de prorata (360 j) et les coefficients dégressifs par pays.
 */
export type DepreciationMethod = 'LINEAIRE' | 'DEGRESSIF' | 'UNITES_OEUVRE' | 'NON_AMORTISSABLE';

export interface AssetComponent {
  label: string;
  cost: bigint; // unités mineures
  residualValue?: bigint;
  method: DepreciationMethod;
  years: number; // durée d'utilité
  degressiveCoefficient?: string; // ex. "2" ; fourni par le pack pays
  totalUnits?: number;
  unitsByYear?: Record<string, number>; // exercice (AAAA) → unités consommées
}

export interface AssetDef {
  account: string; // compte d'immobilisation (6 chiffres)
  inServiceDate: string; // AAAA-MM-JJ
  components: AssetComponent[];
}

export interface ScheduleRow {
  year: number;
  base: bigint;
  dotation: bigint;
  cumul: bigint;
  vnc: bigint;
}

/** Jours selon la convention 30/360. */
export function days360(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30)) + 1;
}

export function componentSchedule(c: AssetComponent, inService: string): ScheduleRow[] {
  const base = c.cost - (c.residualValue ?? 0n);
  const rows: ScheduleRow[] = [];
  if (c.method === 'NON_AMORTISSABLE' || base <= 0n) return rows;
  const startYear = Number(inService.slice(0, 4));
  const firstDays = BigInt(days360(inService, `${startYear}-12-30`));
  let cumul = 0n;
  if (c.method === 'LINEAIRE') {
    const annual = divRound(base, BigInt(c.years));
    let y = startYear;
    while (cumul < base) {
      let d = y === startYear ? divRound(annual * firstDays, 360n) : annual;
      if (cumul + d > base || y >= startYear + c.years) d = base - cumul;
      cumul += d;
      rows.push({ year: y, base, dotation: d, cumul, vnc: c.cost - cumul });
      y++;
    }
    return rows;
  }
  if (c.method === 'DEGRESSIF') {
    if (!c.degressiveCoefficient) throw new Error('Coefficient dégressif requis (pack pays).');
    const [ci, cf = ''] = c.degressiveCoefficient.split('.');
    const coefPpm = BigInt(ci! + cf.padEnd(6, '0').slice(0, 6));
    const ratePpm = coefPpm / BigInt(c.years); // taux dégressif = coefficient / durée
    let remainingYears = c.years;
    let y = startYear;
    while (cumul < base) {
      const vnc = base - cumul;
      const months = y === startYear ? BigInt(13 - Number(inService.slice(5, 7))) : 12n; // dégressif : prorata en mois
      let d = divRound(vnc * ratePpm * months, 1_000_000n * 12n);
      const linearRest = remainingYears <= 1 ? vnc : divRound(vnc, BigInt(remainingYears));
      if (linearRest > d) d = linearRest; // bascule en linéaire
      if (d > vnc) d = vnc;
      cumul += d;
      rows.push({ year: y, base, dotation: d, cumul, vnc: c.cost - cumul });
      y++;
      remainingYears--;
    }
    return rows;
  }
  // unités d'œuvre
  if (!c.totalUnits || !c.unitsByYear) throw new Error("Unités d'œuvre : total et consommation annuelle requis.");
  for (const [y, units] of Object.entries(c.unitsByYear).sort()) {
    let d = divRound(base * BigInt(Math.round(units * 1000)), BigInt(Math.round(c.totalUnits * 1000)));
    if (cumul + d > base) d = base - cumul;
    cumul += d;
    rows.push({ year: Number(y), base, dotation: d, cumul, vnc: c.cost - cumul });
    if (cumul >= base) break;
  }
  return rows;
}

/** Compte d'amortissement associé (2xxxxx → 28xxxx) et compte de dotation. */
export function depreciationAccounts(assetAccount: string) {
  const amort = ('28' + assetAccount.slice(1)).slice(0, 6);
  const incorporelle = assetAccount.startsWith('21');
  return { amort, dotation: incorporelle ? '681200' : '681300' };
}

export function assetDotationForYear(a: AssetDef, year: number): bigint {
  return a.components.reduce((s, c) => s + (componentSchedule(c, a.inServiceDate).find((r) => r.year === year)?.dotation ?? 0n), 0n);
}

export function dotationLines(assets: AssetDef[], year: number): EntryLineInput[] {
  const byAcc = new Map<string, { dot: string; amount: bigint }>();
  for (const a of assets) {
    const d = assetDotationForYear(a, year);
    if (d === 0n) continue;
    const { amort, dotation } = depreciationAccounts(a.account);
    const g = byAcc.get(amort) ?? { dot: dotation, amount: 0n };
    g.amount += d;
    byAcc.set(amort, g);
  }
  const lines: EntryLineInput[] = [];
  const dots = new Map<string, bigint>();
  for (const [amort, g] of byAcc) {
    lines.push({ account: amort, debit: 0n, credit: g.amount });
    dots.set(g.dot, (dots.get(g.dot) ?? 0n) + g.amount);
  }
  return [...[...dots].map(([account, v]) => ({ account, debit: v, credit: 0n })), ...lines];
}

/** Cumul des amortissements à une date (prorata de l'exercice de cession inclus). */
export function accumulatedAt(a: AssetDef, date: string): bigint {
  const year = Number(date.slice(0, 4));
  let total = 0n;
  for (const c of a.components) {
    const rows = componentSchedule(c, a.inServiceDate);
    for (const r of rows) {
      if (r.year < year) total += r.dotation;
      if (r.year === year) {
        const start = year === Number(a.inServiceDate.slice(0, 4)) ? a.inServiceDate : `${year}-01-01`;
        const full = BigInt(days360(start, `${year}-12-30`));
        const part = BigInt(Math.max(0, days360(start, date)));
        total += full > 0n ? divRound(r.dotation * (part > full ? full : part), full) : 0n;
      }
    }
  }
  return total;
}

/**
 * Écritures de cession : dotation complémentaire de l'exercice, sortie de l'actif (VNC en 81x),
 * prix de cession en 82x (contrepartie : créance sur cession 485 ou trésorerie).
 */
export function disposalLines(a: AssetDef, date: string, price: bigint, counterpart: string | undefined, amortBooked: bigint) {
  counterpart ??= a.account.startsWith('21') ? '485100' : '485200';
  const cost = a.components.reduce((s, c) => s + c.cost, 0n);
  const accum = accumulatedAt(a, date);
  const extra = accum - amortBooked;
  const { amort, dotation } = depreciationAccounts(a.account);
  const incorporelle = a.account.startsWith('21');
  const vnc = cost - accum;
  const lines: EntryLineInput[] = [];
  if (extra > 0n) {
    lines.push({ account: dotation, debit: extra, credit: 0n }, { account: amort, debit: 0n, credit: extra });
  }
  if (accum > 0n) lines.push({ account: amort, debit: accum, credit: 0n });
  if (vnc > 0n) lines.push({ account: incorporelle ? '811000' : '812000', debit: vnc, credit: 0n });
  lines.push({ account: a.account, debit: 0n, credit: cost });
  if (price > 0n) lines.push({ account: counterpart, debit: price, credit: 0n }, { account: incorporelle ? '821000' : '822000', debit: 0n, credit: price });
  return { lines, vnc, gainOrLoss: price - vnc, accumulated: accum };
}
