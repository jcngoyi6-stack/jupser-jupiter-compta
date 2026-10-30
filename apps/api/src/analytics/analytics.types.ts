import { z } from 'zod';

const zNum = z.number().finite();
export const UNIT_SOURCES = ['MANUEL', 'QTE_ACHETEE', 'HEURES_PRODUCTION', 'QTE_PRODUITE', 'QTE_VENDUE', 'CA_100'] as const;
export const METHODS = ['CMUP_PERIODE', 'CMUP_ENTREE', 'PEPS'] as const;

export const zCentre = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{1,12}$/, 'Code : majuscules, chiffres, tirets (12 caractères au plus)'),
  label: z.string().min(2).max(80),
  kind: z.enum(['PRINCIPAL', 'AUXILIAIRE', 'STRUCTURE']),
  fn: z.enum(['APPROVISIONNEMENT', 'PRODUCTION', 'DISTRIBUTION', 'ADMINISTRATION', 'AUTRE']).optional(),
  unit: z.string().max(60).optional(),
  valueBase: z.boolean().optional(),
  unitSource: z.enum(UNIT_SOURCES).default('MANUEL'),
  /** Part fixe des charges du centre (0 à 1) et activité normale, pour l'imputation rationnelle. */
  fixedShare: zNum.min(0).max(1).optional(),
  normalActivity: zNum.positive().optional(),
});

export const zSettings = z.object({
  centres: z.array(zCentre).max(60).default([]),
  /** Clés de répartition primaire : comptes de charges (par préfixe) → centres (pourcentages). */
  keys: z.array(z.object({ prefix: z.string().regex(/^\d{1,8}$/), label: z.string().max(100).default(''), shares: z.record(z.string(), zNum.min(0)) })).max(300).default([]),
  /** Répartition secondaire : centre auxiliaire → centres (pourcentages, total 100). */
  transfers: z.record(z.string(), z.record(z.string(), zNum.min(0))).default({}),
  rules: z.object({
    nonIncorporablePrefixes: z.array(z.string().regex(/^\d{1,8}$/)).optional(),
    overrides: z.record(z.string(), z.enum(['INCORPORABLE', 'NON_INCORPORABLE'])).default({}),
  }).default({ overrides: {} }),
  supplementary: z.object({
    equityRate: zNum.min(0).max(1).default(0),
    ownerAnnual: zNum.min(0).default(0),
    /** Centre qui reçoit les charges supplétives (souvent l'administration). */
    centre: z.string().optional(),
  }).default({ equityRate: 0, ownerAnnual: 0 }),
  /** Charges calculées : montant annuel économique remplaçant le montant comptable du compte. */
  calculated: z.array(z.object({ label: z.string(), account: z.string().regex(/^\d{2,8}$/), annualEconomic: zNum.min(0) })).default([]),
  method: z.enum(METHODS).default('CMUP_PERIODE'),
  /** Coûts préétablis : prix standard par article (code) et taux horaire standard par poste. */
  standards: z.object({ prices: z.record(z.string(), zNum.min(0)).default({}), hourlyRates: z.record(z.string(), zNum.min(0)).default({}) }).default({ prices: {}, hourlyRates: {} }),
});
export type Settings = z.infer<typeof zSettings>;

const zUse = z.object({ centre: z.string(), quantity: zNum.min(0) });
const zDirect = z.object({ label: z.string(), amount: zNum });
const zStock = z.object({ quantity: zNum.min(0), value: zNum.min(0) });

