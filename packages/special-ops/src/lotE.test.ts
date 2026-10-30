/** Guide d'application — applications 92 à 100 et 102 à 105. */
import { describe, expect, it } from 'vitest';
import {
  classifyPostClosingEvent, commissionAgent, contractAtClosing, contractCompletion, externalStaffTransfer, freeRevaluation, gieContribution, gieResultShare,
  guaranteeCommitment, legalRevaluation, mandatary, publicPrivatePartnership, revaluedDepreciation, subscriptionCharges,
} from './index';
import { unknownAccounts } from './testkit';

const amt = (r: { entries: { lines: { account: string; debit: bigint; credit: bigint }[] }[] }, i: number) => r.entries[i]!.lines.map((l) => [l.account, l.debit || -l.credit]);
const M = 1_000_000n;
const VAT = 0.18; // taux théorique de l'exemple du guide, fourni en paramètre

describe('applications 92 et 93 : contrats pluri-exercices', () => {
  it('contrat bénéficiaire à l’avancement : CA 555 M, résultat 105 M', () => {
    const r = contractAtClosing({ price: 925n * M, estimatedCost: 750n * M, costIncurred: 450n * M, reliable: true, vatRate: VAT, closingDate: '2026-12-31' });
    expect(amt(r, 0)).toEqual([['418100', 654_900_000n], ['705100', -555n * M], ['443500', -99_900_000n]]);
    expect(r.entries[1]!.date).toBe('2027-01-01');
    expect(r.values).toMatchObject({ progress: 0.6, resultToDate: 105n * M, provision: 0n });
    expect(amt(contractCompletion({ price: 925n * M, vatRate: VAT, date: '2027-10-30' }), 0)).toEqual([['411100', 1_091_500_000n], ['705100', -925n * M], ['443300', -166_500_000n]]);
  });
  it('méthode à l’achèvement : CA limité aux coûts (450 M)', () => {
    const r = contractAtClosing({ price: 925n * M, estimatedCost: 750n * M, costIncurred: 450n * M, reliable: false, vatRate: VAT, closingDate: '2026-12-31' });
    expect(amt(r, 0)).toEqual([['418100', 531n * M], ['705100', -450n * M], ['443500', -81n * M]]);
    expect(contractAtClosing({ price: 1n, estimatedCost: 0n, costIncurred: 5n, reliable: false, vatRate: 0, closingDate: '2026-12-31' }).values!.revenue).toBe(1n);
  });
  it('contrat déficitaire : CA 57,6 M, provision 2,6 M, reprise à la livraison', () => {
    const r = contractAtClosing({ price: 120n * M, estimatedCost: 125n * M, costIncurred: 60n * M, reliable: true, vatRate: VAT, closingDate: '2025-12-31' });
    expect(amt(r, 0)).toEqual([['418100', 67_968_000n], ['705100', -57_600_000n], ['443500', -10_368_000n]]);
    expect(amt(r, 2)).toEqual([['691100', 2_600_000n], ['193000', -2_600_000n]]);
    expect(r.values!.resultToDate).toBe(-5n * M);
    const c = contractCompletion({ price: 120n * M, vatRate: VAT, date: '2026-12-20', provision: 2_600_000n, closingDate: '2026-12-31' });
    expect(amt(c, 1)).toEqual([['193000', 2_600_000n], ['791100', -2_600_000n]]);
  });
});

