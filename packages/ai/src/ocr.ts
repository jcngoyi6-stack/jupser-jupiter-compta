/**
 * OCR des pièces (docs/07) : un modèle multimodal lit la photo ou le PDF et renvoie un JSON strict ;
 * ce module valide ce JSON. Les montants sont convertis en unités mineures sans flottant.
 * Le résultat n'est qu'une proposition : l'écriture reste BROUILLON_IA jusqu'à acceptation humaine.
 */
export const OCR_PROMPT = [
  'Tu lis une pièce comptable (facture fournisseur, reçu, note de frais) émise en Afrique (espace OHADA).',
  'Réponds UNIQUEMENT par un objet JSON, sans texte autour, avec les clés :',
  '{"documentType":"FACTURE|RECU|AVOIR|AUTRE","supplierName":string|null,"supplierTaxId":string|null,"number":string|null,',
  '"date":"AAAA-MM-JJ"|null,"currency":"CDF|USD|EUR|XOF|XAF|GNF|KMF"|null,"netAmount":"123.45"|null,"vatAmount":"0.00"|null,',
  '"grossAmount":"123.45"|null,"description":string|null,"normalizedInvoice":{"codeDefDgi":string|null,"nim":string|null}|null,"confidence":0..1}',
  'Montants en chaînes décimales avec un point. N’invente rien : null si illisible ou absent.',
].join('\n');

export interface OcrResult {
  documentType: 'FACTURE' | 'RECU' | 'AVOIR' | 'AUTRE';
  supplierName: string | null;
  supplierTaxId: string | null;
  number: string | null;
  date: string | null;
  currency: string | null;
  netAmount: bigint | null;
  vatAmount: bigint | null;
  grossAmount: bigint | null;
  description: string | null;
  normalizedInvoice: { codeDefDgi: string | null; nim: string | null } | null;
  confidence: number;
  warnings: string[];
}

const CURRENCIES = new Set(['CDF', 'USD', 'EUR', 'XOF', 'XAF', 'GNF', 'KMF']);
const ZERO_DEC = new Set(['XOF', 'XAF', 'GNF', 'KMF']);

function amount(v: unknown, decimals: number): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(decimals, '0').slice(0, decimals);
  const v2 = BigInt((m[2] ?? '0') + frac);
  return m[1] ? -v2 : v2;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null);

/** Extrait et contrôle le JSON renvoyé par le modèle (tolère des balises ```json). */
export function parseOcrResponse(text: string, fallbackCurrency: string): OcrResult {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('OCR_REPONSE_ILLISIBLE');
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error('OCR_REPONSE_ILLISIBLE');
  }
  const warnings: string[] = [];
  const cur = typeof j.currency === 'string' && CURRENCIES.has(j.currency) ? j.currency : fallbackCurrency;
  if (cur !== j.currency) warnings.push(`Devise non lue : ${fallbackCurrency} retenue par défaut.`);
  const dec = ZERO_DEC.has(cur) ? 0 : 2;
  const net = amount(j.netAmount, dec);
  const vat = amount(j.vatAmount, dec);
  const gross = amount(j.grossAmount, dec);
  if (net !== null && vat !== null && gross !== null && net + vat !== gross) warnings.push('Le total TTC ne correspond pas à HT + TVA : vérifier la pièce.');
  const date = typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null;
  if (!date) warnings.push('Date non lue.');
  const ni = j.normalizedInvoice as { codeDefDgi?: unknown; nim?: unknown } | null | undefined;
  const type = ['FACTURE', 'RECU', 'AVOIR', 'AUTRE'].includes(String(j.documentType)) ? (j.documentType as OcrResult['documentType']) : 'AUTRE';
  const conf = typeof j.confidence === 'number' ? Math.min(1, Math.max(0, j.confidence)) : 0;
  return {
    documentType: type, supplierName: str(j.supplierName), supplierTaxId: str(j.supplierTaxId), number: str(j.number), date, currency: cur,
    netAmount: net, vatAmount: vat, grossAmount: gross, description: str(j.description),
    normalizedInvoice: ni ? { codeDefDgi: str(ni.codeDefDgi), nim: str(ni.nim) } : null,
    confidence: warnings.length ? Math.min(conf, 0.5) : conf, warnings,
  };
}

export const OCR_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const;
export type OcrMediaType = (typeof OCR_MEDIA_TYPES)[number];
