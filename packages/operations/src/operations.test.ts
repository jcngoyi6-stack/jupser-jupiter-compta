import { describe, expect, it } from 'vitest';
import {
  absences, applyMove, applyRate, costSheet, eligibleRecipients, emptyValuation, explode, inventoryVariance, ITEM_ACCOUNTS, loyaltyPoints, netRequirements,
  parseFingertec, payrollVariables, personalize, rankCandidates, rfm, summarize, unsubscribeToken, validateCriteria, valuate, valueOf, workingDays,
} from './index';

describe('stocks', () => {
  const moves = [
    { date: '2026-01-01', qtyMilli: 10_000n, unitCost: 1000n },
    { date: '2026-01-05', qtyMilli: 10_000n, unitCost: 1600n },
    { date: '2026-01-10', qtyMilli: -15_000n },
  ];
  it('valorise au CMUP', () => {
    const r = valuate(moves, 'CMUP');
    expect(r.costs[2]).toBe(19_500n); // 15 × 1 300
    expect(r.valuation).toMatchObject({ qtyMilli: 5000n, value: 6500n, unitCost: 1300n });
  });
  it('valorise en FIFO', () => {
    const r = valuate(moves, 'FIFO');
    expect(r.costs[2]).toBe(18_000n); // 10 × 1 000 + 5 × 1 600
    expect(r.valuation).toMatchObject({ qtyMilli: 5000n, value: 8000n, unitCost: 1600n });
  });
  it('refuse une sortie supérieure au stock et une entrée sans coût', () => {
    expect(() => applyMove(emptyValuation(), { date: 'x', qtyMilli: -1n }, 'CMUP')).toThrow(/insuffisant/);
    expect(() => applyMove(emptyValuation(), { date: 'x', qtyMilli: 1n }, 'CMUP')).toThrow(/Coût/);
    expect(applyMove(emptyValuation(), { date: 'x', qtyMilli: 0n }, 'FIFO').cost).toBe(0n);
    const full = valuate([moves[0]!, { date: '2026-01-02', qtyMilli: -10_000n }], 'CMUP');
    expect(full.valuation.value).toBe(0n);
  });
  it('calcule l’écart d’inventaire et les comptes par nature', () => {
    const v = valuate(moves, 'CMUP').valuation;
    expect(inventoryVariance(v, 4000n)).toEqual({ diffMilli: -1000n, value: -1300n });
    expect(ITEM_ACCOUNTS.MARCHANDISE!.stock).toBe('311100');
    expect(valueOf(1500n, 1000n)).toBe(1500n);
  });
});

describe('production', () => {
  it('éclate la nomenclature et établit le coût de revient', () => {
    const bom = [{ itemId: 'farine', qtyMilli: 500n }, { itemId: 'sucre', qtyMilli: 100n }];
    expect(explode(bom, 10_000n)).toEqual([{ itemId: 'farine', qtyMilli: 5000n }, { itemId: 'sucre', qtyMilli: 1000n }]);
    const cs = costSheet(bom, [{ poste: 'Four', minutes: 6, hourlyRate: 6000n }], 10_000n, (id) => (id === 'farine' ? 2000n : 3000n), '0.10');
    expect(cs.materialCost).toBe(13_000n);
    expect(cs.labourCost).toBe(6000n); // 60 min × 6 000 / h
    expect(cs.overhead).toBe(1900n);
    expect(cs.total).toBe(20_900n);
    expect(cs.unitCost).toBe(2090n);
    expect(costSheet(bom, [], 0n, () => 0n, '0').unitCost).toBe(0n);
    expect(netRequirements(bom, (id) => (id === 'farine' ? 800n : 0n))).toEqual([{ itemId: 'farine', grossMilli: 500n, netMilli: 0n }, { itemId: 'sucre', grossMilli: 100n, netMilli: 100n }]);
    expect(() => applyRate(1n, 'x')).toThrow();
    expect(applyRate(-15n, '0.1')).toBe(-2n);
  });
});

