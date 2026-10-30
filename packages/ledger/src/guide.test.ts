/**
 * Exemples chiffrés du guide d'application du SYSCOHADA révisé (immobilisations).
 * Les numéros renvoient aux « Applications » du guide.
 */
import { describe, expect, it } from 'vitest';
import { accumulatedAt, componentSchedule, depreciationAccounts, derogatoryLines, derogatorySchedule, disposalLines, dotationLines, mirrorAccounts } from './assets';

const dots = (rows: { dotation: bigint }[]) => rows.map((r) => r.dotation);

describe('guide d’application — immobilisations', () => {
  it('application 13 : dégressif à taux décroissant (SOFTY), valeur résiduelle déduite', () => {
    const rows = componentSchedule({ label: 'Machine-outil', cost: 550_000n, residualValue: 50_000n, method: 'DEGRESSIF', years: 5 }, '2026-01-01');
    expect(dots(rows)).toEqual([166_667n, 133_333n, 100_000n, 66_667n, 33_333n]);
    expect(rows.at(-1)!.vnc).toBe(50_000n);
  });
  it('dégressif SOFTY avec mise en service en cours d’année : annuités réparties sur deux exercices', () => {
    const rows = componentSchedule({ label: 'Machine', cost: 150_000n, method: 'DEGRESSIF', years: 2 }, '2026-07-01');
    // annuités 100 000 puis 50 000 ; exercice 1 = 100 000 × 6/12, exercice 2 = 100 000 × 6/12 + 50 000 × 6/12
    expect(dots(rows)).toEqual([50_000n, 75_000n, 25_000n]);
  });
  it('application 14 : unités d’œuvre, sans prorata temporis', () => {
    const rows = componentSchedule({ label: 'Machine-outil', cost: 550_000n, residualValue: 50_000n, method: 'UNITES_OEUVRE', years: 5, totalUnits: 750_000,
      unitsByYear: { '2026': 150_000, '2027': 250_000, '2028': 250_000, '2029': 50_000, '2030': 50_000 } }, '2026-01-01');
    expect(dots(rows)).toEqual([100_000n, 166_667n, 166_667n, 33_333n, 33_333n]);
    expect(rows.at(-1)!.vnc).toBe(50_000n);
  });
  it('application 17 : prorata temporis (matériel de transport acquis le 1er juillet, 20 %)', () => {
    const lines = dotationLines([{ account: '245000', inServiceDate: '2026-07-01', components: [{ label: 'Véhicule', cost: 150n, method: 'LINEAIRE', years: 5 }] }], 2026);
    expect(lines).toEqual([{ account: '681300', debit: 15n, credit: 0n }, { account: '284500', debit: 0n, credit: 15n }]);
    const brevet = dotationLines([{ account: '212000', inServiceDate: '2026-01-01', components: [{ label: 'Brevet', cost: 50n, method: 'LINEAIRE', years: 10 }] }], 2026);
    expect(brevet[0]).toEqual({ account: '681200', debit: 5n, credit: 0n });
  });
  it('application 18 : amortissements dérogatoires (linéaire 4 ans, fiscal dégressif 40 %)', () => {
    const c = { label: 'Matériel de transport', cost: 600n, method: 'LINEAIRE' as const, years: 4, fiscal: { method: 'DEGRESSIF_COEFFICIENT' as const, years: 4, degressiveCoefficient: '1.6' } };
    const s = derogatorySchedule(c, '2026-01-01');
    expect(s.map((r) => [r.fiscal, r.accounting, r.dotation, r.reprise])).toEqual([[240n, 150n, 90n, 0n], [144n, 150n, 0n, 6n], [108n, 150n, 0n, 42n], [108n, 150n, 0n, 42n]]);
    expect(s.at(-1)!.balance).toBe(0n);
    const a = [{ account: '245000', inServiceDate: '2026-01-01', components: [c] }];
    expect(derogatoryLines(a, 2026)).toEqual([{ account: '851000', debit: 90n, credit: 0n }, { account: '151000', debit: 0n, credit: 90n }]);
    expect(derogatoryLines(a, 2027)).toEqual([{ account: '151000', debit: 6n, credit: 0n }, { account: '861000', debit: 0n, credit: 6n }]);
    expect(derogatoryLines(a, 2035)).toEqual([]);
    expect(derogatorySchedule({ label: 'x', cost: 1n, method: 'LINEAIRE', years: 1 }, '2026-01-01')).toEqual([]);
  });
  it('application 33 : approche par composants et renouvellement de l’ascenseur après 8 ans', () => {
    const building = { account: '231300', inServiceDate: '2026-01-01', components: [
      { label: 'Structure', cost: 120_000_000n, method: 'LINEAIRE' as const, years: 30 },
      { label: 'Ascenseur', cost: 30_000_000n, method: 'LINEAIRE' as const, years: 10 },
    ] };
    expect(dotationLines([building], 2026)[0]).toEqual({ account: '681300', debit: 7_000_000n, credit: 0n });
    expect(accumulatedAt({ ...building, components: [building.components[1]!] }, '2033-12-31')).toBe(24_000_000n);
    const out = disposalLines(building, '2033-12-31', 0n, undefined, 24_000_000n, 1);
    expect(out.vnc).toBe(6_000_000n);
    expect(out.lines).toEqual([
      { account: '283100', debit: 24_000_000n, credit: 0n },
      { account: '812000', debit: 6_000_000n, credit: 0n },
      { account: '231300', debit: 0n, credit: 30_000_000n },
    ]);
    expect(() => disposalLines(building, '2033-12-31', 0n, undefined, 0n, 5)).toThrow('COMPOSANT_INCONNU');
  });
  it('comptes 28 et 29 : compte officiel par défaut, compte miroir de l’entité si fourni', () => {
    expect(depreciationAccounts('245100').amort).toBe('284500');
    expect(depreciationAccounts('231310', '283131').amort).toBe('283131');
    expect(mirrorAccounts('231310')).toEqual({ amort: ['283131', '283100'], impairment: ['293131', '293100'] });
  });
  it('application 15 : décomptabilisation (prix en 4852/822, dotation complémentaire, VNC en 812)', () => {
    const it = { account: '244200', inServiceDate: '2026-01-01', components: [{ label: 'Ordinateur', cost: 10_000n, method: 'LINEAIRE' as const, years: 5 }] };
    const out = disposalLines(it, '2030-06-30', 500n, undefined, 8_000n);
    expect(out.accumulated).toBe(9_000n);
    expect(out.lines).toEqual([
      { account: '681300', debit: 1_000n, credit: 0n }, { account: '284400', debit: 0n, credit: 1_000n },
      { account: '284400', debit: 9_000n, credit: 0n }, { account: '812000', debit: 1_000n, credit: 0n }, { account: '244200', debit: 0n, credit: 10_000n },
      { account: '485200', debit: 500n, credit: 0n }, { account: '822000', debit: 0n, credit: 500n },
    ]);
  });
});

