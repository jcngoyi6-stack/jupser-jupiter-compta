'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { bp, money } from '@/lib/format';

export default function Budget() {
  const { company, dec, can } = useSession();
  const qc = useQueryClient();
  const fy = company?.fiscalYears.find((f) => !f.closed);
  const [version, setVersion] = useState('INITIAL');
  const [mode, setMode] = useState('ALERTE');
  const [rows, setRows] = useState<{ prefix: string; analytic: string; label: string; amount: string }[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const q = useQuery({ queryKey: ['budget', company?.id, version], queryFn: () => api<any>(`/companies/${company!.id}/budget?version=${version}`), enabled: !!company });
  useEffect(() => {
    if (q.data) setRows(q.data.report.map((r: any) => ({ prefix: r.prefix, analytic: r.analytic ?? '', label: r.label, amount: money(r.amount, dec).replace(/ /g, '') })));
  }, [q.data, dec]);
  const save = useMutation({
    mutationFn: () => api(`/companies/${company!.id}/budget`, { method: 'PUT', body: { fiscalYearId: fy!.id, version, mode, lines: rows.filter((r) => r.prefix) } }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Budget enregistré.' }); qc.invalidateQueries(); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company || !fy) return null;
  const edit = can('CHEF_COMPTABLE', 'DIRECTION');
  return (
    <div className="space-y-4">
      <PageTitle title="Budget et contrôle budgétaire" sub={`Exercice ${fy.label} — réalisé, engagements (bons de commande) et disponible`}>
        <select className="input w-40" value={version} onChange={(e) => setVersion(e.target.value)}><option value="INITIAL">Budget initial</option><option value="REVISE">Budget révisé</option></select>
        {edit && <select className="input w-52" value={mode} onChange={(e) => setMode(e.target.value)}><option value="ALERTE">Contrôle : alerte</option><option value="BLOQUANT">Contrôle : bloquant</option></select>}
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card p-0">
        <table className="table">
          <thead><tr><th>Compte / préfixe</th><th>Axe analytique</th><th>Libellé</th><th className="text-right">Budget</th><th className="text-right">Réalisé</th><th className="text-right">Engagé</th><th className="text-right">Disponible</th><th>Consommation</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const rep = q.data?.report[i];
              return (
                <tr key={i} className={rep?.overrun ? 'bg-red-50' : ''}>
                  <td><input className="input num w-24 py-1" disabled={!edit} value={r.prefix} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, prefix: e.target.value } : x)))} /></td>
                  <td><input className="input w-28 py-1" disabled={!edit} value={r.analytic} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, analytic: e.target.value } : x)))} /></td>
                  <td><input className="input py-1" disabled={!edit} value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
                  <td><input className="input num w-36 py-1 text-right" disabled={!edit} value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></td>
                  <td className="text-right">{rep && <Money v={rep.realized} dec={dec} />}</td>
                  <td className="text-right">{rep && <Money v={rep.committed} dec={dec} />}</td>
                  <td className="text-right">{rep && <Money v={rep.available} dec={dec} />}</td>
                  <td>{rep ? bp(rep.usageBp) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {edit && <div className="flex gap-2 p-4"><button className="btn-ghost" onClick={() => setRows([...rows, { prefix: '', analytic: '', label: '', amount: '' }])}>+ Ligne</button><button className="btn-primary" onClick={() => save.mutate()}>Enregistrer</button></div>}
      </div>
    </div>
  );
}
