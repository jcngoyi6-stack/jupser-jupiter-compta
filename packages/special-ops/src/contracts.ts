/**
 * Contrats pluri-exercices, abonnement, concessions de service public, GIE et personnel extérieur
 * (guide d'application, chapitres 23 à 27, applications 92 à 98).
 * Le taux de TVA est toujours un paramètre (packs fiscaux par pays) : aucun taux n'est codé en dur.
 */
import { C, D, entry, pct, ratio, type OpEntry, type OpResult } from './core';

const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Contrat pluri-exercices à la clôture (applications 92 et 93) : chiffre d'affaires à l'avancement (résultat à
 * terminaison fiable) ou limité aux coûts engagés (méthode à l'achèvement), en factures à établir (4181 / 705 / 4435)
 * contrepassées à l'ouverture ; perte à terminaison provisionnée pour la part non encore réalisée (6911 / 193).
 */
export function contractAtClosing(p: {
  price: bigint; estimatedCost: bigint; costIncurred: bigint; reliable: boolean; vatRate: number; closingDate: string;
  revenueRecognisedBefore?: bigint; revenueAccount?: string;
}): OpResult {
  const progress = p.estimatedCost === 0n ? 0 : Number(p.costIncurred) / Number(p.estimatedCost);
  const cumulative = p.reliable ? ratio(p.price, p.costIncurred, p.estimatedCost) : (p.costIncurred < p.price ? p.costIncurred : p.price);
  const revenue = cumulative - (p.revenueRecognisedBefore ?? 0n);
  const vat = pct(revenue, p.vatRate);
  const acc = p.revenueAccount ?? '705100';
  const entries: OpEntry[] = [
    entry('Chiffre d’affaires à l’avancement (factures à établir)', [D('418100', revenue + vat), C(acc, revenue), C('443500', vat)], p.closingDate),
    entry('Contrepassation du chiffre d’affaires à l’avancement', [D(acc, revenue), D('443500', vat), C('418100', revenue + vat)], nextDay(p.closingDate)),
  ];
  const lossAtCompletion = p.estimatedCost > p.price ? p.estimatedCost - p.price : 0n;
  const provision = lossAtCompletion - ratio(lossAtCompletion, p.costIncurred, p.estimatedCost);
  if (provision > 0n) entries.push(entry('Provision pour pertes sur marchés à achèvement futur', [D('691100', provision), C('193000', provision)], p.closingDate));
  return { entries, values: { progress, revenue, resultToDate: cumulative - p.costIncurred - provision, provision, resultAtCompletion: p.price - p.estimatedCost } };
}

/** Facturation à la livraison de l'ouvrage, reprise de la provision pour pertes à terminaison. */
export function contractCompletion(p: { price: bigint; vatRate: number; date: string; provision?: bigint; closingDate?: string; revenueAccount?: string }): OpResult {
  const vat = pct(p.price, p.vatRate);
  const entries = [entry('Facturation de l’ouvrage livré', [D('411100', p.price + vat), C(p.revenueAccount ?? '705100', p.price), C('443300', vat)], p.date)];
  if (p.provision) entries.push(entry('Reprise de la provision pour pertes sur marchés à achèvement futur', [D('193000', p.provision), C('791100', p.provision)], p.closingDate ?? p.date));
  return { entries };
}

export interface SubscriptionRow { month: number; charge: bigint; invoiced: bigint; annualEstimate: bigint }

/**
 * Abonnement des charges (application 94) : charge mensuelle = estimation annuelle / 12 (4746) ; à chaque
 * facture, l'estimation annuelle est corrigée de l'écart sur la période couverte et le reste à imputer réparti
 * sur les mois restants.
 */
export function subscriptionCharges(p: {
  annualForecast: bigint; year: number; account?: string; invoices: { month: number; amount: bigint; coveredMonths: number }[]; product?: boolean;
}): OpResult<SubscriptionRow> {
  const acc = p.account ?? (p.product ? '706100' : '624300');
  const spread = p.product ? '474700' : '474600';
  let annual = p.annualForecast;
  let monthly = annual / 12n;
  let charged = 0n;
  const monthlyCharges: bigint[] = [];
  const schedule: SubscriptionRow[] = [];
  const entries: OpEntry[] = [];
  for (let m = 1; m <= 12; m++) {
    const end = new Date(Date.UTC(p.year, m, 0)).toISOString().slice(0, 10);
    const charge = m === 12 ? annual - charged : monthly;
    charged += charge;
    monthlyCharges.push(charge);
    entries.push(entry(`Abonnement du mois ${m}`, p.product ? [D(spread, charge), C(acc, charge)] : [D(acc, charge), C(spread, charge)], end));
    let invoiced = 0n;
    for (const inv of p.invoices.filter((i) => i.month === m)) {
      invoiced += inv.amount;
      entries.push(entry('Facturation de la période', p.product ? [D('411100', inv.amount), C(spread, inv.amount)] : [D(spread, inv.amount), C('401100', inv.amount)], end));
      const coveredCharge = monthlyCharges.slice(Math.max(0, m - inv.coveredMonths), m).reduce((s, x) => s + x, 0n);
      annual += inv.amount - coveredCharge;
      if (m < 12) monthly = (annual - charged) / BigInt(12 - m);
    }
    schedule.push({ month: m, charge, invoiced, annualEstimate: annual });
  }
  return { entries, schedule, values: { annual } };
}

/**
 * Concession de service public / PPP (application 95) : chiffre d'affaires de construction porté en 2734,
 * redevances (2734 + 7713 + 706), droits collectés pour le concédant (4731) et reversement net.
 */
export function publicPrivatePartnership(p: {
  constructionRevenue?: bigint; constructionEndDate?: string;
  fee?: { date: string; construction: bigint; financing: bigint; services: bigint };
  tollsCollected?: bigint; tollsDate?: string; transferDate?: string;
}): OpResult {
  const entries: OpEntry[] = [];
  if (p.constructionRevenue && p.constructionEndDate) {
    entries.push(entry('Chiffre d’affaires de la phase de construction', [D('273400', p.constructionRevenue), C('705100', p.constructionRevenue)], p.constructionEndDate));
  }
  const total = p.fee ? p.fee.construction + p.fee.financing + p.fee.services : 0n;
  if (p.fee) {
    entries.push(entry('Constatation de la redevance', [D('411100', total), C('273400', p.fee.construction), C('706100', p.fee.services), C('771300', p.fee.financing)], p.fee.date));
  }
  if (p.tollsCollected && p.tollsDate) entries.push(entry('Droits de passage collectés pour le concédant', [D('571100', p.tollsCollected), C('473100', p.tollsCollected)], p.tollsDate));
  if (p.tollsCollected && p.transferDate) {
    entries.push(entry('Reversement des droits sous déduction des redevances', [D('473100', p.tollsCollected), C('411100', total), C('521100', p.tollsCollected - total)], p.transferDate));
  }
  return {
    entries,
    notes: ['Biens de retour : hors patrimoine du concessionnaire, mention en notes annexes (engagements obtenus). Biens de remise : immobilisés et amortis sur une durée n’excédant pas celle du contrat.'],
  };
}

/** Participation aux résultats d'un GIE chez le membre (application 96). */
export function gieResultShare(p: { result: bigint; share: number; date: string; definitiveLoss?: boolean; closingDate?: string }): OpResult {
  const part = pct(p.result < 0n ? -p.result : p.result, p.share);
  if (p.result >= 0n) return { entries: [entry('Quote-part du bénéfice du GIE', [D('463100', part), C('772100', part)], p.date)] };
  const entries = [];
  if (p.closingDate) entries.push(entry('Dépréciation pour quote-part de perte du GIE', [D('659800', part), C('496300', part)], p.closingDate));
  if (p.definitiveLoss !== false) entries.push(entry('Quote-part de perte du GIE (complément de cotisation)', [D('621000', part), C('463100', part)], p.date));
  return { entries };
}

/** Participation financière à un GIE (application 97) : parts 266 et avance stable 2774. */
export function gieContribution(p: { capital: bigint; advance?: bigint; date: string }): OpResult {
  const adv = p.advance ?? 0n;
  return { entries: [entry('Apport en capital et avance au GIE', [D('266000', p.capital), D('277400', adv), C('521100', p.capital + adv)], p.date)] };
}

/**
 * Personnel extérieur (application 98) : factures en 6371 / 6372 en cours d'exercice, virées en 6671 / 6672 à la
 * clôture (prééminence de la réalité) ; les prestataires non salariés restent en 6327.
 */
export function externalStaffTransfer(p: { interim: bigint; seconded: bigint; date: string }): OpResult {
  return {
    entries: [entry('Rémunérations transférées de personnel extérieur', [
      D('667100', p.interim), D('667200', p.seconded), C('637100', p.interim), C('637200', p.seconded),
    ], p.date)],
    values: { addedValueEffect: p.interim + p.seconded },
    notes: ['La valeur ajoutée augmente du montant transféré ; l’EBE et la CAFG sont inchangés.'],
  };
}
