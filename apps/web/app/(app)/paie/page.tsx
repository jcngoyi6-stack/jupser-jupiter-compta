'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { DECIMALS, today } from '@/lib/format';

export default function Paie() {
  const { company, dec } = useSession();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [f, setF] = useState({ matricule: '', fullName: '', position: '', hireDate: today(), currency: 'USD', dependents: '0', base: '', logement: '', transport: '' });
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [payDate, setPayDate] = useState(today());
  const emps = useQuery({ queryKey: ['employees', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/payroll/employees`), enabled: !!company });
  const runs = useQuery({ queryKey: ['runs', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/payroll/runs`), enabled: !!company });
  const err = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });
  const add = useMutation({
    mutationFn: () =>
      api(`/companies/${company!.id}/payroll/employees`, {
        method: 'POST',
        body: {
          matricule: f.matricule, fullName: f.fullName, position: f.position || undefined, hireDate: f.hireDate, currency: f.currency, dependents: Number(f.dependents),
          elements: [
            { code: 'BASE', label: 'Salaire de base', amount: f.base, taxable: true, contributable: true, account: '661100' },
            ...(f.logement ? [{ code: 'LOG', label: 'Indemnité de logement', amount: f.logement, taxable: false, contributable: false, account: '663100' }] : []),
            ...(f.transport ? [{ code: 'TRA', label: 'Indemnité de transport', amount: f.transport, taxable: false, contributable: false, account: '663400' }] : []),
          ],
        },
      }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Salarié enregistré (éléments de paie chiffrés).' }); qc.invalidateQueries(); },
    onError: err,
  });
  const run = useMutation({
    mutationFn: () => api<any>(`/companies/${company!.id}/payroll/runs`, { method: 'POST', body: { period, payDate } }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Paie calculée. L’écriture de paie est en brouillon : elle doit être validée par une autre personne (quatre yeux).' }); qc.invalidateQueries(); },
    onError: err,
  });
  if (!company) return null;
  const last = runs.data?.[0];
  return (
    <div className="space-y-4">
      <PageTitle title="Paie" sub="RDC : IRPP retenu à la source (régime IS-IRPP), CNSS, INPP, ONEM — paie en USD convertie au cours officiel du jour de paie" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card space-y-3">
        <h2>Nouveau salarié</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <input className="input" placeholder="Matricule" value={f.matricule} onChange={(e) => setF({ ...f, matricule: e.target.value })} />
          <input className="input md:col-span-2" placeholder="Nom complet" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <input className="input" placeholder="Poste" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
          <input type="date" className="input" value={f.hireDate} onChange={(e) => setF({ ...f, hireDate: e.target.value })} />
          <select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>USD</option><option>CDF</option></select>
          <input className="input" placeholder="Salaire de base" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} />
          <input className="input" placeholder="Ind. logement" value={f.logement} onChange={(e) => setF({ ...f, logement: e.target.value })} />
          <input className="input" placeholder="Ind. transport" value={f.transport} onChange={(e) => setF({ ...f, transport: e.target.value })} />
          <input className="input" placeholder="Personnes à charge" value={f.dependents} onChange={(e) => setF({ ...f, dependents: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={() => add.mutate()}>Enregistrer</button>
      </div>
      <div className="card p-0">
        <table className="table">
          <thead><tr><th>Matricule</th><th>Nom</th><th>Poste</th><th>Devise</th><th className="text-right">Base</th><th>À charge</th></tr></thead>
          <tbody>{emps.data?.map((e) => <tr key={e.id}><td>{e.matricule}</td><td>{e.fullName}</td><td>{e.position}</td><td>{e.currency}</td><td className="text-right"><Money v={e.elements[0]?.amount} dec={DECIMALS[e.currency]} /></td><td>{e.dependents}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card flex flex-wrap items-end gap-3">
        <div><label className="label">Période</label><input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
        <div><label className="label">Date de paie</label><input type="date" className="input" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
        <button className="btn-accent" onClick={() => run.mutate()}>Calculer la paie</button>
      </div>
      {last && (
        <div className="card overflow-x-auto p-0">
          <h2 className="px-4 pt-3">Livre de paie — {last.period} (en {company.currency})</h2>
          {last.result[0]?.banner && <div className="banner-estimation mx-4 mt-2">Estimation — règle non validée</div>}
          <table className="table mt-2">
            <thead><tr><th>Salarié</th><th>Cours</th><th className="text-right">Brut</th><th className="text-right">CNSS sal.</th><th className="text-right">IRPP</th><th className="text-right">Net à payer</th><th className="text-right">Charges patronales</th><th className="text-right">Coût total</th></tr></thead>
            <tbody>
              {last.result.map((s: any) => (
                <tr key={s.employeeId}><td>{s.matricule} {s.fullName}</td><td className="text-xs">{s.rate ?? '—'}</td>
                  <td className="text-right"><Money v={s.gross} dec={dec} /></td><td className="text-right"><Money v={s.cnssEmployee} dec={dec} /></td><td className="text-right"><Money v={s.irpp} dec={dec} /></td>
                  <td className="text-right font-semibold"><Money v={s.net} dec={dec} /></td><td className="text-right"><Money v={s.employer.total} dec={dec} /></td><td className="text-right"><Money v={s.totalCost} dec={dec} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