describe('application 94 : abonnement des charges', () => {
  it('200 000 par mois, facture de 780 000 en mars, puis 220 000', () => {
    const r = subscriptionCharges({ annualForecast: 2_400_000n, year: 2026, invoices: [{ month: 3, amount: 780_000n, coveredMonths: 3 }] });
    expect(r.schedule!.slice(0, 4).map((x) => x.charge)).toEqual([200_000n, 200_000n, 200_000n, 220_000n]);
    expect(r.schedule![2]!.annualEstimate).toBe(2_580_000n);
    expect(amt(r, 0)).toEqual([['624300', 200_000n], ['474600', -200_000n]]);
    expect(amt(r, 3)).toEqual([['474600', 780_000n], ['401100', -780_000n]]);
    expect(r.schedule!.reduce((s, x) => s + x.charge, 0n)).toBe(2_580_000n);
    const p = subscriptionCharges({ annualForecast: 1_200n, year: 2026, product: true, invoices: [{ month: 12, amount: 1_200n, coveredMonths: 12 }] });
    expect(amt(p, 0)).toEqual([['474700', 100n], ['706100', -100n]]);
  });
});

describe('application 95 : concession de service public', () => {
  it('CA de construction, redevance éclatée, droits collectés et reversement net de 63 M', () => {
    const r = publicPrivatePartnership({
      constructionRevenue: 420n * M, constructionEndDate: '2025-12-31', fee: { date: '2026-12-31', construction: 42n * M, financing: 5n * M, services: 25n * M },
      tollsCollected: 135n * M, tollsDate: '2026-12-31', transferDate: '2026-12-31',
    });
    expect(amt(r, 0)).toEqual([['273400', 420n * M], ['705100', -420n * M]]);
    expect(amt(r, 1)).toEqual([['411100', 72n * M], ['273400', -42n * M], ['706100', -25n * M], ['771300', -5n * M]]);
    expect(amt(r, 3)).toEqual([['473100', 135n * M], ['411100', -72n * M], ['521100', -63n * M]]);
    expect(publicPrivatePartnership({}).entries).toEqual([]);
  });
});

describe('applications 96 à 98 : GIE et personnel extérieur', () => {
  it('quote-part de bénéfice (1 M) et de perte (2 M) d’un GIE', () => {
    expect(amt(gieResultShare({ result: 3n * M, share: 1 / 3, date: '2027-03-31' }), 0)).toEqual([['463100', M], ['772100', -M]]);
    const l = gieResultShare({ result: -8n * M, share: 0.25, date: '2027-03-31', closingDate: '2026-12-31' });
    expect(amt(l, 0)).toEqual([['659800', 2n * M], ['496300', -2n * M]]);
    expect(amt(l, 1)).toEqual([['621000', 2n * M], ['463100', -2n * M]]);
    expect(gieResultShare({ result: -8n * M, share: 0.25, date: 'x', definitiveLoss: false }).entries).toEqual([]);
    expect(amt(gieContribution({ capital: 40n * M, advance: 10n * M, date: '2026-04-01' }), 0)).toEqual([['266000', 40n * M], ['277400', 10n * M], ['521100', -50n * M]]);
  });
  it('transfert de 14,4 M en charges de personnel', () => {
    const r = externalStaffTransfer({ interim: 6n * M, seconded: 8_400_000n, date: '2026-12-31' });
    expect(amt(r, 0)).toEqual([['667100', 6n * M], ['667200', 8_400_000n], ['637100', -6n * M], ['637200', -8_400_000n]]);
    expect(r.values!.addedValueEffect).toBe(14_400_000n);
  });
});

