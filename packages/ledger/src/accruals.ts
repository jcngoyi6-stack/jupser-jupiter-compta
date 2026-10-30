/**
 * Régularisations de fin d'exercice (guide d'application, chapitre 6, applications 21 à 24) et leur
 * contre-passation à l'ouverture de l'exercice suivant (contre-passation immédiate).
 */
import type { EntryLineInput } from './entries';

export type AccrualKind = 'CHARGE_CONSTATEE_AVANCE' | 'PRODUIT_CONSTATE_AVANCE' | 'CHARGE_A_PAYER' | 'PRODUIT_A_RECEVOIR';
export type Counterparty = 'FOURNISSEUR' | 'FOURNISSEUR_INVESTISSEMENT' | 'FOURNISSEUR_INTERETS' | 'CLIENT' | 'PERSONNEL' | 'PERSONNEL_CONGES' | 'ORGANISMES_SOCIAUX' | 'ORGANISMES_SOCIAUX_CONGES' | 'ETAT' | 'ETAT_SUBVENTION' | 'BANQUE_INTERETS';

/** Comptes de tiers des régularisations (plan SYSCOHADA révisé). */
export const ACCRUAL_ACCOUNTS: Record<'CHARGE_A_PAYER' | 'PRODUIT_A_RECEVOIR', Partial<Record<Counterparty, string>>> = {
  CHARGE_A_PAYER: {
    FOURNISSEUR: '408100', FOURNISSEUR_INVESTISSEMENT: '481800', FOURNISSEUR_INTERETS: '408600', PERSONNEL: '428600', PERSONNEL_CONGES: '428100',
    ORGANISMES_SOCIAUX: '438600', ORGANISMES_SOCIAUX_CONGES: '438200', ETAT: '448600', BANQUE_INTERETS: '166200',
  },
  PRODUIT_A_RECEVOIR: {
    CLIENT: '418100', FOURNISSEUR: '409800', PERSONNEL: '428700', ORGANISMES_SOCIAUX: '438700', ETAT: '448700', ETAT_SUBVENTION: '449500',
  },
};

export interface AccrualItem {
  kind: AccrualKind;
  /** Compte de charge ou de produit (ou d'immobilisation pour une facture d'investissement non parvenue). */
  account: string;
  amount: bigint;
  counterparty?: Counterparty;
  /** TVA sur facture non parvenue (4455) ou à établir (4435). */
  vat?: bigint;
  thirdPartyId?: string | null;
  label?: string;
}

export function accrualLines(items: AccrualItem[]): EntryLineInput[] {
  const lines: EntryLineInput[] = [];
  for (const it of items) {
    if (it.amount <= 0n) throw new Error('MONTANT_INVALIDE');
    const vat = it.vat ?? 0n;
    switch (it.kind) {
      case 'CHARGE_CONSTATEE_AVANCE':
        lines.push({ account: '476000', debit: it.amount, credit: 0n, label: it.label }, { account: it.account, debit: 0n, credit: it.amount, label: it.label });
        break;
      case 'PRODUIT_CONSTATE_AVANCE':
        lines.push({ account: it.account, debit: it.amount, credit: 0n, label: it.label }, { account: '477000', debit: 0n, credit: it.amount, label: it.label });
        break;
      case 'CHARGE_A_PAYER': {
        const tiers = ACCRUAL_ACCOUNTS.CHARGE_A_PAYER[it.counterparty ?? 'FOURNISSEUR'];
        if (!tiers) throw new Error('TIERS_INADAPTE');
        lines.push({ account: it.account, debit: it.amount, credit: 0n, label: it.label });
        if (vat) lines.push({ account: '445500', debit: vat, credit: 0n, label: it.label });
        lines.push({ account: tiers, debit: 0n, credit: it.amount + vat, thirdPartyId: it.thirdPartyId ?? null, label: it.label });
        break;
      }
      case 'PRODUIT_A_RECEVOIR': {
        const tiers = ACCRUAL_ACCOUNTS.PRODUIT_A_RECEVOIR[it.counterparty ?? 'CLIENT'];
        if (!tiers) throw new Error('TIERS_INADAPTE');
        lines.push({ account: tiers, debit: it.amount + vat, credit: 0n, thirdPartyId: it.thirdPartyId ?? null, label: it.label });
        lines.push({ account: it.account, debit: 0n, credit: it.amount, label: it.label });
        // Avoir à obtenir d'un fournisseur : TVA récupérable à reverser (4455) ; facture à établir : TVA collectée (4435).
        if (vat) lines.push({ account: it.counterparty === 'FOURNISSEUR' ? '445500' : '443500', debit: 0n, credit: vat, label: it.label });
        break;
      }
    }
  }
  return lines;
}

/** Contre-passation à l'ouverture : mêmes lignes, sens inversé. */
export function reversalLines(lines: EntryLineInput[]): EntryLineInput[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

export type ProvisionNature = 'EXPLOITATION' | 'FINANCIERE' | 'HAO';
const PROVISION_ACCOUNTS: Record<ProvisionNature, { dotation: string; reprise: string }> = {
  EXPLOITATION: { dotation: '691100', reprise: '791100' },
  FINANCIERE: { dotation: '697100', reprise: '797100' },
  HAO: { dotation: '854000', reprise: '864000' },
};

/**
 * Provision pour risques et charges (guide d'application, applications 71 à 75) : ajustement du compte 19x
 * au montant requis à la clôture — dotation (691/697/854) ou reprise (791/797/864).
 */
export function provisionLines(nature: ProvisionNature, account: string, required: bigint, booked: bigint): EntryLineInput[] {
  if (!account.startsWith('19')) throw new Error('COMPTE_PROVISION_19_ATTENDU');
  const a = PROVISION_ACCOUNTS[nature];
  const delta = required - booked;
  if (delta > 0n) return [{ account: a.dotation, debit: delta, credit: 0n }, { account, debit: 0n, credit: delta }];
  if (delta < 0n) return [{ account, debit: -delta, credit: 0n }, { account: a.reprise, debit: 0n, credit: -delta }];
  return [];
}
