import type { AccountBalance, ControlResult } from './types';

/**
 * Bilan SYSCOHADA révisé, système normal (références AD…BZ à l'actif, CA…DZ au passif).
 * TODO(expert-comptable, lot L2) : confronter libellés et rattachements à l'AUDCIF page par page.
 *
 * Règle de non-compensation (docs/12) : un compte de tiers est classé à l'actif ou au passif
 * selon le sens de son solde (client créditeur → DI, fournisseur débiteur → BH…).
 */
type Side = 'D' | 'C' | 'any';
interface Rule {
  prefix: string;
  side: Side;
  ref: string;
}

export const ASSET_LINES: { ref: string; label: string; total?: string[] }[] = [
  { ref: 'AD', label: 'IMMOBILISATIONS INCORPORELLES', total: ['AE', 'AF', 'AG', 'AH'] },
  { ref: 'AE', label: 'Frais de développement et de prospection' },
  { ref: 'AF', label: 'Brevets, licences, logiciels et droits similaires' },
  { ref: 'AG', label: 'Fonds commercial et droit au bail' },
  { ref: 'AH', label: 'Autres immobilisations incorporelles' },
  { ref: 'AI', label: 'IMMOBILISATIONS CORPORELLES', total: ['AJ', 'AK', 'AL', 'AM', 'AN'] },
  { ref: 'AJ', label: 'Terrains' },
  { ref: 'AK', label: 'Bâtiments' },
  { ref: 'AL', label: 'Aménagements, agencements et installations' },
  { ref: 'AM', label: 'Matériel, mobilier et actifs biologiques' },
  { ref: 'AN', label: 'Matériel de transport' },
  { ref: 'AP', label: 'AVANCES ET ACOMPTES VERSÉS SUR IMMOBILISATIONS' },
  { ref: 'AQ', label: 'IMMOBILISATIONS FINANCIÈRES', total: ['AR', 'AS'] },
  { ref: 'AR', label: 'Titres de participation' },
  { ref: 'AS', label: 'Autres immobilisations financières' },
  { ref: 'AZ', label: 'TOTAL ACTIF IMMOBILISÉ', total: ['AD', 'AI', 'AP', 'AQ'] },
  { ref: 'BA', label: 'ACTIF CIRCULANT HAO' },
  { ref: 'BB', label: 'STOCKS ET ENCOURS' },
  { ref: 'BG', label: 'CRÉANCES ET EMPLOIS ASSIMILÉS', total: ['BH', 'BI', 'BJ'] },
  { ref: 'BH', label: 'Fournisseurs, avances versées' },
  { ref: 'BI', label: 'Clients' },
  { ref: 'BJ', label: 'Autres créances' },
  { ref: 'BK', label: 'TOTAL ACTIF CIRCULANT', total: ['BA', 'BB', 'BG'] },
  { ref: 'BQ', label: 'Titres de placement' },
  { ref: 'BR', label: 'Valeurs à encaisser' },
  { ref: 'BS', label: 'Banques, chèques postaux, caisse et assimilés' },
  { ref: 'BT', label: 'TOTAL TRÉSORERIE-ACTIF', total: ['BQ', 'BR', 'BS'] },
  { ref: 'BU', label: 'Écart de conversion-Actif' },
  { ref: 'BZ', label: 'TOTAL GÉNÉRAL', total: ['AZ', 'BK', 'BT', 'BU'] },
];