describe('applications 99 et 100 : réévaluation', () => {
  const items = [
    { assetAccount: '223100', cost: 100n * M, currentValue: 150n * M },
    { assetAccount: '231100', cost: 300n * M, accumulated: 50n * M, currentValue: 375n * M },
    { assetAccount: '261000', cost: 25n * M, currentValue: 28n * M },
  ];
  it('réévaluation légale : écart total 73 M (23 M non amortis, 50 M bâtiment)', () => {
    const r = legalRevaluation({ items, index: 1.2, date: '2026-12-31' });
    expect(amt(r, 0)).toEqual([['223100', 20n * M], ['261000', 3n * M], ['106100', -23n * M]]);
    expect(amt(r, 1)).toEqual([['231100', 60n * M], ['283100', -10n * M], ['106100', -50n * M]]);
    expect(r.values!.total).toBe(73n * M);
    const n = legalRevaluation({ items: [items[1]!, { assetAccount: '223100', cost: 1n, currentValue: 1n }], index: 1.2, date: '2026-12-31', taxNeutral: true });
    expect(amt(n, 0)[2]).toEqual(['154000', -50n * M]);
    expect(n.entries).toHaveLength(1);
  });
  it('dotation sur base réévaluée 12 M et reprise de 2 M en cas de neutralité fiscale', () => {
    const r = revaluedDepreciation({ assetAccount: '231100', revaluedNbv: 300n * M, remainingYears: 25, historicalAnnual: 10n * M, taxNeutral: true, date: '2027-12-31' });
    expect(amt(r, 0)).toEqual([['681300', 12n * M], ['283100', -12n * M]]);
    expect(amt(r, 1)).toEqual([['154000', 2n * M], ['861000', -2n * M]]);
    expect(revaluedDepreciation({ assetAccount: '231100', revaluedNbv: 300n * M, remainingYears: 25, date: 'x' }).entries).toHaveLength(1);
  });
  it('réévaluation libre : méthodes 1 et 2 (écart 15 M)', () => {
    const base = { assetAccount: '231100', cost: 150n * M, accumulated: 30n * M, currentValue: 135n * M, date: '2026-12-31' };
    expect(amt(freeRevaluation({ ...base, method: 1 }), 0)).toEqual([['231100', 18_750_000n], ['283100', -3_750_000n], ['106200', -15n * M]]);
    const m2 = freeRevaluation({ ...base, method: 2 });
    expect(amt(m2, 0)).toEqual([['283100', 30n * M], ['231100', -30n * M]]);
    expect(amt(m2, 1)).toEqual([['231100', 15n * M], ['106200', -15n * M]]);
  });
});

