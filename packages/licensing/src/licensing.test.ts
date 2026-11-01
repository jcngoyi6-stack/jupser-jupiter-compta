import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accessMode, checkQuota, computeStatus, EDITION_MODULES, hasModule, isAllowed, prorata, quoteCabinet, quoteEnterprise, reminderDue, type PriceGrid } from './index';

const tarifs = JSON.parse(readFileSync(join(__dirname, '../../../data/tarifs_modules.json'), 'utf8'));
const grid: PriceGrid = tarifs.entreprises;

describe('tarification', () => {
  it('prix = (édition + modules) × utilisateurs ; annuel = 10 mois', () => {
    const q = quoteEnterprise(grid, 'PRO', ['GRH_PAIE_RECRUTEMENT'], 5);
    expect(q.monthlyUsdCents).toBe(BigInt((95 + 25) * 5 * 100));
    expect(q.annualUsdCents).toBe(q.monthlyUsdCents * 10n);
  });
  it('applique les limites', () => {
    expect(() => quoteEnterprise(grid, 'TPE', [], 3)).toThrow(/2 utilisateurs/);
    expect(() => quoteEnterprise(grid, 'ERP', [], 51)).toThrow(/devis/);
    expect(() => quoteEnterprise(grid, 'ERP', [], 0)).toThrow();
    expect(() => quoteEnterprise(grid, 'ERP', ['XXX'], 1)).toThrow(/Module/);
    expect(() => quoteEnterprise({ ...grid, editions: [] }, 'ERP', [], 1)).toThrow(/Édition/);
  });
  it('tarife les cabinets avec suppléments', () => {
    const t = tarifs.cabinets.paliers;
    expect(quoteCabinet(t[0], 3, 25)).toBe(45_000n);
    expect(quoteCabinet(t[0], 5, 30)).toBe(BigInt((450 + 2 * 60 + 5 * 8) * 100));
    expect(() => quoteCabinet(t[3], 1, 1)).toThrow(/devis/);
    expect(quoteCabinet({ code: 'X', prix_mensuel: 10 }, 1, 1)).toBe(1000n);
  });
});

describe('cycle de vie (critère L3 : lecture seule à J+15)', () => {
  const s = { status: 'ACTIF' as const, paidUntil: '2026-10-01' };
  it.each([
    ['2026-09-30', 'ACTIF'],
    ['2026-10-05', 'IMPAYE'],
    ['2026-10-16', 'LECTURE_SEULE'],
    ['2026-11-30', 'SUSPENDU'],
  ])('%s → %s', (today, expected) => expect(computeStatus(s, today)).toBe(expected));
  it('gère essai, archivage et rappels', () => {
    expect(computeStatus({ status: 'ESSAI', trialEndsAt: '2026-11-01' }, '2026-10-30')).toBe('ESSAI');
    expect(computeStatus({ status: 'ESSAI' }, '2026-10-30')).toBe('ESSAI');
    expect(computeStatus({ ...s, archived: true }, '2026-10-30')).toBe('ARCHIVE');
    expect(reminderDue('2026-10-08', '2026-10-01')).toBe('J-7');
    expect(reminderDue('2026-10-01', '2026-10-08')).toBe('J+7');
    expect(reminderDue('2026-10-01', '2026-10-02')).toBeNull();
  });
  it('en lecture seule : consultation et exports permis', () => {
    expect(accessMode('IMPAYE')).toBe('COMPLET');
    expect(accessMode('LECTURE_SEULE')).toBe('LECTURE_SEULE');
    expect(accessMode('SUSPENDU')).toBe('AUCUN');
    expect(isAllowed('LECTURE_SEULE', 'GET')).toBe(true);
    expect(isAllowed('LECTURE_SEULE', 'POST', '/api/exports/fec')).toBe(true);
    expect(isAllowed('LECTURE_SEULE', 'POST', '/api/entries')).toBe(false);
    expect(isAllowed('AUCUN', 'GET')).toBe(false);
    expect(isAllowed('COMPLET', 'DELETE')).toBe(true);
  });
  it('contrôle modules, quotas et prorata', () => {
    expect(hasModule(EDITION_MODULES.PRO, 'FISCALITE')).toBe(true);
    expect(hasModule(EDITION_MODULES.ESSENTIEL, 'GRH_PAIE_RECRUTEMENT')).toBe(false);
    expect(EDITION_MODULES.ERP).toContain('IA_AGENT');
    expect(checkQuota('users', 2, { users: 3, companies: 1, aiCredits: 0 }).ok).toBe(true);
    expect(checkQuota('users', 3, { users: 3, companies: 1, aiCredits: 0 }).message).toMatch(/Quota/);
    expect(prorata(3000n, 15, 30)).toBe(1500n);
    expect(() => prorata(1n, 1, 0)).toThrow();
  });
});

describe('passage de l’essai à l’abonnement payant', () => {
  it('rappels de fin d’essai', async () => {
    const { trialReminderDue } = await import('./index');
    expect(trialReminderDue('2026-12-01', '2026-11-24')).toBe('ESSAI_J-7');
    expect(trialReminderDue('2026-12-01', '2026-11-30')).toBe('ESSAI_J-1');
    expect(trialReminderDue('2026-12-01', '2026-12-01')).toBe('ESSAI_J0');
    expect(trialReminderDue('2026-12-01', '2026-11-28')).toBeNull();
  });
  it('la période payée commence après l’essai ou l’abonnement en cours', async () => {
    const { paidPeriodStart, addMonthsUtc } = await import('./index');
    const now = new Date('2026-11-10T00:00:00Z');
    expect(paidPeriodStart(null, new Date('2026-12-01T00:00:00Z'), now).toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(paidPeriodStart(new Date('2027-03-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'), now).toISOString().slice(0, 10)).toBe('2027-03-01');
    expect(paidPeriodStart(null, new Date('2026-10-01T00:00:00Z'), now)).toEqual(now);
    expect(addMonthsUtc(new Date('2027-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2027-02-28');
    expect(addMonthsUtc(new Date('2026-12-01T00:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-12-01');
  });
});
