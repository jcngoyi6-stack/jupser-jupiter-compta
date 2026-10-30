/** Catalogue : chaque exemple s'exécute, produit des écritures équilibrées sur des comptes imputables. */
import { describe, expect, it } from 'vitest';
import { CATALOGUE, findOperation, reviveAmounts, runOperation, scaleAmounts, toJson } from './index';
import { unknownAccounts } from './testkit';

describe('catalogue des opérations spécifiques', () => {
  it('identifiants uniques', () => {
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
  });
  it.each(CATALOGUE.map((c) => [c.id, c] as const))('%s : exemple JSON exécutable et équilibré', (id, c) => {
    const r = runOperation(id, toJson(c.example));
    for (const e of r.entries) {
      expect(e.lines.reduce((s, l) => s + l.debit - l.credit, 0n)).toBe(0n);
    }
    expect(unknownAccounts([r])).toEqual([]);
  });
  it('conversion des montants et erreurs', () => {
    expect(reviveAmounts({ amount: '12', account: '521100', items: [{ amount: '-3', date: '2026-01-01' }], rate: 0.1 })).toEqual({ amount: 12n, account: '521100', items: [{ amount: -3n, date: '2026-01-01' }], rate: 0.1 });
    expect(() => runOperation('inconnue', {})).toThrow('OPERATION_INCONNUE');
    expect(findOperation('fusion')!.applications).toContain(116);
    expect(scaleAmounts({ a: 5n, b: [{ c: 2n, rate: 0.1, closingRate: 5.5, account: '521100' }] }, 100n)).toEqual({ a: 500n, b: [{ c: 200n, rate: 0.1, closingRate: 550, account: '521100' }] });
  });
});