describe('applications 102 à 105 : engagements, événements postérieurs, tiers', () => {
  it('caution donnée et reçue', () => {
    expect(amt(guaranteeCommitment({ side: 'DONNE', amount: 100n * M, date: '2026-04-15', endDate: '2028-07-15' }), 0)).toEqual([['916200', 100n * M], ['906200', -100n * M]]);
    expect(amt(guaranteeCommitment({ side: 'OBTENU', amount: 100n * M, date: '2026-04-15', endDate: '2028-07-15' }), 1)).toEqual([['912200', 100n * M], ['902200', -100n * M]]);
  });
  it('qualification des événements postérieurs (opérations 1 à 4)', () => {
    const base = { closingDate: '2026-12-31', approvalDate: '2027-03-15' };
    expect(classifyPostClosingEvent({ ...base, eventDate: '2027-02-05', existedAtClosing: true, significant: true }).treatment).toBe('AJUSTEMENT');
    expect(classifyPostClosingEvent({ ...base, eventDate: '2027-01-31', existedAtClosing: false, significant: true }).treatment).toBe('NOTE_ANNEXE');
    expect(classifyPostClosingEvent({ ...base, eventDate: '2027-02-10', existedAtClosing: false, significant: false }).treatment).toBe('RAPPORT_DE_GESTION');
    expect(classifyPostClosingEvent({ ...base, eventDate: '2027-05-30', existedAtClosing: true, significant: true }).treatment).toBe('AUCUN');
    expect(classifyPostClosingEvent({ ...base, eventDate: '2026-12-01', existedAtClosing: true, significant: true }).treatment).toBe('AJUSTEMENT');
  });
  it('commissionnaire : achats 8 M, ventes 8,4 M', () => {
    const r = commissionAgent({ side: 'INTERMEDIAIRE', amount: 8n * M, commission: 400_000n, date: '2026-06-15' });
    expect(amt(r, 1)).toEqual([['411100', 8_400_000n], ['701100', -8_400_000n]]);
    expect(amt(commissionAgent({ side: 'COMMETTANT_ACHAT', amount: 8n * M, commission: 400_000n, date: 'x' }), 0)[0]).toEqual(['601100', 8_400_000n]);
    expect(amt(commissionAgent({ side: 'COMMETTANT_VENTE', amount: 8n * M, commission: 400_000n, date: 'x' }), 0)).toEqual([['411100', 7_600_000n], ['632200', 400_000n], ['701100', -8n * M]]);
  });
  it('mandataire : opérations en 4731, seule la commission en résultat, débours', () => {
    const r = mandatary({ kind: 'ACHAT', amount: 8n * M, date: '2026-06-15', settlementDate: '2026-06-25', fee: 400_000n, disbursement: { amount: 180_000n, date: '2026-06-22', reimbursed: true } });
    expect(amt(r, 0)).toEqual([['473100', 8n * M], ['471200', -8n * M]]);
    expect(amt(r, 2)).toEqual([['411100', 400_000n], ['706100', -400_000n]]);
    expect(amt(r, 3)).toEqual([['473100', 180_000n], ['521100', -180_000n]]);
    const v = mandatary({ kind: 'VENTE', amount: 5n, date: 'x', settlementDate: 'x', fee: 1n, habitual: false, disbursement: { amount: 1n, date: 'x', reimbursed: false } });
    expect(amt(v, 2)[1]).toEqual(['707200', -1n]);
    expect(amt(v, 3)[0]).toEqual(['601500', 1n]);
    expect(mandatary({ kind: 'VENTE', amount: 5n, date: 'x' }).entries).toHaveLength(1);
  });
  it('tous les comptes utilisés existent et sont imputables', () => {
    expect(unknownAccounts([
      contractAtClosing({ price: 120n, estimatedCost: 125n, costIncurred: 60n, reliable: true, vatRate: VAT, closingDate: '2025-12-31' }),
      contractCompletion({ price: 1n, vatRate: VAT, date: 'x', provision: 1n }),
      subscriptionCharges({ annualForecast: 1_200n, year: 2026, product: true, invoices: [{ month: 1, amount: 100n, coveredMonths: 1 }] }),
      subscriptionCharges({ annualForecast: 1_200n, year: 2026, invoices: [{ month: 1, amount: 100n, coveredMonths: 1 }] }),
      publicPrivatePartnership({ constructionRevenue: 1n, constructionEndDate: 'x', fee: { date: 'x', construction: 1n, financing: 1n, services: 1n }, tollsCollected: 5n, tollsDate: 'x', transferDate: 'x' }),
      gieResultShare({ result: 3n, share: 1, date: 'x' }), gieResultShare({ result: -3n, share: 1, date: 'x', closingDate: 'x' }), gieContribution({ capital: 1n, advance: 1n, date: 'x' }),
      externalStaffTransfer({ interim: 1n, seconded: 1n, date: 'x' }),
      legalRevaluation({ items: [{ assetAccount: '223100', cost: 10n, currentValue: 15n }, { assetAccount: '231100', cost: 30n, accumulated: 5n, currentValue: 40n }], index: 1.2, date: 'x', taxNeutral: true }), revaluedDepreciation({ assetAccount: '231100', revaluedNbv: 30n, remainingYears: 2, historicalAnnual: 1n, taxNeutral: true, date: 'x' }),
      freeRevaluation({ assetAccount: '231100', cost: 150n, accumulated: 30n, currentValue: 135n, method: 1, date: 'x' }),
      guaranteeCommitment({ side: 'OBTENU', amount: 1n, date: 'x' }), commissionAgent({ side: 'COMMETTANT_VENTE', amount: 5n, commission: 1n, date: 'x' }),
      mandatary({ kind: 'VENTE', amount: 5n, date: 'x', settlementDate: 'x', fee: 1n, habitual: false, disbursement: { amount: 1n, date: 'x', reimbursed: false } }),
    ])).toEqual([]);
  });
});
