import { describe, expect, it } from 'vitest';
import {
  accumulatedAt, assetDotationForYear, balanceGap, budgetReport, checkBudget, componentSchedule, days360, depreciationAccounts, disposalLines, dotationLines,
  detectBalanceColumns, monthlyForecast, parseBalance, parseBankStatement, parseDelimited, parseJournal, proposeMatches, reconciliationStatement, suggestMapping, toIsoDate, weeklyForecast,
  type AssetDef,
} from './index';

describe('immobilisations', () => {
  it('amortit en linéaire avec prorata temporis (360 jours)', () => {
    expect(days360('2026-04-01', '2026-12-30')).toBe(270);
    const rows = componentSchedule({ label: 'Véhicule', cost: 12_000_000n, method: 'LINEAIRE', years: 5 }, '2026-04-01');
    expect(rows.map((r) => r.dotation)).toEqual([1_800_000n, 2_400_000n, 2_400_000n, 2_400_000n, 2_400_000n, 600_000n]);
    expect(rows.at(-1)!.vnc).toBe(0n);
  });
  it('amortit en dégressif avec bascule en linéaire', () => {
    const rows = componentSchedule({ label: 'Machine', cost: 1_000_000n, method: 'DEGRESSIF', years: 5, degressiveCoefficient: '2' }, '2026-01-01');
    expect(rows.map((r) => r.dotation)).toEqual([400_000n, 240_000n, 144_000n, 108_000n, 108_000n]);
    expect(() => componentSchedule({ label: 'x', cost: 1n, method: 'DEGRESSIF', years: 5 }, '2026-01-01')).toThrow();
  });
  it("amortit par unités d'œuvre et gère les composants non amortissables", () => {
    const rows = componentSchedule({ label: 'Presse', cost: 900n, method: 'UNITES_OEUVRE', years: 0, totalUnits: 90, unitsByYear: { '2026': 30, '2027': 70 } }, '2026-01-01');
    expect(rows.map((r) => r.dotation)).toEqual([300n, 600n]);
    expect(componentSchedule({ label: 'Terrain', cost: 5n, method: 'NON_AMORTISSABLE', years: 0 }, '2026-01-01')).toEqual([]);
    expect(() => componentSchedule({ label: 'x', cost: 9n, method: 'UNITES_OEUVRE', years: 0 }, '2026-01-01')).toThrow();
  });
  const asset: AssetDef = {
    account: '245100',
    inServiceDate: '2026-01-01',
    components: [
      { label: 'Carrosserie', cost: 800_000n, method: 'LINEAIRE', years: 5 },
      { label: 'Moteur', cost: 200_000n, method: 'LINEAIRE', years: 2 },
    ],
  };
  it('approche par composants et écriture de dotation équilibrée', () => {
    expect(assetDotationForYear(asset, 2026)).toBe(160_000n + 100_000n);
    expect(depreciationAccounts('245100')).toEqual({ amort: '284510', dotation: '681300' });
    expect(depreciationAccounts('213000').dotation).toBe('681200');
    const lines = dotationLines([asset], 2026);
    expect(balanceGap(lines)).toBe(0n);
    expect(dotationLines([asset], 2040)).toEqual([]);
  });
  it('cession : VNC en 812, prix en 822, plus-value calculée', () => {
    expect(accumulatedAt(asset, '2027-06-30')).toBe(160_000n + 80_000n + 100_000n + 50_000n);
    const d = disposalLines(asset, '2027-06-30', 700_000n, '485100', 260_000n);
    expect(balanceGap(d.lines)).toBe(0n);
    expect(d.vnc).toBe(1_000_000n - d.accumulated);
    expect(d.gainOrLoss).toBe(700_000n - d.vnc);
    expect(d.lines.find((l) => l.account === '812000')!.debit).toBe(d.vnc);
    const free = disposalLines({ account: '213000', inServiceDate: '2026-01-01', components: [{ label: 'L', cost: 100n, method: 'NON_AMORTISSABLE', years: 0 }] }, '2026-02-01', 0n, '485100', 0n);
    expect(free.lines.map((l) => l.account)).toEqual(['811000', '213000']);
  });
});

