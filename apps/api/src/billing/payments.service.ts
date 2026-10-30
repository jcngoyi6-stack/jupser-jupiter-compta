import { Injectable } from '@nestjs/common';
import { CinetPayProvider, DEFAULT_COVERAGE, FlutterwaveProvider, pickProvider, SimulatorProvider, type PaymentProvider } from '@jupiter/connectors';
import { config } from '../common/config';

/**
 * Prestataires de paiement configurés par variables d'environnement. Sans contrat (variables absentes),
 * seul le simulateur est actif — refusé en production.
 */
@Injectable()
export class PaymentsService {
  readonly simulator = new SimulatorProvider(config.webhookSecret);
  readonly providers: PaymentProvider[] = [];

  constructor() {
    const e = process.env;
    if (e.CINETPAY_API_KEY && e.CINETPAY_SITE_ID) this.providers.push(new CinetPayProvider({ apiKey: e.CINETPAY_API_KEY, siteId: e.CINETPAY_SITE_ID, baseUrl: e.CINETPAY_BASE_URL }));
    if (e.FLUTTERWAVE_SECRET_KEY && e.FLUTTERWAVE_WEBHOOK_HASH) this.providers.push(new FlutterwaveProvider({ secretKey: e.FLUTTERWAVE_SECRET_KEY, webhookHash: e.FLUTTERWAVE_WEBHOOK_HASH, baseUrl: e.FLUTTERWAVE_BASE_URL }));
  }

  choose(country: string, currency: string): PaymentProvider {
    const p = pickProvider(this.providers, country, currency, DEFAULT_COVERAGE);
    if (p) return p;
    if (config.isProd && process.env.ALLOW_PAYMENT_SIMULATOR !== 'true') throw new Error('AUCUN_PRESTATAIRE');
    return this.simulator;
  }

  byCode(code: string): PaymentProvider | null {
    const c = code.toUpperCase();
    if (c === 'SIMULATOR' || c === 'SIMULATEUR') return config.isProd && process.env.ALLOW_PAYMENT_SIMULATOR !== 'true' ? null : this.simulator;
    return this.providers.find((p) => p.code === c) ?? null;
  }
}
