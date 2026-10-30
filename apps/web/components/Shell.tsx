'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useSession } from './session';

type Item = { href: string; label: string; roles?: string[]; module?: string; staff?: boolean; needsCompany?: boolean };

const COMPTA = ['CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE', 'AUDITEUR'];
/** Menu généré à partir des permissions : rôle × modules souscrits (docs/17). */
const MENU: { title: string; items: Item[] }[] = [
  { title: 'Pilotage', items: [{ href: '/', label: t('nav.dashboard') }] },
  {
    title: 'Comptabilité',
    items: [
      { href: '/saisie', label: t('nav.entry'), roles: [...COMPTA, 'CAISSIER'], module: 'COMPTABILITE', needsCompany: true },
      { href: '/ecritures', label: t('nav.entries'), roles: [...COMPTA, 'CAISSIER', 'PAIE', 'DIRECTION'], module: 'COMPTABILITE', needsCompany: true },
      { href: '/plan-comptable', label: t('nav.chart'), roles: COMPTA, module: 'COMPTABILITE', needsCompany: true },
      { href: '/tiers', label: t('nav.thirdParties'), roles: [...COMPTA, 'COMMERCIAL', 'CAISSIER'], module: 'COMPTABILITE', needsCompany: true },
      { href: '/livres', label: t('nav.books'), roles: [...COMPTA, 'DIRECTION'], module: 'COMPTABILITE', needsCompany: true },
      { href: '/etats', label: t('nav.statements'), roles: [...COMPTA, 'DIRECTION'], module: 'ETATS_FINANCIERS', needsCompany: true },
      { href: '/notes', label: 'Notes annexes', roles: COMPTA, module: 'ETATS_FINANCIERS', needsCompany: true },
      { href: '/smt', label: 'États SMT', roles: COMPTA, module: 'ETATS_FINANCIERS', needsCompany: true },
      { href: '/immobilisations', label: 'Immobilisations', roles: COMPTA, module: 'COMPTABILITE', needsCompany: true },
      { href: '/banque', label: 'Rapprochement', roles: [...COMPTA, 'CAISSIER'], module: 'COMPTABILITE', needsCompany: true },
      { href: '/imports', label: 'Imports', roles: ['CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE'], module: 'COMPTABILITE', needsCompany: true },
      { href: '/cloture', label: t('nav.closing'), roles: ['CHEF_COMPTABLE', 'COMPTABLE'], module: 'COMPTABILITE', needsCompany: true },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { href: '/factures', label: t('nav.sales'), roles: ['COMMERCIAL', 'COMPTABLE', 'CHEF_COMPTABLE', 'CAISSIER', 'DIRECTION'], module: 'DOCUMENTS_QR', needsCompany: true },
      { href: '/tresorerie', label: t('nav.treasury'), roles: [...COMPTA, 'CAISSIER', 'DIRECTION'], module: 'TRESORERIE', needsCompany: true },
      { href: '/prevision', label: 'Plan de trésorerie', roles: [...COMPTA, 'DIRECTION'], module: 'TRESORERIE', needsCompany: true },
      { href: '/budget', label: 'Budget', roles: ['CHEF_COMPTABLE', 'COMPTABLE', 'DIRECTION'], module: 'BUDGET', needsCompany: true },
      { href: '/consolidation', label: 'Consolidation', roles: ['CHEF_COMPTABLE', 'DIRECTION'], module: 'CONSOLIDATION', needsCompany: true },
      { href: '/fiscalite', label: t('nav.tax'), roles: ['CHEF_COMPTABLE', 'COMPTABLE', 'FISCALITE', 'DIRECTION'], module: 'FISCALITE', needsCompany: true },
      { href: '/paie', label: t('nav.payroll'), roles: ['PAIE', 'RH'], module: 'GRH_PAIE_RECRUTEMENT', needsCompany: true },
      { href: '/stocks', label: 'Stocks', roles: ['CHEF_COMPTABLE', 'COMPTABLE', 'COMMERCIAL', 'CAISSIER', 'DIRECTION'], module: 'STOCKS', needsCompany: true },
      { href: '/achats', label: 'Achats', roles: ['CHEF_COMPTABLE', 'COMPTABLE', 'COMMERCIAL', 'DIRECTION'], module: 'STOCKS', needsCompany: true },
      { href: '/production', label: 'Production', roles: ['CHEF_COMPTABLE', 'COMPTABLE', 'DIRECTION'], module: 'PRODUCTION', needsCompany: true },
      { href: '/crm', label: 'CRM et campagnes', roles: ['COMMERCIAL', 'DIRECTION'], module: 'MARKETING_CRM', needsCompany: true },
      { href: '/rh', label: 'Ressources humaines', roles: ['RH', 'PAIE'], module: 'GRH_PAIE_RECRUTEMENT', needsCompany: true },
      { href: '/espace-salarie', label: 'Mon espace salarié', roles: ['EMPLOYE'], module: 'GRH_PAIE_RECRUTEMENT', needsCompany: true },
      { href: '/ia', label: t('nav.ai'), module: 'IA_GUIDE' },
    ],
  },
  {
    title: 'Cabinet et conseil',
    items: [
      { href: '/cabinet', label: 'Portefeuille et missions', module: 'CABINET' },
      { href: '/cabinet/balance', label: 'États depuis une balance', module: 'CABINET' },
      { href: '/cabinet/manuel', label: 'Manuel de procédures', module: 'CABINET' },
      { href: '/cabinet/evaluation', label: 'Évaluation et restructuration', module: 'CABINET' },
      { href: '/projets', label: 'Projets d’investissement', module: 'ANALYSE_FINANCIERE', roles: ['DIRECTION', 'CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE', 'AUDITEUR'] },
    ],
  },
  {
    title: 'Bureau',
    items: [
      { href: '/collaboration', label: 'Collaboration', module: 'COLLABORATION' },
      { href: '/ged', label: 'Archives (GED)', module: 'GED_ARCHIVAGE_IA' },
      { href: '/courrier', label: 'Courrier', module: 'COURRIER' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/audit', label: t('nav.audit'), roles: ['AUDITEUR', 'CHEF_COMPTABLE', 'EXPERT_EXTERNE'] },
      { href: '/utilisateurs', label: t('nav.users'), roles: ['ADMIN'] },
      { href: '/abonnement', label: t('nav.subscription'), roles: ['ADMIN'] },
      { href: '/console', label: t('nav.console'), staff: true },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, companies, company, setCompanyId, can, has } = useSession();
  const path = usePathname();
  const visible = (i: Item) => (i.staff ? me.isStaff : (!i.roles || can(...i.roles)) && (!i.module || has(i.module)) && (!i.needsCompany || !!company));
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/connexion';
  };
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-nuit text-white">
        <Link href="/" className="flex items-center gap-3 px-5 py-5">
          <img src="/brand/icone_Jupiter_Compta.svg" alt="" className="h-10 w-10" />
          <div className="leading-tight">
            <div className="text-lg font-bold">
              Jupiter <span className="text-turquoise">Compta</span>
            </div>
            <div className="text-[10px] text-slate-300">{t('tagline')}</div>
          </div>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {MENU.map((g) => {
            const items = g.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={g.title} className="mt-4">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{g.title}</div>
                {items.map((i) => {
                  const active = i.href === '/' ? path === '/' : path.startsWith(i.href);
                  return (
                    <Link key={i.href} href={i.href} className={`mt-0.5 block rounded-md px-3 py-1.5 text-sm ${active ? 'bg-turquoise font-semibold text-white' : 'text-slate-200 hover:bg-nuit-700'}`}>
                      {i.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-nuit-700 px-5 py-3 text-[10px] text-slate-400">
          Édité par <span className="font-semibold text-slate-200">JUPSER</span> — Jupiter Services SARLU
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            {companies.length > 0 && (
              <select className="input w-72" value={company?.id ?? ''} onChange={(e) => setCompanyId(e.target.value)} aria-label="Société">
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.currency} {c.system === 'SMT' ? '(SMT)' : ''}
                  </option>
                ))}
              </select>
            )}
            {can('ADMIN') && (
              <Link href="/societes/nouvelle" className="btn-ghost">
                + Société
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">
              {me.tenant.name} · <span className="badge bg-turquoise-50 text-turquoise-700">{me.tenant.edition}</span>
            </span>
            <span className="font-semibold text-nuit">{me.fullName}</span>
            <button className="btn-ghost" onClick={logout}>
              Déconnexion
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