describe('imports', () => {
  it('reconnaît une balance à 6 colonnes et contrôle l’équilibre', () => {
    const rows = parseDelimited('﻿Compte;Intitulé;Débit ouv;Crédit ouv;Débit mvt;Crédit mvt;Solde débit;Solde crédit\n521100;Banque;0;0;10;0;10,00;0\n101300;Capital;0;0;0;10;0;10\nTOTAL;;;;;;10;10');
    expect(detectBalanceColumns(rows[0]!).layout).toBe('6');
    const r = parseBalance(rows);
    expect(r.lines).toHaveLength(2);
    expect(r.errors).toEqual([]);
    expect(parseBalance(parseDelimited('compte,debit,credit\n5711,5,0')).errors[0]).toMatch(/déséquilibrée/);
    expect(() => detectBalanceColumns(['a', 'b'])).toThrow();
    expect(parseBalance([['Compte', 'Débit', 'Crédit'], ['571', 'abc', '0']]).errors[0]).toMatch(/Ligne 2/);
    expect(() => parseBalance([])).toThrow();
    expect(parseDelimited('')).toEqual([]);
  });
  it('propose une correspondance vers le plan à 6 chiffres', () => {
    const chart = [
      { number: '571100', official: '5711', label: 'Caisse en monnaie nationale', imputable: true },
      { number: '601100', official: '6011', label: 'Achats de marchandises dans la Région', imputable: true },
      { number: '622200', official: '6222', label: 'Locations de bâtiments', imputable: true },
    ];
    expect(suggestMapping({ account: '5711', label: 'Caisse' }, chart).target).toBe('571100');
    expect(suggestMapping({ account: '601999', label: 'Marchandises' }, chart)).toMatchObject({ target: '601100', reason: 'Préfixe 601' });
    expect(suggestMapping({ account: 'X1', label: 'Loyer locations bâtiments' }, chart).target).toBe('622200');
    expect(suggestMapping({ account: 'X1', label: '' }, chart).target).toBeNull();
    expect(suggestMapping({ account: 'X1', label: '' }, chart, { X1: '571100' }).confidence).toBe(1);
  });
  it('importe un journal d’écritures regroupé par pièce et un relevé bancaire', () => {
    const groups = parseJournal(parseDelimited('Journal;Date;Pièce;Compte;Libellé;Débit;Crédit\nACH;05/02/2026;F1;6011;Achat;100;0\nACH;05/02/2026;F1;4011;Fourn;0;100'));
    expect(groups).toHaveLength(1);
    expect(groups[0]![0]!.account).toBe('601100');
    expect(() => parseJournal([['a']])).toThrow();
    expect(() => parseJournal([])).toThrow();
    expect(toIsoDate('2026-02-05T00:00')).toBe('2026-02-05');
    expect(toIsoDate('5-2-26')).toBe('2026-02-05');
    expect(() => toIsoDate('hier')).toThrow();
    const st = parseBankStatement(parseDelimited('Date;Libellé;Débit;Crédit;Référence\n02/03/2026;VIR CLIENT FA-1;0;500;T1\n03/03/2026;LOYER;200;0;'));
    expect(st.map((s) => s.amount)).toEqual([50000n, -20000n]);
    expect(parseBankStatement(parseDelimited('date,label,amount\n2026-03-01,x,-5'))[0]!.amount).toBe(-500n);
    expect(parseBankStatement([])).toEqual([]);
  });
});

describe('rapprochement bancaire', () => {
  const st = [
    { date: '2026-03-02', label: 'VIR CLIENT FA-1', amount: 500n, reference: 'T1' },
    { date: '2026-03-05', label: 'FRAIS', amount: -10n },
  ];
  const book = [
    { id: 'b1', date: '2026-03-01', label: 'Règlement', pieceRef: 'FA-1', amount: 500n },
    { id: 'b2', date: '2026-03-01', label: 'Chèque', pieceRef: 'CH9', amount: -300n },
  ];
  it('propose les correspondances avec score et produit l’état de rapprochement', () => {
    const m = proposeMatches(st, book);
    expect(m).toHaveLength(1);
    expect(m[0]!.reasons).toContain('Référence retrouvée');
    expect(proposeMatches(st, [{ ...book[0]!, date: '2026-04-30' }])).toEqual([]);
    expect(proposeMatches([st[0]!, st[0]!], [{ ...book[0]!, pieceRef: '', date: '2026-03-02' }])).toHaveLength(1);
    const r = reconciliationStatement(200n, 490n, [book[1]!], [st[1]!]);
    expect(r).toMatchObject({ adjustedBook: 190n, adjustedBank: 190n, reconciled: true });
  });
});

describe('prévision de trésorerie et budget', () => {
  it('projette 13 semaines et 12 mois, signale les tensions', () => {
    const items = [
      { date: '2026-01-01', amount: 100n, category: 'CLIENTS', label: 'retard' },
      { date: '2026-01-20', amount: -500n, category: 'PAIE', label: 'paie' },
      { date: '2026-03-15', amount: 1000n, category: 'CLIENTS', label: 'x' },
    ];
    const w = weeklyForecast(200n, items, '2026-01-05');
    expect(w).toHaveLength(13);
    expect(w[0]!.closing).toBe(300n);
    expect(w[2]!.tension).toBe(true);
    const m = monthlyForecast(200n, items, '2026-01');
    expect(m[0]!.closing).toBe(-200n);
    expect(m[2]!.closing).toBe(800n);
    expect(monthlyForecast(0n, [], '2026-11', 3).map((r) => r.month)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
  it('compare budget, réalisé et engagements ; alerte ou bloque', () => {
    const rep = budgetReport(
      [{ prefix: '62', amount: 1000n }, { prefix: '6222', analytic: 'GOMA', amount: 300n }, { prefix: '70', amount: 5000n }, { prefix: '64', amount: 0n }],
      [{ account: '622200', analytic: 'GOMA', net: 250n }, { account: '624800', net: 100n }, { account: '706100', net: -4000n }],
      [{ prefix: '6222', analytic: 'GOMA', amount: 40n }],
    );
    expect(rep[0]).toMatchObject({ realized: 350n, committed: 40n, available: 610n });
    expect(rep[1]!.available).toBe(10n);
    expect(rep[2]!.realized).toBe(4000n);
    expect(rep[3]!.usageBp).toBeNull();
    expect(checkBudget(rep, '622200', 50n, 'GOMA', 'BLOQUANT').ok).toBe(false);
    expect(checkBudget(rep, '622200', 50n, 'GOMA', 'ALERTE')).toMatchObject({ ok: true });
    expect(checkBudget(rep, '622200', 5n, 'GOMA', 'BLOQUANT').ok).toBe(true);
    expect(checkBudget(rep, '601100', 5n, null, 'BLOQUANT').ok).toBe(true);
  });
});