describe('RH', () => {
  const sched = { start: '08:00', dailyMinutes: 480, graceMinutes: 10, workDays: [1, 2, 3, 4, 5] };
  it('lit un export FingerTec et calcule retards et heures supplémentaires', () => {
    const p = parseFingertec([['AC-No.', 'Date', 'Time'], ['12', '02/03/2026', '08:25'], ['12', '02/03/2026', '18:00'], ['13', '2026-03-02', '07:55'], ['', '', '']]);
    expect(p).toHaveLength(3);
    const s = summarize(p, sched);
    const a = s.find((x) => x.badge === '12')!;
    expect(a).toMatchObject({ checkIn: '08:25', checkOut: '18:00', workedMinutes: 575, lateMinutes: 25, overtimeMinutes: 95 });
    expect(s.find((x) => x.badge === '13')).toMatchObject({ checkOut: null, lateMinutes: 0 });
    const dt = parseFingertec([['Badge', 'DateTime'], ['7', '2026-03-03 08:05:00']]);
    expect(dt[0]).toEqual({ badge: '7', date: '2026-03-03', time: '08:05' });
    expect(() => parseFingertec([['x']])).toThrow();
    expect(parseFingertec([])).toEqual([]);
  });
  it('compte les jours ouvrés, les absences et les variables de paie', () => {
    const days = workingDays('2026-03-02', '2026-03-08', sched, ['2026-03-04']);
    expect(days).toEqual(['2026-03-02', '2026-03-03', '2026-03-05', '2026-03-06']);
    expect(absences(days, new Set(['2026-03-02']), new Set(['2026-03-06']))).toEqual(['2026-03-03', '2026-03-05']);
    const v = payrollVariables([{ badge: '1', date: 'd', checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 30, overtimeMinutes: 120, absent: false }], 6000n, 30, true);
    expect(v.overtimePay).toBe(15_600n); // 2 h × 6 000 × 1,3
    expect(v.lateDeduction).toBe(3000n);
    expect(payrollVariables([], 1n, 0, false).lateDeduction).toBe(0n);
  });
  it('classe les candidats par critères pondérés et refuse les critères discriminatoires', () => {
    const crit = [{ code: 'DIP', label: 'Diplôme', weight: 2 }, { code: 'EXP', label: 'Expérience', weight: 3 }];
    expect(validateCriteria(crit)).toEqual([]);
    expect(validateCriteria([{ code: 'A', label: 'Âge', weight: 1 }, { code: 'B', label: 'Test', weight: 0 }])).toHaveLength(2);
    expect(validateCriteria([])).toHaveLength(1);
    const r = rankCandidates(crit, [
      { id: 'a', name: 'A', scores: [{ evaluator: 'e1', criterion: 'DIP', score: 10 }, { evaluator: 'e1', criterion: 'EXP', score: 10 }] },
      { id: 'b', name: 'B', scores: [{ evaluator: 'e1', criterion: 'DIP', score: 20 }, { evaluator: 'e2', criterion: 'DIP', score: 10 }, { evaluator: 'e1', criterion: 'EXP', score: 14 }] },
      { id: 'c', name: 'C', scores: [] },
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(r[0]!.total).toBe(14.4);
    expect(r[2]!.complete).toBe(false);
  });
});

describe('marketing', () => {
  it('segmente (RFM), filtre le consentement et personnalise avec désinscription', () => {
    const s = rfm([{ id: 'x', lastPurchase: '2026-10-20', frequency: 20, monetary: 1_500_000_000n }, { id: 'y', lastPurchase: null, frequency: 0, monetary: 0n }, { id: 'z', lastPurchase: '2026-10-25', frequency: 1, monetary: 0n }, { id: 'w', lastPurchase: '2026-01-01', frequency: 10, monetary: 0n }, { id: 'v', lastPurchase: '2026-07-01', frequency: 3, monetary: 0n }], '2026-10-30');
    expect(s.map((x) => x.segment)).toEqual(['CHAMPIONS', 'INACTIFS', 'RECENTS', 'FIDELES_A_RISQUE', 'A_DEVELOPPER']);
    const c = [{ consent: true, unsubscribed: false, phone: '1' }, { consent: false, unsubscribed: false, phone: '2' }, { consent: true, unsubscribed: true, phone: '3' }, { consent: true, unsubscribed: false, email: 'a@b.c' }];
    expect(eligibleRecipients(c, 'SMS')).toHaveLength(1);
    expect(eligibleRecipients(c, 'EMAIL')).toHaveLength(1);
    expect(unsubscribeToken()).toHaveLength(40);
    expect(personalize('Bonjour {{nom}} {{x}}', { nom: 'Ali' }, 'https://u', 'SMS')).toBe('Bonjour Ali  STOP : https://u');
    expect(personalize('Hi', {}, 'https://u', 'EMAIL')).toMatch(/Se désinscrire/);
    expect(loyaltyPoints(1_000_000n, 100_000n)).toBe(10);
    expect(loyaltyPoints(1n, 0n)).toBe(0);
  });
});
