/**
 * Méthode ABC (comptabilité par activités) : ressources → activités → inducteurs (regroupés en centres
 * de regroupement) → coût des produits.
 */

export interface Activity { code: string; label: string; cost: number; driver: string }
export interface DriverVolume { driver: string; label?: string; volume: number }

export function driverCosts(activities: Activity[], volumes: DriverVolume[]) {
  const groups = new Map<string, { activities: string[]; cost: number }>();
  for (const a of activities) {
    const g = groups.get(a.driver) ?? { activities: [], cost: 0 };
    g.activities.push(a.code);
    g.cost += a.cost;
    groups.set(a.driver, g);
  }
  return [...groups.entries()].map(([driver, g]) => {
    const v = volumes.find((x) => x.driver === driver);
    if (!v || v.volume <= 0) throw new Error(`VOLUME_INDUCTEUR_MANQUANT:${driver}`);
    return { driver, label: v.label ?? driver, activities: g.activities, cost: g.cost, volume: v.volume, unitCost: g.cost / v.volume };
  });
}

/** Ressources → activités : matrice de consommation (pourcentages par activité) appliquée aux charges indirectes. */
export function resourcesToActivities(resources: { label: string; amount: number; shares: Record<string, number> }[]) {
  const out: Record<string, number> = {};
  for (const r of resources) {
    const s = Object.values(r.shares).reduce((x, v) => x + v, 0);
    if (s <= 0) throw new Error(`CLE_VIDE:${r.label}`);
    for (const [a, v] of Object.entries(r.shares)) out[a] = (out[a] ?? 0) + (r.amount * v) / s;
  }
  return out;
}

export interface AbcProduct { code: string; label?: string; quantity: number; directCosts: number; drivers: Record<string, number>; revenue?: number }

export function abcProductCosts(activities: Activity[], volumes: DriverVolume[], products: AbcProduct[]) {
  const unit = driverCosts(activities, volumes);
  const rate = new Map(unit.map((u) => [u.driver, u.unitCost]));
  const rows = products.map((p) => {
    const indirect = Object.entries(p.drivers).map(([d, q]) => {
      if (!rate.has(d)) throw new Error(`INDUCTEUR_INCONNU:${d}`);
      return { driver: d, quantity: q, unitCost: rate.get(d)!, amount: q * rate.get(d)! };
    });
    const indirectTotal = indirect.reduce((s, i) => s + i.amount, 0);
    const total = p.directCosts + indirectTotal;
    return { code: p.code, label: p.label, quantity: p.quantity, directCosts: p.directCosts, indirect, indirectTotal, total, unitCost: p.quantity ? total / p.quantity : null, result: p.revenue === undefined ? null : p.revenue - total };
  });
  const absorbed = rows.reduce((s, r) => s + r.indirectTotal, 0);
  const pool = activities.reduce((s, a) => s + a.cost, 0);
  return { drivers: unit, products: rows, unabsorbed: pool - absorbed };
}
