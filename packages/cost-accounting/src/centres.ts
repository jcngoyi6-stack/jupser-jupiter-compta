/**
 * Méthode des centres d'analyse (sections homogènes) : répartition primaire, répartition secondaire
 * (en cascade ou avec prestations réciproques résolues algébriquement), unités d'œuvre et taux de frais.
 */

export type CentreKind = 'PRINCIPAL' | 'AUXILIAIRE' | 'STRUCTURE';
export type CentreFunction = 'APPROVISIONNEMENT' | 'PRODUCTION' | 'DISTRIBUTION' | 'ADMINISTRATION' | 'AUTRE';

export interface Centre {
  code: string;
  label: string;
  kind: CentreKind;
  fn?: CentreFunction;
  /** Nature de l'unité d'œuvre (« heure machine », « kg acheté ») ou assiette de frais (« 100 F de CA »). */
  unit?: string;
  /** Assiette en valeur (taux de frais) plutôt qu'en quantité. */
  valueBase?: boolean;
}

/** Clé de répartition d'une charge indirecte : pourcentages (ou unités) par centre. */
export interface DistributionKey { charge: string; amount: number; shares: Record<string, number> }

export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    if (Math.abs(m[piv]![col]!) < 1e-12) throw new Error('SYSTEME_INDETERMINE');
    [m[col], m[piv]] = [m[piv]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Répartition primaire : chaque charge est ventilée au prorata de sa clé (somme des parts quelconque). */
export function primaryDistribution(centres: Centre[], keys: DistributionKey[], direct: Record<string, number> = {}) {
  const totals: Record<string, number> = Object.fromEntries(centres.map((c) => [c.code, direct[c.code] ?? 0]));
  const lines = keys.map((k) => {
    const sum = Object.values(k.shares).reduce((s, v) => s + v, 0);
    if (sum <= 0) throw new Error(`CLE_VIDE:${k.charge}`);
    const alloc: Record<string, number> = {};
    for (const [code, share] of Object.entries(k.shares)) {
      if (!(code in totals)) throw new Error(`CENTRE_INCONNU:${code}`);
      alloc[code] = (k.amount * share) / sum;
      totals[code] = (totals[code] ?? 0) + alloc[code]!;
    }
    return { charge: k.charge, amount: k.amount, alloc };
  });
  return { lines, totals };
}

/**
 * Répartition secondaire. `transfers[aux][centre]` = part (en %) des charges du centre auxiliaire cédée au centre.
 * Les prestations réciproques sont résolues par un système d'équations :
 * T(aux) = primaire(aux) + Σ part(autre aux → aux) × T(autre aux).
 */
export function secondaryDistribution(centres: Centre[], primary: Record<string, number>, transfers: Record<string, Record<string, number>>) {
  const aux = centres.filter((c) => c.kind !== 'PRINCIPAL').map((c) => c.code).filter((c) => transfers[c]);
  for (const a of aux) {
    const s = Object.values(transfers[a]!).reduce((x, v) => x + v, 0);
    if (Math.abs(s - 100) > 1e-6) throw new Error(`CLE_SECONDAIRE_NON_100:${a}`);
  }
  const n = aux.length;
  const A = aux.map((ai, i) => aux.map((aj, j) => (i === j ? 1 : 0) - (i === j ? 0 : (transfers[aj]![ai] ?? 0) / 100)));
  const T = n ? solveLinear(A, aux.map((a) => primary[a] ?? 0)) : [];
  const totalOf = Object.fromEntries(aux.map((a, i) => [a, T[i]!]));
  const rows = aux.map((a) => {
    const alloc: Record<string, number> = { [a]: -totalOf[a]! };
    for (const [code, pct] of Object.entries(transfers[a]!)) alloc[code] = (alloc[code] ?? 0) + (totalOf[a]! * pct) / 100;
    return { centre: a, total: totalOf[a]!, alloc };
  });
  const after: Record<string, number> = { ...primary };
  for (const r of rows) for (const [code, v] of Object.entries(r.alloc)) after[code] = (after[code] ?? 0) + v;
  for (const a of aux) after[a] = Math.abs(after[a]!) < 1e-6 ? 0 : after[a]!;
  return { auxiliaryTotals: totalOf, rows, totals: after };
}

/** Coût de l'unité d'œuvre (ou taux de frais) des centres principaux. */
export function unitCosts(centres: Centre[], totals: Record<string, number>, units: Record<string, number>) {
  return centres.filter((c) => c.kind === 'PRINCIPAL').map((c) => {
    const qty = units[c.code] ?? 0;
    const total = totals[c.code] ?? 0;
    return { centre: c.code, label: c.label, unit: c.unit ?? '', total, quantity: qty, unitCost: qty > 0 ? total / qty : null, valueBase: !!c.valueBase };
  });
}

/** Tableau de répartition complet. */
export function distributionTable(p: { centres: Centre[]; keys: DistributionKey[]; direct?: Record<string, number>; transfers: Record<string, Record<string, number>>; units: Record<string, number> }) {
  const prim = primaryDistribution(p.centres, p.keys, p.direct);
  const sec = secondaryDistribution(p.centres, prim.totals, p.transfers);
  return { primary: prim, secondary: sec, unitCosts: unitCosts(p.centres, sec.totals, p.units) };
}
