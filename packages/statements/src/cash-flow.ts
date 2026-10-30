import type { ControlResult } from './types';

/**
 * Tableau des flux de trésorerie (méthode indirecte SYSCOHADA révisé, références ZA…ZH).
 * Chaque ligne d'écriture hors journal d'à-nouveaux et hors trésorerie est affectée à un flux ;
 * la variation de trésorerie (ZG) est donc toujours égale à la somme des flux, et ZH = ZA + ZG
 * se rapproche de la trésorerie de clôture du bilan (contrôle bouclé).
 * TODO(expert-comptable, lot L2) : valider l'affectation fine des comptes mixtes de la classe 4.
 */
export interface FlowLine {
  account: string;
  debit: bigint;
  credit: bigint;
  journalType: string;
}

export const CASH_FLOW_LABELS: Record<string, string> = {
  ZA: 'Trésorerie nette au 1er janvier (trésorerie actif N-1 – trésorerie passif N-1)',
  FA: "Capacité d'autofinancement globale (CAFG)",
  FB: "– Variation d'actif circulant HAO",
  FC: '– Variation des stocks',
  FD: '– Variation des créances',
  FE: '+ Variation du passif circulant',
  ZB: 'Flux de trésorerie provenant des activités opérationnelles',
  FF: "– Décaissements liés aux acquisitions d'immobilisations incorporelles",
  FG: "– Décaissements liés aux acquisitions d'immobilisations corporelles",
  FH: "– Décaissements liés aux acquisitions d'immobilisations financières",
  FI: "+ Encaissements liés aux cessions d'immobilisations incorporelles et corporelles",
  FJ: "+ Encaissements liés aux cessions d'immobilisations financières",
  ZC: "Flux de trésorerie provenant des activités d'investissement",
  FK: '+ Augmentations de capital par apports nouveaux',
  FL: "+ Subventions d'investissement reçues",
  FM: '– Prélèvements sur le capital',
  FN: '– Dividendes versés',
  ZD: 'Flux de trésorerie provenant des capitaux propres',
  FO: '+ Emprunts',
  FP: '+ Autres dettes financières',
  FQ: '– Remboursements des emprunts et autres dettes financières',
  ZE: 'Flux de trésorerie provenant des capitaux étrangers',
  ZF: 'Flux de trésorerie provenant des activités de financement',
  ZG: 'VARIATION DE LA TRÉSORERIE NETTE DE LA PÉRIODE',
  ZH: 'Trésorerie nette au 31 décembre',
};

export const CASH_FLOW_ORDER = [
  'ZA', 'FA', 'FB', 'FC', 'FD', 'FE', 'ZB', 'FF', 'FG', 'FH', 'FI', 'FJ', 'ZC', 'FK', 'FL', 'FM', 'FN', 'ZD',
  'FO', 'FP', 'FQ', 'ZE', 'ZF', 'ZG', 'ZH',
];

export function isTreasury(account: string): boolean {
  return /^5[0-8]/.test(account);
}

export function flowRefOf(account: string, debit: bigint): string {
  const isDebit = debit > 0n;
  const a = account;
  if (/^[67]/.test(a) || /^8[3-9]/.test(a)) return 'FA';
  if (/^(19|15|29|39|49|59)/.test(a)) return 'FA';
  if (/^28/.test(a)) return isDebit ? 'FI' : 'FA';
  if (/^8[12]/.test(a)) return 'FI';
  if (/^48/.test(a)) return 'FB';
  if (/^3/.test(a)) return 'FC';
  if (/^(41|409|476|478)/.test(a)) return 'FD';
  if (/^465/.test(a)) return 'FN';
  if (/^4/.test(a)) return 'FE';
  if (/^21/.test(a)) return isDebit ? 'FF' : 'FI';
  if (/^(22|23|24|25)/.test(a)) return isDebit ? 'FG' : 'FI';
  if (/^(26|27)/.test(a)) return isDebit ? 'FH' : 'FJ';
  if (/^106/.test(a)) return 'FG';
  if (/^104/.test(a)) return 'FM';
  if (/^10/.test(a)) return 'FK';
  if (/^14/.test(a)) return 'FL';
  if (/^1[123]/.test(a)) return 'FN';
  if (/^(16|17)/.test(a)) return isDebit ? 'FQ' : 'FO';
  if (/^18/.test(a)) return isDebit ? 'FQ' : 'FP';
  return 'FE';
}

export interface CashFlowStatement {
  values: Record<string, bigint>;
  rows: { ref: string; label: string; total: boolean; value: bigint }[];
  controls: ControlResult[];
}

export function buildCashFlow(lines: FlowLine[], closingTreasury: bigint): CashFlowStatement {
  const v: Record<string, bigint> = {};
  for (const r of CASH_FLOW_ORDER) v[r] = 0n;
  for (const l of lines) {
    if (/^9/.test(l.account)) continue;
    if (isTreasury(l.account)) {
      if (l.journalType === 'AN') v.ZA = v.ZA! + l.debit - l.credit;
      continue;
    }
    if (l.journalType === 'AN') continue;
    const ref = flowRefOf(l.account, l.debit);
    v[ref] = v[ref]! - (l.debit - l.credit);
  }
  v.ZB = v.FA! + v.FB! + v.FC! + v.FD! + v.FE!;
  v.ZC = v.FF! + v.FG! + v.FH! + v.FI! + v.FJ!;
  v.ZD = v.FK! + v.FL! + v.FM! + v.FN!;
  v.ZE = v.FO! + v.FP! + v.FQ!;
  v.ZF = v.ZD! + v.ZE!;
  v.ZG = v.ZB! + v.ZC! + v.ZF!;
  v.ZH = v.ZA! + v.ZG!;
  const totals = new Set(['ZA', 'ZB', 'ZC', 'ZD', 'ZE', 'ZF', 'ZG', 'ZH']);
  return {
    values: v,
    rows: CASH_FLOW_ORDER.map((ref) => ({ ref, label: CASH_FLOW_LABELS[ref]!, total: totals.has(ref), value: v[ref]! })),
    controls: [
      {
        code: 'TFT_BOUCLE',
        label: 'Trésorerie de clôture du TFT (ZH) = trésorerie nette du bilan',
        ok: v.ZH === closingTreasury,
        detail: v.ZH === closingTreasury ? undefined : `ZH ${v.ZH} ≠ bilan ${closingTreasury}`,
        blocking: true,
      },
    ],
  };
}
