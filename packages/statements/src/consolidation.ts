
/**
 * Consolidation (édition Entreprise) selon le guide d'application du SYSCOHADA révisé (applications 132 à 135) :
 * intégration globale (IG), intégration proportionnelle (IP), mise en équivalence (MEE), élimination des comptes
 * réciproques, conversion des entités en devises (bilan au cours de clôture, résultat au cours moyen, écart de
 * conversion en capitaux propres).
 * - Écart d'acquisition = coût des titres − quote-part des capitaux propres à la date d'acquisition ;
 * - quote-part des capitaux propres acquise depuis → réserves consolidées ;
 * - IG : intérêts minoritaires (capitaux propres et résultat) ; IP : fraction des comptes, sans minoritaires ;
 * - MEE : titres remplacés par la quote-part des capitaux propres, résultat compris ; la quote-part de résultat
 *   figure sur la ligne « Quote-part dans les résultats des entités mises en équivalence ».
 * TODO(expert-comptable) : retraitements d'homogénéisation, amortissement de l'écart d'acquisition, variations de périmètre.
 */
import type { AccountBalance } from './types';

export interface Entity {
  id: string;
  name: string;
  parent: boolean;
  method: 'IG' | 'IP' | 'MEE';
  ownershipPpm: bigint; // pourcentage d'intérêt (1 000 000 = 100 %)
  balances: AccountBalance[]; // dans sa devise
  closingRate?: string; // vers la devise de consolidation (1 devise filiale = x devise groupe)
  averageRate?: string;
  /** coût des titres détenus par la société mère sur cette entité (unités groupe) */
  investmentCost?: bigint;
  investmentAccount?: string;
  /** capitaux propres de l'entité à la date d'acquisition (hors résultat) ; à défaut, capitaux propres actuels */
  equityAtAcquisition?: bigint;
}

const SCALE = 10n ** 10n;
function rateScaled(r?: string): bigint {
  if (!r) return SCALE;
  const [i, f = ''] = r.replace(',', '.').split('.');
  return BigInt(i! + f.padEnd(10, '0').slice(0, 10));
}
const conv = (v: bigint, r: bigint) => (v * r + (v >= 0n ? SCALE / 2n : -SCALE / 2n)) / SCALE;
const PPM = 1_000_000n;
const share = (v: bigint, ppm: bigint) => (v * ppm) / PPM;
const isEquity = (a: string) => /^1[0-4]/.test(a);
const isPl = (a: string) => /^[678]/.test(a);

export interface ConsolidationResult {
  /** Actifs, dettes et comptes de gestion intégrés, après éliminations (capitaux propres des filiales exclus). */
  balances: AccountBalance[];
  minorityInterests: bigint; // part des minoritaires dans les capitaux propres, résultat compris
  minorityEquity: bigint; // part des minoritaires hors résultat de l'exercice
  minorityResult: bigint;
  translationDifference: bigint;
  /** Écart d'acquisition (positif : actif ; négatif : écart d'acquisition négatif). */
  goodwill: bigint;
  /** Quote-part du groupe dans les capitaux propres des filiales acquise depuis leur entrée dans le périmètre. */
  consolidatedReserves: bigint;
  /** Quote-part dans les résultats des entités mises en équivalence. */
  equityMethodResult: bigint;
  eliminated: { account: string; amount: bigint }[];
  /** Présentation synthétique : capitaux propres part du groupe, minoritaires, résultat. */
  summary: {
    groupCapital: bigint;
    groupReserves: bigint;
    groupResult: bigint;
    groupEquity: bigint;
    totalResult: bigint;
  };
}

export function consolidate(entities: Entity[], intercompanyPrefixes: string[] = ['181', '185', '186', '187', '188', '463']): ConsolidationResult {
  const totals = new Map<string, bigint>();
  const add = (a: string, v: bigint) => totals.set(a, (totals.get(a) ?? 0n) + v);
  let minorityEquity = 0n;
  let minorityResult = 0n;
  let translationDifference = 0n;
  let goodwill = 0n;
  let consolidatedReserves = 0n;
  let equityMethodResult = 0n;
  let parentCapital = 0n;
  let parentReserves = 0n;
  const eliminated: { account: string; amount: bigint }[] = [];
  for (const e of entities) {
    const cr = rateScaled(e.closingRate);
    const ar = rateScaled(e.averageRate ?? e.closingRate);
    const converted = e.balances.map((b) => ({ account: b.account, net: conv(b.net, isPl(b.account) ? ar : cr) }));
    const gap = converted.reduce((s, b) => s + b.net, 0n);
    if (gap !== 0n) translationDifference += -gap; // le bilan converti doit rester équilibré
    const equity = -converted.filter((b) => isEquity(b.account)).reduce((s, b) => s + b.net, 0n);
    const result = -converted.filter((b) => isPl(b.account)).reduce((s, b) => s + b.net, 0n);
    const pct = e.parent ? PPM : e.ownershipPpm;
    if (e.parent) {
      const capital = -converted.filter((b) => b.account.startsWith('10')).reduce((s, b) => s + b.net, 0n);
      parentCapital += capital;
      parentReserves += equity - capital; // réserves, report à nouveau, subventions… de la mère
    }
    if (e.method === 'MEE' && !e.parent) {
      // Titres mis en équivalence = quote-part des capitaux propres, résultat compris.
      const cost = e.investmentCost ?? 0n;
      const value = share(equity + result, pct);
      add(e.investmentAccount ?? '262000', value - cost);
      consolidatedReserves += share(equity, pct) - cost;
      equityMethodResult += share(result, pct);
      continue;
    }
    const fraction = e.method === 'IP' && !e.parent ? pct : PPM;
    for (const b of converted) {
      if (!e.parent && isEquity(b.account)) continue; // capitaux propres des filiales : partagés ci-dessous
      const v = share(b.net, fraction);
      if (intercompanyPrefixes.some((p) => b.account.startsWith(p))) {
        eliminated.push({ account: b.account, amount: v });
        continue;
      }
      add(b.account, v);
    }
    if (e.parent) continue;
    const acquired = share(e.equityAtAcquisition ?? equity, pct);
    if (e.investmentCost !== undefined) {
      add(e.investmentAccount ?? '261000', -e.investmentCost);
      goodwill += e.investmentCost - acquired;
    }
    consolidatedReserves += share(equity, pct) - acquired;
    if (e.method === 'IG') {
      minorityEquity += equity - share(equity, pct);
      minorityResult += result - share(result, pct);
    }
  }
  const balances = [...totals].filter(([, v]) => v !== 0n).map(([account, net]) => ({ account, net })).sort((a, b) => a.account.localeCompare(b.account));
  const integratedResult = -balances.filter((b) => isPl(b.account)).reduce((s, b) => s + b.net, 0n);
  const totalResult = integratedResult + equityMethodResult;
  const groupResult = totalResult - minorityResult;
  const groupReserves = parentReserves + consolidatedReserves;
  return {
    balances,
    minorityInterests: minorityEquity + minorityResult,
    minorityEquity,
    minorityResult,
    translationDifference,
    goodwill,
    consolidatedReserves,
    equityMethodResult,
    eliminated,
    summary: { groupCapital: parentCapital, groupReserves, groupResult, groupEquity: parentCapital + groupReserves + groupResult, totalResult },
  };
}
