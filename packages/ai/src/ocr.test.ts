import { describe, expect, it } from 'vitest';
import { parseOcrResponse } from './ocr';

describe('OCR — contrôle de la réponse du modèle', () => {
  it('lit un JSON entouré de balises', () => {
    const r = parseOcrResponse('```json\n{"documentType":"FACTURE","supplierName":"SNEL","number":"F-12","date":"2026-03-01","currency":"CDF","netAmount":"100 000,50","vatAmount":"16000.08","grossAmount":"116000.58","normalizedInvoice":{"codeDefDgi":"ABC","nim":null},"confidence":0.92}\n```', 'USD');
    expect(r).toMatchObject({ documentType: 'FACTURE', supplierName: 'SNEL', netAmount: 10000050n, grossAmount: 11600058n, confidence: 0.92, warnings: [] });
    expect(r.normalizedInvoice).toEqual({ codeDefDgi: 'ABC', nim: null });
  });
  it('signale les incohérences et abaisse la confiance', () => {
    const r = parseOcrResponse('{"documentType":"?","currency":"ZZZ","netAmount":"100","vatAmount":"18","grossAmount":"120","confidence":0.9,"date":"01/02/2026"}', 'XOF');
    expect(r.currency).toBe('XOF');
    expect(r.netAmount).toBe(100n);
    expect(r.documentType).toBe('AUTRE');
    expect(r.warnings).toHaveLength(3);
    expect(r.confidence).toBe(0.5);
    const n = parseOcrResponse('{"netAmount":"-5","vatAmount":"abc","confidence":7}', 'CDF');
    expect(n.netAmount).toBe(-500n);
    expect(n.vatAmount).toBeNull();
    expect(n.normalizedInvoice).toBeNull();
    expect(parseOcrResponse('{"confidence":"x","currency":"USD","date":"2026-01-01","supplierName":"  "}', 'CDF')).toMatchObject({ confidence: 0, supplierName: null });
  });
  it('refuse une réponse illisible', () => {
    expect(() => parseOcrResponse('pas de json', 'CDF')).toThrow('OCR_REPONSE_ILLISIBLE');
    expect(() => parseOcrResponse('{ cassé }', 'CDF')).toThrow('OCR_REPONSE_ILLISIBLE');
  });
});
