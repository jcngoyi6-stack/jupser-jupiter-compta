import { balanceGap } from '@jupiter/ledger';
import { describe, expect, it } from 'vitest';
import { acceptAction, MockLlmProvider, proposePurchaseEntry, redact, suggestAccounts, SYSTEM_PROMPT } from './index';

describe('Jupiter IA', () => {
  it('propose une écriture d’achat en brouillon IA, jamais validée', () => {
    const p = proposePurchaseEntry(
      { supplierName: 'SNEL', date: '2026-03-01', number: 'F-889', netAmount: 100_00n, vatAmount: 16_00n, grossAmount: 116_00n, currency: 'CDF', expenseAccount: '605200', confidence: 0.95 },
      'TP-SNEL',
    );
    expect(p.status).toBe('BROUILLON_IA');
    expect(balanceGap(p.lines)).toBe(0n);
    expect(p.warnings).toEqual([]);
    const q = proposePurchaseEntry({ supplierName: 'X', date: '2026-03-01', number: 'F1', netAmount: 100n, vatAmount: 0n, grossAmount: 101n, currency: 'CDF', confidence: 0.5 }, 'T');
    expect(q.lines[0]!.account).toBe('605700');
    expect(q.warnings).toHaveLength(3);
  });
  it('suggère des comptes et remonte au parent si la subdivision manque', () => {
    expect(suggestAccounts('Paiement loyer mars', new Set(['622200']))).toEqual([{ account: '622200', label: 'Locations de bâtiments' }]);
    expect(suggestAccounts('facture électricité', new Set(['605000']))[0]!.account).toBe('605000');
    expect(suggestAccounts('rien', new Set())).toEqual([]);
  });
  it('minimise les données envoyées au modèle', () => {
    expect(redact('Contact : jean@ex.cd, +243 812 345 678, IBAN CD12ABCD12345678901234')).toBe('Contact : [e-mail], [téléphone], IBAN [compte bancaire]');
  });
  it('exige une acceptation humaine', () => {
    const a = { tool: 'propose_entry', status: 'PROPOSE' as const };
    expect(acceptAction(a, 'u1').status).toBe('ACCEPTE');
    expect(() => acceptAction(a, 'JUPSER_IA')).toThrow();
    expect(() => acceptAction(a, null)).toThrow();
    expect(() => acceptAction({ ...a, status: 'ACCEPTE' }, 'u1')).toThrow(/déjà/);
  });
  it('répond hors ligne avec le fournisseur factice', async () => {
    const llm = new MockLlmProvider();
    expect(SYSTEM_PROMPT).toMatch(/6 chiffres/);
    expect(await llm.complete(SYSTEM_PROMPT, [{ role: 'user', content: 'Comment enregistrer un achat avec TVA ?' }])).toMatch(/445200/);
    expect(await llm.complete(SYSTEM_PROMPT, [{ role: 'user', content: 'Quel compte pour le loyer ?' }])).toMatch(/622200/);
    expect(await llm.complete(SYSTEM_PROMPT, [])).toMatch(/Je ne sais pas/);
  });
});
