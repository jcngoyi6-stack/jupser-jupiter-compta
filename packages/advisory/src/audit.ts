/**
 * Audit et révision (docs/15 §3). Les programmes de travail et les fourchettes de seuil sont des propositions
 * inspirées des ISA ; statut A_VALIDER tant qu'un expert-comptable membre de l'ordre ne les a pas validés.
 */
import { prng } from './invest';

export const REFERENTIAL_STATUS = 'A_VALIDER' as const;

export interface MaterialityBenchmark { name: string; base: number; rate: number }

/**
 * Seuil de signification : le cabinet choisit la référence et le taux (jugement professionnel).
 * Seuil de planification = seuil × ratio de performance ; anomalies manifestement insignifiantes = seuil × ratio.
 */
export function materiality(p: { benchmarks: MaterialityBenchmark[]; selected: string; performanceRatio: number; trivialRatio: number }) {
  const computed = p.benchmarks.map((b) => ({ ...b, amount: Math.abs(b.base) * b.rate }));
  const chosen = computed.find((b) => b.name === p.selected);
  if (!chosen) throw new Error('REFERENCE_INCONNUE');
  return {
    benchmarks: computed,
    overall: chosen.amount,
    performance: chosen.amount * p.performanceRatio,
    trivial: chosen.amount * p.trivialRatio,
  };
}

export type Cycle = 'TRESORERIE' | 'VENTES_CLIENTS' | 'ACHATS_FOURNISSEURS' | 'STOCKS' | 'IMMOBILISATIONS' | 'PERSONNEL' | 'FISCALITE' | 'CAPITAUX_PROPRES';

export const CYCLE_ACCOUNTS: Record<Cycle, string[]> = {
  TRESORERIE: ['5'],
  VENTES_CLIENTS: ['41', '70', '71'],
  ACHATS_FOURNISSEURS: ['40', '60', '61', '62', '63'],
  STOCKS: ['3', '603', '73'],
  IMMOBILISATIONS: ['2', '68', '78', '81', '82'],
  PERSONNEL: ['42', '43', '66'],
  FISCALITE: ['44', '64', '89'],
  CAPITAUX_PROPRES: ['10', '11', '12', '13', '14', '15', '16'],
};

export interface Procedure { ref: string; assertion: string; procedure: string; automated?: string }

const P = (ref: string, assertion: string, procedure: string, automated?: string): Procedure => ({ ref, assertion, procedure, ...(automated ? { automated } : {}) });

export const AUDIT_PROGRAMMES: Record<Cycle, Procedure[]> = {
  TRESORERIE: [
    P('T1', 'Existence', 'Obtenir les confirmations bancaires de tous les comptes ouverts ou clôturés dans l’exercice.', 'CONFIRMATION_BANQUE'),
    P('T2', 'Exhaustivité', 'Contrôler les états de rapprochement à la clôture et le dénouement des suspens.', 'RAPPROCHEMENT'),
    P('T3', 'Existence', 'Assister ou procéder à l’inventaire des caisses à la date de clôture.'),
    P('T4', 'Séparation des exercices', 'Examiner les virements internes et les chèques émis non encaissés autour de la clôture.'),
  ],
  VENTES_CLIENTS: [
    P('V1', 'Existence', 'Circulariser un échantillon de clients (sélection par unité monétaire).', 'CONFIRMATION_CLIENT'),
    P('V2', 'Séparation des exercices', 'Rapprocher les dernières livraisons et factures de l’exercice et du suivant.'),
    P('V3', 'Évaluation', 'Analyser l’antériorité des créances et la suffisance des dépréciations.', 'BALANCE_AGEE'),
    P('V4', 'Exhaustivité', 'Contrôler la continuité des numéros de factures et la certification DEF (RDC).', 'SEQUENCE'),
    P('V5', 'Réalité', 'Revue analytique du chiffre d’affaires par mois et par produit (N/N-1).', 'REVUE_ANALYTIQUE'),
  ],
  ACHATS_FOURNISSEURS: [
    P('A1', 'Exhaustivité', 'Circulariser les principaux fournisseurs, y compris ceux à solde nul.', 'CONFIRMATION_FOURNISSEUR'),
    P('A2', 'Exhaustivité', 'Rechercher les passifs non comptabilisés (paiements postérieurs, factures non parvenues).'),
    P('A3', 'Réalité', 'Tester un échantillon d’achats : bon de commande approuvé, réception, facture, paiement.'),
  ],
  STOCKS: [
    P('S1', 'Existence', 'Assister à l’inventaire physique et réaliser des comptages par sondage.'),
    P('S2', 'Évaluation', 'Recalculer le coût (CMUP ou PEPS) et tester la valeur nette de réalisation.', 'VALORISATION_STOCK'),
    P('S3', 'Séparation des exercices', 'Contrôler les dernières entrées et sorties autour de la clôture.'),
  ],
  IMMOBILISATIONS: [
    P('I1', 'Existence', 'Inspecter physiquement un échantillon d’immobilisations significatives.'),
    P('I2', 'Évaluation', 'Recalculer les dotations aux amortissements et vérifier les durées retenues.', 'RECALCUL_AMORTISSEMENTS'),
    P('I3', 'Droits et obligations', 'Examiner les titres de propriété, contrats de crédit-bail et sûretés.'),
    P('I4', 'Exactitude', 'Contrôler les cessions et sorties (prix, VNC, plus ou moins-values).'),
  ],
  PERSONNEL: [
    P('P1', 'Réalité', 'Rapprocher la masse salariale des déclarations sociales et fiscales.', 'RAPPROCHEMENT_PAIE'),
    P('P2', 'Exactitude', 'Recalculer un échantillon de bulletins à partir des contrats et barèmes du pack pays.'),
    P('P3', 'Exhaustivité', 'Contrôler les provisions pour congés payés et indemnités de fin de carrière.'),
  ],
  FISCALITE: [
    P('F1', 'Exactitude', 'Rapprocher le chiffre d’affaires déclaré à la TVA et le chiffre d’affaires comptable.', 'RAPPROCHEMENT_TVA'),
    P('F2', 'Exactitude', 'Revoir le tableau de passage du résultat comptable au résultat fiscal et le calcul de l’IS.'),
    P('F3', 'Conformité', 'Vérifier le respect des échéances déclaratives et les pénalités éventuelles.'),
  ],
  CAPITAUX_PROPRES: [
    P('C1', 'Exactitude', 'Rapprocher les mouvements des capitaux propres des procès-verbaux d’assemblée.'),
    P('C2', 'Présentation', 'Vérifier la règle des capitaux propres inférieurs à la moitié du capital social.'),
  ],
};

