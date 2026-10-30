import { divRound } from './money';
import type { EntryLineInput } from './entries';

/**
 * Immobilisations (SYSCOHADA révisé, guide d'application chap. 5 et 6) : approche par composants,
 * amortissement linéaire, dégressif à taux décroissant (SOFTY, application 13), par unités d'œuvre
 * (application 14), prorata temporis en jours (base 360 jours, mois de 30 jours), cessions (81x / 82x),
 * amortissements dérogatoires (application 18 : 851 / 151 / 861).
 * Le dégressif « à coefficient » (taux linéaire × coefficient, bascule en linéaire) est un mode fiscal :
 * il sert surtout de plan fiscal pour les amortissements dérogatoires.
 * TODO(expert-comptable) : confirmer la convention de prorata (360 j) et les coefficients fiscaux par pays.
 */
export type DepreciationMethod = 'LINEAIRE' | 'DEGRESSIF' | 'DEGRESSIF_COEFFICIENT' | 'UNITES_OEUVRE' | 'NON_AMORTISSABLE';

export interface AssetComponent {
  label: string;
  cost: bigint; // unités mineures
  residualValue?: bigint;
  method: DepreciationMethod;
  years: number; // durée d'utilité
  degressiveCoefficient?: string; // ex. "2" ; fourni par le pack pays
  totalUnits?: number;
  unitsByYear?: Record<string, number>; // exercice (AAAA) → unités consommées
  /** Tests de dépréciation à la clôture (application 44) : valeur actuelle estimée en fin d'exercice. */
  valueTests?: { year: number; actualValue: bigint }[];
  /** Plan fiscal, s'il diffère du plan comptable (amortissements dérogatoires). */
  fiscal?: { method: 'LINEAIRE' | 'DEGRESSIF_COEFFICIENT'; years: number; degressiveCoefficient?: string };
}

export interface AssetDef {
  account: string; // compte d'immobilisation (6 chiffres)
  /** Comptes d'amortissement (28) et de dépréciation (29) propres à l'entité, s'ils existent dans son plan. */
  amortAccount?: string;
  impairmentAccount?: string;
  inServiceDate: string; // AAAA-MM-JJ
  components: AssetComponent[];
}

