'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSession } from '@/components/session';
import { Alert, Empty, Kpi, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { bp, date } from '@/lib/format';

export default function Dashboard() {
  const { me, company, dec, can, has } = useSession();
  const finance = can('CHEF_COMPTABLE', 'COMPTABLE', 'DIRECTION', 'EXPERT_EXTERNE', 'AUDITEUR');
  const st = useQuery({
    queryKey: ['statements', company?.id],
    queryFn: () => api<any>(`/companies/${company!.id}/reports/statements`),
    enabled: !!company && finance && has('ETATS_FINANCIERS'),
  });
  const drafts = useQuery({
    queryKey: ['drafts', company?.id],
    queryFn: () => api<any>(`/companies/${company!.id}/entries?status=BROUILLON,BROUILLON_IA`),
    enabled: !!company && finance,
  });
  if (!company) {
    return (
      <div>
        <PageTitle title={`Bienvenue, ${me.fullName}`} sub={me.tenant.name} />
        {can('ADMIN') ? (
          <Empty>
            Aucune société n’est encore ouverte. <Link href="/societes/nouvelle" className="font-semibold text-turquoise-700 underline">Ouvrir le premier dossier</Link>
          </Empty>
        ) : (
          <Empty>Aucune société dans votre périmètre.</Empty>
        )}
      </div>
    );
  }
  const cur = st.data?.current;
  const is = cur?.incomeStatement.values;
  const an = cur?.analysis;
  const cur_ = company.currency;
  return (
    <div className="space-y-6">
      <PageTitle title="Tableau de bord" sub={`${company.name} — exercice ${st.data?.fiscalYear?.label ?? ''} — montants en ${cur_}`} />
      {finance && cur && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Chiffre d’affaires (XB)" value={<Money v={is.XB} dec={dec} />} />
            <Kpi label="Excédent brut d’exploitation" value={<Money v={is.XD} dec={dec} />} />
            <Kpi label="Résultat net (XI)" value={<Money v={is.XI} dec={dec} />} />
            <Kpi label="Trésorerie nette" value={<Money v={an.equilibre.tresorerieNette} dec={dec} />} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Fonds de roulement" value={<Money v={an.equilibre.frng} dec={dec} />} />
            <Kpi label="Besoin en fonds de roulement" value={<Money v={an.equilibre.bfr} dec={dec} />} />
            <Kpi label="Autonomie financière" value={bp(an.ratiosBp.autonomieFinanciere)} />
            <Kpi label="Marge nette" value={bp(an.ratiosBp.margeNette)} />
          </div>
          <div className="card">
            <h2>Alertes et contrôles</h2>
            <div className="mt-3 space-y-2">
              {st.data.controls.filter((c: any) => !c.ok).length === 0 && <Alert kind="ok">Tous les contrôles de cohérence sont satisfaits.</Alert>}
              {st.data.controls
                .filter((c: any) => !c.ok)
                .map((c: any) => (
                  <Alert key={c.code} kind={c.blocking ? 'error' : 'warn'}>
                    {c.label} {c.detail ? `— ${c.detail}` : ''}
                  </Alert>
                ))}
            </div>
          </div>
        </>
      )}
      {finance && drafts.data && drafts.data.total > 0 && (
        <div className="card">
          <div className="flex items-center justify-between">
            <h2>Écritures en attente de validation ({drafts.data.total})</h2>
            <Link href="/ecritures?statut=brouillons" className="btn-ghost">Voir</Link>
          </div>
          <ul className="mt-3 divide-y text-sm">
            {drafts.data.items.slice(0, 5).map((e: any) => (
              <li key={e.id} className="flex justify-between py-2">
                <span>{date(e.date)} · {e.journalCode} · {e.label}</span>
                <span className="text-slate-500">{e.status === 'BROUILLON_IA' ? 'Proposée par Jupiter IA' : 'Brouillon'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!finance && (
        <div className="grid gap-4 md:grid-cols-3">
          {has('DOCUMENTS_QR') && can('COMMERCIAL', 'CAISSIER') && <Link href="/factures" className="card hover:border-turquoise"><h2>Factures</h2><p className="text-sm text-slate-500">Émettre une facture avec code QR</p></Link>}
          {has('GRH_PAIE_RECRUTEMENT') && can('PAIE', 'RH') && <Link href="/paie" className="card hover:border-turquoise"><h2>Paie</h2><p className="text-sm text-slate-500">Salariés et paie du mois</p></Link>}
          {has('IA_GUIDE') && <Link href="/ia" className="card hover:border-turquoise"><h2>Jupiter IA</h2><p className="text-sm text-slate-500">Posez vos questions</p></Link>}
        </div>
      )}
    </div>
  );
}