describe('guide d’application — dépréciation des immobilisations', () => {
  const M = 1_000_000n;
  const c = { label: 'Matériel industriel', cost: 30n * M, method: 'LINEAIRE' as const, years: 6, valueTests: [{ year: 2026, actualValue: 8n * M }, { year: 2028, actualValue: 9n * M }] };
  it('application 44 : perte de valeur, plan révisé, reprise plafonnée', async () => {
    const { componentSchedule, impairmentLines } = await import('./assets');
    const rows = componentSchedule(c, '2025-01-01');
    expect(rows.map((r) => r.dotation)).toEqual([5n * M, 5n * M, 2n * M, 2n * M, 4_500_000n, 4_500_000n]);
    // Le tableau du guide imprime 5 000 000 en N+3 : coquille (9 000 000 − 4 500 000 = 4 500 000, puis 0 en N+4).
    expect(rows.map((r) => r.vnc)).toEqual([25n * M, 8n * M, 6n * M, 9n * M, 4_500_000n, 0n]);
    expect(rows[1]!.impairmentDotation).toBe(12n * M);
    expect(rows[3]!.impairmentReprise).toBe(5n * M);
    expect(rows.reduce((s, r) => s + r.dotation, 0n)).toBe(23n * M);
    const a = [{ account: '241100', inServiceDate: '2025-01-01', components: [c] }];
    expect(impairmentLines(a, 2026)).toEqual([{ account: '691400', debit: 12n * M, credit: 0n }, { account: '294100', debit: 0n, credit: 12n * M }]);
    expect(impairmentLines(a, 2028)).toEqual([{ account: '294100', debit: 5n * M, credit: 0n }, { account: '791400', debit: 0n, credit: 5n * M }]);
    // Variante du guide : valeur actuelle 13 000 000 → reprise limitée à 6 000 000 (plafond : VNC historique 10 000 000).
    const v = componentSchedule({ ...c, valueTests: [{ year: 2026, actualValue: 8n * M }, { year: 2028, actualValue: 13n * M }] }, '2025-01-01');
    expect(v[3]!.impairmentReprise).toBe(6n * M);
    expect(v[3]!.vnc).toBe(10n * M);
    const incorp = [{ account: '212000', inServiceDate: '2025-01-01', components: [c] }];
    expect(impairmentLines(incorp, 2026)[0]!.account).toBe('691300');
  });
});
