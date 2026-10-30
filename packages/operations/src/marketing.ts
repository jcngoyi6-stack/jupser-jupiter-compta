import { createHash, randomBytes } from 'node:crypto';

/** Marketing : segmentation RFM, consentement et désinscription, fidélité. */
export interface Customer {
  id: string;
  lastPurchase: string | null;
  frequency: number;
  monetary: bigint;
}

export function rfm(customers: Customer[], asOf: string) {
  const score = (v: number, thresholds: number[]) => 1 + thresholds.filter((t) => v >= t).length;
  return customers.map((c) => {
    const recencyDays = c.lastPurchase ? Math.floor((Date.parse(asOf) - Date.parse(c.lastPurchase)) / 86_400_000) : 9999;
    const r = 6 - score(recencyDays, [30, 90, 180, 365]);
    const f = score(c.frequency, [2, 4, 8, 15]);
    const m = score(Number(c.monetary / 100n), [100_000, 500_000, 2_000_000, 10_000_000]);
    const segment = r >= 4 && f >= 4 ? 'CHAMPIONS' : r >= 4 ? 'RECENTS' : f >= 4 ? 'FIDELES_A_RISQUE' : r <= 2 ? 'INACTIFS' : 'A_DEVELOPPER';
    return { id: c.id, r, f, m, segment, recencyDays };
  });
}

/** Seuls les contacts ayant consenti et non désinscrits reçoivent une campagne. */
export function eligibleRecipients<T extends { consent: boolean; unsubscribed: boolean; phone?: string | null; email?: string | null }>(contacts: T[], channel: 'SMS' | 'WHATSAPP' | 'EMAIL') {
  return contacts.filter((c) => c.consent && !c.unsubscribed && (channel === 'EMAIL' ? !!c.email : !!c.phone));
}

export function unsubscribeToken(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 40);
}

export function personalize(template: string, vars: Record<string, string>, unsubscribeUrl: string, channel: 'SMS' | 'WHATSAPP' | 'EMAIL') {
  const body = template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '');
  const stop = channel === 'EMAIL' ? `\n\nSe désinscrire : ${unsubscribeUrl}` : ` STOP : ${unsubscribeUrl}`;
  return body + stop;
}

/** Fidélité : 1 point par tranche d'achat (paramétrable), plafonné par opération. */
export function loyaltyPoints(amountMinor: bigint, perPointMinor: bigint, maxPerOperation = 10_000): number {
  if (perPointMinor <= 0n) return 0;
  const p = Number(amountMinor / perPointMinor);
  return Math.min(p, maxPerOperation);
}