/** Risque d'anomalie significative par cycle → nature et étendue des travaux. */
export function riskAssessment(cycles: { cycle: Cycle; inherent: 1 | 2 | 3; control: 1 | 2 | 3 }[]) {
  return cycles.map((c) => {
    const score = c.inherent * c.control;
    const level = score >= 6 ? 'ELEVE' : score >= 3 ? 'MOYEN' : 'FAIBLE';
    return { ...c, score, level, approach: level === 'ELEVE' ? 'TESTS_DE_DETAIL_ETENDUS' : level === 'MOYEN' ? 'MIXTE' : 'PROCEDURES_ANALYTIQUES' };
  });
}

export interface JournalEntryLite { id: string; number?: string; date: string; amount: number; description: string; createdBy?: string; validatedBy?: string; postedAt?: string }

/** Écritures inhabituelles : week-end, montants ronds, proches de la clôture, saisies et validées par la même personne, libellés vagues. */
export function unusualEntries(entries: JournalEntryLite[], o: { periodEnd: string; roundTo: number; daysBeforeEnd: number; threshold?: number }) {
  const end = new Date(`${o.periodEnd}T00:00:00Z`).getTime();
  const vague = /\b(divers|regul|régul|ajust|correction|annul|ecart|écart)\b/i;
  return entries
    .map((e) => {
      const d = new Date(`${e.date}T00:00:00Z`);
      const flags: string[] = [];
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) flags.push('WEEK_END');
      if (o.roundTo > 0 && e.amount !== 0 && Math.abs(e.amount) % o.roundTo === 0) flags.push('MONTANT_ROND');
      const days = (end - d.getTime()) / 86400000;
      if (days >= 0 && days <= o.daysBeforeEnd) flags.push('PROCHE_CLOTURE');
      if (e.createdBy && e.validatedBy && e.createdBy === e.validatedBy) flags.push('MEME_SAISISSEUR_VALIDEUR');
      if (vague.test(e.description) || e.description.trim().length < 4) flags.push('LIBELLE_VAGUE');
      if (o.threshold !== undefined && Math.abs(e.amount) >= o.threshold) flags.push('SUPERIEUR_SEUIL');
      return { ...e, flags };
    })
    .filter((e) => e.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || Math.abs(b.amount) - Math.abs(a.amount));
}

