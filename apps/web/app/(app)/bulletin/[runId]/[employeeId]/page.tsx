'use client';
import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { useSession } from '@/components/session';
import { Money } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

/** Bulletin de paie imprimable (PDF via l'impression du navigateur). */
export default function Bulletin({ params }: { params: Promise<{ runId: string; employeeId: string }> }) {
  const { runId, employeeId } = use(params);
  const { company, dec } = useSession();
  const q = useQuery({ queryKey: ['payslip', runId, employeeId], queryFn: () => api<any>(`/companies/${company!.id}/hr/payslips/${runId}/${employeeId}`), enabled: !!company });
  const d = q.data;
  if (!d?.slip) return null;
  const s = d.slip;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <button className="btn-primary no-print" onClick={() => window.print()}>Imprimer / PDF</button>
      <div className="card bg-white p-8">
        <div className="flex justify-between">
          <div>{d.company.logoDataUrl && <img src={d.company.logoDataUrl} alt="" className="mb-2 h-12" />}<div className="font-bold text-nuit">{d.company.name}</div><div className="text-xs">N° employeur : {d.company.employerNo ?? '—'} · NIF : {d.company.taxId ?? '—'}</div></div>
          <div className="text-right"><div className="text-xl font-bold text-nuit">BULLETIN DE PAIE</div><div>Période : {d.period}</div><div className="text-sm">Payé le {date(d.payDate)}</div></div>
        </div>
        <div className="mt-4 rounded bg-slate-50 p-3 text-sm">{d.employee.matricule} — <b>{d.employee.fullName}</b> · {d.employee.position ?? ''} · entré le {date(d.employee.hireDate)} · {d.employee.contractType} · personnes à charge : {d.employee.dependents}</div>
        {s.banner && <div className="banner-estimation mt-3">{s.banner}</div>}
        <table className="table mt-4">
          <thead><tr><th>Rubrique</th><th className="text-right">Base</th><th className="text-right">Gain</th><th className="text-right">Retenue</th><th className="text-right">Part patronale</th></tr></thead>
          <tbody>
            {s.convertedElements.map((e: any) => <tr key={e.code}><td>{e.label}</td><td></td><td className="text-right"><Money v={e.local} dec={dec} /></td><td></td><td></td></tr>)}
            <tr className="total"><td>Salaire brut</td><td></td><td className="text-right"><Money v={s.gross} dec={dec} /></td><td></td><td></td></tr>
            {(s.lines ?? []).filter((l: any) => l.employee || l.employer).map((l: any) => <tr key={l.code}><td>{l.label}</td><td className="text-right"><Money v={l.base} dec={dec} /></td><td></td><td className="text-right"><Money v={l.employee} dec={dec} /></td><td className="text-right"><Money v={l.employer} dec={dec} /></td></tr>)}
            {!s.lines && <><tr><td>Cotisations salariales</td><td></td><td></td><td className="text-right"><Money v={s.cnssEmployee} dec={dec} /></td><td className="text-right"><Money v={s.employer.total} dec={dec} /></td></tr><tr><td>Impôt sur salaires</td><td></td><td></td><td className="text-right"><Money v={s.irpp} dec={dec} /></td><td></td></tr></>}
            <tr className="total"><td>NET À PAYER ({d.company.currency})</td><td></td><td className="text-right"><Money v={s.net} dec={dec} /></td><td></td><td></td></tr>
          </tbody>
        </table>
        <div className="mt-4 text-xs text-slate-500">Coût total employeur : <Money v={s.totalCost} dec={dec} /> {d.company.currency}{s.rate ? ` — salaire contractuel converti au cours ${s.rate}` : ''}. Bulletin à conserver sans limitation de durée.</div>
      </div>
    </div>
  );
}
