import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeGenericPayslip, contributionsOf, countryPackRules, MissingValueError, parsePercent, RuleSet, rdcSeedRules, type CountryRef, type TaxRule } from './index';

const ref = JSON.parse(readFileSync(join(__dirname, '../../../data/pays_ohada_referentiel.json'), 'utf8')).pays as CountryRef[];

describe('packs des 17 pays', () => {
  const rules = countryPackRules(ref);
  it('couvre les 17 États parties, tout au statut A_VALIDER', () => {
    expect(new Set(rules.map((r) => r.country)).size).toBe(17);
    expect(rules.every((r) => r.status === 'A_VALIDER')).toBe(true);
  });
  it('lit les taux chiffrés sans en inventer', () => {
    const v = (c: string, t: string, p: string) => rules.find((r) => r.country === c && r.tax === t && r.param === p)?.value;
    expect(v('CI', 'TVA', 'taux_normal')).toBe('0.18');
    expect(v('CI', 'TVA', 'taux_reduit')).toBe('0.09');
    expect(v('CM', 'TVA', 'taux_normal')).toBe('0.1925');
    expect(v('BF', 'IS', 'taux')).toBe('0.275');
    expect(v('CM', 'IS', 'taux')).toBe('0.33');
    expect(v('GN', 'IS', 'taux')).toBeNull();
    expect(v('KM', 'IS', 'taux')).toBeNull();
    expect(v('GW', 'TVA', 'taux_normal')).toBeNull();
    expect(v('SN', 'IMPOT_SALAIRES', 'bareme_annuel')).toBeNull();
  });
  it('analyse les pourcentages', () => {
    expect(parsePercent('30 %')).toBe('0.3');
    expect(parsePercent('27,5 %')).toBe('0.275');
    expect(parsePercent('1 % du chiffre')).toBe('0.01');
    expect(parsePercent('À confirmer')).toBeNull();
    expect(parsePercent('Minimum forfaitaire')).toBeNull();
    expect(parsePercent('25 % à 35 % selon activité')).toBeNull();
  });
  it('déduit les cotisations sociales', () => {
    const gn = contributionsOf(ref.find((c) => c.code === 'GN')!);
    expect(gn.find((c) => c.code === 'CNSS_salarie')).toMatchObject({ part: 'SALARIE', taux: '0.05' });
    expect(gn.find((c) => c.code === 'VF_employeur')).toMatchObject({ part: 'EMPLOYEUR', taux: '0.06', base: 'BRUT' });
    const ci = contributionsOf(ref.find((c) => c.code === 'CI')!);
    expect(ci.find((c) => c.code === 'CNPS_employeur')!.taux).toBeNull();
  });
  it('refuse de calculer une paie tant que le barème n’est pas saisi', () => {
    const rs = new RuleSet(rules);
    expect(() => computeGenericPayslip(rs, { country: 'GN', payDate: '2026-03-31', decimals: 0, gross: 1_000_000n, contributableBase: 1_000_000n, taxableBase: 1_000_000n })).toThrow(MissingValueError);
    expect(() => computeGenericPayslip(rs, { country: 'CI', payDate: '2026-03-31', decimals: 0, gross: 1n, contributableBase: 1n, taxableBase: 1n })).toThrow(/CNPS|taux/);
  });
  it('calcule la paie dès que le fiscaliste a saisi le barème', () => {
    const extra: TaxRule = { country: 'GN', tax: 'IMPOT_SALAIRES', param: 'bareme_annuel', value: [{ de: 0, a: 12_000_000, taux: 0 }, { de: 12_000_000, a: null, taux: 0.1 }], effectiveFrom: '2026-02-01', status: 'VALIDE', legalRef: 'cas de test' };
    const rs = new RuleSet([...rules, extra]);
    const p = computeGenericPayslip(rs, { country: 'GN', payDate: '2026-03-31', decimals: 0, gross: 2_000_000n, contributableBase: 2_000_000n, taxableBase: 2_000_000n });
    expect(p.employeeContributions).toBe(100_000n); // CNSS 5 %
    expect(p.employerContributions).toBe(360_000n + 120_000n + 30_000n); // CNSS 18 % + VF 6 % + TA 1,5 %
    expect(p.incomeTax).toBe(100_000n); // (24 M – 12 M) × 10 % / 12
    expect(p.net).toBe(1_800_000n);
    expect(p.banner).toMatch(/Estimation/);
  });
  it('reste compatible avec le pack RDC détaillé', () => {
    expect(rdcSeedRules().length).toBeGreaterThan(10);
  });
});