export const LIABILITY_LINES: { ref: string; label: string; total?: string[] }[] = [
  { ref: 'CA', label: 'Capital' },
  { ref: 'CB', label: 'Apporteurs capital non appelé (-)' },
  { ref: 'CD', label: 'Primes liées au capital social' },
  { ref: 'CE', label: 'Écarts de réévaluation' },
  { ref: 'CF', label: 'Réserves indisponibles' },
  { ref: 'CG', label: 'Réserves libres' },
  { ref: 'CH', label: 'Report à nouveau (+ ou -)' },
  { ref: 'CJ', label: "Résultat net de l'exercice (bénéfice + ou perte -)" },
  { ref: 'CL', label: "Subventions d'investissement" },
  { ref: 'CM', label: 'Provisions réglementées' },
  {
    ref: 'CP',
    label: 'TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES',
    total: ['CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CJ', 'CL', 'CM'],
  },
  { ref: 'DA', label: 'Emprunts et dettes financières diverses' },
  { ref: 'DB', label: 'Dettes de location-acquisition' },
  { ref: 'DC', label: 'Provisions pour risques et charges' },
  { ref: 'DD', label: 'TOTAL DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES', total: ['DA', 'DB', 'DC'] },
  { ref: 'DF', label: 'TOTAL RESSOURCES STABLES', total: ['CP', 'DD'] },
  { ref: 'DH', label: 'Dettes circulantes HAO' },
  { ref: 'DI', label: 'Clients, avances reçues' },
  { ref: 'DJ', label: "Fournisseurs d'exploitation" },
  { ref: 'DK', label: 'Dettes fiscales et sociales' },
  { ref: 'DM', label: 'Autres dettes' },
  { ref: 'DN', label: 'Provisions pour risques à court terme' },
  { ref: 'DP', label: 'TOTAL PASSIF CIRCULANT', total: ['DH', 'DI', 'DJ', 'DK', 'DM', 'DN'] },
  { ref: 'DQ', label: "Banques, crédits d'escompte" },
  { ref: 'DR', label: 'Banques, établissements financiers et crédits de trésorerie' },
  { ref: 'DT', label: 'TOTAL TRÉSORERIE-PASSIF', total: ['DQ', 'DR'] },
  { ref: 'DV', label: 'Écart de conversion-Passif' },
  { ref: 'DZ', label: 'TOTAL GÉNÉRAL', total: ['DF', 'DP', 'DT', 'DV'] },
];

/** Rattachement des comptes d'actif (montant brut, solde débiteur). */
const ASSET_RULES: Rule[] = [
  { prefix: '211', side: 'any', ref: 'AE' },
  { prefix: '212', side: 'any', ref: 'AF' },
  { prefix: '213', side: 'any', ref: 'AF' },
  { prefix: '214', side: 'any', ref: 'AF' },
  { prefix: '215', side: 'any', ref: 'AG' },
  { prefix: '216', side: 'any', ref: 'AG' },
  { prefix: '21', side: 'any', ref: 'AH' },
  { prefix: '22', side: 'any', ref: 'AJ' },
  { prefix: '2391', side: 'any', ref: 'AK' },
  { prefix: '231', side: 'any', ref: 'AK' },
  { prefix: '232', side: 'any', ref: 'AK' },
  { prefix: '233', side: 'any', ref: 'AK' },
  { prefix: '237', side: 'any', ref: 'AK' },
  { prefix: '23', side: 'any', ref: 'AL' },
  { prefix: '245', side: 'any', ref: 'AN' },
  { prefix: '2495', side: 'any', ref: 'AN' },
  { prefix: '24', side: 'any', ref: 'AM' },
  { prefix: '25', side: 'any', ref: 'AP' },
  { prefix: '26', side: 'any', ref: 'AR' },
  { prefix: '27', side: 'any', ref: 'AS' },
  { prefix: '485', side: 'any', ref: 'BA' },
  { prefix: '488', side: 'any', ref: 'BA' },
  { prefix: '48', side: 'D', ref: 'BA' },
  { prefix: '3', side: 'any', ref: 'BB' },
  { prefix: '409', side: 'D', ref: 'BH' },
  { prefix: '40', side: 'D', ref: 'BH' },
  { prefix: '41', side: 'D', ref: 'BI' },
  { prefix: '478', side: 'any', ref: 'BU' },
  { prefix: '185', side: 'D', ref: 'BJ' },
  { prefix: '42', side: 'D', ref: 'BJ' },
  { prefix: '43', side: 'D', ref: 'BJ' },
  { prefix: '44', side: 'D', ref: 'BJ' },
  { prefix: '45', side: 'D', ref: 'BJ' },
  { prefix: '46', side: 'D', ref: 'BJ' },
  { prefix: '47', side: 'D', ref: 'BJ' },
  { prefix: '50', side: 'any', ref: 'BQ' },
  { prefix: '51', side: 'any', ref: 'BR' },
  { prefix: '52', side: 'D', ref: 'BS' },
  { prefix: '53', side: 'D', ref: 'BS' },
  { prefix: '54', side: 'D', ref: 'BS' },
  { prefix: '55', side: 'D', ref: 'BS' },
  { prefix: '57', side: 'D', ref: 'BS' },
  { prefix: '58', side: 'D', ref: 'BS' },
];

