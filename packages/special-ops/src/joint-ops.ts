/**
 * Opérations faites en commun, établissements et succursales, franchise (guide d'application, chapitres 33 à 35,
 * applications 106 à 112). Les écritures chez l'autre partie (non-gérant, succursale, franchiseur) sont rendues
 * dans `counterpartEntries`.
 */
import { C, D, entry, pct, type OpEntry, type OpLine, type OpResult } from './core';

export interface AccountAmount { account: string; amount: bigint }

/**
 * Société en participation (applications 106 et 107) : solde des comptes de gestion de la participation par le
 * compte de liaison 188, puis répartition du résultat entre le gérant (752) et l'associé non gérant (4631).
 */
export function jointVentureResult(p: { charges: AccountAmount[]; products: AccountAmount[]; managerShare: number; date: string }): OpResult {
  const totalC = p.charges.reduce((s, x) => s + x.amount, 0n);
  const totalP = p.products.reduce((s, x) => s + x.amount, 0n);
  const result = totalP - totalC;
  const managerPart = pct(result, p.managerShare);
  const partnerPart = result - managerPart;
  const close: OpLine[] = [...p.products.map((x) => D(x.account, x.amount)), ...p.charges.map((x) => C(x.account, x.amount)), C('188000', result)];
  const sign = result >= 0n;
  return {
    entries: [
      entry('Solde des comptes de gestion de la participation', close, p.date),
      entry('Répartition du résultat de la participation', sign
        ? [D('188000', result), C('752100', managerPart), C('463100', partnerPart)]
        : [D('652100', -managerPart), D('463100', -partnerPart), C('188000', -result)], p.date),
    ],
    counterpartEntries: [entry('Quote-part de résultat de la participation (associé non gérant)', sign
      ? [D('463100', partnerPart), C('752500', partnerPart)]
      : [D('652500', -partnerPart), C('463100', -partnerPart)], p.date)],
    values: { result, managerPart, partnerPart },
    notes: ['Comptes 752x / 652x selon le plan à 6 chiffres : à valider par l’expert-comptable pour les participations.'],
  };
}

/** Quote-part de l'associé non gérant dans une immobilisation acquise par le gérant (4631 / 182 ; chez l'associé 2773 / 4631). */
export function jointVentureAssetShare(p: { amount: bigint; partnerShare: number; date: string }): OpResult {
  const part = pct(p.amount, p.partnerShare);
  return {
    entries: [entry('Part de l’associé dans l’immobilisation acquise', [D('463100', part), C('182000', part)], p.date)],
    counterpartEntries: [entry('Part dans l’immobilisation acquise par le gérant', [D('277300', part), C('463100', part)], p.date)],
  };
}

export type BranchFlow = 'FONDS' | 'MARCHANDISES_SIEGE' | 'ACHAT_DIRECT' | 'LIVRAISON_AU_SIEGE';

/**
 * Flux siège ↔ succursale (applications 108 et 110) en comptes de liaison 185 (permanents non bloqués),
 * 186 (liaison charges) et 187 (liaison produits). Écritures du siège dans `entries`, de la succursale dans
 * `counterpartEntries`.
 */
export function branchTransfer(p: { flow: BranchFlow; amount: bigint; date: string; hqTreasury?: string; branchTreasury?: string }): OpResult {
  const a = p.amount;
  const hqT = p.hqTreasury ?? '521100';
  const brT = p.branchTreasury ?? '521100';
  const map: Record<BranchFlow, [OpLine[], OpLine[], string]> = {
    FONDS: [[D('185000', a), C(hqT, a)], [D(brT, a), C('185000', a)], 'Fonds mis à disposition de la succursale'],
    MARCHANDISES_SIEGE: [[D('185000', a), C('187000', a)], [D('186000', a), C('185000', a)], 'Envoi de marchandises du siège'],
    ACHAT_DIRECT: [[D('185000', a), C('401100', a)], [D('601100', a), C('185000', a)], 'Achat livré directement à la succursale'],
    LIVRAISON_AU_SIEGE: [[D('186000', a), C('185000', a)], [D('185000', a), C('187000', a)], 'Livraison de marchandises au siège'],
  };
  const [hq, br, label] = map[p.flow];
  return { entries: [entry(label, hq, p.date)], counterpartEntries: [entry(label, br, p.date)] };
}

/** Dotation de la succursale (application 109) : compte permanent bloqué 184 chez le siège et chez la succursale. */
export function branchEndowment(p: { assets: AccountAmount[]; hqFinancing: AccountAmount[]; date: string }): OpResult {
  const total = p.assets.reduce((s, x) => s + x.amount, 0n);
  return {
    entries: [entry('Ouverture de la succursale', [D('184000', total), ...p.hqFinancing.map((x) => C(x.account, x.amount))], p.date)],
    counterpartEntries: [entry('Création de la succursale', [...p.assets.map((x) => D(x.account, x.amount)), C('184000', total)], p.date)],
  };
}

