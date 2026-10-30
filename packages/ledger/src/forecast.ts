/** Prévision de trésorerie (13 semaines / 12 mois) : encaissements et décaissements échéancés. */
export interface CashItem {
  date: string; // échéance
  amount: bigint; // + encaissement, – décaissement
  category: string; // CLIENTS, FOURNISSEURS, PAIE, FISCAL, EMPRUNT, AUTRE
  label: string;
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

export function weeklyForecast(opening: bigint, items: CashItem[], start: string, weeks = 13) {
  const rows = [];
  let bal = opening;
  // les échéances dépassées sont rattachées à la première semaine
  for (let w = 0; w < weeks; w++) {
    const from = addDays(start, w * 7);
    const to = addDays(start, w * 7 + 6);
    const inWeek = items.filter((i) => (w === 0 ? i.date <= to : i.date >= from && i.date <= to));
    const receipts = inWeek.filter((i) => i.amount > 0n).reduce((s, i) => s + i.amount, 0n);
    const payments = inWeek.filter((i) => i.amount < 0n).reduce((s, i) => s - i.amount, 0n);
    const byCategory: Record<string, bigint> = {};
    for (const i of inWeek) byCategory[i.category] = (byCategory[i.category] ?? 0n) + i.amount;
    const openingBal = bal;
    bal = bal + receipts - payments;
    rows.push({ week: w + 1, from, to, opening: openingBal, receipts, payments, byCategory, closing: bal, tension: bal < 0n });
  }
  return rows;
}

export function monthlyForecast(opening: bigint, items: CashItem[], startMonth: string, months = 12) {
  const rows = [];
  let bal = opening;
  let [y, m] = startMonth.split('-').map(Number) as [number, number];
  for (let k = 0; k < months; k++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const inMonth = items.filter((i) => (k === 0 ? i.date.slice(0, 7) <= key : i.date.slice(0, 7) === key));
    const net = inMonth.reduce((s, i) => s + i.amount, 0n);
    const o = bal;
    bal += net;
    rows.push({ month: key, opening: o, net, closing: bal, tension: bal < 0n });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return rows;
}
