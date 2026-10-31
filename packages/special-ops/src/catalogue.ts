/**
 * Catalogue des opérations spécifiques exposé par l'API et l'écran « Opérations spécifiques » : identifiant,
 * libellé, chapitre et applications du guide, fonction de calcul et exemple pré-rempli (chiffres du guide).
 * Les montants circulent en JSON sous forme de chaînes d'unités mineures (`reviveAmounts` / `toJson`).
 */
import * as m0 from './leases';
import * as m1 from './property';
import * as m2 from './securities';
import * as m3 from './receivables';
import * as m4 from './equity';
import * as m5 from './grants';
import * as m6 from './bonds';
import * as m7 from './pensions';
import * as m8 from './hedging';
import * as m9 from './contracts';
import * as m10 from './revaluation';
import * as m11 from './third-parties';
import * as m12 from './mergers';
import * as m13 from './joint-ops';
import * as m14 from './misc-ops';
import * as m15 from './transition';
import * as m16 from './group';
import type { OpResult } from './core';

export interface CatalogueItem {
  id: string; label: string; chapter: string; applications: number[];
  // Paramètres de forme variable selon l'opération : validés par la fonction de calcul elle-même.
  run: (params: never) => OpResult;
  example: Record<string, unknown>;
}

const ops = { ...m0, ...m1, ...m2, ...m3, ...m4, ...m5, ...m6, ...m7, ...m8, ...m9, ...m10, ...m11, ...m12, ...m13, ...m14, ...m15, ...m16 };
const M = 1_000_000n;
const fn = <P>(f: (p: P) => OpResult) => f as (params: never) => OpResult;

