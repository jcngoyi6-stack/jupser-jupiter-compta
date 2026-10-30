'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { readFileForApi } from '@/lib/file';
import { useAction } from '@/lib/hooks';

type Tab = 'conges' | 'presence' | 'recrutement' | 'declarations';

export default function Rh() {
  const { company } = useSession();
  const { run, msg } = useAction();
  const [tab, setTab] = useState<Tab>('presence');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const emps = useQuery({ queryKey: ['employees', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/payroll/employees`), enabled: !!company });
  const leaves = useQuery({ queryKey: ['leaves', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/hr/leaves`), enabled: !!company });
  const att = useQuery({ queryKey: ['att', company?.id, month], queryFn: () => api<any>(`/companies/${company!.id}/hr/attendance?month=${month}`), enabled: !!company && tab === 'presence' });
  const jobs = useQuery({ queryKey: ['jobs', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/hr/jobs`), enabled: !!company && tab === 'recrutement' });
  const runs = useQuery({ queryKey: ['runs', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/payroll/runs`), enabled: !!company && tab === 'declarations' });
  const [job, setJob] = useState({ title: '', criteria: 'DIP:Diplôme:2\nEXP:Expérience:3\nTEST:Test technique:3\nENT:Entretien:2' });
  const [cand, setCand] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, string>>({});
  if (!company) return null;
  const name = (id: string) => emps.data?.find((e) => e.id === id)?.fullName ?? '';
  return (
    <div className="space-y-4">
      <PageTitle title="Ressources humaines" sub="Congés, présence biométrique reliée à la paie, recrutement par critères pondérés, déclarations sociales" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-2">{(['presence', 'conges', 'recrutement', 'declarations'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(t)}>{{ presence: 'Présence', conges: 'Congés', recrutement: 'Recrutement', declarations: 'Bulletins et déclarations' }[t]}</button>)}</div>
      {tab === 'presence' && (
        <div className="space-y-3">
          <div className="card flex flex-wrap items-end gap-3">
            <div><label className="label">Mois</label><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            <label className="btn-ghost cursor-pointer">Importer les pointages FingerTec<input type="file" className="hidden" accept=".csv,.txt,.xlsx" onChange={async (e) => e.target.files?.[0] && run({ path: `/companies/${company.id}/hr/attendance/import`, body: await readFileForApi(e.target.files[0]), ok: (r) => `${r.days} journée(s) importée(s)${r.unknownBadges.length ? ` — badges inconnus : ${r.unknownBadges.join(', ')}` : ''}.` })} /></label>
            <button className="btn-accent" onClick={() => run({ path: `/companies/${company.id}/hr/attendance/validate`, body: { month }, ok: 'Présences validées : elles alimenteront la paie du mois.' })}>Valider le mois</button>
          </div>
          <div className="card p-0"><table className="table"><thead><tr><th>Salarié</th><th>Jours présents</th><th>Retards (min)</th><th>Heures sup. (min)</th><th>Absences non justifiées</th><th>Validé</th></tr></thead>
            <tbody>{att.data?.summary.map((s: any) => <tr key={s.employeeId}><td>{s.matricule} {s.name}</td><td>{s.daysPresent}</td><td>{s.lateMinutes}</td><td>{s.overtimeMinutes}</td><td className="text-xs">{s.unjustifiedAbsences.map(date).join(', ')}</td><td>{s.validated ? 'Oui' : 'Non'}</td></tr>)}</tbody></table></div>
        </div>
      )}
      {tab === 'conges' && (
        <div className="space-y-3">
          <div className="card flex gap-2"><button className="btn-ghost" onClick={() => run({ path: `/companies/${company.id}/hr/leaves/accrue`, body: { daysPerMonthX100: 150 }, ok: 'Acquisition mensuelle enregistrée (1,5 jour).' })}>Acquisition mensuelle (1,5 j)</button></div>
          <div className="card p-0"><table className="table"><thead><tr><th>Salarié</th><th>Type</th><th>Du</th><th>Au</th><th>Jours</th><th>Statut</th><th></th></tr></thead>
            <tbody>{leaves.data?.map((l) => <tr key={l.id}><td>{name(l.employeeId)}</td><td>{l.type}</td><td>{date(l.fromDate)}</td><td>{date(l.toDate)}</td><td>{l.days / 100}</td><td>{l.status}</td>
              <td>{l.status === 'DEMANDE' && <><button className="btn-accent px-2 py-1 text-xs" onClick={() => run({ path: `/companies/${company.id}/hr/leaves/${l.id}/decide`, body: { approve: true }, ok: 'Congé approuvé.' })}>Approuver</button> <button className="btn-danger px-2 py-1 text-xs" onClick={() => run({ path: `/companies/${company.id}/hr/leaves/${l.id}/decide`, body: { approve: false }, ok: 'Congé refusé.' })}>Refuser</button></>}</td></tr>)}</tbody></table></div>
          <div className="card p-0"><table className="table"><thead><tr><th>Salarié</th><th>Solde de congés (jours)</th><th>Badge</th></tr></thead><tbody>{emps.data?.map((e) => <tr key={e.id}><td>{e.fullName}</td><td>{e.leaveBalance / 100}</td><td>{e.badgeId}</td></tr>)}</tbody></table></div>
        </div>
      )}
      {tab === 'recrutement' && (
        <div className="space-y-3">
          <div className="card space-y-2">
            <h2>Nouveau poste</h2>
            <input className="input" placeholder="Intitulé du poste" value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} />
            <textarea className="input h-24 font-mono text-xs" value={job.criteria} onChange={(e) => setJob({ ...job, criteria: e.target.value })} />
            <p className="text-xs text-slate-500">Un critère par ligne : CODE:Libellé:pondération. Les critères discriminatoires (âge, sexe, origine, religion…) sont refusés.</p>
            <button className="btn-primary" onClick={() => run({ path: `/companies/${company.id}/hr/jobs`, body: { title: job.title, criteria: job.criteria.split('\n').filter(Boolean).map((l) => { const [code, label, w] = l.split(':'); return { code: code!.trim(), label: (label ?? '').trim(), weight: Number(w) }; }) }, ok: 'Poste ouvert.' })}>Ouvrir le poste</button>
          </div>
          {jobs.data?.map((j) => (
            <div key={j.id} className="card space-y-2">
              <h2>{j.title}</h2>
              <div className="flex gap-2"><input className="input w-64" placeholder="Nom du candidat" value={cand[j.id] ?? ''} onChange={(e) => setCand({ ...cand, [j.id]: e.target.value })} /><button className="btn-ghost" onClick={() => run({ path: `/companies/${company.id}/hr/jobs/${j.id}/candidates`, body: { name: cand[j.id] }, ok: 'Candidat ajouté.' })}>Ajouter</button></div>
              <table className="table"><thead><tr><th>Rang</th><th>Candidat</th><th>Note globale /20</th>{j.criteria.map((c: any) => <th key={c.code}>{c.label} (×{c.weight})</th>)}<th></th></tr></thead>
                <tbody>{j.ranking.map((r: any) => <tr key={r.id}><td>{r.rank}</td><td>{r.name}</td><td className="font-semibold">{r.total}</td>
                  {r.detail.map((d: any) => <td key={d.criterion}><input className="input w-16 py-1" placeholder={String(d.average)} value={scores[r.id + d.criterion] ?? ''} onChange={(e) => setScores({ ...scores, [r.id + d.criterion]: e.target.value })} /></td>)}
                  <td><button className="btn-ghost px-2 py-1 text-xs" onClick={() => run({ path: `/companies/${company.id}/hr/candidates/${r.id}/scores`, body: { scores: j.criteria.filter((c: any) => scores[r.id + c.code]).map((c: any) => ({ criterion: c.code, score: Number(scores[r.id + c.code]) })) }, ok: 'Notes enregistrées (votre évaluation).' })}>Noter</button></td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      )}
      {tab === 'declarations' && (
        <div className="card p-0"><table className="table"><thead><tr><th>Période</th><th>Bulletins</th><th>Déclaration sociale</th></tr></thead>
          <tbody>{runs.data?.map((r) => <tr key={r.id}><td>{r.period}</td><td className="space-x-2">{r.result.map((s: any) => <Link key={s.employeeId} className="text-turquoise-700 underline" href={`/bulletin/${r.id}/${s.employeeId}`}>{s.fullName}</Link>)}</td><td><a className="btn-ghost px-2 py-1 text-xs" href={`/api/companies/${company.id}/hr/declarations/${r.id}.csv`}>Télécharger (CSV)</a></td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}
