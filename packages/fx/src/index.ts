import { divRound, type EntryLineInput } from '@jupiter/ledger';

/** Parités fixes officielles (docs/05 §5). */
export const FIXED_PEGS: Record<string, { base: string; rate: string; source: string }> = {
  XOF: { base: 'EUR', rate: '655.957', source: 'BCEAO (parité fixe)' },
  XAF: { base: 'EUR', rate: '655.957', source: 'BEAC (parité fixe)' },
  KMF: { base: 'EUR', rate: '491.96775', source: 'Banque centrale des Comores (parité fixe)' },
};

export type RateType = 'OFFICIEL' | 'MARCHE' | 'MANUEL';

export interface FxRate {
  currency: string; // devise étrangère
  quote: string; // devise de tenue
  rate: string; // 1 currency = rate quote
  date: string;
  source: string;
  type: RateType;
}

const RATE_SCALE = 10n ** 10n;

/** Cours décimal → entier à l'échelle 10^10 (aucun flottant). */
export function rateToScaled(rate: string): bigint {
  const s = rate.trim().replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,10}))?$/.exec(s);
  if (!m) throw new Error(`Cours invalide : ${rate}`);
  const frac = (m[2] ?? '').padEnd(10, '0');
  const v = BigInt(m[1]! + frac);
  if (v === 0n) throw new Error('Cours nul');
  return v;
}

/**
 * Convertit un montant en devise (unités mineures) vers la devise de tenue (unités mineures),
 * arrondi au plus proche.
 */
export function convert(foreignMinor: bigint, rate: string, fromDecimals: number, toDecimals: number): bigint {
  const scaled = rateToScaled(rate);
  const num = foreignMinor * scaled * 10n ** BigInt(toDecimals);
  const den = RATE_SCALE * 10n ** BigInt(fromDecimals);
  return divRound(num, den);
}

/** Choisit le cours applicable à une date : le plus récent ≤ date, priorité OFFICIEL > MARCHE > MANUEL. */
export function pickRate(rates: FxRate[], currency: string, quote: string, date: string): FxRate | null {
  const prio: Record<RateType, number> = { OFFICIEL: 0, MARCHE: 1, MANUEL: 2 };
  const c = rates
    .filter((r) => r.currency === currency && r.quote === quote && r.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date) || prio[a.type] - prio[b.type]);
  return c[0] ?? null;
}

export interface OpenFxItem {
  account: string; // compte de créance ou de dette (6 chiffres)
  thirdPartyId?: string | null;
  kind: 'CREANCE' | 'DETTE';
  financial?: boolean; // créance/dette financière (sinon exploitation)
  currency: string;
  foreignOutstanding: bigint; // unités mineures devise
  bookedLocal: bigint; // contre-valeur comptabilisée (unités mineures devise de tenue)
  currencyDecimals: number;
}

export interface RevaluationResult {
  item: OpenFxItem;
  closingLocal: bigint;
  difference: bigint; // closingLocal – bookedLocal
  latent: 'PERTE' | 'GAIN' | 'NUL';
  lines: EntryLineInput[];
  provisionLines: EntryLineInput[];
}

/**
 * Réévaluation de clôture (prudence) : écarts de conversion en 478 (actif, perte latente) / 479 (passif,
 * gain latent) ; les gains latents ne passent jamais en résultat ; les pertes latentes sont provisionnées
 * (guide d'application, applications 84 et 87) :
 * - créances et dettes d'exploitation : 659100 / 499100 (provision pour risques à court terme sur opérations
 *   d'exploitation ; le guide écrit 4911, qui est « Créances litigieuses » dans le plan révisé) ;
 * - créances et dettes financières : 697100 / 194000 (provisions pour pertes de change).
 */
export function revalue(item: OpenFxItem, closingRate: string, localDecimals: number): RevaluationResult {
  const closingLocal = convert(item.foreignOutstanding, closingRate, item.currencyDecimals, localDecimals);
  const difference = closingLocal - item.bookedLocal;
  const lines: EntryLineInput[] = [];
  const provisionLines: EntryLineInput[] = [];
  const tp = item.thirdPartyId ?? null;
  let latent: RevaluationResult['latent'] = 'NUL';
  const abs = difference < 0n ? -difference : difference;
  if (difference !== 0n) {
    if (item.kind === 'CREANCE') {
      if (difference < 0n) {
        latent = 'PERTE';
        lines.push({ account: item.financial ? '478200' : '478100', debit: abs, credit: 0n });
        lines.push({ account: item.account, thirdPartyId: tp, debit: 0n, credit: abs });
      } else {
        latent = 'GAIN';
        lines.push({ account: item.account, thirdPartyId: tp, debit: abs, credit: 0n });
        lines.push({ account: item.financial ? '479200' : '479100', debit: 0n, credit: abs });
      }
    } else {
      if (difference > 0n) {
        latent = 'PERTE';
        lines.push({ account: item.financial ? '478400' : '478300', debit: abs, credit: 0n });
        lines.push({ account: item.account, thirdPartyId: tp, debit: 0n, credit: abs });
      } else {
        latent = 'GAIN';
        lines.push({ account: item.account, thirdPartyId: tp, debit: abs, credit: 0n });
        lines.push({ account: '479300', debit: 0n, credit: abs });
      }
    }
    if (latent === 'PERTE') {
      provisionLines.push({ account: item.financial ? '697100' : '659100', debit: abs, credit: 0n });
      provisionLines.push({ account: item.financial ? '194000' : '499100', debit: 0n, credit: abs });
    }
  }
  return { item, closingLocal, difference, latent, lines, provisionLines };
}

/**
 * Écart de change réalisé au règlement (guide d'application, applications 84 et 86) :
 * créances et dettes commerciales 656 (perte) / 756 (gain) ; opérations financières 676 / 776.
 * Retourne la ligne d'écart à ajouter à l'écriture de règlement.
 */
export function realizedDifference(
  kind: 'CREANCE' | 'DETTE',
  bookedLocal: bigint,
  settledLocal: bigint,
  financial = false,
): { gainOrLoss: 'GAIN' | 'PERTE' | 'NUL'; line: EntryLineInput | null } {
  // Créance : on encaisse settledLocal pour solder bookedLocal ; dette : on décaisse settledLocal.
  const delta = kind === 'CREANCE' ? settledLocal - bookedLocal : bookedLocal - settledLocal;
  if (delta === 0n) return { gainOrLoss: 'NUL', line: null };
  if (delta > 0n) return { gainOrLoss: 'GAIN', line: { account: financial ? '776000' : '756000', debit: 0n, credit: delta } };
  return { gainOrLoss: 'PERTE', line: { account: financial ? '676000' : '656000', debit: -delta, credit: 0n } };
}

/**
 * Seuil SMT (art. 13 AUDCIF) exprimé en FCFA, converti dans la monnaie du pays via l'euro.
 * `eurToLocal` : cours 1 EUR = x devise locale (ex. BCC pour le CDF).
 */
export function convertXafThreshold(xafAmount: bigint, eurToLocal: string, localDecimals: number): bigint {
  // 1 EUR = 655,957 XAF → montant EUR = XAF / 655,957
  const eurScaled = (xafAmount * RATE_SCALE * RATE_SCALE) / rateToScaled('655.957'); // EUR × 10^10
  return divRound(eurScaled * rateToScaled(eurToLocal) * 10n ** BigInt(localDecimals), RATE_SCALE * RATE_SCALE);
}
