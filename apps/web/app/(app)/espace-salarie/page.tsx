'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Empty, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date, today } from '@/lib/format';
import { useAction } from '@/lib/hooks';

/** Libre-service salarié : bulletins, congés, pointages. */
export default function EspaceSalarie() {
  const { company, dec } = useSession();
  const { run, msg } = useAction();
  const me = useQuery({ queryKey: ['hr-me', company?.id], queryFn: () => api<any>(`/companies/${company!.id}/hr/me`), enabled: !!company });
  const leaves = useQuery({ queryKey: ['leaves', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/hr/leaves`), enabled: !!company });
  const [l, setL] = useState({ fromDate: today(), toDate: today(), type: 'CONGE_PAYE' });
  if (!company) return null;
  if (me.data && !me.data.employee) return <Empty>Aucun dossier salarié n’est rattaché à votre compte. Contactez les ressources humaines.</Empty>;
  const e = me.data?.employee;
  return (
    <div className="space-y-4">
      <PageTitle title="Mon espace" sub={e ? `${e.fullName} — ${e.position ?? ''} — solde de congés : ${e.leaveBalance / 100} jour(s)` : ''} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card flex flex-wrap items-end gap-2">
        <div><label className="label">Du</label><input type="date" className="input" value={l.fromDate} onChange={(x) => setL({ ...l, fromDate: x.target.value })} /></div>
        <div><label className="label">Au</label><input type="date" className="input" value={l.toDate} onChange={(x) => setL({ ...l, toDate: x.target.value })} /></div>
        <select className="input w-48" value={l.type} onChange={(x) => setL({ ...l, type: x.target.value })}><option value="CONGE_PAYE">Congé payé</option><option value="MALADIE">Maladie</option><option value="CIRCONSTANCE">Congé de circonstance</option><option value="SANS_SOLDE">Sans solde</option></select>
        <button className="btn-primary" onClick={() => run({ path: `/companies/${company.id}/hr/leaves`, body: l, ok: 'Demande envoyée aux ressources humaines.' })}>Demander un congé</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-0"><h2 className="px-4 pt-3">Mes bulletins</h2><table className="table mt-1"><tbody>{me.data?.payslips.map((p: any) => <tr key={p.runId}><td>{p.period}</td><td className="text-right"><Money v={p.slip.net} dec={dec} /></td><td><Link className="text-turquoise-700 underline" href={`/bulletin/${p.runId}/${e.id}`}>Voir</Link></td></tr>)}</tbody></table></div>
        <div className="card p-0"><h2 className="px-4 pt-3">Mes congés</h2><table className="table mt-1"><tbody>{leaves.data?.map((x) => <tr key={x.id}><td>{date(x.fromDate)} → {date(x.toDate)}</td><td>{x.days / 100} j</td><td>{x.status}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card p-0"><h2 className="px-4 pt-3">Mes pointages</h2><table className="table mt-1"><tbody>{me.data?.attendance.map((a: any) => <tr key={a.id}><td>{date(a.date)}</td><td>{a.checkIn} – {a.checkOut ?? '…'}</td><td>{a.lateMinutes ? `${a.lateMinutes} min de retard` : ''}</td></tr>)}</tbody></table></div>
    </div>
  );
}
