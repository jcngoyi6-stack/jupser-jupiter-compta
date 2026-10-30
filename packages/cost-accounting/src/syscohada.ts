/**
 * Journal de la comptabilité analytique de gestion en classe 9 (SYSCOHADA révisé, comptes 92 à 99).
 * L'AUDCIF laisse les subdivisions à l'initiative de l'entité : le découpage ci-dessous est une proposition
 * de Jupiter Compta, modifiable (TODO(expert-comptable) : validation du plan analytique de chaque client).
 */
import type { Centre } from './centres';
import type { computeCosts } from './costs';
import type { IncorporationResult } from './incorporation';

export const CAGE_ACCOUNTS: Record<string, string> = {
  '921': 'Stocks réfléchis',
  '926': 'Charges réfléchies',
  '927': 'Produits réfléchis',
  '940': 'Charges directes à imputer',
  '941': 'Coûts d’achat',
  '942': 'Coûts de production',
  '943': 'Coûts de distribution',
  '944': 'Coûts de revient des produits vendus',
  '951': 'Stocks de matières et fournitures',
  '952': 'Stocks d’en-cours',
  '953': 'Sous-produits et déchets',
  '955': 'Stocks de produits',
  '971': 'Charges non incorporables',
  '972': 'Charges supplétives',
  '973': 'Différences sur charges calculées',
  '975': 'Différences d’inventaire',
  '976': 'Produits non incorporés',
  '977': 'Différences d’arrondi et de rapprochement',
  '978': 'Écarts de variation des stocks',
  '981': 'Résultats analytiques par produit',
};

/** Compte de reclassement (93) d'un centre : 93 + rang sur deux chiffres. */
export const centreAccount = (centres: Centre[], code: string) => `93${String(centres.findIndex((c) => c.code === code) + 1).padStart(2, '0')}`;

export interface CageLine { account: string; label: string; debit: number; credit: number; analytic?: string }
export interface CageEntry { ref: string; label: string; lines: CageLine[] }

const r2 = (v: number) => Math.round(v * 100) / 100;

function entry(ref: string, label: string, raw: CageLine[]): CageEntry {
  const lines = raw
    .map((l) => {
      const net = l.debit - l.credit;
      return { ...l, debit: net > 0 ? r2(net) : 0, credit: net < 0 ? r2(-net) : 0 };
    })
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  const gap = r2(d - c);
  if (gap !== 0) lines.push({ account: '977', label: CAGE_ACCOUNTS['977']!, debit: gap < 0 ? -gap : 0, credit: gap > 0 ? gap : 0 });
  return { ref, label, lines };
}

const L = (account: string, amount: number, label?: string, analytic?: string): CageLine =>
  ({ account, label: label ?? CAGE_ACCOUNTS[account] ?? account, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0, analytic });

