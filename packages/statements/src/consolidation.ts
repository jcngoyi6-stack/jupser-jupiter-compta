import type { AccountBalance } from './types';

/**
 * Consolidation (édition Entreprise) — intégration globale (IG) et mise en équivalence (MEE),
 * élimination des comptes réciproques, conversion des filiales en devises (bilan au cours de clôture,
 * résultat au cours moyen, écart de conversion en capitaux propres).
 * TODO(expert-comptable) : écarts d'acquisition, retraitements d'homogénéisation, dispositions de
 * l'AUDCIF sur les comptes consolidés et combinés.
 */
export interface Entity {
  id: string;
  name: string;
  parent: boolean;
  method: 'IG' | 'MEE';
  ownershipPpm: bigint; // pourcentage d'intérêt × 10 000 (1 000 000 = 100 %)
  balances: AccountBalance[]; // dans sa devise
  closingRate?: string; // vers la devise de consolidation (1 devise filiale = x devise groupe)
  averageRate?: string;
  /** coût des titres détenus par la société mère sur cette entité (unités groupe) */
  investmentCost?: bigint;
  investmentAccount?: string;
}

const SCALE = 10n ** 10n;
function rateScaled(r?: string): bigint {
  if (!r) return SCALE;
  const [i, f = ''] = r.replace(',', '.').split('.');
  return BigInt(i! + f.padEnd(10, '0').slice(0, 10));
}
const conv = (v: bigint, r: bigint) => (v * r + (v >= 0n ? SCALE / 2n : -SCALE / 2n)) / SCALE;

export interface ConsolidationResult {
  balances: AccountBalance[];
  minorityInterests: bigint; // part des minoritaires dans les capitaux propres, résultat compris
  minorityEquity: bigint; // part des minoritaires hors résultat de l'exercice
  minorityResult: bigint;
  translationDifference: bigint;
  goodwill: bigint;
  eliminated: { account: string; amount: bigint }[];
}

export function consolidate(entities: Entity[], intercompanyPrefixes: string[] = ['181', '185', '186', '187', '188', '463']): ConsolidationResult {
  const totals = new Map<string, bigint>();
  const add = (a: string, v: bigint) => totals.set(a, (totals.get(a) ?? 0n) + v);
  let minorityInterests = 0n;
  let minorityEquity = 0n;
  let minorityResult = 0n;
  let translationDifference = 0n;
  let goodwill = 0n;
  const eliminated: { account: string; amount: bigint }[] = [];
  for (const e of entities) {
    const cr = rateScaled(e.closingRate);
    const ar = rateScaled(e.averageRate ?? e.closingRate);
    const isPl = (a: string) => /^[678]/.test(a);
    const converted = e.balances.map((b) => ({ account: b.account, net: conv(b.net, isPl(b.account) ? ar : cr) }));
    // écart de conversion : le bilan converti doit rester équilibré
    const gap = converted.reduce((s, b) => s + b.net, 0n);
    if (gap !== 0n) translationDifference += -gap;
    if (e.parent || e.method === 'IG') {
      for (const b of converted) {
        if (intercompanyPrefixes.some((p) => b.account.startsWith(p))) {
          eliminated.push({ account: b.account, amount: b.net });
          continue;
        }
        add(b.account, b.net);
      }
      if (!e.parent) {
        const pct = e.ownershipPpm;
        const equity = -converted.filter((b) => /^1[0-4]/.test(b.account)).reduce((s, b) => s + b.net, 0n);
        const result = -converted.filter((b) => isPl(b.account)).reduce((s, b) => s + b.net, 0n);
        minorityEquity += (equity * (1_000_000n - pct)) / 1_000_000n;
        minorityInterests += ((equity + result) * (1_000_000n - pct)) / 1_000_000n;
        minorityResult += (result * (1_000_000n - pct)) / 1_000_000n;
        if (e.investmentCost !== undefined) {
          const share = (equity * pct) / 1_000_000n;
          goodwill += e.investmentCost - share;
          add(e.investmentAccount ?? '261000', -e.investmentCost);
          // les capitaux propres de la filiale sont remplacés par la part du groupe (éliminée contre les titres)
          for (const b of converted.filter((x) => /^1[0-4]/.test(x.account))) add(b.account, -b.net);
        }
      }
    } else {
      // MEE : les titres sont remplacés par la quote-part des capitaux propres
      const equity = -converted.filter((b) => /^1[0-4]/.test(b.account) || isPl(b.account)).reduce((s, b) => s + b.net, 0n);
      const share = (equity * e.ownershipPpm) / 1_000_000n;
      const cost = e.investmentCost ?? 0n;
      add(e.investmentAccount ?? '262000', share - cost);
      add('776000', -(share - cost)); // quote-part de résultat — TODO(expert-comptable) : ligne dédiée
    }
  }
  // écarts d'arrondi/intra-groupe éventuels : compensés en écart de conversion
  return {
    balances: [...totals].filter(([, v]) => v !== 0n).map(([account, net]) => ({ account, net })).sort((a, b) => a.account.localeCompare(b.account)),
    minorityInterests,
    minorityEquity,
    minorityResult,
    translationDifference,
    goodwill,
    eliminated,
  };
}
