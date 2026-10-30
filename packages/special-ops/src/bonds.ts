/**
 * Emprunts obligataires (guide d'application, chapitre 20, applications 78 à 80).
 * La dette est constatée au prix d'émission ; la prime de remboursement est rapportée en 6714 au prorata des
 * obligations échues (amortissements constants, annuités) ou des intérêts courus (in fine, via 1661).
 * Les frais d'émission sont des charges de l'exercice (6316).
 */
import { C, D, entry, ratio, type OpEntry, type OpResult } from './core';

export interface BondRow { year: number; liveBonds: number; interest: bigint; redeemedBonds: number; redemption: bigint; premium: bigint; annuity: bigint }

export function bondLoan(p: {
  count: number; nominal: bigint; issuePrice: bigint; redemptionPrice: bigint; rate: number; years: number; mode: 'AMORTISSEMENT_CONSTANT' | 'IN_FINE';
  issueDate: string; fees?: bigint; viaSubscription?: boolean; account?: string;
}): OpResult<BondRow> {
  const account = p.account ?? '161100';
  const issued = p.issuePrice * BigInt(p.count);
  const coupon = BigInt(Math.round(Number(p.nominal) * p.rate));
  const premiumPerBond = p.redemptionPrice - p.issuePrice;
  const y0 = Number(p.issueDate.slice(0, 4));
  const entries: OpEntry[] = p.viaSubscription
    ? [
        entry('Ouverture de la souscription', [D('471300', issued), C(account, issued)], p.issueDate),
        entry('Versement des fonds par les obligataires', [D('521100', issued), C('471300', issued)], p.issueDate),
      ]
    : [entry(`Émission de ${p.count} obligations à ${p.issuePrice}`, [D('521100', issued), C(account, issued)], p.issueDate)];
  if (p.fees) entries.push(entry('Frais d’émission d’emprunt', [D('631600', p.fees), C('521100', p.fees)], p.issueDate));
  const schedule: BondRow[] = [];
  let live = p.count;
  const totalInterest = coupon * BigInt(p.count) * BigInt(p.years);
  let premiumLeft = premiumPerBond * BigInt(p.count);
  for (let k = 1; k <= p.years; k++) {
    const interest = coupon * BigInt(live);
    const redeemed = p.mode === 'IN_FINE' ? (k === p.years ? live : 0) : k === p.years ? live : Math.floor(p.count / p.years);
    const redemption = p.redemptionPrice * BigInt(redeemed);
    const premium = p.mode === 'IN_FINE' ? (k === p.years ? premiumLeft : ratio(premiumPerBond * BigInt(p.count), interest, totalInterest)) : premiumPerBond * BigInt(redeemed);
    premiumLeft -= premium;
    schedule.push({ year: y0 + k - 1, liveBonds: live, interest, redeemedBonds: redeemed, redemption, premium, annuity: interest + redemption });
    const date = `${y0 + k - 1}-12-31`;
    if (p.mode === 'IN_FINE') {
      entries.push(entry(`Coupon n° ${k}`, [D('671100', interest), C('521100', interest)], date));
      entries.push(entry('Rattachement de la prime de remboursement', [D('671400', premium), C('166100', premium)], date));
      if (redeemed) {
        const accrued = premiumPerBond * BigInt(p.count);
        entries.push(entry('Remboursement in fine', [D(account, issued), D('166100', accrued), C('521100', redemption)], date));
      }
    } else {
      entries.push(entry(`Annuité n° ${k}`, [D(account, p.issuePrice * BigInt(redeemed)), D('671100', interest), D('671400', premium), C('521100', interest + redemption)], date));
    }
    live -= redeemed;
  }
  return {
    entries, schedule,
    values: { issued, totalPremium: premiumPerBond * BigInt(p.count) },
    notes: ['Primes de remboursement non échues : à mentionner dans les engagements hors bilan (notes annexes).'],
  };
}

/**
 * Emprunt obligataire convertible (application 80) : dette au prix d'émission (1612), provision pour le risque
 * de payer la prime (6971 / 1988), conversion (1612 → 1013 + 1054) et reprise de la quote-part de provision.
 */
export function convertibleBond(p: {
  count: number; nominal: bigint; issuePrice: bigint; issueDate: string; provisionDate?: string; provisionRate?: number;
  conversions?: { bonds: number; shares: number; shareNominal: bigint; date: string; reversalDate?: string }[];
}): OpResult {
  const issued = p.issuePrice * BigInt(p.count);
  const premiumPerBond = p.nominal - p.issuePrice;
  const entries = [entry(`Émission de ${p.count} obligations convertibles`, [D('521100', issued), C('161200', issued)], p.issueDate)];
  const provision = BigInt(Math.round(Number(premiumPerBond * BigInt(p.count)) * (p.provisionRate ?? 1)));
  if (p.provisionDate && provision > 0n) entries.push(entry('Risque de paiement de la prime de remboursement', [D('697100', provision), C('198800', provision)], p.provisionDate));
  for (const c of p.conversions ?? []) {
    const debt = p.issuePrice * BigInt(c.bonds);
    const capital = c.shareNominal * BigInt(c.shares);
    entries.push(entry(`Conversion de ${c.bonds} obligations en ${c.shares} actions`, [D('161200', debt), C('101300', capital), C('105400', debt - capital)], c.date));
    if (c.reversalDate && p.provisionDate) {
      const rev = ratio(provision, BigInt(c.bonds), BigInt(p.count));
      entries.push(entry('Reprise de la provision des obligations converties', [D('198800', rev), C('797100', rev)], c.reversalDate));
    }
  }
  return { entries, values: { issued, provision } };
}