export function cageJournal(p: {
  centres: Centre[];
  incorporation: IncorporationResult;
  primaryTotals: Record<string, number>;
  secondaryRows: { centre: string; alloc: Record<string, number> }[];
  costs: ReturnType<typeof computeCosts>;
  /** Fonction (achat, production, distribution) de chaque centre principal pour l'imputation. */
}) {
  const { centres, incorporation: inc, costs } = p;
  const acc = (code: string) => centreAccount(centres, code);
  const primaryTotal = Object.values(p.primaryTotals).reduce((s, v) => s + v, 0);
  const entries: CageEntry[] = [];

  // 1. Reprise des charges de la comptabilité générale
  entries.push(entry('CAGE-01', 'Reprise des charges et différences d’incorporation', [
    ...Object.entries(p.primaryTotals).map(([c, v]) => L(acc(c), v, `Centre ${c}`, c)),
    L('940', inc.incorporable - primaryTotal),
    L('971', inc.nonIncorporableTotal),
    L('926', -inc.generalCharges),
    L('972', -inc.supplementaryTotal),
    L('973', -inc.calculatedDifference),
  ]));

  // 2. Répartition secondaire
  entries.push(entry('CAGE-02', 'Répartition secondaire des centres auxiliaires', p.secondaryRows.flatMap((r) => Object.entries(r.alloc).map(([c, v]) => L(acc(c), v, `Centre ${c}`, c)))));

  // 3. Stocks initiaux
  const opening: CageLine[] = [];
  for (const m of costs.materials) opening.push(L('951', m.inventory.opening.value, undefined, m.code));
  for (const pr of costs.products) {
    opening.push(L('955', pr.inventory.opening.value, undefined, pr.code));
    opening.push(L('942', pr.productionCost.wipOpening, 'En-cours initial', pr.code));
  }
  const openingTotal = opening.reduce((s, l) => s + l.debit - l.credit, 0);
  entries.push(entry('CAGE-03', 'Stocks et en-cours initiaux', [...opening, L('921', -openingTotal)]));

  // 4. Coûts d'achat et entrées en stock
  const purchase: CageLine[] = [];
  for (const m of costs.materials) {
    const pc = m.purchaseCost;
    const direct = pc.price + pc.direct.reduce((s, d) => s + d.amount, 0);
    purchase.push(L('941', pc.total, undefined, m.code), L('940', -direct), ...pc.centres.map((c) => L(acc(c.centre), -c.amount, `Centre ${c.centre}`, c.centre)));
    purchase.push(L('951', pc.total, undefined, m.code), L('941', -pc.total, undefined, m.code));
  }
  entries.push(entry('CAGE-04', 'Coûts d’achat et entrées en stock', purchase));

  // 5. Coûts de production et entrées en stock de produits
  const prod: CageLine[] = [];
  for (const pr of costs.products) {
    const pc = pr.productionCost;
    for (const m of pc.materials) prod.push(L('942', m.amount, `Consommation ${m.material}`, pr.code), L('951', -m.amount, undefined, m.material));
    const direct = pc.direct.reduce((s, d) => s + d.amount, 0) + pc.wasteTreatment;
    prod.push(L('942', direct, 'Charges directes de production', pr.code), L('940', -direct));
    for (const c of pc.centres) prod.push(L('942', c.amount, `Centre ${c.centre}`, pr.code), L(acc(c.centre), -c.amount, `Centre ${c.centre}`, c.centre));
    prod.push(L('952', pc.wipClosing, 'En-cours final', pr.code), L('942', -pc.wipClosing, 'En-cours final', pr.code));
    prod.push(L('953', pc.byProduct, undefined, pr.code), L('942', -pc.byProduct, 'Sous-produits', pr.code));
    prod.push(L('955', pc.total, undefined, pr.code), L('942', -pc.total, 'Production de la période', pr.code));
  }
  entries.push(entry('CAGE-05', 'Coûts de production', prod));

  // 6. Coûts de revient, ventes et résultats analytiques
  const res: CageLine[] = [];
  for (const pr of costs.products) {
    const fc = pr.fullCost;
    res.push(L('944', fc.costOfSales, 'Coût de production des produits vendus', pr.code), L('955', -fc.costOfSales, undefined, pr.code));
    const ddirect = fc.distribution.direct.reduce((s, d) => s + d.amount, 0);
    res.push(L('943', ddirect, undefined, pr.code), L('940', -ddirect));
    for (const c of fc.distribution.centres) res.push(L('943', c.amount, undefined, pr.code), L(acc(c.centre), -c.amount, `Centre ${c.centre}`, c.centre));
    res.push(L('944', fc.distribution.total, 'Coût de distribution', pr.code), L('943', -fc.distribution.total, undefined, pr.code));
    res.push(L('981', fc.total, `Coût de revient ${pr.code}`, pr.code), L('944', -fc.total, undefined, pr.code));
    res.push(L('927', pr.revenue, 'Ventes réfléchies', pr.code), L('981', -pr.revenue, `Ventes ${pr.code}`, pr.code));
  }
  entries.push(entry('CAGE-06', 'Coûts de revient et résultats analytiques', res));

  // 7. Différences d'inventaire
  const invDiff: CageLine[] = [];
  for (const m of costs.materials) if (m.inventory.inventoryDifference) invDiff.push(L('951', m.inventory.inventoryDifference.value, undefined, m.code), L('975', -m.inventory.inventoryDifference.value));
  for (const pr of costs.products) if (pr.inventory.inventoryDifference) invDiff.push(L('955', pr.inventory.inventoryDifference.value, undefined, pr.code), L('975', -pr.inventory.inventoryDifference.value));
  if (invDiff.length) entries.push(entry('CAGE-07', 'Différences d’inventaire', invDiff));

  // 8. Soldes résiduels des centres et des charges directes (différences d'arrondi ou de rapprochement)
  const balance = trialBalance(entries);
  const residual = balance.filter((b) => (b.account.startsWith('93') || b.account === '940') && Math.abs(b.balance) >= 0.01);
  if (residual.length) entries.push(entry('CAGE-08', 'Solde des centres et charges directes non imputés', [
    ...residual.map((b) => L(b.account, -b.balance, b.label)),
    L('977', residual.reduce((s, b) => s + b.balance, 0)),
  ]));
  return { entries, balance: trialBalance(entries), accounts: CAGE_ACCOUNTS };
}

export function trialBalance(entries: CageEntry[]) {
  const map = new Map<string, { account: string; label: string; debit: number; credit: number }>();
  for (const e of entries) for (const l of e.lines) {
    const k = map.get(l.account) ?? { account: l.account, label: CAGE_ACCOUNTS[l.account] ?? l.label, debit: 0, credit: 0 };
    k.debit += l.debit;
    k.credit += l.credit;
    map.set(l.account, k);
  }
  return [...map.values()].sort((a, b) => a.account.localeCompare(b.account)).map((r) => ({ ...r, debit: r2(r.debit), credit: r2(r.credit), balance: r2(r.debit - r.credit) }));
}