/** Données d'une période : collectées automatiquement puis modifiables avant calcul. */
export const zDataset = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3),
  charges: z.array(z.object({ account: z.string(), label: z.string().optional(), amount: zNum, analytic: z.record(z.string(), zNum).default({}) })),
  generalProducts: zNum,
  generalResult: zNum,
  equity: zNum.default(0),
  /** Variation des stocks en comptabilité générale (− comptes 603 + production stockée 73). */
  stockVariation: zNum.default(0),
  /** Production stockée (comptes 73), exclue des produits non incorporés. */
  stockedProduction: zNum.default(0),
  units: z.record(z.string(), zNum.min(0)).default({}),
  materials: z.array(z.object({
    code: z.string(), label: z.string(), opening: zStock,
    purchases: z.object({ quantity: zNum.min(0), price: zNum.min(0), directCosts: z.array(zDirect).default([]), centres: z.array(zUse).default([]) }),
    physicalClosing: zNum.min(0).optional(),
  })).default([]),
  products: z.array(z.object({
    code: z.string(), label: z.string(), opening: zStock, produced: zNum.min(0),
    consumption: z.array(z.object({ material: z.string(), quantity: zNum.min(0) })).default([]),
    directCosts: z.array(zDirect).default([]), centres: z.array(zUse).default([]),
    wip: z.object({ opening: zNum.min(0), closing: zNum.min(0) }).optional(),
    byProductValue: zNum.min(0).optional(), wasteTreatmentCost: zNum.min(0).optional(),
    sold: zNum.min(0), salePrice: zNum.min(0),
    distribution: z.object({ directCosts: z.array(zDirect).default([]), centres: z.array(zUse).default([]) }).default({ directCosts: [], centres: [] }),
    physicalClosing: zNum.min(0).optional(),
  })).default([]),
  budgets: z.record(z.string(), zNum).default({}),
  warnings: z.array(z.string()).default([]),
});
export type Dataset = z.infer<typeof zDataset>;

/** Paramétrage proposé à la première ouverture (à adapter par l'entité). */
export function defaultSettings(): Settings {
  return zSettings.parse({
    centres: [
      { code: 'ADM', label: 'Administration', kind: 'AUXILIAIRE', fn: 'ADMINISTRATION' },
      { code: 'ENT', label: 'Entretien', kind: 'AUXILIAIRE', fn: 'AUTRE' },
      { code: 'APP', label: 'Approvisionnement', kind: 'PRINCIPAL', fn: 'APPROVISIONNEMENT', unit: 'unité achetée', unitSource: 'QTE_ACHETEE' },
      { code: 'ATE', label: 'Atelier', kind: 'PRINCIPAL', fn: 'PRODUCTION', unit: 'heure de production', unitSource: 'HEURES_PRODUCTION' },
      { code: 'DIS', label: 'Distribution', kind: 'PRINCIPAL', fn: 'DISTRIBUTION', unit: '100 F de chiffre d’affaires', valueBase: true, unitSource: 'CA_100' },
    ],
    keys: [
      { prefix: '62', label: 'Services extérieurs A', shares: { ADM: 20, ENT: 10, APP: 10, ATE: 40, DIS: 20 } },
      { prefix: '63', label: 'Services extérieurs B', shares: { ADM: 40, APP: 10, ATE: 20, DIS: 30 } },
      { prefix: '64', label: 'Impôts et taxes', shares: { ADM: 100 } },
      { prefix: '605', label: 'Autres achats (eau, électricité)', shares: { ENT: 20, ATE: 70, ADM: 10 } },
      { prefix: '61', label: 'Transports', shares: { APP: 50, DIS: 50 } },
      { prefix: '663', label: 'Indemnités et personnel indirect', shares: { ADM: 50, DIS: 50 } },
      { prefix: '67', label: 'Frais financiers', shares: { ADM: 100 } },
      { prefix: '68', label: 'Dotations', shares: { ADM: 10, ENT: 10, ATE: 70, DIS: 10 } },
    ],
    transfers: { ADM: { ENT: 10, APP: 20, ATE: 40, DIS: 30 }, ENT: { ADM: 10, APP: 10, ATE: 70, DIS: 10 } },
    supplementary: { equityRate: 0, ownerAnnual: 0, centre: 'ADM' },
  });
}
