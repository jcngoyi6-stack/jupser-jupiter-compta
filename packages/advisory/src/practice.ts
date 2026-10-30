/** Gestion du cabinet : circuit de revue, temps et honoraires, échéances (docs/15 §1). */

export type MissionType = 'TENUE' | 'REVISION' | 'ETABLISSEMENT' | 'AUDIT' | 'CONSEIL_FISCAL' | 'PAIE' | 'EVALUATION' | 'RESTRUCTURATION';
export const MISSION_TYPES: MissionType[] = ['TENUE', 'REVISION', 'ETABLISSEMENT', 'AUDIT', 'CONSEIL_FISCAL', 'PAIE', 'EVALUATION', 'RESTRUCTURATION'];

export type ReviewStage = 'PREPARATION' | 'REVUE' | 'SIGNATURE' | 'VERROUILLE';
export type ReviewAction = 'SOUMETTRE' | 'APPROUVER' | 'RENVOYER' | 'SIGNER';

export interface ReviewPoint { id: string; text: string; by: string; at: string; resolved: boolean }
export interface ReviewState {
  stage: ReviewStage;
  preparerId?: string;
  reviewerId?: string;
  partnerId?: string;
  points: ReviewPoint[];
  history: { action: ReviewAction; by: string; at: string }[];
}

export const emptyReview = (): ReviewState => ({ stage: 'PREPARATION', points: [], history: [] });

/**
 * Circuit préparateur → réviseur → associé signataire. Une même personne ne peut pas cumuler deux rôles,
 * et la signature est refusée tant qu'un point de revue reste ouvert.
 */
export function reviewTransition(s: ReviewState, action: ReviewAction, userId: string, at: string): ReviewState {
  const next = (stage: ReviewStage, patch: Partial<ReviewState> = {}): ReviewState => ({
    ...s, ...patch, stage, history: [...s.history, { action, by: userId, at }],
  });
  if (s.stage === 'VERROUILLE') throw new Error('DOSSIER_VERROUILLE');
  if (action === 'SOUMETTRE' && s.stage === 'PREPARATION') return next('REVUE', { preparerId: userId });
  if (action === 'RENVOYER' && (s.stage === 'REVUE' || s.stage === 'SIGNATURE')) return next('PREPARATION');
  if (action === 'APPROUVER' && s.stage === 'REVUE') {
    if (userId === s.preparerId) throw new Error('SEPARATION_DES_TACHES');
    if (s.points.some((p) => !p.resolved)) throw new Error('POINTS_DE_REVUE_OUVERTS');
    return next('SIGNATURE', { reviewerId: userId });
  }
  if (action === 'SIGNER' && s.stage === 'SIGNATURE') {
    if (userId === s.preparerId || userId === s.reviewerId) throw new Error('SEPARATION_DES_TACHES');
    if (s.points.some((p) => !p.resolved)) throw new Error('POINTS_DE_REVUE_OUVERTS');
    return next('VERROUILLE', { partnerId: userId });
  }
  throw new Error('TRANSITION_INVALIDE');
}

export interface TimeLine { missionId: string; userId: string; minutes: number; billable: boolean }
export interface MissionLite { id: string; title: string; budgetMinutes: number; feeAmount: bigint; hourlyRate: bigint }

/** Rentabilité par mission : temps passés valorisés au taux horaire vs honoraires convenus. */
export function missionProfitability(missions: MissionLite[], times: TimeLine[], costPerHour: Record<string, bigint> = {}) {
  return missions.map((m) => {
    const t = times.filter((x) => x.missionId === m.id);
    const minutes = t.reduce((s, x) => s + x.minutes, 0);
    const billableMinutes = t.filter((x) => x.billable).reduce((s, x) => s + x.minutes, 0);
    const valued = (m.hourlyRate * BigInt(billableMinutes)) / 60n;
    const cost = t.reduce((s, x) => s + ((costPerHour[x.userId] ?? 0n) * BigInt(x.minutes)) / 60n, 0n);
    const fee = m.feeAmount > 0n ? m.feeAmount : valued;
    return {
      missionId: m.id,
      title: m.title,
      minutes,
      billableMinutes,
      budgetMinutes: m.budgetMinutes,
      budgetUsedPct: m.budgetMinutes ? Math.round((minutes / m.budgetMinutes) * 100) : null,
      overBudget: m.budgetMinutes > 0 && minutes > m.budgetMinutes,
      valuedTime: valued,
      fee,
      cost,
      margin: fee - cost,
      writeOff: m.feeAmount > 0n ? valued - m.feeAmount : 0n,
    };
  });
}

/** Rentabilité par collaborateur (minutes facturables / totales). */
export function staffUtilisation(times: TimeLine[]) {
  const by = new Map<string, { minutes: number; billable: number }>();
  for (const t of times) {
    const r = by.get(t.userId) ?? { minutes: 0, billable: 0 };
    r.minutes += t.minutes;
    if (t.billable) r.billable += t.minutes;
    by.set(t.userId, r);
  }
  return [...by.entries()].map(([userId, r]) => ({ userId, ...r, rate: r.minutes ? r.billable / r.minutes : 0 }));
}

/** Échéancier consolidé : toutes les obligations des clients dans une fenêtre. */
export function deadlinesInWindow<T extends { date: string }>(items: T[], from: string, to: string): T[] {
  return items.filter((i) => i.date >= from && i.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}
