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
  'nav.ai': 'Jupiter IA',
  'nav.audit': 'Piste d’audit',
  'nav.users': 'Utilisateurs',
  'nav.subscription': 'Abonnement',
  'nav.console': 'Console JUPSER',
  tagline: 'Précision. Conformité. Sérénité.',
};
type Key = keyof typeof fr;
const en: Partial<Record<Key, string>> = {
  'nav.dashboard': 'Dashboard', 'nav.entry': 'Journal entry', 'nav.entries': 'Entries', 'nav.chart': 'Chart of accounts', 'nav.thirdParties': 'Third parties',
  'nav.books': 'Books', 'nav.statements': 'Financial statements', 'nav.closing': 'Year-end closing', 'nav.sales': 'Invoices', 'nav.treasury': 'Treasury & currencies',
  'nav.tax': 'Tax', 'nav.payroll': 'Payroll', 'nav.ai': 'Jupiter AI', 'nav.audit': 'Audit trail', 'nav.users': 'Users', 'nav.subscription': 'Subscription',
  'nav.console': 'JUPSER console', tagline: 'Precision. Compliance. Peace of mind.',
};
const pt: Partial<Record<Key, string>> = {
  'nav.dashboard': 'Painel', 'nav.entry': 'Lançamento', 'nav.entries': 'Lançamentos', 'nav.chart': 'Plano de contas', 'nav.thirdParties': 'Terceiros',
  'nav.books': 'Livros', 'nav.statements': 'Demonstrações financeiras', 'nav.closing': 'Encerramento', 'nav.sales': 'Faturas', 'nav.treasury': 'Tesouraria e moedas',
  'nav.tax': 'Fiscalidade', 'nav.payroll': 'Salários', 'nav.ai': 'Jupiter IA', 'nav.audit': 'Trilha de auditoria', 'nav.users': 'Utilizadores', 'nav.subscription': 'Assinatura',
  'nav.console': 'Consola JUPSER', tagline: 'Precisão. Conformidade. Serenidade.',
};
const es: Partial<Record<Key, string>> = {
  'nav.dashboard': 'Panel', 'nav.entry': 'Asiento', 'nav.entries': 'Asientos', 'nav.chart': 'Plan de cuentas', 'nav.thirdParties': 'Terceros',
  'nav.books': 'Libros', 'nav.statements': 'Estados financieros', 'nav.closing': 'Cierre', 'nav.sales': 'Facturas', 'nav.treasury': 'Tesorería y divisas',
  'nav.tax': 'Fiscalidad', 'nav.payroll': 'Nómina', 'nav.ai': 'Jupiter IA', 'nav.audit': 'Pista de auditoría', 'nav.users': 'Usuarios', 'nav.subscription': 'Suscripción',
  'nav.console': 'Consola JUPSER', tagline: 'Precisión. Conformidad. Serenidad.',
};
const dict: Record<Lang, Partial<Record<Key, string>>> = { fr, en, pt, es };

export function t(key: Key, lang: Lang = 'fr'): string {
  return dict[lang][key] ?? fr[key];
}

/** Libellés de menu : la clé est le libellé français. [anglais, portugais, espagnol] */
const LABELS: Record<string, [string, string, string]> = {
  'Pilotage': ['Management', 'Gestão', 'Dirección'],
  'Comptabilité': ['Accounting', 'Contabilidade', 'Contabilidad'],
  'Gestion': ['Operations', 'Operações', 'Gestión'],
  'Bureau': ['Office', 'Escritório', 'Oficina'],
  'Administration': ['Administration', 'Administração', 'Administración'],
  'Cabinet et conseil': ['Firm & advisory', 'Gabinete e consultoria', 'Despacho y consultoría'],
  'Notes annexes': ['Notes to the accounts', 'Notas anexas', 'Notas a los estados'],
  'États SMT': ['Minimum cash system', 'Sistema mínimo de tesouraria', 'Sistema mínimo de tesorería'],
  'Immobilisations': ['Fixed assets', 'Imobilizações', 'Inmovilizado'],
  'Rapprochement': ['Bank reconciliation', 'Reconciliação bancária', 'Conciliación bancaria'],
  'Imports': ['Imports', 'Importações', 'Importaciones'],
  'Budget': ['Budget', 'Orçamento', 'Presupuesto'],
  'Comptabilité analytique': ['Cost accounting', 'Contabilidade analítica', 'Contabilidad analítica'],
  'Plan de trésorerie': ['Cash forecast', 'Previsão de tesouraria', 'Previsión de tesorería'],
  'Consolidation': ['Consolidation', 'Consolidação', 'Consolidación'],
  'Stocks': ['Inventory', 'Existências', 'Existencias'],
  'Achats': ['Purchasing', 'Compras', 'Compras'],
  'Production': ['Production', 'Produção', 'Producción'],
  'CRM et campagnes': ['CRM & campaigns', 'CRM e campanhas', 'CRM y campañas'],
  'Ressources humaines': ['Human resources', 'Recursos humanos', 'Recursos humanos'],
  'Mon espace salarié': ['My employee space', 'Meu espaço', 'Mi espacio'],
  'Collaboration': ['Collaboration', 'Colaboração', 'Colaboración'],
  'Archives (GED)': ['Document archive', 'Arquivo documental', 'Archivo documental'],
  'Courrier': ['Mail register', 'Correspondência', 'Correspondencia'],
  'Portefeuille et missions': ['Clients & engagements', 'Carteira e missões', 'Cartera y encargos'],
  'États depuis une balance': ['Statements from trial balance', 'Demonstrações a partir do balancete', 'Estados desde balance'],
  'Manuel de procédures': ['Procedures manual', 'Manual de procedimentos', 'Manual de procedimientos'],
  'Évaluation et restructuration': ['Valuation & restructuring', 'Avaliação e reestruturação', 'Valoración y reestructuración'],
  'Projets d’investissement': ['Investment projects', 'Projetos de investimento', 'Proyectos de inversión'],
  'Sécurité et postes': ['Security & devices', 'Segurança e postos', 'Seguridad y equipos'],
};

export function tl(label: string, lang: Lang): string {
  if (lang === 'fr') return label;
  const key = (Object.keys(fr) as Key[]).find((k) => fr[k] === label);
  if (key) return t(key, lang);
  const row = LABELS[label];
  return row ? row[lang === 'en' ? 0 : lang === 'pt' ? 1 : 2] : label;
}

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
];

export function storedLang(): Lang {
  try {
    const v = localStorage.getItem('jc_lang');
    return v === 'en' || v === 'pt' || v === 'es' ? v : 'fr';
  } catch {
    return 'fr';
  }
}

export function saveLang(l: Lang) {
  try {
    localStorage.setItem('jc_lang', l);
  } catch {
    /* stockage indisponible : langue par défaut */
  }
}
