import { canonicalJson, sha256 } from '@jupiter/ledger';
import { createHmac } from 'node:crypto';

/**
 * Facture normalisée (RDC) — DGI : dispositif électronique fiscal (DEF) / module de contrôle de facturation
 * (e-MCF). Chaque facture émise est transmise au dispositif, qui renvoie les éléments de sécurité à
 * imprimer : code DEF/DGI, numéro d'identification du module (NIM), compteurs, date-heure et QR code.
 *
 * TODO(DGI/fiscaliste) : confirmer sur la spécification technique officielle de la DGI les codes des
 * groupes de taxation, des types de facture et de client, ainsi que les points d'accès de l'API.
 * Les listes ci-dessous sont paramétrables (règles FACTURE_NORMALISEE, statut A_VALIDER).
 */
export type InvoiceType = 'FV' | 'FA' | 'EV' | 'EA'; // vente, avoir, vente export, avoir export
export type ClientType = 'PP' | 'PM' | 'PC' | 'PL' | 'AO';

export const DEFAULT_TAX_GROUPS: Record<string, { label: string; vatKind: 'EXONERE' | 'NORMAL' | 'REDUIT' | 'EXPORT' }> = {
  A: { label: 'Exonéré', vatKind: 'EXONERE' },
  B: { label: 'Taxable — taux normal', vatKind: 'NORMAL' },
  C: { label: 'Taxable — taux réduit', vatKind: 'REDUIT' },
  D: { label: 'Exportation / régime dérogatoire', vatKind: 'EXPORT' },
};

export interface NormalizedItem {
  name: string;
  quantity: string; // décimal
  unitPriceTtc: bigint; // unités mineures
  taxGroup: string;
}

export interface NormalizedInvoice {
  sellerTaxId: string; // NIF du vendeur
  sellerName: string;
  nim?: string | null;
  type: InvoiceType;
  reference?: string | null; // code DEF/DGI de la facture d'origine (avoir)
  client: { type: ClientType; name: string; taxId?: string | null; address?: string | null };
  operator: { id: string; name: string };
  items: NormalizedItem[];
  payment: { method: 'ESPECES' | 'VIREMENT' | 'CARTE' | 'MOBILE_MONEY' | 'CHEQUE' | 'CREDIT' | 'AUTRE'; amount: bigint }[];
  internalNumber: string;
  date: string;
}

export interface SecurityElements {
  mode: 'PRODUCTION' | 'SIMULATION';
  uid: string;
  codeDefDgi: string;
  nim: string;
  counters: string; // ex. « 12/15 FV »
  dateTime: string;
  qrCode: string; // contenu à imprimer sous forme de QR
  totals: { ht: string; tva: string; ttc: string };
}

export interface EInvoiceProvider {
  readonly name: string;
  submit(invoice: NormalizedInvoice): Promise<SecurityElements>;
}

export function validateNormalizedInvoice(inv: NormalizedInvoice, groups = DEFAULT_TAX_GROUPS): string[] {
  const errors: string[] = [];
  if (!inv.sellerTaxId?.trim()) errors.push('NIF du vendeur obligatoire pour la facture normalisée.');
  if (inv.items.length === 0) errors.push('Au moins un article.');
  for (const [i, it] of inv.items.entries()) {
    if (!groups[it.taxGroup]) errors.push(`Article ${i + 1} : groupe de taxation ${it.taxGroup} inconnu.`);
    if (!/^\d+(\.\d{1,3})?$/.test(it.quantity) || Number(it.quantity) <= 0) errors.push(`Article ${i + 1} : quantité invalide.`);
    if (it.unitPriceTtc < 0n) errors.push(`Article ${i + 1} : prix négatif.`);
  }
  if ((inv.type === 'FA' || inv.type === 'EA') && !inv.reference) errors.push("Un avoir doit référencer le code DEF/DGI de la facture d'origine.");
  if (inv.client.type === 'PM' && !inv.client.taxId) errors.push('NIF du client obligatoire pour une personne morale.');
  const total = itemsTotal(inv.items);
  const paid = inv.payment.reduce((s, p) => s + p.amount, 0n);
  if (inv.payment.length && paid !== total) errors.push('Le total des paiements doit égaler le total TTC.');
  return errors;
}

export function itemsTotal(items: NormalizedItem[]): bigint {
  return items.reduce((s, it) => s + lineTotal(it), 0n);
}