/** Rattachement des comptes de passif (solde créditeur présenté en positif). */
const LIABILITY_RULES: Rule[] = [
  { prefix: '109', side: 'any', ref: 'CB' },
  { prefix: '101', side: 'any', ref: 'CA' },
  { prefix: '102', side: 'any', ref: 'CA' },
  { prefix: '103', side: 'any', ref: 'CA' },
  { prefix: '104', side: 'any', ref: 'CA' },
  { prefix: '105', side: 'any', ref: 'CD' },
  { prefix: '106', side: 'any', ref: 'CE' },
  { prefix: '111', side: 'any', ref: 'CF' },
  { prefix: '112', side: 'any', ref: 'CF' },
  { prefix: '113', side: 'any', ref: 'CF' },
  { prefix: '11', side: 'any', ref: 'CG' },
  { prefix: '12', side: 'any', ref: 'CH' },
  { prefix: '13', side: 'any', ref: 'CJ' },
  { prefix: '14', side: 'any', ref: 'CL' },
  { prefix: '15', side: 'any', ref: 'CM' },
  { prefix: '16', side: 'any', ref: 'DA' },
  { prefix: '181', side: 'any', ref: 'DA' },
  { prefix: '182', side: 'any', ref: 'DA' },
  { prefix: '183', side: 'any', ref: 'DA' },
  { prefix: '184', side: 'any', ref: 'DA' },
  { prefix: '17', side: 'any', ref: 'DB' },
  { prefix: '19', side: 'any', ref: 'DC' },
  { prefix: '18', side: 'C', ref: 'DM' },
  { prefix: '48', side: 'C', ref: 'DH' },
  { prefix: '41', side: 'C', ref: 'DI' },
  { prefix: '40', side: 'C', ref: 'DJ' },
  { prefix: '479', side: 'any', ref: 'DV' },
  { prefix: '42', side: 'C', ref: 'DK' },
  { prefix: '43', side: 'C', ref: 'DK' },
  { prefix: '44', side: 'C', ref: 'DK' },
  { prefix: '45', side: 'C', ref: 'DM' },
  { prefix: '46', side: 'C', ref: 'DM' },
  { prefix: '47', side: 'C', ref: 'DM' },
  { prefix: '499', side: 'any', ref: 'DN' },
  { prefix: '599', side: 'any', ref: 'DN' },
  { prefix: '564', side: 'any', ref: 'DQ' },
  { prefix: '565', side: 'any', ref: 'DQ' },
  { prefix: '56', side: 'any', ref: 'DR' },
  { prefix: '52', side: 'C', ref: 'DR' },
  { prefix: '53', side: 'C', ref: 'DR' },
  { prefix: '54', side: 'C', ref: 'DR' },
  { prefix: '55', side: 'C', ref: 'DR' },
  { prefix: '57', side: 'C', ref: 'DR' },
  { prefix: '58', side: 'C', ref: 'DR' },
];

function match(rules: Rule[], account: string, net: bigint): string | null {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!account.startsWith(r.prefix)) continue;
    if (r.side === 'D' && net <= 0n) continue;
    if (r.side === 'C' && net >= 0n) continue;
    if (!best || r.prefix.length > best.prefix.length) best = r;
  }
  return best?.ref ?? null;
}

/** Comptes d'amortissement / de dépréciation d'actif : 28x, 29x, 39x, 49x (sauf 499), 59x (sauf 599). */
export function contraAssetTarget(account: string): string | null {
  if (/^(28|29)/.test(account)) return '2' + account.slice(2);
  if (/^39/.test(account)) return '3' + account.slice(2);
  if (/^49/.test(account) && !account.startsWith('499')) return '4' + account.slice(2);
  if (/^59/.test(account) && !account.startsWith('599')) return '5' + account.slice(2);
  return null;
}

