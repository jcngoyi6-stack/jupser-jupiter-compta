/**
 * Port PaymentProvider (docs/02, docs/09) et adaptateurs.
 * Règle : une notification de prestataire n'est jamais crue sur parole — le statut est revérifié
 * auprès de l'API du prestataire (ou la signature est contrôlée) avant de prolonger un abonnement.
 * TODO(JUPSER) : confirmer les points d'accès et paramètres avec les contrats signés (appel d'offres).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface CheckoutRequest {
  reference: string;
  /** Montant en unités mineures de la devise (centimes). */
  amountMinor: bigint;
  currency: string;
  description: string;
  customer: { name: string; email: string; phone?: string };
  returnUrl: string;
  notifyUrl: string;
  method?: 'MOBILE_MONEY' | 'CARTE' | 'VIREMENT';
}

export interface CheckoutResult { provider: string; reference: string; redirectUrl: string | null; instructions: string }
export type PaymentStatus = 'PAYE' | 'ECHEC' | 'EN_ATTENTE';
export interface VerifiedPayment { reference: string; status: PaymentStatus; amountMinor: bigint | null; currency: string | null; raw?: unknown }

export interface PaymentProvider {
  readonly code: string;
  /** Devises acceptées par le prestataire. */
  readonly currencies: string[];
  createCheckout(r: CheckoutRequest): Promise<CheckoutResult>;
  /** Extrait la référence d'une notification (corps + en-têtes), après contrôle de signature si le prestataire en fournit. */
  parseNotification(body: unknown, headers: Record<string, string | undefined>): string;
  /** Statut faisant foi, interrogé auprès du prestataire. */
  verify(reference: string): Promise<VerifiedPayment>;
}

export class PaymentError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'GNF', 'KMF']);
/** Montant « majeur » attendu par les API (entier pour les devises sans décimales). */
export function toMajor(minor: bigint, currency: string): string {
  if (ZERO_DECIMAL.has(currency)) return minor.toString();
  const s = minor.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}
export function fromMajor(v: string | number, currency: string): bigint {
  const s = String(v);
  if (ZERO_DECIMAL.has(currency)) return BigInt(Math.round(Number(s)));
  const [i, f = ''] = s.split('.');
  return BigInt((i ?? '0') + (f + '00').slice(0, 2));
}

const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** CinetPay (RDC, CI, SN, CM, BF, ML, TG, BJ, GN). */
export class CinetPayProvider implements PaymentProvider {
  readonly code = 'CINETPAY';
  readonly currencies = ['XOF', 'XAF', 'CDF', 'GNF', 'USD'];
  constructor(private readonly o: { apiKey: string; siteId: string; baseUrl?: string; fetch?: FetchLike }) {}
  private get base() { return this.o.baseUrl ?? 'https://api-checkout.cinetpay.com/v2'; }
  private get f(): FetchLike { return this.o.fetch ?? (fetch as unknown as FetchLike); }

  async createCheckout(r: CheckoutRequest): Promise<CheckoutResult> {
    if (!this.currencies.includes(r.currency)) throw new PaymentError('DEVISE_NON_SUPPORTEE', `${r.currency} non acceptée par CinetPay.`);
    const res = await this.f(`${this.base}/payment`, json({
      apikey: this.o.apiKey, site_id: this.o.siteId, transaction_id: r.reference, amount: Number(toMajor(r.amountMinor, r.currency)), currency: r.currency,
      description: r.description.replace(/[^\w\s-]/g, ' ').slice(0, 100), notify_url: r.notifyUrl, return_url: r.returnUrl,
      channels: r.method === 'CARTE' ? 'CREDIT_CARD' : r.method === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'ALL',
      customer_name: r.customer.name, customer_email: r.customer.email, customer_phone_number: r.customer.phone,
    }));
    const data = await res.json();
    if (!res.ok || String(data?.code) !== '201' || !data?.data?.payment_url) throw new PaymentError('PRESTATAIRE', `CinetPay : ${data?.message ?? res.status}`);
    return { provider: this.code, reference: r.reference, redirectUrl: data.data.payment_url, instructions: 'Redirection vers la page de paiement CinetPay (mobile money ou carte).' };
  }

  parseNotification(body: unknown): string {
    const ref = (body as { cpm_trans_id?: string } | null)?.cpm_trans_id;
    if (!ref) throw new PaymentError('NOTIFICATION_INVALIDE', 'Référence de transaction absente.');
    return ref;
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const res = await this.f(`${this.base}/payment/check`, json({ apikey: this.o.apiKey, site_id: this.o.siteId, transaction_id: reference }));
    const data = await res.json();
    const st = String(data?.data?.status ?? '');
    const status: PaymentStatus = st === 'ACCEPTED' ? 'PAYE' : st === 'REFUSED' || st === 'CANCELLED' ? 'ECHEC' : 'EN_ATTENTE';
    const currency = data?.data?.currency ?? null;
    return { reference, status, currency, amountMinor: data?.data?.amount !== undefined && currency ? fromMajor(data.data.amount, currency) : null, raw: data };
  }
}