/**
 * Intégration des comptes de la succursale (application 111) : la succursale vire tous ses soldes au compte 185 ;
 * le siège reprend les soldes (hors 184, 185, 186 et 187 qui s'éliminent) par le crédit/débit du 185.
 */
export function branchIntegration(p: { balances: { account: string; debit: bigint; credit: bigint }[]; date: string }): OpResult {
  const own = p.balances.filter((b) => !b.account.startsWith('185'));
  const branchClosing: OpLine[] = own.map((b) => (b.debit > b.credit ? C(b.account, b.debit - b.credit) : D(b.account, b.credit - b.debit)));
  const net = own.reduce((s, b) => s + b.debit - b.credit, 0n);
  branchClosing.push(net > 0n ? D('185000', net) : C('185000', -net));
  const integrated = own.filter((b) => !['184', '186', '187'].some((x) => b.account.startsWith(x)));
  const hq: OpLine[] = integrated.map((b) => (b.debit > b.credit ? D(b.account, b.debit - b.credit) : C(b.account, b.credit - b.debit)));
  const bal = (prefix: string) => own.filter((b) => b.account.startsWith(prefix)).reduce((s, b) => s + b.debit - b.credit, 0n);
  // Élimination chez le siège : 184 (dotation), 187 siège ↔ 186 succursale, 186 siège ↔ 187 succursale.
  hq.push(D('184000', bal('184')), D('187000', bal('186')), D('186000', bal('187')));
  const hqNet = integrated.reduce((s, b) => s + b.debit - b.credit, 0n) + bal('184') + bal('186') + bal('187');
  hq.push(hqNet > 0n ? C('185000', hqNet) : D('185000', -hqNet));
  const sum = (pred: (a: string) => boolean) => own.filter((b) => pred(b.account)).reduce((s, b) => s + b.credit - b.debit, 0n);
  const ownResult = sum((a) => a.startsWith('6') || a.startsWith('7'));
  const liaison = sum((a) => a.startsWith('186') || a.startsWith('187'));
  return {
    entries: [entry('Intégration des comptes de la succursale', hq, p.date)],
    counterpartEntries: [entry('Virement des soldes de la succursale au compte de liaison', branchClosing, p.date)],
    values: { branchResult: ownResult, branchResultWithLiaison: ownResult + liaison },
    notes: ['Les comptes 184, 186 et 187 du siège et de la succursale s’éliminent réciproquement lors du regroupement.'],
  };
}

/**
 * Contrat de franchise (application 112) : chez le franchisé, droit d'entrée immobilisé (2184 et aménagements
 * 235), amortissements prorata temporis, redevance estimée à la clôture (634 / 408) ; chez le franchiseur, chiffre
 * d'affaires (706) et facture à établir (4181).
 */
export function franchise(p: {
  rightOfUse: bigint; fitOut?: bigint; date: string; paymentDate?: string; contractYears: number; fitOutYears?: number; monthsInFirstYear: number;
  royaltyRate: number; revenue: bigint; closingDate: string; royaltyAccount?: string;
}): OpResult {
  const fit = p.fitOut ?? 0n;
  const total = p.rightOfUse + fit;
  const royalty = pct(p.revenue, p.royaltyRate);
  const amortRight = BigInt(Math.round(Number(p.rightOfUse) / p.contractYears * p.monthsInFirstYear / 12));
  const amortFit = p.fitOutYears ? BigInt(Math.round(Number(fit) / p.fitOutYears * p.monthsInFirstYear / 12)) : 0n;
  const ry = p.royaltyAccount ?? '634400';
  const entries: OpEntry[] = [
    entry('Acquisition du droit d’utilisation de la marque', [D('218400', p.rightOfUse), C('481100', p.rightOfUse)], p.date),
    entry('Aménagements de bureaux', [D('235800', fit), C('481200', fit)], p.date),
  ].filter((e) => e.lines.length);
  if (p.paymentDate) entries.push(entry('Règlement du droit d’entrée', [D('481100', p.rightOfUse), D('481200', fit), C('521100', total)], p.paymentDate));
  entries.push(entry('Redevance de l’exercice (à régulariser)', [D(ry, royalty), C('408100', royalty)], p.closingDate));
  entries.push(entry('Dotations aux amortissements', [D('681200', amortRight), D('681300', amortFit), C('281800', amortRight), C('283500', amortFit)], p.closingDate));
  const counterpart: OpEntry[] = [entry('Droit d’entrée facturé', [D('411100', total), C('706100', total)], p.date)];
  if (p.paymentDate) counterpart.push(entry('Règlement du droit d’entrée', [D('521100', total), C('411100', total)], p.paymentDate));
  counterpart.push(entry('Redevance à facturer', [D('418100', royalty), C('706100', royalty)], p.closingDate));
  return { entries, counterpartEntries: counterpart, values: { royalty, amortRight, amortFit } };
}
