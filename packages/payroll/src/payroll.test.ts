import { balanceGap } from '@jupiter/ledger';
import { rdcSeedRules, RuleSet } from '@jupiter/tax-engine';
import { describe, expect, it } from 'vitest';
import { computePayslip, payrollEntryLines, type PayslipInput } from './index';

const rules = new RuleSet(rdcSeedRules());
const base: PayslipInput = {
  employeeId: 'E1',
  country: 'CD',
  payDate: '2026-01-31',
  contractCurrency: 'USD',
  currencyDecimals: 2,
  localDecimals: 2,
  fxRate: '2850',
  fxSource: 'BCC',
  elements: [{ code: 'BASE', label: 'Salaire de base', amount: 1_000_00n, taxable: true, contributable: true }],
  dependents: 2,
  headcount: 10,
};

describe('paie RDC 2026 (IS-IRPP)', () => {
  it('cas 1 : 1 000 USD, 2 personnes à charge', () => {
    const s = computePayslip(rules, base);
    expect(s.gross).toBe(2_850_000_00n);
    expect(s.cnssEmployee).toBe(142_500_00n);
    expect(s.irppBeforeReduction).toBe(565_560_00n);
    expect(s.familyReduction).toBe(22_622_40n);
    expect(s.irpp).toBe(542_937_60n);
    expect(s.net).toBe(2_164_562_40n);
    expect(s.employer.cnssPensions + s.employer.cnssRisks + s.employer.cnssFamily).toBe(370_500_00n);
    expect(s.employer.inpp).toBe(85_500_00n);
    expect(s.employer.onem).toBe(5_700_00n);
    expect(s.totalCost).toBe(2_850_000_00n + 461_700_00n);
    expect(s.banner).toMatch(/Estimation/);
  });
  it('cas 2 : petit salaire en CDF → minimum mensuel de 2 000 FC', () => {
    const s = computePayslip(rules, { ...base, contractCurrency: 'CDF', fxRate: null, elements: [{ code: 'BASE', label: 'Base', amount: 50_000_00n, taxable: true, contributable: true }], dependents: 0 });
    expect(s.irppBeforeReduction).toBe(1_500_00n);
    expect(s.irpp).toBe(2_000_00n);
  });
  it('cas 3 : indemnités non imposables (logement, transport)', () => {
    const s = computePayslip(rules, {
      ...base,
      elements: [
        ...base.elements,
        { code: 'LOG', label: 'Indemnité de logement', amount: 300_00n, taxable: false, contributable: false, account: '663100' },
        { code: 'TRA', label: 'Indemnité de transport', amount: 100_00n, taxable: false, contributable: false, account: '663400' },
      ],
    });
    expect(s.gross).toBe(3_990_000_00n);
    expect(s.taxableBase).toBe(2_850_000_00n);
    expect(s.contributableBase).toBe(2_850_000_00n);
  });
  it('cas 4 : charges de famille plafonnées à 9 personnes', () => {
    const s9 = computePayslip(rules, { ...base, dependents: 9 });
    const s12 = computePayslip(rules, { ...base, dependents: 12 });
    expect(s12.irpp).toBe(s9.irpp);
  });
  it('cas 5 : grand effectif → taux INPP réduit ; avances retenues', () => {
    const s = computePayslip(rules, { ...base, headcount: 400, deductions: [{ code: 'AVA', label: 'Avance sur salaire', amount: 100_000_00n }] });
    expect(s.employer.inpp).toBe(28_500_00n);
    expect(s.net).toBe(2_064_562_40n);
    expect(computePayslip(rules, { ...base, headcount: 100 }).employer.inpp).toBe(57_000_00n);
  });
  it('refuse une paie en devise sans cours', () => {
    expect(() => computePayslip(rules, { ...base, fxRate: null })).toThrow(/Cours/);
  });
  it('génère une écriture de paie équilibrée', () => {
    const s1 = computePayslip(rules, { ...base, deductions: [{ code: 'AVA', label: 'Avance', amount: 10_00n }] });
    const s2 = computePayslip(rules, { ...base, employeeId: 'E2', dependents: 0 });
    const lines = payrollEntryLines([s1, s2], (id) => `TP-${id}`);
    expect(balanceGap(lines)).toBe(0n);
    expect(lines.filter((l) => l.account === '422000').every((l) => l.thirdPartyId)).toBe(true);
    expect(lines.find((l) => l.account === '447200')!.credit).toBe(s1.irpp + s2.irpp);
  });
  it('applique le plafond de 30 % du revenu imposable si la CNSS est déductible', () => {
    const rs = new RuleSet([
      ...rdcSeedRules().filter((r) => !(r.param === 'cnss_deductible' || r.param === 'plafond_taux_revenu')),
      { country: 'CD', tax: 'IRPP_SALAIRES', param: 'cnss_deductible', value: true, effectiveFrom: '2026-01-01', status: 'VALIDE', legalRef: 't' },
      { country: 'CD', tax: 'IRPP_SALAIRES', param: 'plafond_taux_revenu', value: '0.01', effectiveFrom: '2026-01-01', status: 'VALIDE', legalRef: 't' },
    ]);
    const s = computePayslip(rs, base);
    expect(s.taxableBase).toBe(2_850_000_00n - 142_500_00n);
    expect(s.irpp).toBe(27_075_00n);
  });
  it('refuse une grille INPP invalide', () => {
    const rs = new RuleSet([
      ...rdcSeedRules().filter((r) => r.tax !== 'INPP'),
      { country: 'CD', tax: 'INPP', param: 'taux_par_effectif', value: [{ max: 5, taux: '0.03' }], effectiveFrom: '2026-01-01', status: 'VALIDE', legalRef: 't' },
    ]);
    expect(() => computePayslip(rs, base)).toThrow(/INPP/);
  });
});
