/**
 * Immeubles de placement (application 41), constructions sur sol d'autrui (application 42),
 * rentes viagères (application 43).
 */
import { C, D, entry, type OpResult } from './core';

/** Acquisition d'un immeuble en partie occupé et en partie de placement (approche par composants). */
export function investmentProperty(p: { ownUse: bigint; investment: bigint; date: string; ownUseAccount?: string }): OpResult {
  const total = p.ownUse + p.investment;
  return {
    entries: [entry('Acquisition d’un immeuble (partie occupée et immeuble de placement)', [D(p.ownUseAccount ?? '231300', p.ownUse), D('231500', p.investment), C('481200', total)], p.date)],
    notes: ['Les parties pouvant être vendues séparément sont comptabilisées distinctement ; l’immeuble de placement suit les règles des immobilisations corporelles (coût, amortissement).'],
  };
}

const days360 = (from: string, to: string) => {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30)) + 1;
};

/**
 * Construction sur sol d'autrui (application 42), chez le locataire : amortissement sur la durée du bail
 * de la base (coût − indemnité attendue) ; à l'expiration, indemnité (822) et sortie (812).
 * Chez le propriétaire du terrain : entrée du bâtiment contre indemnité versée (521) ou produit HAO (841).
 */
export function buildingOnLeasedLand(p: { cost: bigint; expectedIndemnity: bigint; leaseYears: number; completionDate: string; expiryDate?: string; lastYearDotation?: bigint }): OpResult {
  const base = p.cost - p.expectedIndemnity;
  const annual = base / BigInt(p.leaseYears);
  const y = Number(p.completionDate.slice(0, 4));
  const first = (annual * BigInt(days360(p.completionDate, `${y}-12-30`)) + 180n) / 360n;
  const entries = [
    entry('Construction sur sol d’autrui', [D('232300', p.cost), C('481200', p.cost)], p.completionDate),
    entry(`Dotation de l’exercice ${y} (prorata)`, [D('681300', first), C('283200', first)], `${y}-12-31`),
  ];
  if (p.expiryDate) {
    const last = p.lastYearDotation ?? annual;
    entries.push(entry('Indemnité perçue à l’expiration du bail', [D('521100', p.expectedIndemnity), C('822000', p.expectedIndemnity)], p.expiryDate));
    entries.push(entry('Dotation complémentaire de l’exercice d’expiration', [D('681300', last), C('283200', last)], p.expiryDate));
    entries.push(entry('Sortie de la construction', [D('812000', p.expectedIndemnity), D('283200', base), C('232300', p.cost)], p.expiryDate));
  }
  return { entries, values: { annualDepreciation: annual, firstYearDepreciation: first } };
}

export function landOwnerAtLeaseExpiry(p: { value: bigint; indemnityPaid: boolean; date: string; significant?: boolean }): OpResult {
  const counterpart = p.indemnityPaid ? '521100' : p.significant ? '148000' : '841000';
  return { entries: [entry(p.indemnityPaid ? 'Bâtiment reçu contre indemnité' : 'Bâtiment reçu sans indemnité', [D('231300', p.value), C(counterpart, p.value)], p.date)] };
}

/**
 * Rente viagère (application 43) : bien acquis contre un bouquet et une rente capitalisée (1681) ;
 * arrérages imputés sur 1681 ; au décès, solde en produit HAO (841) ; au-delà du capital, arrérages en charge HAO (831).
 * Pour un financement lié aux activités ordinaires : 6781 / 7781.
 */
export function lifeAnnuity(p: {
  land: bigint; building: bigint; downPayment: bigint; annuity: bigint; date: string; buildingYears: number;
  paymentsMade: number; deathDate?: string; ordinaryActivity?: boolean;
}): OpResult {
  const capitalised = p.land + p.building - p.downPayment;
  const y = Number(p.date.slice(0, 4));
  const firstDot = (p.building / BigInt(p.buildingYears) * BigInt(days360(p.date, `${y}-12-30`)) + 180n) / 360n;
  const entries = [
    entry('Acquisition en viager', [D('223200', p.land), D('231300', p.building), C('521100', p.downPayment), C('168100', capitalised)], p.date),
    entry('Dotation de la première année (prorata)', [D('681300', firstDot), C('283100', firstDot)], `${y}-12-31`),
  ];
  let remaining = capitalised;
  const chargeAcc = p.ordinaryActivity ? '678100' : '831000';
  for (let k = 1; k <= p.paymentsMade; k++) {
    const date = `${y + k}-${p.date.slice(5)}`;
    const onCapital = remaining >= p.annuity ? p.annuity : remaining;
    remaining -= onCapital;
    entries.push(entry(`Arrérages n° ${k}`, [D('168100', onCapital), D(chargeAcc, p.annuity - onCapital), C('521100', p.annuity)], date));
  }
  if (p.deathDate && remaining > 0n) {
    entries.push(entry('Décès du crédirentier : solde de la rente capitalisée', [D('168100', remaining), C(p.ordinaryActivity ? '778100' : '841000', remaining)], p.deathDate));
  }
  return { entries, values: { capitalised, remaining: p.deathDate ? 0n : remaining, firstYearDepreciation: firstDot } };
}