export const CATALOGUE: CatalogueItem[] = [
  { id: 'location-preneur', label: 'Location-acquisition chez le preneur', chapter: 'Contrats de location', applications: [37], run: fn(ops.lesseeLease),
    example: { assetAccount: '241100', nature: 'MOBILIER', value: 450_000n, payment: 80_650n, periods: 7, optionPrice: 51_600n, directCosts: 50_000n, usefulLifeYears: 10, startDate: '2026-01-01' } },
  { id: 'location-bailleur', label: 'Location-acquisition chez le bailleur', chapter: 'Contrats de location', applications: [38], run: fn(ops.lessorLease),
    example: { salePrice: 280_000n, productionCost: 200_000n, payment: 70_000n, periods: 5, rate: 0.1, startDate: '2026-01-01' } },
  { id: 'reserve-propriete-acheteur', label: 'Achat avec clause de réserve de propriété', chapter: 'Réserve de propriété', applications: [39], run: fn(ops.retentionBuyer),
    example: { assetAccount: '241100', amount: 20n * M, date: '2026-03-01', paymentDate: '2026-09-01' } },
  { id: 'reserve-propriete-vendeur', label: 'Vente avec clause de réserve de propriété', chapter: 'Réserve de propriété', applications: [40], run: fn(ops.retentionSeller),
    example: { amount: 30n * M, date: '2026-03-01' } },
  { id: 'immeuble-placement', label: 'Immeuble de placement', chapter: 'Immobilisations', applications: [41], run: fn(ops.investmentProperty),
    example: { ownUse: 50n * M, investment: 150n * M, date: '2026-01-02' } },
  { id: 'sol-autrui', label: 'Construction sur sol d’autrui', chapter: 'Immobilisations', applications: [42], run: fn(ops.buildingOnLeasedLand),
    example: { cost: 60n * M, expectedIndemnity: 10n * M, leaseYears: 15, completionDate: '2026-10-01' } },
  { id: 'rente-viagere', label: 'Acquisition en viager', chapter: 'Immobilisations', applications: [43], run: fn(ops.lifeAnnuity),
    example: { land: 50n * M, building: 300n * M, downPayment: 110n * M, annuity: 20n * M, date: '2026-01-01', buildingYears: 120, paymentsMade: 3 } },
  { id: 'titres-acquisition', label: 'Acquisition de titres', chapter: 'Titres', applications: [48], run: fn(ops.acquireSecurities),
    example: { category: 'PLACEMENT_ACTIONS_COTEES', quantity: 5000, unitPrice: 12_000n, feeRate: 0.015, date: '2026-06-05' } },
  { id: 'titres-non-liberes', label: 'Titres partiellement libérés', chapter: 'Titres', applications: [49], run: fn(ops.subscribeUnpaidSecurities),
    example: { quantity: 20_000, nominal: 10_000n, premium: 2_000n, paidFraction: 0.5, fees: M, date: '2026-05-01', callDate: '2026-11-08' } },
  { id: 'titres-immobilises-cession', label: 'Cession de titres immobilisés', chapter: 'Titres', applications: [50], run: fn(ops.disposeFinancialAsset),
    example: { account: '274100', cost: 50n * M, impairment: 6n * M, price: 48n * M, date: '2026-08-15' } },
  { id: 'titres-placement-cession', label: 'Cession de titres de placement (PEPS / CMP)', chapter: 'Titres', applications: [51], run: fn(ops.disposePlacementSecurities),
    example: { method: 'PEPS', quantity: 2500, price: 29n * M, date: '2026-09-01', lots: [
      { date: '2025-04-01', quantity: 1000, unitPrice: 12_000n }, { date: '2025-09-01', quantity: 500, unitPrice: 12_500n },
      { date: '2026-04-01', quantity: 1200, unitPrice: 11_000n }, { date: '2026-07-01', quantity: 300, unitPrice: 10_000n }] } },
  { id: 'titres-placement-depreciation', label: 'Dépréciation des titres de placement', chapter: 'Titres', applications: [51], run: fn(ops.placementImpairment),
    example: { cost: 18_250_000n, marketValue: 18_075_000n, date: '2025-12-31' } },
  { id: 'abandon-creance', label: 'Abandon de créance', chapter: 'Créances', applications: [55], run: fn(ops.debtWaiver),
    example: { side: 'CREANCIER', nature: 'COMMERCIAL', amount: 10n * M, date: '2026-09-30' } },
  { id: 'affacturage', label: 'Affacturage classique', chapter: 'Créances', applications: [56], run: fn(ops.factoring),
    example: { amount: 28_500_000n, factoringFee: 250_000n, financingFee: 200_000n, transferDate: '2026-07-01', settlementDate: '2026-07-03' } },
  { id: 'affacturage-inverse', label: 'Affacturage inversé', chapter: 'Créances', applications: [56], run: fn(ops.reverseFactoring),
    example: { side: 'CLIENT', amount: 20n * M, factoringFee: 20_000n, date: '2026-07-01', maturityDate: '2026-09-30' } },
  { id: 'titrisation', label: 'Titrisation de créances', chapter: 'Créances', applications: [57], run: fn(ops.securitisation),
    example: { nominal: 80n * M, price: 70n * M, transferDate: '2026-04-01', settlementDate: '2026-04-10' } },
  { id: 'constitution', label: 'Constitution de société', chapter: 'Capitaux propres', applications: [58], run: fn(ops.incorporation),
    example: { capital: 300n * M, promiseDate: '2026-09-19', realisationDate: '2026-09-20', notaryTransferDate: '2026-09-30', notaryFees: 5n * M, actFees: 500_000n,
      inKindAssets: [{ account: '212200', amount: 30n * M }, { account: '223100', amount: 20n * M }, { account: '231100', amount: 150n * M }, { account: '241100', amount: 50n * M }, { account: '411100', amount: 40n * M }],
      inKindLiabilities: [{ account: '162000', amount: 50n * M }] } },
  { id: 'liberation-fractionnee', label: 'Libération fractionnée du capital', chapter: 'Capitaux propres', applications: [59], run: fn(ops.fractionedCapital),
    example: { capital: 25n * M, subscriptionDate: '2026-11-15', calls: [{ amount: 12_500_000n, callDate: '2026-11-15', paymentDate: '2026-11-30' }, { amount: 12_500_000n, callDate: '2027-03-10', paymentDate: '2027-04-15' }] } },
  { id: 'augmentation-numeraire', label: 'Augmentation de capital en numéraire', chapter: 'Capitaux propres', applications: [60], run: fn(ops.capitalIncreaseCash),
    example: { quantity: 5000, nominal: 10_000n, issuePrice: 15_000n, subscriptionDate: '2026-05-08', recordDate: '2026-05-09', transferDate: '2026-05-10' } },
  { id: 'augmentation-reserves', label: 'Augmentation par incorporation de réserves', chapter: 'Capitaux propres', applications: [61], run: fn(ops.capitalIncreaseReserves),
    example: { amount: 20n * M, date: '2026-04-01' } },
  { id: 'reduction-pertes', label: 'Réduction de capital par imputation des pertes', chapter: 'Capitaux propres', applications: [62], run: fn(ops.capitalReductionLosses),
    example: { amount: 80n * M, date: '2026-06-10' } },
  { id: 'reduction-remboursement', label: 'Réduction de capital par remboursement', chapter: 'Capitaux propres', applications: [63], run: fn(ops.capitalReductionRepayment),
    example: { amount: 25n * M, date: '2026-10-01', paymentDate: '2026-11-01' } },
  { id: 'amortissement-capital', label: 'Amortissement du capital', chapter: 'Capitaux propres', applications: [64], run: fn(ops.capitalAmortisation),
    example: { amount: 37_500_000n, date: '2026-08-01' } },
  { id: 'subvention-octroi', label: 'Subvention d’investissement : octroi et réception', chapter: 'Subventions', applications: [66], run: fn(ops.grantAward),
    example: { amount: 260n * M, date: '2026-03-25', receiptDate: '2026-05-12' } },
  { id: 'subvention-reprise', label: 'Reprise de subvention d’investissement', chapter: 'Subventions', applications: [66], run: fn(ops.grantRelease),
    example: { amount: 1_800_000n, grantAccount: '141200', date: '2026-12-31' } },
  { id: 'subvention-cession', label: 'Solde de subvention à la cession du bien', chapter: 'Subventions', applications: [66], run: fn(ops.grantOnDisposal),
    example: { grant: 208n * M, alreadyReleased: 34_666_667n, date: '2030-12-31' } },
  { id: 'subvention-exploitation', label: 'Subvention d’exploitation', chapter: 'Subventions', applications: [67], run: fn(ops.operatingGrant),
    example: { amount: 97_500_000n, date: '2026-12-31' } },
  { id: 'subvention-equilibre', label: 'Subvention d’équilibre', chapter: 'Subventions', applications: [68], run: fn(ops.equilibriumGrant),
    example: { amount: 400n * M, date: '2026-12-31' } },
  { id: 'avance-etat', label: 'Avance conditionnée de l’État', chapter: 'Subventions', applications: [69], run: fn(ops.stateAdvance),
    example: { amount: 600n * M, date: '2026-09-30', settlements: [{ date: '2032-09-30', principal: 200n * M, waived: 400n * M }] } },
  { id: 'subvention-depreciation', label: 'Dépréciation d’un bien subventionné', chapter: 'Subventions', applications: [70], run: fn(ops.subsidisedAssetImpairment),
    example: { assetAccount: '241100', netBookValue: 20n * M, grantBalance: 12n * M, recoverable: 6n * M, method: 2, date: '2026-12-31' } },
  { id: 'emprunt-obligataire', label: 'Emprunt obligataire', chapter: 'Emprunts obligataires', applications: [78, 79], run: fn(ops.bondLoan),
    example: { count: 5_000, nominal: 10_000n, issuePrice: 9_500n, redemptionPrice: 10_500n, rate: 0.06, years: 5, mode: 'IN_FINE', issueDate: '2026-01-01', viaSubscription: true } },
  { id: 'obligations-convertibles', label: 'Emprunt obligataire convertible', chapter: 'Emprunts obligataires', applications: [80], run: fn(ops.convertibleBond),
    example: { count: 25_000, nominal: 15_000n, issuePrice: 13_000n, issueDate: '2026-01-01', provisionDate: '2026-12-31', conversions: [{ bonds: 4_000, shares: 3_000, shareNominal: 10_000n, date: '2028-01-01', reversalDate: '2029-12-31' }] } },
  { id: 'retraite-dotation', label: 'Engagements de retraite : dotation et écarts actuariels', chapter: 'Retraites', applications: [81, 82], run: fn(ops.pensionYearEnd),
    example: { opening: 14_718n, serviceCost: 15_579n, discountRate: 0.0585, closing: 29_736n, date: '2027-12-31' } },
  { id: 'retraite-assurance', label: 'Régime de retraite couvert par une assurance', chapter: 'Retraites', applications: [83], run: fn(ops.insuredPensionPremium),
    example: { method: 1, premium: 10_000n, obligation: 14_718n, date: '2026-12-31' } },
  { id: 'change-position', label: 'Position globale de change et couverture', chapter: 'Change', applications: [88, 90], run: fn(ops.fxPosition),
    example: { mode: 'POSITION_GLOBALE', date: '2026-12-31', items: [
      { account: '277100', kind: 'CREANCE', nature: 'FINANCIER', foreign: 100_000, historicalRate: 620, closingRate: 550 },
      { account: '162000', kind: 'DETTE', nature: 'FINANCIER', foreign: 80_000, historicalRate: 620, closingRate: 550 }] } },
  { id: 'change-cours-garanti', label: 'Achat couvert à cours garanti', chapter: 'Change', applications: [89], run: fn(ops.fixedRateHedgedPurchase),
    example: { foreign: 250_000, hedgedRate: 650, date: '2026-12-05', paymentDate: '2027-02-05' } },
  { id: 'change-vente-terme', label: 'Vente à terme couvrant une vente future', chapter: 'Change', applications: [91], run: fn(ops.forwardSaleHedge),
    example: { foreign: 400_000, spotAtInception: 600, forwardRate: 590, inceptionDate: '2026-05-01', maturityDate: '2027-04-30', coverMonths: 12, closingDate: '2026-12-31', monthsToClosing: 8,
      spotAtMaturity: 575, saleDate: '2027-07-31', saleRate: 550, saleClosingDate: '2027-12-31', saleClosingRate: 530, settlementDate: '2028-02-10', settlementRate: 515 } },
  { id: 'contrat-cloture', label: 'Contrat pluri-exercices à la clôture', chapter: 'Contrats pluri-exercices', applications: [92, 93], run: fn(ops.contractAtClosing),
    example: { price: 925n * M, estimatedCost: 750n * M, costIncurred: 450n * M, reliable: true, vatRate: 0.18, closingDate: '2026-12-31' } },
  { id: 'contrat-livraison', label: 'Contrat pluri-exercices à la livraison', chapter: 'Contrats pluri-exercices', applications: [92, 93], run: fn(ops.contractCompletion),
    example: { price: 925n * M, vatRate: 0.18, date: '2027-10-30' } },
  { id: 'abonnement', label: 'Abonnement des charges ou produits', chapter: 'Abonnement', applications: [94], run: fn(ops.subscriptionCharges),
    example: { annualForecast: 2_400_000n, year: 2026, invoices: [{ month: 3, amount: 780_000n, coveredMonths: 3 }] } },
  { id: 'concession-ppp', label: 'Concession de service public (PPP)', chapter: 'Concessions', applications: [95], run: fn(ops.publicPrivatePartnership),
    example: { fee: { date: '2026-12-31', construction: 42n * M, financing: 5n * M, services: 25n * M }, tollsCollected: 135n * M, tollsDate: '2026-12-31', transferDate: '2026-12-31' } },
  { id: 'gie-resultat', label: 'Quote-part de résultat d’un GIE', chapter: 'GIE', applications: [96], run: fn(ops.gieResultShare),
    example: { result: -8n * M, share: 0.25, date: '2027-03-31', closingDate: '2026-12-31' } },
  { id: 'gie-apport', label: 'Participation financière à un GIE', chapter: 'GIE', applications: [97], run: fn(ops.gieContribution),
    example: { capital: 40n * M, advance: 10n * M, date: '2026-04-01' } },
  { id: 'personnel-exterieur', label: 'Transfert du personnel extérieur', chapter: 'Personnel', applications: [98], run: fn(ops.externalStaffTransfer),
    example: { interim: 6n * M, seconded: 8_400_000n, date: '2026-12-31' } },
  { id: 'reevaluation-legale', label: 'Réévaluation légale', chapter: 'Réévaluation', applications: [99], run: fn(ops.legalRevaluation),
    example: { index: 1.2, date: '2026-12-31', items: [{ assetAccount: '223100', cost: 100n * M, currentValue: 150n * M }, { assetAccount: '231100', cost: 300n * M, accumulated: 50n * M, currentValue: 375n * M }, { assetAccount: '261000', cost: 25n * M, currentValue: 28n * M }] } },
  { id: 'reevaluation-dotation', label: 'Dotation sur base réévaluée', chapter: 'Réévaluation', applications: [99], run: fn(ops.revaluedDepreciation),
    example: { assetAccount: '231100', revaluedNbv: 300n * M, remainingYears: 25, historicalAnnual: 10n * M, taxNeutral: true, date: '2027-12-31' } },
  { id: 'reevaluation-libre', label: 'Réévaluation libre', chapter: 'Réévaluation', applications: [100], run: fn(ops.freeRevaluation),
    example: { assetAccount: '231100', cost: 150n * M, accumulated: 30n * M, currentValue: 135n * M, method: 1, date: '2026-12-31' } },
  { id: 'engagement-caution', label: 'Caution donnée ou reçue (hors bilan)', chapter: 'Engagements', applications: [102], run: fn(ops.guaranteeCommitment),
    example: { side: 'DONNE', amount: 100n * M, date: '2026-04-15', endDate: '2028-07-15' } },
  { id: 'commissionnaire', label: 'Opération en qualité de commissionnaire', chapter: 'Tiers', applications: [104], run: fn(ops.commissionAgent),
    example: { side: 'INTERMEDIAIRE', amount: 8n * M, commission: 400_000n, date: '2026-06-15' } },
  { id: 'mandataire', label: 'Opération en qualité de mandataire', chapter: 'Tiers', applications: [105], run: fn(ops.mandatary),
    example: { kind: 'ACHAT', amount: 8n * M, date: '2026-06-15', settlementDate: '2026-06-25', fee: 400_000n } },
  { id: 'participation-resultat', label: 'Résultat d’une société en participation', chapter: 'Opérations en commun', applications: [106, 107], run: fn(ops.jointVentureResult),
    example: { managerShare: 0.75, date: '2026-01-31', charges: [{ account: '601100', amount: 1_200_000n }, { account: '612000', amount: 220_000n }, { account: '616000', amount: 38_000n }, { account: '628100', amount: 74_000n }], products: [{ account: '701100', amount: 1_800_000n }] } },
  { id: 'succursale-flux', label: 'Flux siège / succursale', chapter: 'Établissements', applications: [108, 110], run: fn(ops.branchTransfer),
    example: { flow: 'FONDS', amount: 5n * M, date: '2026-06-25' } },
  { id: 'succursale-dotation', label: 'Dotation d’une succursale (compte 184)', chapter: 'Établissements', applications: [109], run: fn(ops.branchEndowment),
    example: { date: '2026-12-01', assets: [{ account: '215000', amount: 24n * M }, { account: '521100', amount: 7n * M }], hqFinancing: [{ account: '521100', amount: 31n * M }] } },
  { id: 'franchise', label: 'Contrat de franchise (franchisé)', chapter: 'Franchise', applications: [112], run: fn(ops.franchise),
    example: { rightOfUse: 100n * M, fitOut: 40n * M, date: '2026-01-15', paymentDate: '2026-01-30', contractYears: 20, fitOutYears: 10, monthsInFirstYear: 11.5, royaltyRate: 0.05, revenue: 200n * M, closingDate: '2026-12-31' } },
  { id: 'devises-ajustement', label: 'Ajustement d’un compte en devises', chapter: 'Pluri-monétaire', applications: [113, 114], run: fn(ops.foreignAccountAdjustment),
    example: { account: '521500', kind: 'TRESORERIE', closingRate: 510, date: '2026-12-31', movements: [{ side: 'D', foreign: 1000, local: 510_000n }, { side: 'D', foreign: 900, local: 459_900n }, { side: 'C', foreign: 300, local: 152_700n }] } },
  { id: 'agricole', label: 'Opérations des entités agricoles', chapter: 'Agriculture', applications: [115], run: fn(ops.agriculturalOps),
    example: { plantation: { value: 150n * M, productiveYears: 40, date: '2026-01-01', closingDate: '2026-12-31' }, selfConsumption: { amount: 50_000n, date: '2026-03-01' } } },
  { id: 'fusion', label: 'Fusion-absorption', chapter: 'Fusions', applications: [116, 117, 118, 119], run: fn(ops.merger),
    example: { date: '2026-06-30', absorbing: { shares: 10_000, nominal: 10_000n, netAssets: 260n * M, holdsAbsorbedShares: 2_000, holdingCost: 10n * M, holdingAccount: '263000' },
      absorbed: { shares: 5_000, assets: [{ account: '241100', gross: 37n * M, value: 85n * M }, { account: '411100', gross: 18n * M }], liabilities: [{ account: '162000', amount: 3n * M }], equity: [{ account: '101300', amount: 50n * M }, { account: '118100', amount: 2n * M }] } } },
  { id: 'apport-partiel', label: 'Apport partiel d’actif (bénéficiaire)', chapter: 'Fusions', applications: [120], run: fn(ops.partialContribution),
    example: { items: [{ account: '215000', amount: 25n * M }, { account: '241100', amount: 45n * M }, { account: '311100', amount: 36n * M }], liabilities: [{ account: '401100', amount: 12_820_000n }],
      doubtful: { gross: 7_200_000n, impairment: 5_760_000n, clientsGross: 35_580_000n }, issuePrice: 15_000n, nominal: 10_000n, date: '2027-01-01' } },
  { id: 'liquidation', label: 'Liquidation', chapter: 'Liquidation', applications: [122], run: fn(ops.liquidation),
    example: { method: 'DIRECT', date: '2027-01-25', openingCash: 9_850_000n, fees: 3n * M,
      assets: [{ account: '231100', gross: 40n * M, reduction: 26_500_000n, proceeds: 25n * M }, { account: '241100', gross: 20n * M, reduction: 15n * M, proceeds: 4_500_000n }],
      receivables: [{ account: '411100', gross: 11n * M, collected: 9_500_000n, discount: 1_500_000n }], liabilities: [{ account: '401100', amount: 17n * M }],
      equity: [{ account: '101300', amount: 20n * M }, { account: '118100', amount: 14n * M }] } },
  { id: 'transition-retraite', label: 'Première application : engagements de retraite', chapter: 'Première application', applications: [125], run: fn(ops.pensionTransition),
    example: { priorObligation: 75n * M, spreadYears: 5, transitionDate: '2018-01-01' } },
  { id: 'perimetre-groupe', label: 'Pourcentages de contrôle et d’intérêt, méthodes', chapter: 'Consolidation', applications: [128, 129, 130], run: fn((p: Parameters<typeof ops.groupPercentages>[0]) => ({ entries: [], values: Object.fromEntries(Object.entries(ops.groupPercentages(p)).map(([k, v]) => [k, `contrôle ${(v.control * 100).toFixed(2)} % · intérêt ${(v.interest * 100).toFixed(2)} % · ${v.method}`])) })),
    example: { parent: 'H', jointControl: ['D'], holdings: [{ owner: 'H', owned: 'A', capital: 0.9 }, { owner: 'H', owned: 'D', capital: 0.25 }, { owner: 'A', owned: 'E', capital: 0.6 }, { owner: 'D', owned: 'I', capital: 0.7 }] } },
  { id: 'entite-ad-hoc', label: 'Contrôle d’une entité ad hoc', chapter: 'Consolidation', applications: [131], run: fn((p: Parameters<typeof ops.adHocControl>[0]) => { const r = ops.adHocControl(p); return { entries: [], values: { controle: r.controlled ? 'OUI' : 'NON', methode: r.method }, notes: [r.reason] }; }),
    example: { decisionPowers: true, majorityBenefits: false, majorityRisks: true } },
  { id: 'variation-interet', label: 'Variation du pourcentage d’intérêt', chapter: 'Consolidation', applications: [141], run: fn(ops.ownershipChange),
    example: { initial: { interest: 0.7, cost: 50n * M, equity: 45n * M, upliftGross: 20n * M, taxRate: 0.25 }, step: { newInterest: 0.8, price: 9_700_000n, equity: 75n * M, upliftAmortised: 1_600_000n }, closingEquity: 90n * M, depreciableUplift: { amount: 8n * M, years: 10 } } },
  { id: 'comptes-combines', label: 'Comptes combinés', chapter: 'Consolidation', applications: [142], run: fn(ops.combinedAccounts),
    example: { entities: [
      { code: 'B', interest: 0.9, fixedAssets: 200n, otherAssets: 450n, capitalAndReserves: 500n, result: 40n, liabilities: 110n, revenue: 1000n, otherIncome: 50n, charges: 980n, incomeTax: 30n, deferredTax: 30n },
      { code: 'C', interest: 0.6, fixedAssets: 300n, otherAssets: 500n, capitalAndReserves: 650n, result: 20n, liabilities: 130n, revenue: 1500n, otherIncome: 100n, charges: 1560n, incomeTax: 20n },
      { code: 'D', interest: 0.7, fixedAssets: 150n, otherAssets: 350n, capitalAndReserves: 350n, result: 30n, liabilities: 120n, revenue: 750n, otherIncome: 30n, charges: 720n, incomeTax: 30n }] } },
  { id: 'ecarts-acquisition', label: 'Écarts d’évaluation et d’acquisition (consolidation)', chapter: 'Consolidation', applications: [135, 136, 137], run: fn(ops.acquisitionDifferences),
    example: { cost: 50n * M, interest: 0.8, equity: 25n * M, taxRate: 0.25, adjustments: [{ label: 'Terrain', amount: 15n * M }, { label: 'Marque', amount: 10n * M }, { label: 'Brevet', amount: 6n * M }, { label: 'Retraite', amount: -7_500_000n }] } },
];

