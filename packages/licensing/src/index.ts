/**
 * Moteur de licences (docs/09) : tarification par utilisateur et par module, cycle de vie de l'abonnement,
 * contrôle des modules et des quotas — vérifié côté serveur.
 */
export const MODULES = [
  'COMPTABILITE',
  'ETATS_FINANCIERS',
  'TRESORERIE',
  'DOCUMENTS_QR',
  'COLLABORATION',
  'IA_GUIDE',
  'FISCALITE',
  'ANALYSE_FINANCIERE',
  'BUDGET',
  'STOCKS',
  'IA_ANALYSTE',
  'GRH_PAIE_RECRUTEMENT',
  'PRESENCE_BIOMETRIQUE',
  'PRODUCTION',
  'MARKETING_CRM',
  'GED_ARCHIVAGE_IA',
  'COURRIER',
  'IA_AGENT',
  'MULTI_SOCIETES',
  'CONSOLIDATION',
  'API',
  'SMT',
  'CABINET',
] as const;
export type ModuleCode = (typeof MODULES)[number];

export type EditionCode = 'TPE' | 'ESSENTIEL' | 'PRO' | 'ERP';

const ESSENTIEL: ModuleCode[] = ['COMPTABILITE', 'ETATS_FINANCIERS', 'TRESORERIE', 'DOCUMENTS_QR', 'COLLABORATION', 'IA_GUIDE'];
const PRO: ModuleCode[] = [...ESSENTIEL, 'FISCALITE', 'ANALYSE_FINANCIERE', 'BUDGET', 'STOCKS', 'IA_ANALYSTE'];

export const EDITION_MODULES: Record<EditionCode, ModuleCode[]> = {
  TPE: ['SMT', 'DOCUMENTS_QR', 'TRESORERIE', 'IA_GUIDE'],
  ESSENTIEL,
  PRO,
  ERP: MODULES.filter((m) => m !== 'CABINET' && m !== 'SMT'),
};

export interface PriceGrid {
  editions: { code: EditionCode; prix_utilisateur: number; max_utilisateurs?: number }[];
  modules_a_la_carte_par_utilisateur: Record<string, number>;
}

export interface SubscriptionQuote {
  monthlyUsdCents: bigint;
  annualUsdCents: bigint; // 2 mois offerts
  lines: { label: string; perUserUsd: number; users: number; totalUsdCents: bigint }[];
}

export function quoteEnterprise(grid: PriceGrid, edition: EditionCode, addOns: string[], users: number): SubscriptionQuote {
  const ed = grid.editions.find((e) => e.code === edition);
  if (!ed) throw new Error(`Édition inconnue : ${edition}`);
  if (ed.max_utilisateurs && users > ed.max_utilisateurs) {
    throw new Error(`L'édition ${edition} est limitée à ${ed.max_utilisateurs} utilisateurs.`);
  }
  if (users > 50) throw new Error('Au-delà de 50 utilisateurs : sur devis.');
  if (users < 1) throw new Error('Au moins un utilisateur.');
  const lines = [{ label: `Édition ${edition}`, perUserUsd: ed.prix_utilisateur, users, totalUsdCents: BigInt(ed.prix_utilisateur * 100 * users) }];
  for (const m of addOns) {
    const p = grid.modules_a_la_carte_par_utilisateur[m];
    if (p === undefined) throw new Error(`Module inconnu : ${m}`);
    lines.push({ label: `Module ${m}`, perUserUsd: p, users, totalUsdCents: BigInt(p * 100 * users) });
  }
  const monthly = lines.reduce((s, l) => s + l.totalUsdCents, 0n);
  return { monthlyUsdCents: monthly, annualUsdCents: monthly * 10n, lines };
}

export interface CabinetTier {
  code: string;
  prix_mensuel: number | string;
  collaborateurs_inclus?: number;
  dossiers_inclus?: number;
  supplement_collaborateur?: number;
  supplement_dossier?: number;
}

export function quoteCabinet(tier: CabinetTier, collaborators: number, files: number): bigint {
  if (typeof tier.prix_mensuel !== 'number') throw new Error('Palier sur devis.');
  const extraC = Math.max(0, collaborators - (tier.collaborateurs_inclus ?? 0));
  const extraF = Math.max(0, files - (tier.dossiers_inclus ?? 0));
  return BigInt(
    (tier.prix_mensuel + extraC * (tier.supplement_collaborateur ?? 0) + extraF * (tier.supplement_dossier ?? 0)) * 100,
  );
}

export type SubscriptionStatus = 'ESSAI' | 'ACTIF' | 'IMPAYE' | 'LECTURE_SEULE' | 'SUSPENDU' | 'ARCHIVE';

export interface SubscriptionState {
  status: SubscriptionStatus;
  trialEndsAt?: string | null;
  paidUntil?: string | null; // fin de la période payée
  archived?: boolean;
}

function daysBetween(a: string, b: string): number {
  return Math.floor((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}

/**
 * Cycle : essai 30 j → actif → impayé (rappels J-7, J0, J+3, J+7) → lecture seule à J+15 → suspendu à J+60.
 */
export function computeStatus(s: SubscriptionState, today: string): SubscriptionStatus {
  if (s.archived) return 'ARCHIVE';
  const end = s.paidUntil ?? s.trialEndsAt;
  if (!end) return s.status;
  const late = daysBetween(end, today);
  if (late <= 0) return s.paidUntil ? 'ACTIF' : 'ESSAI';
  if (late >= 60) return 'SUSPENDU';
  if (late >= 15) return 'LECTURE_SEULE';
  return 'IMPAYE';
}

export function reminderDue(paidUntil: string, today: string): 'J-7' | 'J0' | 'J+3' | 'J+7' | null {
  const d = daysBetween(paidUntil, today);
  return ({ [-7]: 'J-7', 0: 'J0', 3: 'J+3', 7: 'J+7' } as Record<number, 'J-7' | 'J0' | 'J+3' | 'J+7'>)[d] ?? null;
}

export type AccessMode = 'COMPLET' | 'LECTURE_SEULE' | 'AUCUN';

export function accessMode(status: SubscriptionStatus): AccessMode {
  if (status === 'ESSAI' || status === 'ACTIF' || status === 'IMPAYE') return 'COMPLET';
  if (status === 'LECTURE_SEULE') return 'LECTURE_SEULE';
  return 'AUCUN';
}

/** Les consultations et exports restent permis en lecture seule. */
export function isAllowed(mode: AccessMode, method: string, path = ''): boolean {
  if (mode === 'COMPLET') return true;
  if (mode === 'AUCUN') return false;
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || /\/exports?\//.test(path);
}

export function hasModule(active: readonly string[], required: ModuleCode): boolean {
  return active.includes(required);
}

export interface Limits {
  users: number;
  companies: number;
  aiCredits: number;
}

export function checkQuota(kind: keyof Limits, current: number, limits: Limits): { ok: boolean; message?: string } {
  if (current + 1 > limits[kind]) {
    return { ok: false, message: `Quota atteint (${kind} : ${limits[kind]}). Contactez JUPSER pour étendre votre abonnement.` };
  }
  return { ok: true };
}

/** Prorata d'un changement de formule (en jours). */
export function prorata(monthlyCents: bigint, daysRemaining: number, daysInPeriod: number): bigint {
  if (daysInPeriod <= 0) throw new Error('Période invalide');
  return (monthlyCents * BigInt(daysRemaining) + BigInt(daysInPeriod) / 2n) / BigInt(daysInPeriod);
}
