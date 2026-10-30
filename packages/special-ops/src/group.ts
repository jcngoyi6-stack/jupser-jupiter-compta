/**
 * Consolidation avancée (guide d'application, chapitre 42, applications 128 à 130 et 135 à 138) :
 * pourcentages de contrôle et d'intérêt (chaînes, participations circulaires, droits de vote doubles et potentiels),
 * périmètre et méthodes, écarts d'évaluation et d'acquisition (goodwill, badwill, mise en équivalence), conversion
 * des états financiers en devises. Les écritures de consolidation relèvent du journal de consolidation (statements).
 */
import { pct, type OpResult } from './core';

export interface Holding { owner: string; owned: string; capital: number; votes?: number }
export type ConsolidationMethod = 'INTEGRATION_GLOBALE' | 'INTEGRATION_PROPORTIONNELLE' | 'MISE_EN_EQUIVALENCE' | 'NON_CONSOLIDEE';

/**
 * Pourcentages de contrôle (droits de vote détenus directement et par les entités contrôlées) et d'intérêt
 * (somme des produits le long des chaînes ; participations circulaires résolues par itération, la mère pouvant
 * être détenue par ses filiales — méthode de la « mère fictive », application 130).
 */
export function groupPercentages(p: { parent: string; holdings: Holding[]; jointControl?: string[] }): Record<string, { control: number; interest: number; method: ConsolidationMethod }> {
  const entities = [...new Set(p.holdings.flatMap((h) => [h.owner, h.owned]).concat(p.parent))];
  const votes = (h: Holding) => h.votes ?? h.capital;
  const controlled = new Set([p.parent]);
  const control: Record<string, number> = { [p.parent]: 1 };
  for (let changed = true; changed;) {
    changed = false;
    for (const e of entities) {
      if (e === p.parent) continue;
      const c = p.holdings.filter((h) => h.owned === e && controlled.has(h.owner)).reduce((s, h) => s + votes(h), 0);
      control[e] = c;
      if (c > 0.5 && !controlled.has(e)) { controlled.add(e); changed = true; }
    }
  }
  const heldInParent = p.holdings.filter((h) => h.owned === p.parent).reduce((s, h) => s + h.capital, 0);
  let interest: Record<string, number> = Object.fromEntries(entities.map((e) => [e, e === p.parent ? 1 : 0]));
  for (let i = 0; i < 500; i++) {
    const next: Record<string, number> = {};
    for (const e of entities) {
      const viaChains = p.holdings.filter((h) => h.owned === e).reduce((s, h) => s + interest[h.owner]! * h.capital, 0);
      next[e] = e === p.parent ? 1 - heldInParent + viaChains : viaChains;
    }
    const delta = entities.reduce((s, e) => s + Math.abs(next[e]! - interest[e]!), 0);
    interest = next;
    if (delta < 1e-12) break;
  }
  const out: Record<string, { control: number; interest: number; method: ConsolidationMethod }> = {};
  for (const e of entities) {
    const c = control[e] ?? 0;
    const method: ConsolidationMethod = e === p.parent || c > 0.5 ? 'INTEGRATION_GLOBALE'
      : p.jointControl?.includes(e) ? 'INTEGRATION_PROPORTIONNELLE' : c >= 0.2 ? 'MISE_EN_EQUIVALENCE' : 'NON_CONSOLIDEE';
    out[e] = { control: c, interest: interest[e]!, method };
  }
  return out;
}

/**
 * Pourcentage de droits de vote avec actions à vote double, sans droit de vote et droits potentiels substantifs
 * (application 129, entité H).
 */
export function votingRights(p: {
  held: { ordinary: number; double?: number; potential?: number }; capital: { ordinary: number; double?: number; nonVoting?: number; potential?: number };
}): { control: number; interest: number } {
  const v = p.held.ordinary + 2 * (p.held.double ?? 0) + (p.held.potential ?? 0);
  const total = p.capital.ordinary + 2 * (p.capital.double ?? 0) + (p.capital.potential ?? 0);
  const shares = p.capital.ordinary + (p.capital.double ?? 0) + (p.capital.nonVoting ?? 0);
  return { control: v / total, interest: (p.held.ordinary + (p.held.double ?? 0)) / shares };
}

