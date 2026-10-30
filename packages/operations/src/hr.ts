/**
 * RH : pointages biométriques (export FingerTec), congés, recrutement par critères pondérés.
 */
export interface Punch {
  badge: string;
  date: string; // AAAA-MM-JJ
  time: string; // HH:MM
}

export interface Schedule {
  start: string; // HH:MM
  dailyMinutes: number; // durée normale
  graceMinutes: number; // tolérance de retard
  workDays: number[]; // 1 = lundi … 7 = dimanche
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Export FingerTec (CSV/TXT : AC-No / badge, date, heure) → pointages. */
export function parseFingertec(rows: string[][]): Punch[] {
  const [header, ...data] = rows;
  if (!header) return [];
  const h = header.map((c) => c.toLowerCase().replace(/[^a-z]/g, ''));
  const badge = h.findIndex((c) => ['acno', 'badge', 'userid', 'enno', 'id', 'matricule'].includes(c));
  const dt = h.findIndex((c) => c === 'datetime' || c === 'dateheure');
  const date = h.findIndex((c) => c === 'date');
  const time = h.findIndex((c) => c === 'time' || c === 'heure');
  if (badge < 0 || (dt < 0 && (date < 0 || time < 0))) throw new Error('Format FingerTec non reconnu (attendu : AC-No, Date, Time).');
  return data
    .filter((r) => r[badge])
    .map((r) => {
      let d: string;
      let t: string;
      if (dt >= 0) [d, t] = r[dt]!.split(/[ T]/) as [string, string];
      else {
        d = r[date]!;
        t = r[time]!;
      }
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : d.split(/[/.-]/).reverse().map((x, i) => (i === 0 && x.length === 2 ? '20' + x : x.padStart(2, '0'))).join('-');
      return { badge: r[badge]!.trim(), date: iso, time: t.slice(0, 5) };
    });
}

export interface DaySummary {
  badge: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  absent: boolean;
}

/** Synthèse journalière : premier pointage = arrivée, dernier = départ. */
export function summarize(punches: Punch[], s: Schedule): DaySummary[] {
  const by = new Map<string, Punch[]>();
  for (const p of punches) by.set(`${p.badge}|${p.date}`, [...(by.get(`${p.badge}|${p.date}`) ?? []), p]);
  return [...by.values()].map((ps) => {
    const times = ps.map((p) => p.time).sort();
    const inT = times[0]!;
    const outT = times.length > 1 ? times.at(-1)! : null;
    const worked = outT ? toMin(outT) - toMin(inT) : 0;
    const late = Math.max(0, toMin(inT) - toMin(s.start) - s.graceMinutes);
    return {
      badge: ps[0]!.badge,
      date: ps[0]!.date,
      checkIn: inT,
      checkOut: outT,
      workedMinutes: worked,
      lateMinutes: late > 0 ? toMin(inT) - toMin(s.start) : 0,
      overtimeMinutes: Math.max(0, worked - s.dailyMinutes),
      absent: false,
    };
  });
}

/** Jours ouvrés entre deux dates incluses (hors jours non travaillés et jours fériés). */
export function workingDays(from: string, to: string, s: Pick<Schedule, 'workDays'>, holidays: string[] = []): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (s.workDays.includes(dow) && !holidays.includes(iso)) out.push(iso);
  }
  return out;
}

/** Jours d'absence non justifiés sur une période (pas de pointage, pas de congé approuvé). */
export function absences(days: string[], present: Set<string>, onLeave: Set<string>) {
  return days.filter((d) => !present.has(d) && !onLeave.has(d));
}

/** Variables de paie issues de la présence : heures supplémentaires et retards. */
export function payrollVariables(summaries: DaySummary[], hourlyCost: bigint, overtimeRatePct: number, deductLate: boolean) {
  const ot = summaries.reduce((s, d) => s + d.overtimeMinutes, 0);
  const late = summaries.reduce((s, d) => s + d.lateMinutes, 0);
  const overtimePay = (hourlyCost * BigInt(ot) * BigInt(100 + overtimeRatePct) + 3000n) / 6000n;
  const lateDeduction = deductLate ? (hourlyCost * BigInt(late) + 30n) / 60n : 0n;
  return { overtimeMinutes: ot, lateMinutes: late, overtimePay, lateDeduction };
}

export interface Criterion {
  code: string;
  label: string;
  weight: number; // pondération (somme quelconque)
}
export interface Score {
  evaluator: string;
  criterion: string;
  score: number; // 0..20
}

/**
 * Classement des candidats : moyenne des évaluateurs par critère, pondérée. Aucun critère
 * discriminatoire n'est accepté (âge, sexe, ethnie, religion…).
 */
const FORBIDDEN = /(age|âge|sexe|genre|ethni|tribu|relig|origine|nationalit|handicap|grossesse|situation familiale|matrimonial)/i;

export function validateCriteria(criteria: Criterion[]): string[] {
  const errors: string[] = [];
  if (!criteria.length) errors.push('Au moins un critère.');
  for (const c of criteria) {
    if (FORBIDDEN.test(c.label) || FORBIDDEN.test(c.code)) errors.push(`Critère interdit (discriminatoire) : ${c.label}`);
    if (c.weight <= 0) errors.push(`Pondération invalide : ${c.label}`);
  }
  return errors;
}

export function rankCandidates(criteria: Criterion[], candidates: { id: string; name: string; scores: Score[] }[]) {
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  return candidates
    .map((cand) => {
      const detail = criteria.map((c) => {
        const ss = cand.scores.filter((s) => s.criterion === c.code);
        const avg = ss.length ? ss.reduce((s, x) => s + x.score, 0) / ss.length : 0;
        return { criterion: c.code, average: Math.round(avg * 100) / 100, evaluators: ss.length };
      });
      const total = detail.reduce((s, d) => s + d.average * (criteria.find((c) => c.code === d.criterion)!.weight), 0) / totalWeight;
      return { id: cand.id, name: cand.name, total: Math.round(total * 100) / 100, detail, complete: detail.every((d) => d.evaluators > 0) };
    })
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
