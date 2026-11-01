import { netByAccount, resultDeterminationLines, trialBalance, type PostedLine } from '@jupiter/ledger';
import { describe, expect, it } from 'vitest';
import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  contraAssetTarget,
  financialAnalysis,
  flowRefOf,
  goingConcern,
  incomeRefOf,
  isTreasury,
  type AccountBalance,
} from './index';

/** Jeu de référence : exercice 2026 d'une SARL de services à Kinshasa (montants CDF, unités mineures). */
let seq = 0;
function e(journal: string, date: string, lines: [string, bigint, bigint][]): PostedLine[] {
  seq++;
  return lines.map(([account, debit, credit]) => ({ account, debit, credit, date, journalCode: journal, entryNumber: String(seq) }));
}
const M = 1_000_000_00n; // 1 million CDF
const dataset: PostedLine[] = [
  // À-nouveaux
  ...e('AN', '2026-01-01', [
    ['101300', 0n, 50n * M],
    ['244400', 30n * M, 0n],
    ['284400', 0n, 6n * M],
    ['411100', 12n * M, 0n],
    ['401000', 0n, 8n * M],
    ['521100', 25n * M, 0n],
    ['571100', 2n * M, 0n],
    ['121000', 0n, 5n * M],
  ]),
  // Ventes de services TTC 116 M
  ...e('VTE', '2026-03-31', [['411100', 116n * M, 0n], ['706100', 0n, 100n * M], ['443200', 0n, 16n * M]]),
  // Encaissements clients
  ...e('BQ', '2026-04-30', [['521100', 110n * M, 0n], ['411100', 0n, 110n * M]]),
  // Achats de fournitures TTC 23,2 M
  ...e('ACH', '2026-02-15', [['605700', 20n * M, 0n], ['445200', 32n * M / 10n, 0n], ['401000', 0n, 232n * M / 10n]]),
  ...e('BQ', '2026-03-15', [['401000', 25n * M, 0n], ['521100', 0n, 25n * M]]),
  // Loyer
  ...e('BQ', '2026-05-05', [['622200', 12n * M, 0n], ['521100', 0n, 12n * M]]),
  // Salaires et charges
  ...e('PAIE', '2026-06-30', [
    ['661100', 30n * M, 0n],
    ['664100', 39n * M / 10n, 0n],
    ['422000', 0n, 255n * M / 10n],
    ['447200', 0n, 3n * M],
    ['431300', 0n, 54n * M / 10n],
  ]),
  ...e('BQ', '2026-07-05', [['422000', 255n * M / 10n, 0n], ['447200', 3n * M, 0n], ['431300', 54n * M / 10n, 0n], ['521100', 0n, 339n * M / 10n]]),
  // Acquisition d'un véhicule financée par emprunt
  ...e('OD', '2026-08-01', [['245100', 40n * M, 0n], ['162000', 0n, 40n * M]]),
  ...e('BQ', '2026-09-01', [['162000', 5n * M, 0n], ['671200', 1n * M, 0n], ['521100', 0n, 6n * M]]),
  // Liquidation TVA
  ...e('OD', '2026-04-30', [['443200', 16n * M, 0n], ['445200', 0n, 32n * M / 10n], ['444100', 0n, 128n * M / 10n]]),
  ...e('BQ', '2026-05-15', [['444100', 128n * M / 10n, 0n], ['521100', 0n, 128n * M / 10n]]),
  // Avance d'un client (client créditeur)
  ...e('BQ', '2026-11-20', [['521100', 5n * M, 0n], ['411200', 0n, 5n * M]]),
  // Dotations aux amortissements
  ...e('OD', '2026-12-31', [['681300', 10n * M, 0n], ['284400', 0n, 6n * M], ['284500', 0n, 4n * M]]),
  // Cession d'un matériel : brut 10 M, amorti 6 M, prix 5 M
  ...e('OD', '2026-12-15', [['284400', 6n * M, 0n], ['812000', 4n * M, 0n], ['244400', 0n, 10n * M]]),
  ...e('BQ', '2026-12-15', [['521100', 5n * M, 0n], ['822000', 0n, 5n * M]]),
  // Impôt sur le résultat (minimum ou IS)
  ...e('OD', '2026-12-31', [['891100', 3n * M, 0n], ['441000', 0n, 3n * M]]),
  // Découvert sur une seconde banque
  ...e('BQ', '2026-12-31', [['521500', 0n, 1n * M], ['571100', 1n * M, 0n]]),
];

function balancesOf(lines: PostedLine[]): AccountBalance[] {
  return [...netByAccount(lines).entries()].map(([account, net]) => ({ account, net }));
}