/**
 * Écarts de première consolidation (applications 135 à 137) : écart de consolidation, écart d'évaluation net
 * d'impôt différé (part du groupe et des minoritaires), écart d'acquisition (positif amorti sur sa durée d'utilité,
 * 10 ans si elle ne peut être déterminée de façon fiable ; négatif rapporté au résultat).
 */
export function acquisitionDifferences(p: {
  cost: bigint; interest: number; equity: bigint; adjustments: { label: string; amount: bigint }[]; taxRate: number;
  goodwillUsefulLife?: number | 'INDETERMINEE' | 'NON_LIMITEE'; method?: 'INTEGRATION_GLOBALE' | 'MISE_EN_EQUIVALENCE';
}): OpResult {
  const gross = p.adjustments.reduce((s, a) => s + a.amount, 0n);
  const deferredTax = pct(gross, p.taxRate);
  const valuation = gross - deferredTax;
  const groupValuation = pct(valuation, p.interest);
  const consolidationDifference = p.cost - pct(p.equity, p.interest);
  const goodwill = consolidationDifference - groupValuation;
  const life = p.goodwillUsefulLife ?? 'INDETERMINEE';
  const annual = goodwill <= 0n || life === 'NON_LIMITEE' || p.method === 'MISE_EN_EQUIVALENCE' ? 0n : goodwill / BigInt(life === 'INDETERMINEE' ? 10 : life);
  return {
    entries: [],
    values: {
      consolidationDifference, grossRevaluation: gross, deferredTax, valuationDifference: valuation, groupValuation, minorityValuation: valuation - groupValuation,
      fairValueNetAssets: p.equity + valuation, goodwill, annualGoodwillAmortisation: annual, badwillToResult: goodwill < 0n ? -goodwill : 0n,
    },
    notes: [
      goodwill < 0n ? 'Écart d’acquisition négatif : vérifier l’identification et l’évaluation des actifs et passifs avant de constater un profit.' : 'Écart d’acquisition soumis à un test de dépréciation annuel ; ses dépréciations ne sont jamais reprises.',
      ...(p.method === 'MISE_EN_EQUIVALENCE' ? ['Mise en équivalence : l’écart d’acquisition est inclus dans la valeur des titres mis en équivalence.'] : []),
    ],
  };
}

/** Montant signé : actif et charges positifs, passif, capitaux propres et produits négatifs. */
export interface TranslationItem { code: string; amount: bigint; basis: 'CLOTURE' | 'HISTORIQUE' | 'MOYEN'; historicalRate?: number }

/**
 * Conversion des états financiers d'une entité étrangère (application 138) : cours de clôture (méthode du cours de
 * clôture) ou cours historique pour les éléments non monétaires (méthode du cours historique), cours moyen pour le
 * compte de résultat ; l'écart de conversion est isolé en capitaux propres (ou en résultat, cours historique).
 */
export function translateStatements(p: { items: TranslationItem[]; closingRate: number; averageRate: number }): OpResult {
  const translated = p.items.map((it) => {
    const rate = it.basis === 'CLOTURE' ? p.closingRate : it.basis === 'MOYEN' ? p.averageRate : it.historicalRate ?? p.closingRate;
    return { code: it.code, amount: BigInt(Math.round(Number(it.amount) * rate)) };
  });
  // Éléments signés (actif et charges positifs, passif et produits négatifs) : l'écart équilibre la conversion.
  const translationDifference = -translated.reduce((s, t) => s + t.amount, 0n);
  return { entries: [], values: { ...Object.fromEntries(translated.map((t) => [t.code, t.amount])), translationDifference } };
}
