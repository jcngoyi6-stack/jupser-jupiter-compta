import { describe, expect, it } from 'vitest';
import {
  applyRate,
  corporateTax,
  ESTIMATION_BANNER,
  MissingRuleError,
  monthlyDeadlines,
  progressiveTax,
  rateToPpm,
  rdcSeedRules,
  RuleSet,
  RuleTrace,
  smtEligible,
  SMT_THRESHOLDS_XAF,
  vatFromGross,
  vatFromNet,
  vatReturn,
  vatSettlementLines,
  type TaxRule,
} from './index';

const rules = new RuleSet(rdcSeedRules());

describe('règles versionnées', () => {
  it('sélectionne la règle en vigueur à la date', () => {
    const extra: TaxRule = { country: 'CD', tax: 'IS', param: 'taux', value: '0.35', effectiveFrom: '2020-01-01', effectiveTo: '2025-12-31', status: 'VALIDE', legalRef: 'ancien régime' };
    const rs = new RuleSet([...rdcSeedRules(), extra]);
    expect(rs.find<string>('CD', 'IS', 'taux', '2024-06-01').value).toBe('0.35');
    expect(rs.find<string>('CD', 'IS', 'taux', '2026-06-01').value).toBe('0.30');
    expect(() => rs.find('CD', 'IS', 'taux', '2019-01-01')).toThrow(MissingRuleError);
    expect(rs.tryFind('CI', 'IS', 'taux', '2026-01-01')).toBeNull();
    expect(rs.tryFind('CD', 'IS', 'taux', '2026-01-01')).not.toBeNull();
  });
  it('affiche le bandeau d’estimation pour une règle A_VALIDER', () => {
    const t = new RuleTrace();
    expect(t.banner).toBeNull();
    t.use(rules.find('CD', 'TVA', 'taux_normal', '2026-02-01'));
    expect(t.estimation).toBe(true);
    expect(t.banner).toBe(ESTIMATION_BANNER);
  });
});

describe('calculs', () => {
  it('applique un taux sans flottant', () => {
    expect(rateToPpm('0.16')).toBe(160_000n);
    expect(rateToPpm(0.015)).toBe(15_000n);
    expect(() => rateToPpm('16%')).toThrow();
    expect(applyRate(100_000_00n, '0.16')).toBe(16_000_00n);
  });
  it('calcule la TVA HT→TTC et TTC→HT', () => {
    expect(vatFromNet(100_00n, '0.16')).toEqual({ net: 100_00n, vat: 16_00n, gross: 116_00n });
    expect(vatFromGross(116_00n, '0.16')).toEqual({ net: 100_00n, vat: 16_00n, gross: 116_00n });
  });
  it('liquide la TVA : due ou crédit à reporter', () => {
    expect(vatReturn({ collected: 100n, deductible: 30n, previousCredit: 20n }).due).toBe(50n);
    const credit = vatReturn({ collected: 10n, deductible: 30n, previousCredit: 0n });
    expect(credit.creditToCarry).toBe(20n);
    const l1 = vatSettlementLines({ collected: 100n, deductible: 30n, previousCredit: 20n });
    expect(l1.reduce((s, l) => s + l.debit - l.credit, 0n)).toBe(0n);
    const l2 = vatSettlementLines({ collected: 10n, deductible: 30n, previousCredit: 0n });
    expect(l2.find((l) => l.account === '444900')!.debit).toBe(20n);
    expect(vatSettlementLines({ collected: 0n, deductible: 0n, previousCredit: 0n })).toEqual([]);
  });
  it('applique un barème annuel en paie mensuelle', () => {
    const b = rules.find<{ de: number; a: number | null; taux: number }[]>('CD', 'IRPP_SALAIRES', 'bareme_annuel', '2026-01-31').value;
    expect(progressiveTax(2_850_000_00n, b, 2, 12)).toBe(565_560_00n);
    expect(progressiveTax(0n, b, 2, 12)).toBe(0n);
    expect(progressiveTax(5_000_000_00n, b, 2, 1)).toBe(58_320_00n + 458_400_00n);
    expect(progressiveTax(50_000_000_00n, b, 2, 1)).toBe(58_320_00n + 2_948_400_00n + 6_480_000_00n + 2_720_000_00n);
  });
  // 5 cas fiscaux (critère L5, à confronter aux calculs du fiscaliste)
  it.each([
    [100_000_000_00n, 1_000_000_000_00n, 'IS', 30_000_000_00n],
    [10_000_000_00n, 2_000_000_000_00n, 'MINIMUM', 20_000_000_00n],
    [-5_000_000_00n, 500_000_000_00n, 'MINIMUM', 5_000_000_00n],
    [0n, 0n, 'IS', 0n],
    [33_333_333_33n, 1_000_000_000_00n, 'IS', 10_000_000_00n],
  ])('IS ou minimum : résultat %s, CA %s → %s', (profit, turnover, basis, due) => {
    const r = corporateTax(rules, { country: 'CD', date: '2026-12-31', taxableProfit: profit, turnover });
    expect(r.basis).toBe(basis);
    expect(r.due).toBe(due);
    expect(r.banner).toBe(ESTIMATION_BANNER);
    expect(r.account).toBe(basis === 'IS' ? '891100' : '895000');
  });
  it('génère le calendrier et teste l’éligibilité SMT', () => {
    const cal = monthlyDeadlines('TVA', 2026, 15, 'Déclaration TVA');
    expect(cal).toHaveLength(12);
    expect(cal[11]!.dueDate).toBe('2027-01-15');
    expect(cal[0]!.dueDate).toBe('2026-02-15');
    expect(SMT_THRESHOLDS_XAF.SERVICES).toBe(30_000_000n);
    expect(smtEligible(10n, 20n)).toBe(true);
    expect(smtEligible(20n, 20n)).toBe(false);
  });
});
