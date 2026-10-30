'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date } from '@/lib/format';

function monthBounds() {
  const d = new Date();
  d.setUTCDate(0);
  const end = d.toISOString().slice(0, 10);
  return { from: end.slice(0, 8) + '01', to: end };
}

export default function Fiscalite() {
  const { company, dec, can } = useSession();
  const qc = useQueryClient();
  const [p, setP] = useState(monthBounds());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const vat = useQuery({ queryKey: ['vat', company?.id, p], queryFn: () => api<any>(`/companies/${company!.id}/tax/vat-return?from=${p.from}&to=${p.to}`), enabled: !!company });
  const is = useQuery({ queryKey: ['is', company?.id], queryFn: () => api<any>(`/companies/${company!.id}/tax/corporate`), enabled: !!company });
  const cal = useQuery({ queryKey: ['cal', company?.id], queryFn: () => api<any>(`/companies/${company!.id}/tax/calendar`), enabled: !!company });
  const rules = useQuery({ queryKey: ['rules', company?.country], queryFn: () => api<any[]>(`/tax-rules?country=${company!.country}`), enabled: !!company });
  const settle = useMutation({
    mutationFn: () => api<any>(`/companies/${company!.id}/tax/vat-settlement`, { method: 'POST', body: p }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Écriture de liquidation de TVA proposée en brouillon (à valider dans Écritures).' }); qc.invalidateQueries(); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company) return null;
  const upcoming = cal.data?.events.filter((e: any) => e.dueDate >= new Date().toISOString().slice(0, 10)).slice(0, 6);
  return (
    <div className="space-y-4">
      <PageTitle title="Fiscalité assistée" sub={`${company.country === 'CD' ? 'RDC — régime IS-IRPP (loi n°23/053)' : company.country} · aucun taux codé en dur : règles versionnées`} />
      {(vat.data?.banner || is.data?.banner) && <div className="banner-estimation">⚠ Estimation — règle non validée : les paramètres fiscaux du pack {company.country} attendent la validation d’un fiscaliste désigné par JUPSER.</div>}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2>Déclaration de TVA</h2>
          <div className="flex gap-2">
            <input type="date" className="input" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} />
            <input type="date" className="input" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} />
          </div>
          {vat.data && (
            <table className="table"><tbody>
              <tr><td>TVA collectée (443)</td><td className="text-right"><Money v={vat.data.collected} dec={dec} /></td></tr>
              <tr><td>TVA déductible (445)</td><td className="text-right"><Money v={vat.data.deductible} dec={dec} /></td></tr>
              <tr><td>Crédit reporté (4449)</td><td className="text-right"><Money v={vat.data.previousCredit} dec={dec} /></td></tr>
              <tr className="total"><td>TVA due</td><td className="text-right"><Money v={vat.data.due} dec={dec} /></td></tr>
              <tr><td>Crédit à reporter</td><td className="text-right"><Money v={vat.data.creditToCarry} dec={dec} /></td></tr>
            </tbody></table>
          )}
          {can('CHEF_COMPTABLE', 'COMPTABLE', 'FISCALITE') && <button className="btn-primary" onClick={() => settle.mutate()}>Proposer l’écriture de liquidation</button>}
        </div>
        <div className="card space-y-3">
          <h2>Impôt sur le résultat (simulation)</h2>
          {is.data && (
            <table className="table"><tbody>
              <tr><td>Résultat avant impôt</td><td className="text-right"><Money v={is.data.preTaxResult} dec={dec} /></td></tr>
              <tr><td>Chiffre d’affaires</td><td className="text-right"><Money v={is.data.turnover} dec={dec} /></td></tr>
              <tr><td>IS au taux légal</td><td className="text-right"><Money v={is.data.is} dec={dec} /></td></tr>
              <tr><td>Minimum d’imposition (% du CA)</td><td className="text-right"><Money v={is.data.minimum} dec={dec} /></td></tr>
              <tr className="total"><td>Impôt dû ({is.data.basis === 'IS' ? 'IS' : 'minimum'}) — compte {is.data.account}</td><td className="text-right"><Money v={is.data.due} dec={dec} /></td></tr>
            </tbody></table>
          )}
          <p className="text-xs text-slate-500">Le résultat fiscal tient compte des réintégrations et déductions à saisir par le fiscaliste (TODO(fiscaliste)).</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-0">
          <h2 className="px-4 pt-3">Prochaines échéances</h2>
          <table className="table mt-1"><tbody>{upcoming?.map((e: any) => <tr key={e.tax + e.period}><td>{date(e.dueDate)}</td><td>{e.label}</td></tr>)}</tbody></table>
        </div>
        <div className="card max-h-96 overflow-y-auto p-0">
          <h2 className="px-4 pt-3">Règles fiscales et sociales ({company.country})</h2>
          <table className="table mt-1">
            <thead><tr><th>Impôt</th><th>Paramètre</th><th>Valeur</th><th>Effet</th><th>Statut</th></tr></thead>
            <tbody>
              {rules.data?.map((r) => (
                <tr key={r.id} title={r.legalRef}><td>{r.tax}</td><td>{r.param}</td><td className="max-w-[12rem] truncate text-xs">{JSON.stringify(r.value)}</td><td>{date(r.effectiveFrom)}</td><td><Status s={r.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
