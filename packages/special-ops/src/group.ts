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

/**
 * Entité ad hoc (application 131) : consolidée si deux des trois critères sont réunis — pouvoirs de décision et
 * avantages, pouvoirs et risques, ou avantages et risques. Pour une entité issue d'une cession de créances, le critère
 * des pouvoirs de décision prédomine.
 */
export function adHocControl(p: { decisionPowers: boolean; majorityBenefits: boolean; majorityRisks: boolean; receivablesVehicle?: boolean }): { controlled: boolean; method: ConsolidationMethod; reason: string } {
  const { decisionPowers: d, majorityBenefits: b, majorityRisks: r } = p;
  const controlled = p.receivablesVehicle ? d : (d && b) || (d && r) || (b && r);
  const met = [d && 'pouvoirs de décision', b && 'majorité des avantages', r && 'majorité des risques'].filter(Boolean).join(', ') || 'aucun critère';
  return {
    controlled,
    method: controlled ? 'INTEGRATION_GLOBALE' : 'NON_CONSOLIDEE',
    reason: controlled
      ? `Entité ad hoc contrôlée (${met}) : intégration globale.`
      : `Critères réunis : ${met} — contrôle non établi${p.receivablesVehicle ? ' (véhicule de cession de créances : les pouvoirs de décision prédominent)' : ''}.`,
  };
}

/**
 * Variation du pourcentage d'intérêt sans perte de contrôle (application 141) : l'écart d'acquisition reste figé à la
 * date de prise de contrôle ; l'écart entre le prix du lot (acheté ou cédé) et la quote-part de juste valeur acquise ou
 * cédée est une opération entre actionnaires, imputée sur les réserves du groupe. Partage des capitaux propres à la
 * clôture au nouveau pourcentage.
 */
export function ownershipChange(p: {
  initial: { interest: number; cost: bigint; equity: bigint; upliftGross: bigint; taxRate: number };
  step: { newInterest: number; price: bigint; equity: bigint; upliftAmortised?: bigint };
  closingEquity: bigint;
  depreciableUplift?: { amount: bigint; years: number };
}): OpResult {
  const t = p.initial.taxRate;
  const net = (gross: bigint) => gross - pct(gross, t);
  const valuation0 = net(p.initial.upliftGross);
  const goodwill = p.initial.cost - pct(p.initial.equity + valuation0, p.initial.interest);
  const delta = p.step.newInterest - p.initial.interest;
  if (p.step.newInterest <= 0.5) {
    return { entries: [], values: { goodwill, lossOfControl: 'OUI' }, notes: ['Perte de contrôle : la filiale sort du périmètre de l’intégration globale ; résultat de cession à déterminer sur la quote-part cédée et réévaluation de la participation conservée.'] };
  }
  const valuationStep = net(p.initial.upliftGross - (p.step.upliftAmortised ?? 0n));
  const shareFairValue = pct(p.step.equity + valuationStep, Math.abs(delta));
  // achat : réserves diminuées de l'excédent du prix ; cession : réserves augmentées du prix au-delà de la quote-part cédée
  const reservesImpact = delta >= 0 ? shareFairValue - p.step.price : p.step.price - shareFairValue;
  const i2 = p.step.newInterest;
  const groupValuation = pct(valuation0, i2);
  const totalCost = delta >= 0 ? p.initial.cost + p.step.price : p.initial.cost - BigInt(Math.round(Number(p.initial.cost) * Math.abs(delta) / p.initial.interest));
  const titlesAfterEliminations = totalCost - groupValuation - goodwill;
  const minorities = pct(p.closingEquity, 1 - i2);
  const groupReserves = pct(p.closingEquity, i2) - titlesAfterEliminations;
  const annual = p.depreciableUplift ? p.depreciableUplift.amount / BigInt(p.depreciableUplift.years) : 0n;
  return {
    entries: [],
    values: {
      goodwill, valuationAtControl: valuation0, valuationAtStep: valuationStep, shareFairValue, reservesImpact,
      titlesAfterEliminations, minorities, groupReserves,
      annualUpliftDepreciation: annual, annualGroupShareNetOfTax: pct(net(annual), i2), annualMinorityShareNetOfTax: net(annual) - pct(net(annual), i2),
    },
    notes: ['Écart d’acquisition figé à la prise de contrôle : aucun nouvel écart n’est constaté sur le lot supplémentaire.'],
  };
}

export interface CombinedEntity {
  code: string; interest: number;
  fixedAssets: bigint; otherAssets: bigint; capitalAndReserves: bigint; result: bigint; liabilities: bigint;
  revenue: bigint; otherIncome: bigint; charges: bigint; incomeTax: bigint; deferredTax?: bigint;
}

/**
 * Comptes combinés (application 142) : agrégation des entités de l'espace OHADA liées à une entité extérieure,
 * impôts différés sur retraitements, partage entre ayants droit (pourcentage de l'entité combinante) et minoritaires.
 */
export function combinedAccounts(p: { entities: CombinedEntity[] }): OpResult {
  const sum = (f: (e: CombinedEntity) => bigint) => p.entities.reduce((s, e) => s + f(e), 0n);
  const dt = (e: CombinedEntity) => e.deferredTax ?? 0n;
  const reservesShare = sum((e) => pct(e.capitalAndReserves, e.interest));
  const resultShare = sum((e) => pct(e.result + dt(e), e.interest));
  const minorities = sum((e) => e.capitalAndReserves + e.result + dt(e) - pct(e.capitalAndReserves, e.interest) - pct(e.result + dt(e), e.interest));
  const minorityResult = sum((e) => e.result + dt(e) - pct(e.result + dt(e), e.interest));
  const beforeTax = sum((e) => e.revenue + e.otherIncome - e.charges);
  return {
    entries: [],
    values: {
      fixedAssets: sum((e) => e.fixedAssets), otherAssets: sum((e) => e.otherAssets), deferredTaxAssets: sum(dt),
      totalAssets: sum((e) => e.fixedAssets + e.otherAssets + dt(e)),
      combinedCapitalAndReserves: reservesShare, combinedResult: resultShare, ownersEquity: reservesShare + resultShare, minorities,
      totalEquity: reservesShare + resultShare + minorities, liabilities: sum((e) => e.liabilities),
      revenue: sum((e) => e.revenue), otherIncome: sum((e) => e.otherIncome), charges: sum((e) => e.charges), resultBeforeTax: beforeTax,
      incomeTax: sum((e) => e.incomeTax), deferredTaxVariation: sum(dt), netResult: beforeTax - sum((e) => e.incomeTax) + sum(dt),
      minorityResult, ownersResult: resultShare,
    },
    notes: ['Les opérations avec l’entité extérieure (honoraires versés à la maison mère hors OHADA) ne s’éliminent pas : seules les opérations réciproques entre entités combinées le sont.'],
  };
}
