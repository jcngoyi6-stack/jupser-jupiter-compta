/** Guide d'application du SYSCOHADA révisé — application 7 : centralisation de la TVA. */
import { describe, expect, it } from 'vitest';
import { vatReturn, vatSettlementLines } from './index';

describe('guide d’application — application 7', () => {
  it('1er trimestre : TVA due 60 − 44 = 16, chaque sous-compte soldé', () => {
    const i = {
      collected: 60n, deductible: 44n, previousCredit: 0n,
      collectedByAccount: { '443100': 35n, '443400': 6n, '443200': 19n },
      deductibleByAccount: { '445100': 15n, '445200': 18n, '445300': 11n },
    };
    expect(vatReturn(i).due).toBe(16n);
    const l = vatSettlementLines(i);
    expect(l).toEqual([
      { account: '443100', debit: 35n, credit: 0n }, { account: '443200', debit: 19n, credit: 0n }, { account: '443400', debit: 6n, credit: 0n },
      { account: '445100', debit: 0n, credit: 15n }, { account: '445200', debit: 0n, credit: 18n }, { account: '445300', debit: 0n, credit: 11n },
      { account: '444100', debit: 0n, credit: 16n },
    ]);
  });
  it('4e trimestre : crédit de TVA à reporter 40 − 35 = 5 en 4449', () => {
    const i = {
      collected: 35n, deductible: 40n, previousCredit: 0n,
      collectedByAccount: { '443300': 16n, '443100': 12n, '443200': 7n },
      deductibleByAccount: { '445100': 10n, '445200': 12n, '445300': 18n },
    };
    const l = vatSettlementLines(i);
    expect(l.at(-1)).toEqual({ account: '444900', debit: 5n, credit: 0n });
    expect(l.reduce((s, x) => s + x.debit - x.credit, 0n)).toBe(0n);
    // Régularisation négative d'un sous-compte (avoir) : sens inversé
    expect(vatSettlementLines({ collected: 5n, deductible: 0n, previousCredit: 0n, collectedByAccount: { '443100': 7n, '443200': -2n } })[1]).toEqual({ account: '443200', debit: 0n, credit: 2n });
    expect(vatSettlementLines({ collected: 0n, deductible: -3n, previousCredit: 0n, deductibleByAccount: { '445200': -3n } })[0]).toEqual({ account: '445200', debit: 3n, credit: 0n });
  });
});