/** Contrôle des séquences : trous et doublons dans une numérotation « PREFIXE-000123 ». */
export function sequenceCheck(numbers: string[]) {
  const byPrefix = new Map<string, number[]>();
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const n of numbers) {
    if (seen.has(n)) duplicates.push(n);
    seen.add(n);
    const m = /^(.*?)(\d+)$/.exec(n);
    if (!m) continue;
    const arr = byPrefix.get(m[1] ?? '') ?? [];
    arr.push(Number(m[2]));
    byPrefix.set(m[1] ?? '', arr);
  }
  const gaps: { prefix: string; from: number; to: number }[] = [];
  for (const [prefix, arr] of byPrefix) {
    const s = [...new Set(arr)].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) {
      const prev = s[i - 1] ?? 0;
      const cur = s[i] ?? 0;
      if (cur - prev > 1) gaps.push({ prefix, from: prev + 1, to: cur - 1 });
    }
  }
  return { gaps, duplicates };
}

/** Sondage par unité monétaire (sélection systématique à départ aléatoire reproductible). */
export function monetaryUnitSample<T extends { id: string; amount: number }>(items: T[], sampleSize: number, seed = 1) {
  const pop = items.filter((i) => i.amount !== 0);
  const total = pop.reduce((s, i) => s + Math.abs(i.amount), 0);
  if (sampleSize <= 0 || total === 0) return { interval: 0, selected: [] as T[] };
  const interval = total / sampleSize;
  let next = prng(seed)() * interval;
  let cum = 0;
  const selected: T[] = [];
  for (const it of pop) {
    cum += Math.abs(it.amount);
    let hit = false;
    while (next < cum) {
      hit = true;
      next += interval;
    }
    if (hit) selected.push(it);
  }
  return { interval, selected };
}

/** Revue analytique N / N-1 : variations significatives à commenter. */
export function analyticalReview(rows: { account: string; label: string; current: number; prior: number }[], o: { amountThreshold: number; pctThreshold: number }) {
  return rows
    .map((r) => {
      const change = r.current - r.prior;
      const pct = r.prior === 0 ? null : change / Math.abs(r.prior);
      const significant = Math.abs(change) >= o.amountThreshold && (pct === null || Math.abs(pct) >= o.pctThreshold);
      return { ...r, change, pct, significant };
    })
    .filter((r) => r.significant)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** Synthèse des anomalies relevées par rapport au seuil. */
export function misstatementSummary(items: { ref: string; description: string; amount: number; adjusted: boolean }[], overall: number) {
  const uncorrected = items.filter((i) => !i.adjusted).reduce((s, i) => s + i.amount, 0);
  return {
    total: items.reduce((s, i) => s + i.amount, 0),
    uncorrected,
    exceedsMateriality: Math.abs(uncorrected) >= overall,
    opinionHint: Math.abs(uncorrected) >= overall ? 'OPINION_AVEC_RESERVE_A_ENVISAGER' : 'OPINION_SANS_RESERVE_ENVISAGEABLE',
  };
}

export type ConfirmationKind = 'CLIENT' | 'FOURNISSEUR' | 'BANQUE' | 'AVOCAT';

/** Lettre de circularisation (demande signée par l'entité, réponse directe à l'auditeur). */
export function confirmationLetter(kind: ConfirmationKind, d: { entity: string; auditor: string; auditorAddress: string; recipient: string; date: string; balance?: string; currency?: string }) {
  const intro = `${d.recipient}\n\nObjet : demande de confirmation au ${d.date}\n\nMadame, Monsieur,\n\nDans le cadre de l’audit de nos comptes, nous vous prions de bien vouloir confirmer directement à ${d.auditor} (${d.auditorAddress}) `;
  const body: Record<ConfirmationKind, string> = {
    CLIENT: `le solde de votre compte dans nos livres, soit ${d.balance ?? '…'} ${d.currency ?? ''} en notre faveur. En cas de désaccord, merci d’indiquer le solde figurant dans votre comptabilité et le détail des écarts.`,
    FOURNISSEUR: `le solde de notre compte dans vos livres à cette date, ainsi que le détail des factures non réglées, des effets en circulation et des engagements en cours.`,
    BANQUE: `les soldes de l’ensemble de nos comptes, les emprunts et découverts, les garanties et cautions données ou reçues, les titres en dépôt, les signatures autorisées et tout autre engagement à cette date.`,
    AVOCAT: `la liste des litiges, contentieux et réclamations en cours nous concernant, votre appréciation de leur issue probable et des montants en jeu, ainsi que vos honoraires restant dus.`,
  };
  return `${intro}${body[kind]}\n\nCette demande ne constitue pas une demande de paiement.\n\nVeuillez agréer nos salutations distinguées.\n\n${d.entity}\n\n— Projet généré par Jupiter Compta, à valider par l’auditeur.`;
}

/** Référence de feuille de travail : cycle + numéro (ex. « VENTES_CLIENTS-03 » → « V-03 »). */
export function workpaperRef(cycle: Cycle, n: number): string {
  return `${cycle.charAt(0)}-${String(n).padStart(2, '0')}`;
}