/** Flutterwave (cartes et mobile money, pays non couverts par l'agrégateur principal). */
export class FlutterwaveProvider implements PaymentProvider {
  readonly code = 'FLUTTERWAVE';
  readonly currencies = ['USD', 'XOF', 'XAF', 'CDF', 'GNF', 'EUR'];
  constructor(private readonly o: { secretKey: string; webhookHash: string; baseUrl?: string; fetch?: FetchLike }) {}
  private get base() { return this.o.baseUrl ?? 'https://api.flutterwave.com/v3'; }
  private get f(): FetchLike { return this.o.fetch ?? (fetch as unknown as FetchLike); }
  private get auth() { return { Authorization: `Bearer ${this.o.secretKey}`, 'Content-Type': 'application/json' }; }

  async createCheckout(r: CheckoutRequest): Promise<CheckoutResult> {
    if (!this.currencies.includes(r.currency)) throw new PaymentError('DEVISE_NON_SUPPORTEE', `${r.currency} non acceptée par Flutterwave.`);
    const res = await this.f(`${this.base}/payments`, {
      method: 'POST', headers: this.auth,
      body: JSON.stringify({
        tx_ref: r.reference, amount: toMajor(r.amountMinor, r.currency), currency: r.currency, redirect_url: r.returnUrl,
        payment_options: r.method === 'MOBILE_MONEY' ? 'mobilemoneyfranco' : 'card',
        customer: { email: r.customer.email, name: r.customer.name, phonenumber: r.customer.phone }, customizations: { title: 'Jupiter Compta', description: r.description },
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.status !== 'success' || !data?.data?.link) throw new PaymentError('PRESTATAIRE', `Flutterwave : ${data?.message ?? res.status}`);
    return { provider: this.code, reference: r.reference, redirectUrl: data.data.link, instructions: 'Redirection vers la page de paiement Flutterwave.' };
  }

  parseNotification(body: unknown, headers: Record<string, string | undefined>): string {
    const h = headers['verif-hash'] ?? '';
    const a = Buffer.from(h);
    const b = Buffer.from(this.o.webhookHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PaymentError('SIGNATURE', 'Signature Flutterwave invalide.');
    const ref = (body as { data?: { tx_ref?: string } } | null)?.data?.tx_ref;
    if (!ref) throw new PaymentError('NOTIFICATION_INVALIDE', 'Référence absente.');
    return ref;
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const res = await this.f(`${this.base}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, { headers: this.auth });
    const data = await res.json();
    const st = String(data?.data?.status ?? '');
    const status: PaymentStatus = st === 'successful' ? 'PAYE' : st === 'failed' || st === 'cancelled' ? 'ECHEC' : 'EN_ATTENTE';
    const currency = data?.data?.currency ?? null;
    return { reference, status, currency, amountMinor: data?.data?.amount !== undefined && currency ? fromMajor(data.data.amount, currency) : null, raw: data };
  }
}

/** Prestataire de démonstration : notification signée HMAC-SHA256, statut porté par la notification. */
export class SimulatorProvider implements PaymentProvider {
  readonly code = 'SIMULATEUR';
  readonly currencies = ['USD', 'CDF', 'XOF', 'XAF', 'GNF', 'KMF', 'EUR'];
  private readonly last = new Map<string, PaymentStatus>();
  constructor(private readonly secret: string) {}
  async createCheckout(r: CheckoutRequest): Promise<CheckoutResult> {
    return { provider: this.code, reference: r.reference, redirectUrl: null, instructions: r.method === 'MOBILE_MONEY' ? 'Une demande de paiement est envoyée sur le téléphone (simulation).' : 'Redirection vers la page sécurisée du prestataire (simulation).' };
  }
  sign(body: unknown): string {
    return createHmac('sha256', this.secret).update(JSON.stringify(body)).digest('hex');
  }
  parseNotification(body: unknown, headers: Record<string, string | undefined>): string {
    const sig = headers['x-signature'] ?? '';
    const exp = this.sign(body);
    if (sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) throw new PaymentError('SIGNATURE', 'Signature du webhook invalide.');
    const b = body as { externalRef?: string; status?: PaymentStatus };
    if (!b?.externalRef || (b.status !== 'PAYE' && b.status !== 'ECHEC')) throw new PaymentError('NOTIFICATION_INVALIDE', 'Notification incomplète.');
    this.last.set(b.externalRef, b.status);
    return b.externalRef;
  }
  async verify(reference: string): Promise<VerifiedPayment> {
    return { reference, status: this.last.get(reference) ?? 'EN_ATTENTE', amountMinor: null, currency: null };
  }
}

/** Choix du prestataire selon le pays du client (agrégateur principal, sinon secours). */
export function pickProvider(providers: PaymentProvider[], country: string, currency: string, coverage: Record<string, string[]>): PaymentProvider | null {
  const eligible = providers.filter((p) => p.currencies.includes(currency));
  return eligible.find((p) => coverage[p.code]?.includes(country)) ?? eligible.find((p) => !coverage[p.code]) ?? eligible[0] ?? null;
}

/** Couverture annoncée (docs/09) — à mettre à jour selon les contrats. */
export const DEFAULT_COVERAGE: Record<string, string[]> = {
  CINETPAY: ['CD', 'CI', 'SN', 'CM', 'BF', 'ML', 'TG', 'BJ', 'GN'],
};
