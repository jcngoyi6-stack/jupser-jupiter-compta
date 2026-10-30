import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  abnormalBalances,
  accountClass,
  agedBalance,
  autoLetter,
  balanceGap,
  balanceTotals,
  benfordAnalysis,
  buildReversal,
  canLetter,
  canonicalJson,
  computeAuditHash,
  decimalsOf,
  divRound,
  entryHash,
  findSequenceGaps,
  firstDigit,
  formatAmount,
  formatEntryNumber,
  generalLedger,
  GENESIS_HASH,
  isCollective,
  monthlyPeriods,
  netByAccount,
  netResult,
  nextLetter,
  normalizeAccountNumber,
  normalSide,
  officialAncestor,
  openingEntryLines,
  parseAmount,
  parseChartCsv,
  parseChartHeadings,
  proposeFirstFiscalYear,
  resultDeterminationLines,
  sha256,
  toDecimalString,
  trialBalance,
  validateEntry,
  validateSubAccount,
  verifyAuditChain,
  type AuditRecord,
  type EntryInput,
  type ValidationContext,
} from './index';

const csv = readFileSync(join(__dirname, '../../../data/plan_comptes_syscohada_revise_6chiffres.csv'), 'utf8');
const chart = parseChartCsv(csv);
const accounts = new Map(chart.map((a) => [a.number, { number: a.number, active: true, imputable: a.imputable }]));

const ctx: ValidationContext = {
  accounts,
  fiscalYear: { start: '2026-01-01', end: '2026-12-31', closed: false },
  isPeriodOpen: (d) => d >= '2026-02-01',
};

const sale: EntryInput = {
  journalCode: 'VTE',
  journalType: 'VENTES',
  date: '2026-03-15',
  pieceRef: 'FA-0001',
  label: 'Vente de services',
  lines: [
    { account: '411100', thirdPartyId: 'C1', debit: 116_000_00n, credit: 0n },
    { account: '706100', debit: 0n, credit: 100_000_00n },
    { account: '443200', debit: 0n, credit: 16_000_00n },
  ],
};

describe('montants', () => {
  it('analyse et formate sans flottant', () => {
    expect(parseAmount('1 234,56')).toBe(123456n);
    expect(parseAmount('1234.5')).toBe(123450n);
    expect(parseAmount('-12')).toBe(-1200n);
    expect(parseAmount('10,500')).toBe(1050n);
    expect(parseAmount(15)).toBe(1500n);
    expect(parseAmount(15n, 0)).toBe(15n);
    expect(() => parseAmount(1.5)).toThrow();
    expect(() => parseAmount('1,234')).toThrow(/Précision/);
    expect(() => parseAmount('abc')).toThrow();
    expect(formatAmount(123456789n)).toBe('1 234 567,89');
    expect(formatAmount(-5n)).toBe('-0,05');
    expect(formatAmount(1000n, 0)).toBe('1 000');
    expect(toDecimalString(-123456n)).toBe('-1234.56');
    expect(toDecimalString(7n, 0)).toBe('7');
    expect(decimalsOf('cdf')).toBe(2);
    expect(decimalsOf('XOF')).toBe(0);
    expect(() => decimalsOf('ZZZ')).toThrow();
  });
  it('arrondit au plus proche', () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(5n, -2n)).toBe(-3n);
    expect(() => divRound(1n, 0n)).toThrow();
  });
});

describe('plan de comptes à 6 chiffres', () => {
  it('charge les 1 312 lignes du plan SYSCOHADA révisé', () => {
    expect(chart.length).toBeGreaterThan(1100);
    expect(chart.every((a) => /^\d{6}$/.test(a.number))).toBe(true);
    expect(parseChartHeadings(csv).find((h) => h.official === '57')).toBeTruthy();
    expect(accounts.get('571100')?.imputable).toBe(true);
  });
  it('complète à droite par des zéros', () => {
    expect(normalizeAccountNumber('571')).toBe('571000');
    expect(normalizeAccountNumber('5711')).toBe('571100');
    expect(() => normalizeAccountNumber('5711000')).toThrow();
    expect(accountClass('601100')).toBe(6);
  });
  it('contrôle la création de sous-comptes', () => {
    const existing = new Map(chart.map((a) => [a.number, { official: a.official, class: a.class }]));
    expect(validateSubAccount('571110', '571100', existing)).toEqual([]);
    expect(validateSubAccount('521110', '571100', existing).length).toBeGreaterThan(0);
    expect(validateSubAccount('57111', '571100', existing).length).toBeGreaterThan(0);
    expect(validateSubAccount('571100', '571100', existing)).toContain('Le compte 571100 existe déjà.');
    expect(validateSubAccount('999999', '999000', existing)[0]).toMatch(/inexistant/);
    expect(officialAncestor('571110', new Set(chart.map((a) => a.official)))).toBe('5711');
    expect(officialAncestor('999999', new Set(['57']))).toBeNull();
  });
  it('détermine le sens normal et les comptes collectifs', () => {
    expect(normalSide('571100')).toBe('D');
    expect(normalSide('281300')).toBe('C');
    expect(normalSide('603100')).toBe('DC');
    expect(normalSide('101100')).toBe('C');
    expect(normalSide('109000')).toBe('D');
    expect(normalSide('121000')).toBe('DC');
    expect(normalSide('736000')).toBe('DC');
    expect(normalSide('561000')).toBe('C');
    expect(normalSide('521100')).toBe('DC');
    expect(normalSide('811000')).toBe('D');
    expect(normalSide('821000')).toBe('C');
    expect(normalSide('411100')).toBe('DC');
    expect(isCollective('401000')).toBe(true);
    expect(isCollective('571100')).toBe(false);
  });
});