export interface ScheduleRow {
  year: number;
  base: bigint;
  dotation: bigint;
  cumul: bigint;
  vnc: bigint;
  /** Dépréciation (29) : dotation et reprise de l'exercice, solde à la clôture. */
  impairmentDotation?: bigint;
  impairmentReprise?: bigint;
  impairment?: bigint;
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
  if (c.method === 'LINEAIRE' && c.valueTests?.length) return impairedLinearSchedule(c, inService, base, firstDays, startYear);
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
    // SOFTY : annuité p = base × (n + 1 − p) / (n(n+1)/2) ; prorata réparti sur deux exercices.
    const n = BigInt(c.years);
    const sum = (n * (n + 1n)) / 2n;
    const annuity = (p: number) => (p >= 1 && p <= c.years ? divRound(base * BigInt(c.years + 1 - p), sum) : 0n);
    const f = firstDays >= 360n ? 360n : firstDays; // fraction de la première année (sur 360)
    for (let k = 0; k <= c.years && cumul < base; k++) {
      let d = k === 0 ? divRound(annuity(1) * f, 360n) : divRound(annuity(k) * (360n - f), 360n) + divRound(annuity(k + 1) * f, 360n);
      if (k === c.years || cumul + d > base) d = base - cumul;
      if (d === 0n) continue;
      cumul += d;
      rows.push({ year: startYear + k, base, dotation: d, cumul, vnc: c.cost - cumul });
    }
    return rows;
  }
  if (c.method === 'DEGRESSIF_COEFFICIENT') {
    if (!c.degressiveCoefficient) throw new Error('Coefficient dégressif requis (pack pays).');
    const [ci, cf = ''] = c.degressiveCoefficient.split('.');
    const coefPpm = BigInt(ci! + cf.padEnd(6, '0').slice(0, 6));
    const ratePpm = coefPpm / BigInt(c.years); // taux dégressif = coefficient / durée
    let remainingYears = c.years;
    let y = startYear;
    while (cumul < base) {
      const vnc = base - cumul;
      const months = y === startYear ? BigInt(13 - Number(inService.slice(5, 7))) : 12n; // dégressif fiscal : prorata en mois
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

/**
 * Linéaire avec tests de dépréciation (application 44 du guide) : la perte de valeur est dotée en 29 ;
 * le plan est ensuite révisé (valeur nette − valeur résiduelle sur la durée résiduelle) ; une reprise
 * est plafonnée à la valeur nette comptable qu'aurait eue l'actif sans dépréciation.
 */
function impairedLinearSchedule(c: AssetComponent, inService: string, base: bigint, firstDays: bigint, startYear: number): ScheduleRow[] {
  const residual = c.residualValue ?? 0n;
  const historical = componentSchedule({ ...c, valueTests: undefined }, inService);
  const rows: ScheduleRow[] = [];
  let cumul = 0n;
  let impairment = 0n;
  let annual = divRound(base, BigInt(c.years));
  for (let k = 0; k <= c.years; k++) {
    const y = startYear + k;
    const remainingNet = c.cost - cumul - impairment - residual;
    if (remainingNet <= 0n) break;
    let d = k === 0 ? divRound(annual * firstDays, 360n) : annual;
    if (k === c.years || d > remainingNet) d = remainingNet;
    cumul += d;
    let dot = 0n;
    let rep = 0n;
    const test = c.valueTests!.find((t) => t.year === y);
    if (test) {
      const net = c.cost - cumul - impairment;
      const histVnc = historical.find((r) => r.year === y)?.vnc ?? residual;
      if (test.actualValue < net) dot = net - test.actualValue;
      else if (test.actualValue > net && impairment > 0n) {
        const target = test.actualValue < histVnc ? test.actualValue : histVnc;
        rep = target - net > impairment ? impairment : target - net;
        if (rep < 0n) rep = 0n;
      }
      impairment += dot - rep;
      const left = BigInt(c.years - k - 1);
      if (left > 0n) annual = divRound(c.cost - cumul - impairment - residual, left);
    }
    rows.push({ year: y, base, dotation: d, cumul, vnc: c.cost - cumul - impairment, impairmentDotation: dot, impairmentReprise: rep, impairment });
  }
  return rows;
}

/** Écritures de dépréciation des immobilisations : 6913/6914 → 29x ; reprises 29x → 7913/7914. */
export function impairmentLines(assets: AssetDef[], year: number): EntryLineInput[] {
  const lines: EntryLineInput[] = [];
  for (const a of assets) {
    const incorporelle = a.account.startsWith('21');
    const dep = a.impairmentAccount ?? `29${a.account.slice(1, 3)}00`;
    let dot = 0n;
    let rep = 0n;
    for (const c of a.components) {
      const r = componentSchedule(c, a.inServiceDate).find((x) => x.year === year);
      dot += r?.impairmentDotation ?? 0n;
      rep += r?.impairmentReprise ?? 0n;
    }
    if (dot > 0n) lines.push({ account: incorporelle ? '691300' : '691400', debit: dot, credit: 0n }, { account: dep, debit: 0n, credit: dot });
    if (rep > 0n) lines.push({ account: dep, debit: rep, credit: 0n }, { account: incorporelle ? '791300' : '791400', debit: 0n, credit: rep });
  }
  return lines;
}

/**
 * Amortissements dérogatoires (application 18) : écart entre la dotation fiscale et la dotation comptable.
 * Écart positif → dotation 851 / 151 ; négatif → reprise 151 / 861.
 */
export function derogatorySchedule(c: AssetComponent, inService: string) {
  if (!c.fiscal) return [];
  const acc = componentSchedule(c, inService);
  const fis = componentSchedule({ ...c, method: c.fiscal.method, years: c.fiscal.years, degressiveCoefficient: c.fiscal.degressiveCoefficient, fiscal: undefined }, inService);
  const years = [...new Set([...acc, ...fis].map((r) => r.year))].sort((a, b) => a - b);
  let balance = 0n;
  return years.map((year) => {
    const accounting = acc.find((r) => r.year === year)?.dotation ?? 0n;
    const fiscal = fis.find((r) => r.year === year)?.dotation ?? 0n;
    const diff = fiscal - accounting;
    balance += diff;
    return { year, accounting, fiscal, dotation: diff > 0n ? diff : 0n, reprise: diff < 0n ? -diff : 0n, balance };
  });
}

export function derogatoryLines(assets: AssetDef[], year: number): EntryLineInput[] {
  let dot = 0n;
  let rep = 0n;
  for (const a of assets) for (const c of a.components) {
    const r = derogatorySchedule(c, a.inServiceDate).find((x) => x.year === year);
    if (r) { dot += r.dotation; rep += r.reprise; }
  }
  const net = dot - rep;
  if (net === 0n) return [];
  return net > 0n
    ? [{ account: '851000', debit: net, credit: 0n }, { account: '151000', debit: 0n, credit: net }]
    : [{ account: '151000', debit: -net, credit: 0n }, { account: '861000', debit: 0n, credit: -net }];
}

/**
 * Compte d'amortissement (28) et de dotation. Par défaut, le compte officiel à 4 chiffres « 28 » + 2e et 3e
 * chiffres de l'immobilisation (2451 → 2845, 2313 → 2831, 2121 → 2812), complété à 6 chiffres ; un compte
 * miroir créé par l'entité (ex. 283131 pour 231310, application 33) est passé dans `amortAccount`.
 */
export function depreciationAccounts(assetAccount: string, amortAccount?: string) {
  const amort = amortAccount ?? `28${assetAccount.slice(1, 3)}00`;
  const incorporelle = assetAccount.startsWith('21');
  return { amort, dotation: incorporelle ? '681200' : '681300' };
}

/** Comptes candidats (miroir puis officiel) pour résoudre les 28 et 29 dans le plan de l'entité. */
export function mirrorAccounts(assetAccount: string) {
  return {
    amort: [`28${assetAccount.slice(1)}`.slice(0, 6), `28${assetAccount.slice(1, 3)}00`],
    impairment: [`29${assetAccount.slice(1)}`.slice(0, 6), `29${assetAccount.slice(1, 3)}00`],
  };
}

export function assetDotationForYear(a: AssetDef, year: number): bigint {
  return a.components.reduce((s, c) => s + (componentSchedule(c, a.inServiceDate).find((r) => r.year === year)?.dotation ?? 0n), 0n);
}

export function dotationLines(assets: AssetDef[], year: number): EntryLineInput[] {
  const byAcc = new Map<string, { dot: string; amount: bigint }>();
  for (const a of assets) {
    const d = assetDotationForYear(a, year);
    if (d === 0n) continue;
    const { amort, dotation } = depreciationAccounts(a.account, a.amortAccount);
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
export function disposalLines(a: AssetDef, date: string, price: bigint, counterpart: string | undefined, amortBooked: bigint, componentIndex?: number) {
  counterpart ??= a.account.startsWith('21') ? '485100' : '485200';
  // Renouvellement d'un composant (application 33) : seul ce composant sort de l'actif.
  if (componentIndex !== undefined) {
    const comp = a.components[componentIndex];
    if (!comp) throw new Error('COMPOSANT_INCONNU');
    a = { ...a, components: [comp] };
  }
  const cost = a.components.reduce((s, c) => s + c.cost, 0n);
  const accum = accumulatedAt(a, date);
  const extra = accum - amortBooked;
  const { amort, dotation } = depreciationAccounts(a.account, a.amortAccount);
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
