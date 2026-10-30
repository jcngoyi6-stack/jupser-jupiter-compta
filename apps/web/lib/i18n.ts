/** Internationalisation : français par défaut ; anglais, portugais (Guinée-Bissau), espagnol (Guinée équatoriale) prévus. */
export type Lang = 'fr' | 'en' | 'pt' | 'es';

const fr = {
  'nav.dashboard': 'Tableau de bord',
  'nav.entry': 'Saisie',
  'nav.entries': 'Écritures',
  'nav.chart': 'Plan comptable',
  'nav.thirdParties': 'Tiers',
  'nav.books': 'Livres',
  'nav.statements': 'États financiers',
  'nav.closing': 'Clôture',
  'nav.sales': 'Factures',
  'nav.treasury': 'Trésorerie & devises',
  'nav.tax': 'Fiscalité',
  'nav.payroll': 'Paie',
  'nav.ai': 'JUPSER IA',
  'nav.audit': 'Piste d’audit',
  'nav.users': 'Utilisateurs',
  'nav.subscription': 'Abonnement',
  'nav.console': 'Console JUPSER',
  tagline: 'Précision. Conformité. Sérénité.',
};
type Key = keyof typeof fr;
const en: Partial<Record<Key, string>> = {
  'nav.dashboard': 'Dashboard',
  'nav.entry': 'Journal entry',
  'nav.statements': 'Financial statements',
  tagline: 'Precision. Compliance. Peace of mind.',
};
const dict: Record<Lang, Partial<Record<Key, string>>> = { fr, en, pt: {}, es: {} };

export function t(key: Key, lang: Lang = 'fr'): string {
  return dict[lang][key] ?? fr[key];
}
