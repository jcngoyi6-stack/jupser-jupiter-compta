'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date } from '@/lib/format';

export default function Cloture() {
  const { company, can, dec } = useSession();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const co = useQuery({ queryKey: ['company', company?.id], queryFn: () => api<any>(`/companies/${company!.id}`), enabled: !!company });
  const ctl = useQuery({ queryKey: ['controls', company?.id], queryFn: () => api<any>(`/companies/${company!.id}/reports/controls`), enabled: !!company });
  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/companies/${company!.id}${path}`, { method: 'POST', body }),
    onSuccess: (r: any) => {
      setMsg({ kind: 'ok', text: r.anEntry ? `Exercice clôturé. Résultat : ${r.resultEntry?.number ?? '—'} · À-nouveaux : ${r.anEntry.number}` : 'Opération effectuée.' });
      qc.invalidateQueries();
    },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company) return null;
  const c = ctl.data;
  return (
    <div className="space-y-4">
      <PageTitle title="Clôture assistée" sub="Contrôles de cohérence, verrouillage des périodes, détermination du résultat et à-nouveaux" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {c && (
        <div className="card space-y-2">
          <h2>Liste de contrôle</h2>
          <Alert kind={c.sequenceGaps.length ? 'error' : 'ok'}>Numérotation continue des écritures : {c.sequenceGaps.length ? `ruptures dans ${c.sequenceGaps.map((g: any) => g.journal).join(', ')}` : 'aucune rupture'}</Alert>
          <Alert kind={c.abnormalBalances.length ? 'warn' : 'ok'}>
            Comptes à solde anormal : {c.abnormalBalances.length ? c.abnormalBalances.map((a: any) => `${a.account} (${a.expected === 'D' ? 'devrait être débiteur' : 'devrait être créditeur'})`).join(', ') : 'aucun'}
          </Alert>
          <Alert kind={c.suspenseAccounts.length ? 'warn' : 'ok'}>Comptes d’attente (470/471) non soldés : {c.suspenseAccounts.length || 'aucun'}</Alert>
          <Alert kind={c.possibleDuplicates.length ? 'warn' : 'ok'}>Doublons de pièces possibles : {c.possibleDuplicates.map((d: any) => d.pieceRef).join(', ') || 'aucun'}</Alert>
          <Alert kind="info">Loi de Benford ({c.benford.n} montants) : {c.benford.conform === null ? 'échantillon insuffisant (50 minimum)' : c.benford.conform ? 'distribution conforme' : `écart significatif (MAD ${c.benford.mad.toFixed(4)}) — à examiner`}</Alert>
        </div>
      )}
      {co.data?.fiscalYears.map((fy: any) => (
        <div key={fy.id} className="card">
          <div className="flex items-center justify-between">
            <h2>Exercice {fy.label} — du {date(fy.startDate)} au {date(fy.endDate)} {fy.closed && <span className="badge bg-slate-200">clôturé</span>}</h2>
            {!fy.closed && can('CHEF_COMPTABLE') && (
              <button className="btn-primary" onClick={() => confirm(`Clôturer définitivement l’exercice ${fy.label} ? Le résultat sera déterminé, les périodes verrouillées et les à-nouveaux générés.`) && run.mutate({ path: `/fiscal-years/${fy.id}/close` })}>
                Clôturer l’exercice
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
            {fy.periods.map((p: any) => (
              <div key={p.id} className={`rounded-md border p-2 text-center text-sm ${p.status === 'CLOTUREE' ? 'border-slate-300 bg-slate-100' : 'border-emerald-300 bg-emerald-50'}`}>
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs">{p.status === 'CLOTUREE' ? 'Verrouillée' : 'Ouverte'}</div>
                {!fy.closed && p.status === 'OUVERTE' && can('CHEF_COMPTABLE', 'COMPTABLE') && (
                  <button className="mt-1 text-xs text-nuit underline" onClick={() => run.mutate({ path: `/periods/${p.id}/close` })}>Clôturer</button>
                )}
                {!fy.closed && p.status === 'CLOTUREE' && can('CHEF_COMPTABLE') && (
                  <button className="mt-1 text-xs text-amber-700 underline" onClick={() => { const reason = prompt('Motif de réouverture (tracé dans la piste d’audit) :'); if (reason) run.mutate({ path: `/periods/${p.id}/reopen`, body: { reason } }); }}>Rouvrir</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-500">Travaux d’inventaire (amortissements, provisions, régularisations, réévaluation des devises) : écritures proposées en brouillon puis validées par un utilisateur habilité. Montants en {company.currency}. <Money v="0" dec={dec} className="hidden" /></p>
    </div>
  );
}