describe('compte de résultat', () => {
  const is = buildIncomeStatement(balancesOf(dataset));
  it('calcule les soldes intermédiaires', () => {
    expect(is.values.XB).toBe(100n * M);
    expect(is.values.XC).toBe(100n * M - 20n * M - 12n * M);
    expect(is.values.XD).toBe(68n * M - 339n * M / 10n);
    expect(is.values.XE).toBe(is.values.XD! - 10n * M);
    expect(is.values.XF).toBe(-1n * M);
    expect(is.values.XH).toBe(1n * M);
    expect(is.values.XI).toBe(is.values.XG! + is.values.XH! - 3n * M);
    expect(is.controls.every((c) => c.ok)).toBe(true);
    expect(is.rows.map((r) => r.ref)[0]).toBe('TA');
  });
  it('rattache les comptes au préfixe le plus long', () => {
    expect(incomeRefOf('603100')).toBe('RB');
    expect(incomeRefOf('797100')).toBe('TL');
    expect(incomeRefOf('776000')).toBe('TK');
    expect(incomeRefOf('411100')).toBeNull();
  });
  it('signale un compte de gestion non rattaché', () => {
    const r = buildIncomeStatement([{ account: '609000', net: 10n }, { account: '571100', net: -10n }]);
    expect(r.controls[0]!.ok).toBe(false);
  });
});

describe('bilan', () => {
  const bs = buildBalanceSheet(balancesOf(dataset));
  const a = Object.fromEntries(bs.assets.map((r) => [r.ref, r]));
  const p = Object.fromEntries(bs.liabilities.map((r) => [r.ref, r.value]));
  it('est équilibré (actif = passif) avec résultat non encore affecté en CJ', () => {
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.controls.every((c) => c.ok)).toBe(true);
    const is = buildIncomeStatement(balancesOf(dataset));
    expect(p.CJ).toBe(is.values.XI);
  });
  it('présente brut, amortissements et net', () => {
    expect(a.AM!.gross).toBe(20n * M);
    expect(a.AM!.depreciation).toBe(6n * M);
    expect(a.AN!.gross).toBe(40n * M);
    expect(a.AN!.depreciation).toBe(4n * M);
    expect(a.AZ!.net).toBe(50n * M);
  });
  it('ne compense pas : client créditeur au passif (DI), découvert en trésorerie-passif (DR)', () => {
    expect(a.BI!.gross).toBe(18n * M);
    expect(p.DI).toBe(5n * M);
    expect(p.DR).toBe(1n * M);
    expect(p.DJ).toBe(62n * M / 10n);
    expect(p.DK).toBe(3n * M);
    expect(p.DA).toBe(35n * M);
    expect(p.CH).toBe(5n * M);
  });
  it('reste identique après détermination du résultat (131)', () => {
    const rows = trialBalance(dataset);
    const res = resultDeterminationLines(rows).map((l) => ({ ...l, date: '2026-12-31', journalCode: 'OD' }));
    const bs2 = buildBalanceSheet(balancesOf([...dataset, ...res]));
    expect(bs2.totalAssets).toBe(bs.totalAssets);
    expect(bs2.liabilities.find((l) => l.ref === 'CJ')!.value).toBe(p.CJ);
  });
  it('signale les déséquilibres et rattache les comptes de contrepartie', () => {
    const r = buildBalanceSheet([{ account: '571100', net: 10n }]);
    expect(r.controls[0]!.ok).toBe(false);
    expect(contraAssetTarget('281300')).toBe('21300');
    expect(contraAssetTarget('391000')).toBe('31000');
    expect(contraAssetTarget('491000')).toBe('41000');
    expect(contraAssetTarget('499000')).toBeNull();
    expect(contraAssetTarget('590000')).toBe('50000');
    expect(contraAssetTarget('411100')).toBeNull();
    const u = buildBalanceSheet([{ account: '900000', net: 5n }, { account: '600000', net: 0n }]);
    expect(u.unmapped).toHaveLength(0);
  });
  it('classe les provisions à court terme et les crédits de trésorerie', () => {
    const r = buildBalanceSheet([
      { account: '499100', net: -10n },
      { account: '564000', net: -5n },
      { account: '409100', net: 7n },
      { account: '485000', net: 8n },
      { account: '481000', net: -9n },
      { account: '478100', net: 2n },
      { account: '479100', net: -3n },
      { account: '109000', net: 4n },
      { account: '521100', net: 6n },
    ]);
    const l = Object.fromEntries(r.liabilities.map((x) => [x.ref, x.value]));
    const as = Object.fromEntries(r.assets.map((x) => [x.ref, x.gross]));
    expect(l.DN).toBe(10n);
    expect(l.DQ).toBe(5n);
    expect(l.DH).toBe(9n);
    expect(l.DV).toBe(3n);
    expect(l.CB).toBe(-4n);
    expect(as.BH).toBe(7n);
    expect(as.BA).toBe(8n);
    expect(as.BU).toBe(2n);
  });
});