describe('validation des écritures (invariants 1 à 4)', () => {
  it('accepte une écriture équilibrée', () => {
    const r = validateEntry(sale, ctx);
    expect(r.ok).toBe(true);
    expect(r.totalDebit).toBe(r.totalCredit);
    expect(balanceGap(sale.lines)).toBe(0n);
  });
  it('refuse une écriture déséquilibrée', () => {
    const e = { ...sale, lines: [...sale.lines.slice(0, 2)] };
    const r = validateEntry(e, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors.map((x) => x.code)).toContain('DESEQUILIBRE');
  });
  it('exige la pièce, le libellé, un tiers sur les collectifs, des comptes imputables', () => {
    const e: EntryInput = {
      ...sale,
      pieceRef: ' ',
      label: '',
      lines: [
        { account: '411100', debit: 100n, credit: 0n },
        { account: '411000', thirdPartyId: 'X', debit: 0n, credit: 50n },
        { account: '999999', debit: 0n, credit: 50n },
        { account: '57', debit: 0n, credit: 0n },
        { account: '706100', debit: -1n, credit: 1n },
      ],
    };
    const codes = validateEntry(e, ctx).errors.map((x) => x.code);
    for (const c of ['PIECE_OBLIGATOIRE', 'LIBELLE_OBLIGATOIRE', 'TIERS_OBLIGATOIRE', 'COMPTE_NON_IMPUTABLE', 'COMPTE_INCONNU', 'COMPTE_FORMAT', 'MONTANT_NEGATIF', 'LIGNE_DC']) {
      expect(codes).toContain(c);
    }
  });
  it('refuse les périodes clôturées, hors exercice, exercice clos et comptes inactifs', () => {
    expect(validateEntry({ ...sale, date: '2026-01-15' }, ctx).errors[0]!.code).toBe('PERIODE_CLOTUREE');
    expect(validateEntry({ ...sale, date: '2027-01-15' }, ctx).errors[0]!.code).toBe('HORS_EXERCICE');
    expect(validateEntry({ ...sale, date: '15/01/2026' }, ctx).errors[0]!.code).toBe('DATE_INVALIDE');
    expect(validateEntry(sale, { ...ctx, fiscalYear: { ...ctx.fiscalYear, closed: true } }).errors[0]!.code).toBe('EXERCICE_CLOTURE');
    const inactive = new Map(accounts);
    inactive.set('706100', { number: '706100', active: false, imputable: true });
    expect(validateEntry(sale, { ...ctx, accounts: inactive }).errors[0]!.code).toBe('COMPTE_INACTIF');
    expect(validateEntry({ ...sale, lines: sale.lines.slice(0, 1) }, ctx).errors.map((e) => e.code)).toContain('LIGNES_INSUFFISANTES');
  });
  it("interdit la saisie manuelle en journal d'à-nouveaux", () => {
    expect(validateEntry({ ...sale, journalType: 'AN' }, ctx).errors[0]!.code).toBe('AN_MANUEL_INTERDIT');
    expect(validateEntry({ ...sale, journalType: 'AN' }, { ...ctx, systemGenerated: true }).ok).toBe(true);
  });
  it('alerte sur une pièce de N+1 (spécialisation des exercices)', () => {
    const r = validateEntry({ ...sale, pieceDate: '2027-01-05' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.warnings[0]!.code).toBe('SPECIALISATION_EXERCICES');
  });
  it('exige les informations de change sur les lignes en devise (invariant 6)', () => {
    const e: EntryInput = {
      ...sale,
      lines: [
        { ...sale.lines[0]!, fx: { currency: 'USD', foreignAmount: 4000_00n, rate: '', rateSource: 'BCC', rateDate: '2026-03-15' } },
        ...sale.lines.slice(1),
      ],
    };
    expect(validateEntry(e, ctx).errors[0]!.code).toBe('DEVISE_INCOMPLETE');
  });
  it('exige une pièce numérisée au-delà du seuil', () => {
    const c = { ...ctx, attachmentThreshold: 1_000_000_00n };
    expect(validateEntry(sale, c).ok).toBe(true);
    expect(validateEntry(sale, { ...c, attachmentThreshold: 1n }).errors[0]!.code).toBe('PIECE_NUMERISEE_REQUISE');
    expect(validateEntry(sale, { ...c, attachmentThreshold: 1n, hasAttachment: true }).ok).toBe(true);
  });
  it('contre-passe en inversant les sens', () => {
    const r = buildReversal(sale, '2026-03-20', 'VTE-2026-000001');
    expect(r.lines[0]!.credit).toBe(116_000_00n);
    expect(r.label).toMatch(/Contre-passation de VTE-2026-000001/);
    expect(validateEntry(r, ctx).ok).toBe(true);
  });
  it('numérote sans trou', () => {
    expect(formatEntryNumber('VTE', '2026', 12)).toBe('VTE-2026-000012');
    expect(findSequenceGaps([1, 2, 3])).toEqual([]);
    expect(findSequenceGaps([3, 1, 5])).toEqual([2, 4]);
  });
});

const posted = [
  { account: '101300', date: '2026-01-01', debit: 0n, credit: 1_000_00n, journalCode: 'AN' },
  { account: '521100', date: '2026-01-01', debit: 1_000_00n, credit: 0n, journalCode: 'AN' },
  { account: '411100', date: '2026-02-01', debit: 500_00n, credit: 0n, journalCode: 'VTE', entryNumber: '2', thirdPartyId: 'C1' },
  { account: '706100', date: '2026-02-01', debit: 0n, credit: 500_00n, journalCode: 'VTE', entryNumber: '2' },
  { account: '605200', date: '2026-02-03', debit: 200_00n, credit: 0n, journalCode: 'ACH', entryNumber: '3' },
  { account: '571100', date: '2026-02-03', debit: 0n, credit: 200_00n, journalCode: 'ACH', entryNumber: '3' },
];

describe('balance, grand-livre, clôture', () => {
  it('produit une balance à 6 colonnes équilibrée', () => {
    const rows = trialBalance(posted);
    const t = balanceTotals(rows);
    expect(t.openingDebit).toBe(t.openingCredit);
    expect(t.movementDebit).toBe(t.movementCredit);
    expect(t.closingDebit).toBe(t.closingCredit);
    expect(rows.find((r) => r.account === '571100')!.closingCredit).toBe(200_00n);
    expect(abnormalBalances(rows).map((a) => a.account)).toEqual(['571100']);
    expect(netByAccount(posted).get('706100')).toBe(-500_00n);
  });
  it('signale un passif à solde débiteur', () => {
    const rows = trialBalance([
      { account: '101300', date: '2026-01-01', debit: 10n, credit: 0n },
      { account: '571100', date: '2026-01-01', debit: 0n, credit: 10n },
    ]);
    expect(abnormalBalances(rows).map((a) => a.expected)).toEqual(['C', 'D']);
  });
  it('produit le grand-livre avec solde progressif', () => {
    const gl = generalLedger([...posted, { account: '411100', date: '2026-01-15', debit: 0n, credit: 100_00n, entryNumber: '1' }]);
    const c = gl.find((a) => a.account === '411100')!;
    expect(c.lines[0]!.runningBalance).toBe(-100_00n);
    expect(c.balance).toBe(400_00n);
    expect(c.totalDebit).toBe(500_00n);
  });
  it('détermine le résultat puis génère les à-nouveaux', () => {
    const rows = trialBalance(posted);
    expect(netResult(rows)).toBe(300_00n);
    const res = resultDeterminationLines(rows);
    expect(balanceGap(res)).toBe(0n);
    expect(res.find((l) => l.account === '131000')!.credit).toBe(300_00n);
    expect(() => openingEntryLines(rows)).toThrow();
    const after = trialBalance([...posted, ...res.map((l) => ({ ...l, date: '2026-12-31', journalCode: 'OD' }))]);
    const an = openingEntryLines(after);
    expect(balanceGap(an)).toBe(0n);
    expect(an.some((l) => l.account.startsWith('7'))).toBe(false);
    const loss = trialBalance([
      { account: '605200', date: '2026-01-01', debit: 10n, credit: 0n },
      { account: '571100', date: '2026-01-01', debit: 0n, credit: 10n },
    ]);
    expect(resultDeterminationLines(loss).find((l) => l.account === '139000')!.debit).toBe(10n);
  });
});

describe('lettrage', () => {
  const lines = [
    { id: 'a', thirdPartyId: 'C1', account: '411100', date: '2026-01-10', reference: 'FA1', debit: 100n, credit: 0n },
    { id: 'b', thirdPartyId: 'C1', account: '411100', date: '2026-01-20', reference: 'X', debit: 0n, credit: 100n },
    { id: 'c', thirdPartyId: 'C1', account: '411100', date: '2026-02-10', reference: 'FA1', debit: 0n, credit: 100n },
    { id: 'd', thirdPartyId: 'C1', account: '411100', date: '2026-02-10', reference: 'FA2', debit: 70n, credit: 0n },
  ];
  it('propose les correspondances (même référence en priorité)', () => {
    expect(autoLetter(lines)).toEqual([{ letter: 'A', ids: ['a', 'c'] }]);
  });
  it('contrôle un lettrage manuel', () => {
    expect(canLetter([lines[0]!, lines[1]!]).ok).toBe(true);
    expect(canLetter([lines[0]!]).ok).toBe(false);
    expect(canLetter([lines[0]!, lines[3]!]).reason).toMatch(/soldé/);
    expect(canLetter([lines[0]!, { ...lines[1]!, account: '401000' }]).ok).toBe(false);
    expect(canLetter([lines[0]!, { ...lines[1]!, thirdPartyId: 'C2' }]).ok).toBe(false);
    expect(canLetter([lines[0]!, { ...lines[1]!, letter: 'A' }]).ok).toBe(false);
  });
  it('incrémente les codes', () => {
    expect(nextLetter(null)).toBe('A');
    expect(nextLetter('A')).toBe('B');
    expect(nextLetter('Z')).toBe('AA');
    expect(nextLetter('AZ')).toBe('BA');
  });
  it('calcule la balance âgée', () => {
    const m = agedBalance(lines, '2026-04-30');
    expect(m.get('C1')).toEqual([0n, 0n, -30n, 0n]);
  });
});

describe('audit chaîné et empreintes', () => {
  it('vérifie une chaîne intacte et détecte une altération', () => {
    const recs: AuditRecord[] = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= 3; i++) {
      const r = { seq: i, at: `2026-01-0${i}T00:00:00Z`, actor: 'u1', action: 'ENTRY_VALIDATED', object: `e${i}`, payload: { n: BigInt(i) }, prevHash: prev };
      const hash = computeAuditHash(r);
      recs.push({ ...r, hash });
      prev = hash;
    }
    expect(verifyAuditChain(recs).ok).toBe(true);
    const tampered = recs.map((r) => (r.seq === 2 ? { ...r, actor: 'pirate' } : r));
    expect(verifyAuditChain(tampered)).toEqual({ ok: false, brokenAt: 2 });
    const relinked = recs.map((r) => (r.seq === 3 ? { ...r, prevHash: GENESIS_HASH } : r));
    expect(verifyAuditChain(relinked).ok).toBe(false);
  });
  it('sérialise de façon canonique', () => {
    expect(canonicalJson({ b: 1, a: [1n, null, new Date(0)], c: undefined })).toBe('{"a":["1",null,"1970-01-01T00:00:00.000Z"],"b":1}');
    expect(canonicalJson(undefined)).toBe('null');
    expect(sha256('abc')).toHaveLength(64);
    const h = entryHash({ number: '1', date: '2026-01-01', journalCode: 'OD', pieceRef: 'p', label: 'l', lines: [], prevHash: GENESIS_HASH });
    expect(h).toHaveLength(64);
  });
});

