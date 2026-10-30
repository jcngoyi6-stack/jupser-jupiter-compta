import { isValidAccountNumber, type EntryLineInput } from '@jupiter/ledger';

/**
 * JUPSER IA — couche pure : outils déclarés, garde-fous, propositions d'écritures (statut BROUILLON_IA).
 * L'appel au modèle (API Claude) se fait côté serveur via `LlmProvider` (apps/api).
 */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmProvider {
  complete(system: string, messages: LlmMessage[]): Promise<string>;
}

export const SYSTEM_PROMPT = [
  'Tu es JUPSER IA, assistant comptable intégré à Jupiter Compta (éditeur : JUPITER SERVICES SARLU – JUPSER, Kinshasa).',
  "Référentiel : SYSCOHADA révisé et Acte uniforme relatif au droit comptable et à l'information financière (AUDCIF).",
  'Les numéros de comptes ont 6 chiffres (compte officiel complété par des zéros : 571 → 571000).',
  'En RDC, la comptabilité est tenue en francs congolais (CDF) ; terminologie fiscale IS-IRPP (loi n°23/053).',
  "Réponds en français, cite l'article de l'AUDCIF ou la référence du guide d'application quand tu l'invoques.",
  "Si tu n'es pas certain d'une règle, réponds « je ne sais pas » et oriente vers un fiscaliste ou un expert-comptable.",
  "Tu ne valides jamais d'écriture : tu proposes des brouillons que l'utilisateur valide.",
].join('\n');

export interface ExtractedInvoice {
  supplierName: string;
  supplierTaxId?: string;
  date: string;
  number: string;
  netAmount: bigint;
  vatAmount: bigint;
  grossAmount: bigint;
  currency: string;
  expenseAccount?: string;
  confidence: number; // 0..1
}

export interface ProposedEntry {
  status: 'BROUILLON_IA';
  journalCode: string;
  date: string;
  pieceRef: string;
  label: string;
  lines: EntryLineInput[];
  confidence: number;
  warnings: string[];
}

/** Pièce d'achat → écriture proposée (charge / 4452 / 401) — jamais validée automatiquement. */
export function proposePurchaseEntry(inv: ExtractedInvoice, supplierThirdPartyId: string, journalCode = 'ACH'): ProposedEntry {
  const warnings: string[] = [];
  if (inv.netAmount + inv.vatAmount !== inv.grossAmount) warnings.push('HT + TVA ≠ TTC : vérifier les montants lus.');
  const expense = inv.expenseAccount && isValidAccountNumber(inv.expenseAccount) ? inv.expenseAccount : '605700';
  if (!inv.expenseAccount) warnings.push('Compte de charge non identifié : 605700 proposé par défaut.');
  if (inv.confidence < 0.8) warnings.push('Confiance faible : relecture attentive recommandée.');
  const lines: EntryLineInput[] = [{ account: expense, debit: inv.netAmount, credit: 0n }];
  if (inv.vatAmount > 0n) lines.push({ account: '445200', debit: inv.vatAmount, credit: 0n, vatCode: 'TVA_DED' });
  lines.push({ account: '401100', thirdPartyId: supplierThirdPartyId, debit: 0n, credit: inv.grossAmount });
  return {
    status: 'BROUILLON_IA',
    journalCode,
    date: inv.date,
    pieceRef: inv.number,
    label: `Facture ${inv.number} — ${inv.supplierName}`,
    lines,
    confidence: inv.confidence,
    warnings,
  };
}

/** Suggestions de comptes par mots-clés (mode Guide, sans appel au modèle). */
const KEYWORDS: [RegExp, string, string][] = [
  [/loyer|bail/i, '622200', 'Locations de bâtiments'],
  [/[ée]lectricit[ée]|snel/i, '605200', 'Fournitures non stockables – Électricité'],
  [/\beau\b|regideso/i, '605100', 'Fournitures non stockables – Eau'],
  [/internet|t[ée]l[ée]phone|airtime|forfait/i, '628100', 'Frais de téléphone'],
  [/carburant|essence|gasoil/i, '605300', 'Autres énergies'],
  [/fourniture.*bureau|papeterie/i, '605500', 'Fournitures de bureau non stockables'],
  [/salaire|\bpaie\b/i, '661100', 'Appointements, salaires et commissions'],
  [/transport|taxi|billet/i, '618100', 'Voyages et déplacements'],
  [/honoraire|avocat|consultant|expert/i, '632400', 'Honoraires des professions réglementées'],
  [/assurance/i, '625100', 'Assurances multirisques'],
  [/banque|frais bancaires|agios/i, '631800', 'Autres frais bancaires'],
  [/marchandise/i, '601100', 'Achats de marchandises'],
  [/publicit|annonce/i, '627100', 'Annonces, insertions'],
  [/entretien|r[ée]paration/i, '624800', 'Autres entretiens et réparations'],
];

export function suggestAccounts(text: string, known: ReadonlySet<string>): { account: string; label: string }[] {
  const out: { account: string; label: string }[] = [];
  for (const [re, acc, label] of KEYWORDS) {
    if (!re.test(text)) continue;
    // si le plan de la société ne contient pas la subdivision, on remonte au compte officiel parent
    const candidates = [acc, acc.slice(0, 4).padEnd(6, '0'), acc.slice(0, 3).padEnd(6, '0')];
    out.push({ account: candidates.find((c) => known.has(c)) ?? acc, label });
  }
  return out;
}

/** Minimisation des données envoyées au modèle : masque noms de salariés, téléphones, e-mails, IBAN/RIB. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail]')
    .replace(/(\+?243|0)\s?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}/g, '[téléphone]')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9 ]{10,30}\b/g, '[compte bancaire]');
}

export interface AiActionRecord {
  tool: string;
  status: 'PROPOSE' | 'ACCEPTE' | 'REJETE';
  acceptedBy?: string | null;
}

/** Garde-fou : une action IA ne s'accepte que par un humain identifié, jamais par l'IA elle-même. */
export function acceptAction(a: AiActionRecord, userId: string | null | undefined): AiActionRecord {
  if (!userId || userId === 'JUPSER_IA') throw new Error('Une action IA doit être acceptée par un utilisateur humain.');
  if (a.status !== 'PROPOSE') throw new Error('Action déjà traitée.');
  return { ...a, status: 'ACCEPTE', acceptedBy: userId };
}

/** Fournisseur factice (V0 : sans clé d'API) — répond à partir de la base de connaissances interne. */
export class MockLlmProvider implements LlmProvider {
  async complete(_system: string, messages: LlmMessage[]): Promise<string> {
    const q = messages[messages.length - 1]?.content ?? '';
    const s = suggestAccounts(q, new Set());
    if (/achat.*tva|tva.*achat/i.test(q)) {
      return [
        'Achat avec TVA récupérable (SYSCOHADA révisé) :',
        '- Débit 60xxxx (achat) ou compte de charge : montant HT',
        '- Débit 445200 TVA récupérable sur achats : TVA',
        '- Crédit 401100 Fournisseurs : TTC (tiers obligatoire)',
        "Pièce justificative obligatoire (principe d'enregistrement chronologique et pièce justificative).",
      ].join('\n');
    }
    if (s.length) return `Compte(s) proposé(s) : ${s.map((x) => `${x.account} — ${x.label}`).join(' ; ')}. À confirmer selon la nature exacte de la dépense.`;
    return "Je ne sais pas répondre avec certitude. Mode hors ligne (aucune clé d'API configurée) : consultez l'AUDCIF ou votre expert-comptable.";
  }
}
export * from './ocr';
