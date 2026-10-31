import { describe, expect, it } from 'vitest';
import { INTERCOMPANY_KINDS, intercompanyOperation } from './index';
import { unknownAccounts } from './testkit';

const lines = (e: { lines: { account: string; debit: bigint; credit: bigint }[] }) => e.lines.map((l) => [l.account, l.debit || -l.credit]);

describe('opérations intragroupe', () => {
  it('refacturation de prestations avec TVA : comptes groupe réciproques', () => {
    const r = intercompanyOperation({ kind: 'PRESTATION', amount: 1_000_000n, vatRate: 0.16, date: '2026-06-30', label: 'Frais de siège' });
    expect(lines(r.entries[0]!)).toEqual([['411200', 1_160_000n], ['706100', -1_000_000n], ['443100', -160_000n]]);
    expect(lines(r.counterpartEntries![0]!)).toEqual([['632800', 1_000_000n], ['445200', 160_000n], ['401200', -1_160_000n]]);
  });
  it('prêt intragroupe et dividende', () => {
    const p = intercompanyOperation({ kind: 'PRET', amount: 5n, date: 'x' });
    expect(lines(p.counterpartEntries![0]!)).toEqual([['521100', 5n], ['181100', -5n]]);
    expect(lines(intercompanyOperation({ kind: 'DIVIDENDE', amount: 7n, date: 'x' }).counterpartEntries![0]!)).toEqual([['521100', 7n], ['772100', -7n]]);
  });
  it('tous les types sont équilibrés sur des comptes imputables', () => {
    const all = INTERCOMPANY_KINDS.map((kind) => intercompanyOperation({ kind, amount: 100n, vatRate: 0.18, date: 'x' }));
    expect(unknownAccounts([...all, ...all.map((r) => ({ entries: r.counterpartEntries! }))])).toEqual([]);
  });
});
