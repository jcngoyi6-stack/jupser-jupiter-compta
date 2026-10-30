'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, today } from '@/lib/format';

export default function Prevision() {
  const { company, dec } = useSession();
  const qc = useQueryClient();
  const [view, setView] = useState<'weeks' | 'months'>('weeks');
  const [f, setF] = useState({ date: today(), amount: '', category: 'AUTRE', label: '' });
  const [msg, setMsg] = useState('');
  const q = useQuery({ queryKey: ['forecast', company?.id], queryFn: () => api<any>(`/companies/${company!.id}/treasury/forecast`), enabled: !!company });
  const add = useMutation({ mutationFn: () => api(`/companies/${company!.id}/treasury/forecast/items`, { method: 'POST', body: f }), onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast'] }), onError: (e) => setMsg(errorText(e)) });
  if (!company) return null;
  const d = q.data;
  return (
    <div className="space-y-4">
      <PageTitle title="Plan de trésorerie" sub="13 semaines et 12 mois — créances et dettes échéancées, paie, fiscalité, prévisions manuelles">
        <button className={view === 'weeks' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('weeks')}>13 semaines</button>
        <button className={view === 'months' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('months')}>12 mois</button>
      </PageTitle>
      {msg && <Alert>{msg}</Alert>}
      {d?.weeks.some((w: any) => w.tension) && <Alert kind="warn">Tension de trésorerie prévue : solde négatif sur au moins une semaine.</Alert>}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          {view === 'weeks' ? (
            <>
              <thead><tr><th>Semaine</th><th>Période</th><th className="text-right">Ouverture</th><th className="text-right">Encaissements</th><th className="text-right">Décaissements</th><th className="text-right">Clôture</th></tr></thead>
              <tbody>{d?.weeks.map((w: any) => <tr key={w.week} className={w.tension ? 'bg-red-50' : ''}><td>S{w.week}</td><td>{date(w.from)} – {date(w.to)}</td><td className="text-right"><Money v={w.opening} dec={dec} /></td><td className="text-right"><Money v={w.receipts} dec={dec} /></td><td className="text-right"><Money v={w.payments} dec={dec} /></td><td className="text-right font-semibold"><Money v={w.closing} dec={dec} /></td></tr>)}</tbody>
            </>
          ) : (
            <>
              <thead><tr><th>Mois</th><th className="text-right">Ouverture</th><th className="text-right">Flux net</th><th className="text-right">Clôture</th></tr></thead>
              <tbody>{d?.months.map((m: any) => <tr key={m.month} className={m.tension ? 'bg-red-50' : ''}><td>{m.month}</td><td className="text-right"><Money v={m.opening} dec={dec} /></td><td className="text-right"><Money v={m.net} dec={dec} /></td><td className="text-right font-semibold"><Money v={m.closing} dec={dec} /></td></tr>)}</tbody>
            </>
          )}
        </table>
      </div>
      <div className="card grid grid-cols-2 gap-2 md:grid-cols-5">
        <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input className="input" placeholder="Montant (– pour une sortie)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option>AUTRE</option><option>EMPRUNT</option><option>INVESTISSEMENT</option><option>CLIENTS</option><option>FOURNISSEURS</option></select>
        <input className="input" placeholder="Libellé" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <button className="btn-primary" onClick={() => add.mutate()}>Ajouter une prévision</button>
      </div>
    </div>
  );
}