export function lineTotal(it: NormalizedItem): bigint {
  const [i, f = ''] = it.quantity.split('.');
  const q = BigInt(i! + f.padEnd(3, '0'));
  return (it.unitPriceTtc * q + 500n) / 1000n;
}

/**
 * Simulateur du dispositif (développement, recette, formation) : produit des éléments de sécurité
 * au format attendu, clairement marqués SIMULATION — sans valeur fiscale.
 */
export class SimulatedDef implements EInvoiceProvider {
  readonly name = 'SIMULATION';
  private counters = new Map<string, number>();
  constructor(private readonly secret: string, private readonly nim = 'SIM-000001') {}

  async submit(inv: NormalizedInvoice): Promise<SecurityElements> {
    const errors = validateNormalizedInvoice(inv);
    if (errors.length) throw new Error(errors.join(' '));
    const key = `${inv.sellerTaxId}|${inv.type}`;
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    const total = [...this.counters.entries()].filter(([k]) => k.startsWith(inv.sellerTaxId)).reduce((s, [, v]) => s + v, 0);
    const digest = createHmac('sha256', this.secret).update(canonicalJson(inv)).digest('hex').toUpperCase();
    const code = digest.slice(0, 24).match(/.{4}/g)!.join('-');
    const dateTime = new Date().toISOString();
    const ttc = itemsTotal(inv.items);
    return {
      mode: 'SIMULATION',
      uid: sha256(digest).slice(0, 32),
      codeDefDgi: code,
      nim: inv.nim ?? this.nim,
      counters: `${n}/${total} ${inv.type}`,
      dateTime,
      qrCode: `DEF-SIMULATION;${inv.nim ?? this.nim};${code};${inv.sellerTaxId};${dateTime}`,
      totals: { ht: '', tva: '', ttc: ttc.toString() },
    };
  }
}

export interface HttpEmcfConfig {
  baseUrl: string;
  token: string;
  /** chemins paramétrables, à confirmer sur la spécification DGI */
  submitPath?: string;
  confirmPath?: (uid: string) => string;
  fetchImpl?: typeof fetch;
}

/**
 * Adaptateur HTTP du e-MCF : envoi de la facture (demande) puis confirmation (finalisation),
 * qui renvoie les éléments de sécurité. Le jeton reste côté serveur.
 */
export class HttpEmcf implements EInvoiceProvider {
  readonly name = 'RDC_EMCF';
  constructor(private readonly cfg: HttpEmcfConfig) {}

  private async call(method: string, path: string, body?: unknown) {
    const f = this.cfg.fetchImpl ?? fetch;
    const res = await f(this.cfg.baseUrl.replace(/\/$/, '') + path, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? Number(v) / 1 : v)),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`e-MCF ${res.status} : ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  async submit(inv: NormalizedInvoice): Promise<SecurityElements> {
    const errors = validateNormalizedInvoice(inv);
    if (errors.length) throw new Error(errors.join(' '));
    // Montants transmis en unités de la monnaie (francs congolais) : la DGI raisonne en FC.
    const toUnits = (v: bigint) => Number(v) / 100;
    const created = await this.call('POST', this.cfg.submitPath ?? '/api/invoice', {
      nif: inv.sellerTaxId,
      rn: inv.internalNumber,
      mode: 'ht',
      type: inv.type,
      reference: inv.reference ?? undefined,
      items: inv.items.map((it) => ({ name: it.name, price: toUnits(it.unitPriceTtc), quantity: Number(it.quantity), taxGroup: it.taxGroup })),
      client: inv.client,
      operator: inv.operator,
      payment: inv.payment.map((p) => ({ name: p.method, amount: toUnits(p.amount) })),
    });
    const uid = String(created.uid ?? '');
    if (!uid) throw new Error('e-MCF : identifiant de transaction absent.');
    const done = await this.call('PUT', (this.cfg.confirmPath ?? ((u: string) => `/api/invoice/${u}/confirm`))(uid));
    return {
      mode: 'PRODUCTION',
      uid,
      codeDefDgi: String(done.codeDEFDGI ?? done.codeDefDgi ?? done.code ?? ''),
      nim: String(done.nim ?? inv.nim ?? ''),
      counters: String(done.counters ?? ''),
      dateTime: String(done.dateTime ?? new Date().toISOString()),
      qrCode: String(done.qrCode ?? ''),
      totals: { ht: String(created.total_ht ?? ''), tva: String(created.total_tva ?? ''), ttc: String(created.total ?? '') },
    };
  }
}
