import { applyRate } from './rates';
import { valueOf, MILLI } from './stock';

/** Production : nomenclature, ordre de fabrication, fiche de coût de revient. */
export interface BomLine {
  itemId: string;
  qtyMilli: bigint; // pour une unité de produit
}
export interface RoutingStep {
  poste: string;
  minutes: number; // par unité
  hourlyRate: bigint; // coût horaire (unités mineures)
}

export function explode(components: BomLine[], qtyMilli: bigint): BomLine[] {
  return components.map((c) => ({ itemId: c.itemId, qtyMilli: (c.qtyMilli * qtyMilli) / MILLI }));
}

export function costSheet(
  components: BomLine[],
  routing: RoutingStep[],
  qtyMilli: bigint,
  unitCostOf: (itemId: string) => bigint,
  overheadRate: string,
) {
  const materials = explode(components, qtyMilli).map((c) => ({ ...c, unitCost: unitCostOf(c.itemId), cost: valueOf(c.qtyMilli, unitCostOf(c.itemId)) }));
  const materialCost = materials.reduce((s, m) => s + m.cost, 0n);
  const labour = routing.map((r) => {
    const minutes = BigInt(Math.round(r.minutes * 1000)) * qtyMilli / MILLI; // milli-minutes
    return { poste: r.poste, cost: (r.hourlyRate * minutes + 30_000n) / 60_000n };
  });
  const labourCost = labour.reduce((s, l) => s + l.cost, 0n);
  const overhead = applyRate(materialCost + labourCost, overheadRate);
  const total = materialCost + labourCost + overhead;
  return { materials, materialCost, labour, labourCost, overhead, total, unitCost: qtyMilli > 0n ? (total * MILLI + qtyMilli / 2n) / qtyMilli : 0n };
}

/** Besoins nets simples : besoin brut – stock disponible, jamais négatif. */
export function netRequirements(needs: BomLine[], available: (itemId: string) => bigint) {
  return needs.map((n) => {
    const net = n.qtyMilli - available(n.itemId);
    return { itemId: n.itemId, grossMilli: n.qtyMilli, netMilli: net > 0n ? net : 0n };
  });
}
