import { describe, expect, it } from 'vitest';
import { buildSmtStatements, consolidate, detailNote, movementNote, NOTE_NUMBERS, textNoteTemplates } from './index';

describe('SMT (modèle officiel)', () => {
  it('établit recettes, dépenses, variations et bilan SMT', () => {
    const closing = [
      { account: '104100', net: -1000n },
      { account: '571100', net: 1200n },
      { account: '521100', net: -50n },
      { account: '411100', net: 200n },
      { account: '401100', net: -150n },
      { account: '701100', net: -900n },
      { account: '601100', net: 500n },
      { account: '622200', net: 100n },
      { account: '311100', net: 100n },
      { account: '603100', net: -100n },
      { account: '245100', net: 100n },
      { account: '284500', net: -20n },
      { account: '681300', net: 20n },
    ];
    const cash = [
      { counterparts: [{ account: '701100', amount: 700n }] },
      { counterparts: [{ account: '601100', amount: -350n }, { account: '622200', amount: -100n }] },
      { counterparts: [{ account: '104100', amount: 1000n }] },
      { counterparts: [{ account: '245100', amount: -100n }] },
      { counterparts: [{ account: '758800', amount: 5n }, { account: '661100', amount: -5n }, { account: '641000', amount: -1n }, { account: '671000', amount: -1n }, { account: '628100', amount: -3n }] },
    ];
    const r = buildSmtStatements(closing, cash);
    expect(r.totalRecettes).toBe(705n);
    expect(r.depenses).toEqual({ achats: 350n, loyers: 100n, salaires: 5n, impots: 1n, interets: 1n, autres: 3n });
    expect(r.solde).toBe(245n);
    expect(r.variations).toEqual({ stocks: 100n, creances: 200n, dettes: 150n });
    expect(r.dotations).toBe(20n);
    expect(r.controls[0]!.ok).toBe(true);
    expect(r.passif.resultat).toBe(380n);
  });
});

describe('notes annexes', () => {
  const lines = [
    { account: '244400', debit: 1000n, credit: 0n, journalType: 'AN' },
    { account: '244400', debit: 300n, credit: 100n, journalType: 'OD' },
    { account: '284400', debit: 0n, credit: 200n, journalType: 'AN' },
    { account: '284400', debit: 50n, credit: 120n, journalType: 'OD' },
  ];
  it('génère les tableaux de mouvements (3A, 3C)', () => {
    const n3a = movementNote(lines, '3A');
    expect(n3a.rows.find((r) => r.label.startsWith('Matériel'))!.values).toEqual([1000n, 300n, 100n, 1200n]);
    expect(movementNote(lines, '3C').rows.at(-1)!.values).toEqual([200n, 120n, 50n, 270n]);
    expect(() => movementNote(lines, '99')).toThrow();
  });
  it('génère les notes de détail N/N-1 et les textes types', () => {
    const n = detailNote('7', [{ account: '411100', net: 500n }], [{ account: '411100', net: 300n }, { account: '411200', net: 10n }], { '411100': 'Clients' });
    expect(n.rows[0]).toEqual({ label: '411100 Clients', values: [500n, 300n, 200n] });
    expect(n.rows.at(-1)!.values).toEqual([500n, 310n, 190n]);
    expect(detailNote('21', [{ account: '706100', net: -800n }]).rows[0]!.values[0]).toBe(800n);
    expect(() => detailNote('99', [])).toThrow();
    expect(NOTE_NUMBERS.details).toContain('27A');
    const t = textNoteTemplates({ companyName: 'X', system: 'NORMAL', depreciation: 'LINEAIRE', stockMethod: 'CMUP', currency: 'CDF', fiscalYear: '2026' });
    expect(t[0]!.text).toMatch(/SYSCOHADA révisé \(système normal\)/);
    expect(textNoteTemplates({ companyName: 'X', system: 'SMT', depreciation: 'LINEAIRE', stockMethod: 'CMUP', currency: 'CDF', fiscalYear: '2026' })[0]!.text).toMatch(/minimal/);
  });
});

describe('consolidation', () => {
  const parent = {
    id: 'm', name: 'Mère', parent: true, method: 'IG' as const, ownershipPpm: 1_000_000n,
    balances: [
      { account: '101300', net: -1000n }, { account: '261000', net: 600n }, { account: '521100', net: 500n },
      { account: '181100', net: -100n }, { account: '701100', net: -200n }, { account: '601100', net: 200n },
    ],
  };
  const sub = {
    id: 'f', name: 'Filiale', parent: false, method: 'IG' as const, ownershipPpm: 800_000n, investmentCost: 600n,
    balances: [
      { account: '101300', net: -500n }, { account: '521100', net: 600n }, { account: '185000', net: 100n },
      { account: '706100', net: -300n }, { account: '622200', net: 100n },
    ],
  };
  it('intègre globalement, élimine les comptes réciproques, calcule minoritaires et écart d’acquisition', () => {
    const r = consolidate([parent, sub]);
    expect(r.eliminated.map((e) => e.account).sort()).toEqual(['181100', '185000']);
    expect(r.minorityEquity).toBe(100n); // 20 % × 500
    expect(r.minorityResult).toBe(40n); // 20 % × 200
    expect(r.goodwill).toBe(200n); // 600 – 80 % × 500
    const sum = r.balances.reduce((s, b) => s + b.net, 0n);
    const elim = r.eliminated.reduce((s, e) => s + e.amount, 0n);
    expect(sum + r.goodwill - r.minorityEquity + elim).toBe(0n);
    expect(r.balances.find((b) => b.account === '261000')).toBeUndefined();
  });
  it('convertit une filiale en devises et met en équivalence', () => {
    const usd = { ...sub, investmentCost: undefined, closingRate: '2850', averageRate: '2800', balances: [{ account: '101300', net: -10n }, { account: '521100', net: 12n }, { account: '706100', net: -2n }] };
    const r = consolidate([usd]);
    expect(r.translationDifference).toBe(-(-28500n + 34200n - 5600n));
    const mee = consolidate([{ ...sub, method: 'MEE', ownershipPpm: 300_000n, investmentCost: 100n, investmentAccount: '262000' }]);
    expect(mee.balances.find((b) => b.account === '262000')!.net).toBe(110n); // 30 % × (500 + 200) – 100
  });
});