describe('Benford et exercices', () => {
  it('mesure la conformité à la loi de Benford', () => {
    const amounts = Array.from({ length: 1000 }, (_, i) => BigInt(Math.floor(10 ** (1 + (i / 1000) * 4))));
    const r = benfordAnalysis(amounts);
    expect(r.n).toBe(1000);
    expect(r.conform).toBe(true);
    expect(benfordAnalysis([]).conform).toBeNull();
    expect(benfordAnalysis(Array.from({ length: 100 }, () => 9n)).conform).toBe(false);
    expect(firstDigit(0n)).toBeNull();
    expect(firstDigit(-450n)).toBe(4);
  });
  it('propose la durée du premier exercice et découpe en périodes', () => {
    expect(proposeFirstFiscalYear('2026-03-10')).toEqual({ start: '2026-03-10', end: '2026-12-31', months: 10 });
    expect(proposeFirstFiscalYear('2026-09-01').end).toBe('2027-12-31');
    const p = monthlyPeriods('2026-01-01', '2026-12-31');
    expect(p).toHaveLength(12);
    expect(p[1]).toEqual({ start: '2026-02-01', end: '2026-02-28', label: '02/2026' });
    expect(monthlyPeriods('2026-03-10', '2027-01-31')[0]!.start).toBe('2026-03-10');
  });
});
