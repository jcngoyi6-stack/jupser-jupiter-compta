/**
 * Port FxRateProvider (docs/05 §5) : récupération quotidienne des cours, chaîne de secours, saisie manuelle tracée.
 * Les cours restent des chaînes décimales (aucun flottant).
 */
import { FIXED_PEGS, type FxRate } from '@jupiter/fx';
import type { FetchLike } from './payments';

export interface FxRateProvider {
  readonly code: string;
  /** Cours du jour pour la devise de tenue `quote` (1 devise étrangère = rate quote). */
  fetchRates(quote: string, date: string): Promise<FxRate[]>;
}

/** Parités fixes officielles (XOF/XAF/KMF contre EUR). */
export class FixedPegProvider implements FxRateProvider {
  readonly code = 'PARITE_FIXE';
  async fetchRates(quote: string, date: string): Promise<FxRate[]> {
    const p = FIXED_PEGS[quote];
    return p ? [{ currency: p.base, quote, rate: p.rate, date, source: p.source, type: 'OFFICIEL' }] : [];
  }
}

const DECIMAL = /^\d+(\.\d{1,10})?$/;
export function normalizeRate(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return DECIMAL.test(s) && Number(s) > 0 ? s : null;
}

/**
 * Fournisseur HTTP générique (banque centrale ou source commerciale) : l'URL renvoie du JSON,
 * `extract` le transforme en { devise: cours }. Sert pour la BCC (RDC), la BCEAO, la BEAC, la BCRG.
 * TODO(JUPSER) : brancher le format exact publié par chaque banque centrale (ou un flux convenu).
 */
export class HttpJsonFxProvider implements FxRateProvider {
  constructor(
    readonly code: string,
    private readonly o: { url: (quote: string, date: string) => string; extract: (json: any) => Record<string, unknown>; source: string; quotes: string[]; type?: 'OFFICIEL' | 'MARCHE'; fetch?: FetchLike },
  ) {}
  async fetchRates(quote: string, date: string): Promise<FxRate[]> {
    if (!this.o.quotes.includes(quote)) return [];
    const res = await (this.o.fetch ?? (fetch as unknown as FetchLike))(this.o.url(quote, date));
    if (!res.ok) throw new Error(`${this.code} : HTTP ${res.status}`);
    const out: FxRate[] = [];
    for (const [currency, v] of Object.entries(this.o.extract(await res.json()))) {
      const rate = normalizeRate(v);
      if (rate && currency !== quote) out.push({ currency, quote, rate, date, source: this.o.source, type: this.o.type ?? 'OFFICIEL' });
    }
    return out;
  }
}

/** Banque centrale du Congo — flux JSON convenu { date, rates: { USD: "2850.12", EUR: "…" } }. */
export const bccProvider = (url: string, f?: FetchLike) =>
  new HttpJsonFxProvider('BCC', { url: (_q, d) => `${url}${url.includes('?') ? '&' : '?'}date=${d}`, extract: (j) => j?.rates ?? {}, source: 'Banque centrale du Congo (cours indicatif)', quotes: ['CDF'], fetch: f });

/** Interroge les fournisseurs dans l'ordre ; le premier qui répond pour une devise l'emporte. Erreurs collectées. */
export async function fetchWithFallback(providers: FxRateProvider[], quote: string, date: string) {
  const rates = new Map<string, FxRate>();
  const errors: { provider: string; message: string }[] = [];
  for (const p of providers) {
    try {
      for (const r of await p.fetchRates(quote, date)) if (!rates.has(r.currency)) rates.set(r.currency, r);
    } catch (e) {
      errors.push({ provider: p.code, message: (e as Error).message });
    }
  }
  return { rates: [...rates.values()], errors };
}

/** Saisie manuelle en dernier recours, toujours tracée (utilisateur + motif). */
export function manualRate(p: { currency: string; quote: string; rate: string; date: string; userName: string; reason: string }): FxRate {
  const rate = normalizeRate(p.rate);
  if (!rate) throw new Error('COURS_INVALIDE');
  if (p.reason.trim().length < 5) throw new Error('MOTIF_OBLIGATOIRE');
  return { currency: p.currency, quote: p.quote, rate, date: p.date, source: `Saisie manuelle — ${p.userName} : ${p.reason.trim()}`, type: 'MANUEL' };
}