describe('tableau des flux de trésorerie', () => {
  const lines = dataset.map((l) => ({ ...l, journalType: l.journalCode === 'AN' ? 'AN' : 'OD' }));
  const closing = [...netByAccount(dataset).entries()].filter(([a]) => isTreasury(a)).reduce((s, [, v]) => s + v, 0n);
  const tft = buildCashFlow(lines, closing);
  it('boucle : ZH = trésorerie de clôture', () => {
    expect(tft.values.ZA).toBe(27n * M);
    expect(tft.values.ZH).toBe(closing);
    expect(tft.controls[0]!.ok).toBe(true);
  });
  it('isole les flux d’investissement et de financement', () => {
    expect(tft.values.FG).toBe(-40n * M);
    expect(tft.values.FI).toBe(5n * M);
    expect(tft.values.FO).toBe(40n * M);
    expect(tft.values.FQ).toBe(-5n * M);
    expect(tft.values.ZG).toBe(tft.values.ZB! + tft.values.ZC! + tft.values.ZF!);
  });
  it('détecte un TFT non bouclé et affecte les comptes', () => {
    expect(buildCashFlow(lines, 0n).controls[0]!.ok).toBe(false);
    expect(flowRefOf('311000', 1n)).toBe('FC');
    expect(flowRefOf('211000', 1n)).toBe('FF');
    expect(flowRefOf('211000', 0n)).toBe('FI');
    expect(flowRefOf('261000', 1n)).toBe('FH');
    expect(flowRefOf('261000', 0n)).toBe('FJ');
    expect(flowRefOf('106100', 0n)).toBe('FG');
    expect(flowRefOf('104100', 1n)).toBe('FM');
    expect(flowRefOf('101300', 0n)).toBe('FK');
    expect(flowRefOf('141000', 0n)).toBe('FL');
    expect(flowRefOf('465000', 1n)).toBe('FN');
    expect(flowRefOf('131000', 1n)).toBe('FN');
    expect(flowRefOf('181000', 0n)).toBe('FP');
    expect(flowRefOf('181000', 1n)).toBe('FQ');
    expect(flowRefOf('485000', 1n)).toBe('FI');
    expect(flowRefOf('481000', 0n)).toBe('FG');
    expect(flowRefOf('488000', 1n)).toBe('FB');
    expect(flowRefOf('291000', 1n)).toBe('FA');
    expect(flowRefOf('284000', 0n)).toBe('FA');
    expect(flowRefOf('000000', 0n)).toBe('FE');
    expect(buildCashFlow([{ account: '901000', debit: 1n, credit: 0n, journalType: 'OD' }], 0n).values.ZG).toBe(0n);
  });
});

describe('analyse financière', () => {
  it('calcule SIG, équilibre financier, ratios et alertes de continuité', () => {
    const b = balancesOf(dataset);
    const r = financialAnalysis(buildBalanceSheet(b), buildIncomeStatement(b), 50n * M);
    expect(r.sig.chiffreAffaires).toBe(100n * M);
    expect(r.equilibre.controle).toBe(true);
    expect(r.ratiosBp.autonomieFinanciere).toBeGreaterThan(0);
    expect(goingConcern(10n, 50n, -1n, -5n).every((c) => !c.ok)).toBe(true);
    expect(goingConcern(10n, 0n, 1n, 5n).every((c) => c.ok)).toBe(true);
    const empty = financialAnalysis(buildBalanceSheet([]), buildIncomeStatement([]), 0n);
    expect(empty.ratiosBp.margeNette).toBeNull();
  });
});

describe('bilan consolidé : impôts différés', () => {
  it('compte IDA en actif immobilisé, IDP en dettes financières ; ignoré hors consolidation', async () => {
    const { buildBalanceSheet } = await import('./balance-sheet');
    const balances = [
      { account: 'IDA', net: 300n }, { account: 'IDP', net: -100n }, { account: '521100', net: 800n }, { account: '101300', net: -1000n },
    ];
    const c = buildBalanceSheet(balances, { consolidated: true });
    expect(c.assets.find((a) => a.ref === 'AW')!.net).toBe(300n);
    expect(c.liabilities.find((l) => l.ref === 'DE')!.value).toBe(100n);
    expect(c.totalAssets).toBe(c.totalLiabilities);
    const p = buildBalanceSheet(balances);
    expect(p.assets.find((a) => a.ref === 'AW')).toBeUndefined();
  });
});