export interface AssetRow {
  ref: string;
  label: string;
  total: boolean;
  gross: bigint;
  depreciation: bigint;
  net: bigint;
}
export interface LiabilityRow {
  ref: string;
  label: string;
  total: boolean;
  value: bigint;
}

export interface BalanceSheet {
  assets: AssetRow[];
  liabilities: LiabilityRow[];
  unmapped: AccountBalance[];
  controls: ControlResult[];
  totalAssets: bigint;
  totalLiabilities: bigint;
}

/**
 * Construit le bilan à partir des soldes de clôture (classes 1 à 5) et du résultat des classes 6 à 8
 * non encore soldées (porté en CJ).
 */
export function buildBalanceSheet(balances: AccountBalance[]): BalanceSheet {
  const gross: Record<string, bigint> = {};
  const dep: Record<string, bigint> = {};
  const liab: Record<string, bigint> = {};
  const unmapped: AccountBalance[] = [];
  let pendingResult = 0n;

  for (const b of balances) {
    const c = b.account[0];
    if (c === '6' || c === '7' || c === '8') {
      pendingResult += -b.net;
      continue;
    }
    if (c === '9' || b.net === 0n) continue;
    const contra = contraAssetTarget(b.account);
    if (contra) {
      const ref = match(ASSET_RULES, contra, 1n);
      if (ref) {
        dep[ref] = (dep[ref] ?? 0n) - b.net; // solde créditeur → dépréciation positive
        continue;
      }
    }
    const aRef = match(ASSET_RULES, b.account, b.net);
    const lRef = match(LIABILITY_RULES, b.account, b.net);
    if (aRef && (!lRef || c === '2' || c === '3' || b.account.startsWith('478') || /^5[01]/.test(b.account))) {
      gross[aRef] = (gross[aRef] ?? 0n) + b.net;
    } else if (lRef) {
      liab[lRef] = (liab[lRef] ?? 0n) - b.net;
    } else {
      unmapped.push(b);
    }
  }
  liab.CJ = (liab.CJ ?? 0n) + pendingResult;

  const assetVals: Record<string, { g: bigint; d: bigint }> = {};
  for (const l of ASSET_LINES) {
    if (!l.total) assetVals[l.ref] = { g: gross[l.ref] ?? 0n, d: dep[l.ref] ?? 0n };
  }
  for (const l of ASSET_LINES) {
    if (l.total) {
      assetVals[l.ref] = l.total.reduce(
        (s, r) => ({ g: s.g + assetVals[r]!.g, d: s.d + assetVals[r]!.d }),
        { g: 0n, d: 0n },
      );
    }
  }
  const liabVals: Record<string, bigint> = {};
  for (const l of LIABILITY_LINES) if (!l.total) liabVals[l.ref] = liab[l.ref] ?? 0n;
  for (const l of LIABILITY_LINES) if (l.total) liabVals[l.ref] = l.total.reduce((s, r) => s + liabVals[r]!, 0n);

  const assets = ASSET_LINES.map((l) => {
    const v = assetVals[l.ref]!;
    return { ref: l.ref, label: l.label, total: !!l.total, gross: v.g, depreciation: v.d, net: v.g - v.d };
  });
  const liabilities = LIABILITY_LINES.map((l) => ({
    ref: l.ref,
    label: l.label,
    total: !!l.total,
    value: liabVals[l.ref]!,
  }));
  const totalAssets = assetVals.BZ!.g - assetVals.BZ!.d;
  const totalLiabilities = liabVals.DZ!;
  const controls: ControlResult[] = [
    {
      code: 'BILAN_EQUILIBRE',
      label: 'Total actif net = total passif',
      ok: totalAssets === totalLiabilities,
      detail: totalAssets === totalLiabilities ? undefined : `Écart : ${totalAssets - totalLiabilities}`,
      blocking: true,
    },
    {
      code: 'BILAN_COMPTES_MAPPES',
      label: 'Tous les comptes de bilan sont rattachés à un poste',
      ok: unmapped.length === 0,
      detail: unmapped.map((u) => u.account).join(', ') || undefined,
      blocking: true,
    },
  ];
  return { assets, liabilities, unmapped, controls, totalAssets, totalLiabilities };
}