// Clés jamais converties en bigint (comptes, dates, codes, libellés…).
const TEXT_KEY = /^(.*[aA]ccount|date|.*Date|label|code|side|kind|nature|method|flow|basis|category|mode|parent|owner|owned)$/;

/** Convertit les chaînes d'entiers des montants en bigint (récursif) ; laisse intacts comptes, dates et libellés. */
export function reviveAmounts(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => reviveAmounts(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, reviveAmounts(v, k)]));
  if (typeof value === 'string' && /^-?\d+$/.test(value) && !TEXT_KEY.test(key)) return BigInt(value);
  return value;
}

/** Multiplie les montants (bigint) d'un exemple : passage des francs aux unités mineures de la devise du dossier. */
// Cours de change (monnaie du dossier par unité de devise) : exprimés eux aussi en unités mineures.
const FX_RATE_KEY = /^(historicalRate|closingRate|averageRate|hedgedRate|forwardRate|spotAtInception|spotAtMaturity|saleRate|saleClosingRate|settlementRate)$/;

export function scaleAmounts(value: unknown, factor: bigint, key = ''): unknown {
  if (typeof value === 'bigint') return value * factor;
  if (typeof value === 'number' && FX_RATE_KEY.test(key)) return value * Number(factor);
  if (Array.isArray(value)) return value.map((v) => scaleAmounts(v, factor, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scaleAmounts(v, factor, k)]));
  return value;
}

/** Sérialise un résultat ou un exemple (bigint → chaîne). */
export function toJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

export function findOperation(id: string): CatalogueItem | undefined {
  return CATALOGUE.find((c) => c.id === id);
}

/** Exécute une opération à partir de paramètres JSON ; renvoie le résultat sérialisable. */
export function runOperation(id: string, params: unknown): OpResult {
  const op = findOperation(id);
  if (!op) throw new Error('OPERATION_INCONNUE');
  return op.run(reviveAmounts(params) as never);
}
