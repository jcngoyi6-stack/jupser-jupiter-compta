/** Guide d'application du SYSCOHADA révisé — application 101 : inventaire permanent, CMUP après chaque entrée. */
import { describe, expect, it } from 'vitest';
import { applyMove, emptyValuation } from './stock';

describe('guide d’application — application 101', () => {
  it('sorties valorisées au CMUP recalculé après chaque entrée (montants en centimes)', () => {
    let v = applyMove(emptyValuation(), { date: '2026-01-01', qtyMilli: 3_820_000n, unitCost: 80_000n }, 'CMUP').valuation; // 3 820 kg à 800
    const s1 = applyMove(v, { date: '2026-01-05', qtyMilli: -80_000n }, 'CMUP');
    expect(s1.cost).toBe(6_400_000n); // 80 kg × 800 = 64 000
    v = s1.valuation;
    v = applyMove(v, { date: '2026-01-07', qtyMilli: 820_000n, unitCost: 66_439n }, 'CMUP').valuation; // 544 800 / 820 = 664,39
    const s2 = applyMove(v, { date: '2026-01-08', qtyMilli: -4_041_000n }, 'CMUP');
    // Guide : 4 041 kg × 775,614 = 3 134 257 F ; écart d'arrondi du coût unitaire d'entrée inférieur à 1 F.
    expect(Number(s2.cost) / 100).toBeGreaterThan(3_134_256);
    expect(Number(s2.cost) / 100).toBeLessThan(3_134_258);
  });
});

describe('guide d’application — applications 53 et 54 : dépréciation des stocks', async () => {
  const { requiredImpairment, impairmentAdjustmentLines, IMPAIRMENT_ACCOUNTS, actualValue } = await import('./impairment');
  it('application 53 : contrat de vente ferme, puis sans contrat ; plus-value latente non constatée', () => {
    expect(requiredImpairment(10_000_000n, { mode: 'VNR', contractPrice: 11_500_000n, probablePrice: 10_500_000n, costsToSell: 2_000_000n })).toEqual({ actual: 9_500_000n, impairment: 500_000n });
    expect(requiredImpairment(10_000_000n, { mode: 'VNR', probablePrice: 10_500_000n, costsToSell: 2_000_000n }).impairment).toBe(1_500_000n);
    expect(requiredImpairment(10_000_000n, { mode: 'VNR', contractPrice: 13_500_000n, costsToSell: 2_000_000n }).impairment).toBe(0n);
    expect(impairmentAdjustmentLines({ [IMPAIRMENT_ACCOUNTS.MARCHANDISE!]: 500_000n }, {})).toEqual([
      { account: '659300', debit: 500_000n, credit: 0n }, { account: '391000', debit: 0n, credit: 500_000n },
    ]);
    expect(() => actualValue({ mode: 'VNR', costsToSell: 0n })).toThrow('PRIX_DE_VENTE_REQUIS');
  });
  it('application 54 : matières premières au coût actuel de remplacement (7 840 × 9 600)', () => {
    const r = requiredImpairment(96_000_000n, { mode: 'COUT_REMPLACEMENT', replacementValue: 7_840n * 9_600n });
    expect(r.impairment).toBe(20_736_000n);
    expect(impairmentAdjustmentLines({ '392000': 20_736_000n }, {})[1]).toEqual({ account: '392000', debit: 0n, credit: 20_736_000n });
    // Reprise si la dépréciation requise diminue l'exercice suivant
    expect(impairmentAdjustmentLines({ '392000': 12_000_000n }, { '392000': 20_736_000n })).toEqual([
      { account: '392000', debit: 8_736_000n, credit: 0n }, { account: '759300', debit: 0n, credit: 8_736_000n },
    ]);
  });
});
