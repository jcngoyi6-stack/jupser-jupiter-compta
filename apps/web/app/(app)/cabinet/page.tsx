'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Empty, Kpi, Money, PageTitle, Status } from '@/components/ui';
import { api } from '@/lib/api';
import { date, today } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const TYPES: [string, string][] = [
  ['TENUE', 'Tenue'], ['REVISION', 'Révision'], ['ETABLISSEMENT', 'Établissement des comptes'], ['AUDIT', 'Audit / commissariat'],
  ['CONSEIL_FISCAL', 'Conseil fiscal'], ['PAIE', 'Paie externalisée'], ['EVALUATION', 'Évaluation'], ['RESTRUCTURATION', 'Restructuration'],
];
const STAGES: Record<string, string> = { PREPARATION: 'Préparation', REVUE: 'En revue', SIGNATURE: 'À signer', VERROUILLE: 'Signé — verrouillé' };

export default function Cabinet() {
  const { companies } = useSession();
  const { run, msg } = useAction();
  const [tab, setTab] = useState<'portefeuille' | 'rentabilite' | 'echeances'>('portefeuille');
  const [f, setF] = useState({ companyId: '', type: 'TENUE', title: '', budgetHours: '0', feeAmount: '0', hourlyRate: '0', deadline: '' });
  const [time, setTime] = useState<{ missionId: string; date: string; hours: string; description: string }>({ missionId: '', date: today(), hours: '1', description: '' });
  const pf = useQuery({ queryKey: ['cabinet-portfolio'], queryFn: () => api<any[]>('/cabinet/portfolio') });
  const prof = useQuery({ queryKey: ['cabinet-prof'], queryFn: () => api<any>('/cabinet/profitability'), enabled: tab === 'rentabilite' });
  const year = new Date().getFullYear();
  const dl = useQuery({ queryKey: ['cabinet-dl', year], queryFn: () => api<any[]>(`/cabinet/deadlines?from=${year}-01-01&to=${year + 1}-06-30`), enabled: tab === 'echeances' });
  const missions = (pf.data ?? []).flatMap((c: any) => c.missions.map((m: any) => ({ ...m, company: c.company })));
  const alerts = missions.filter((m: any) => m.alerts.length).length;

  return (
    <div className="space-y-4">
      <PageTitle title="Espace Cabinet" sub="Portefeuille de dossiers, missions, temps et honoraires, circuit de revue">
        {(['portefeuille', 'rentabilite', 'echeances'] as const).map((t) => (
          <button key={t} className={tab === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(t)}>{t === 'portefeuille' ? 'Portefeuille' : t === 'rentabilite' ? 'Rentabilité' : 'Échéances'}</button>
        ))}
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {tab === 'portefeuille' && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Kpi label="Dossiers clients" value={pf.data?.length ?? '…'} />
            <Kpi label="Missions" value={missions.length} />
            <Kpi label="Missions en alerte" value={alerts} hint="Échéance dépassée ou budget d’heures dépassé" />
          </div>
          <div className="card space-y-3">
            <h2 className="font-semibold">Nouvelle mission</h2>
            <div className="grid gap-2 md:grid-cols-4">
              <select className="input" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
                <option value="">Dossier client…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <input className="input md:col-span-2" placeholder="Intitulé de la mission" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <label className="text-sm">Budget (heures)<input className="input num" value={f.budgetHours} onChange={(e) => setF({ ...f, budgetHours: e.target.value })} /></label>
              <label className="text-sm">Honoraires forfaitaires<input className="input num" value={f.feeAmount} onChange={(e) => setF({ ...f, feeAmount: e.target.value })} /></label>
              <label className="text-sm">Taux horaire<input className="input num" value={f.hourlyRate} onChange={(e) => setF({ ...f, hourlyRate: e.target.value })} /></label>
              <label className="text-sm">Échéance<input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
            </div>
            <button className="btn-primary" disabled={!f.companyId || f.title.length < 3} onClick={() => run({ path: '/cabinet/missions', body: { ...f, budgetHours: Number(f.budgetHours.replace(',', '.')) || 0, deadline: f.deadline || undefined }, ok: 'Mission créée.' })}>Créer la mission</button>
          </div>
          <div className="card p-0">
            {missions.length === 0 ? <Empty>Aucune mission.</Empty> : (
              <table className="table">
                <thead><tr><th>Client</th><th>Mission</th><th>Type</th><th>Échéance</th><th>Revue</th><th className="text-right">Temps / budget</th><th>Alertes</th><th /></tr></thead>
                <tbody>
                  {missions.map((m: any) => (
                    <tr key={m.id}>
                      <td>{m.company.name}</td>
                      <td>{m.title}</td>
                      <td>{TYPES.find(([v]) => v === m.type)?.[1]}</td>
                      <td>{date(m.deadline)}</td>
                      <td><Status s={STAGES[m.stage] ?? m.stage} /></td>
                      <td className="text-right">{(m.minutes / 60).toFixed(1)} h{m.budgetUsedPct !== null && ` (${m.budgetUsedPct} %)`}</td>
                      <td className="text-xs text-red-700">{m.alerts.map((a: string) => a.replace(/_/g, ' ').toLowerCase()).join(', ')}</td>
                      <td><Link className="text-turquoise underline" href={`/cabinet/mission/${m.id}`}>Ouvrir</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card space-y-2">
            <h2 className="font-semibold">Saisie des temps</h2>
            <div className="grid gap-2 md:grid-cols-5">
              <select className="input md:col-span-2" value={time.missionId} onChange={(e) => setTime({ ...time, missionId: e.target.value })}>
                <option value="">Mission…</option>
                {missions.map((m: any) => <option key={m.id} value={m.id}>{m.company.name} — {m.title}</option>)}
              </select>
              <input type="date" className="input" value={time.date} onChange={(e) => setTime({ ...time, date: e.target.value })} />
              <input className="input num" placeholder="Heures" value={time.hours} onChange={(e) => setTime({ ...time, hours: e.target.value })} />
              <input className="input" placeholder="Travaux réalisés" value={time.description} onChange={(e) => setTime({ ...time, description: e.target.value })} />
            </div>
            <button className="btn-primary" disabled={!time.missionId} onClick={() => run({ path: `/cabinet/missions/${time.missionId}/time`, body: { date: time.date, minutes: Math.round(Number(time.hours.replace(',', '.')) * 60), description: time.description }, ok: 'Temps enregistré.' })}>Enregistrer le temps</button>
          </div>
        </>
      )}

      {tab === 'rentabilite' && prof.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-0">
            <table className="table">
              <thead><tr><th>Mission</th><th className="text-right">Heures</th><th className="text-right">Temps valorisé</th><th className="text-right">Honoraires</th><th className="text-right">Mali / boni</th></tr></thead>
              <tbody>{prof.data.missions.map((m: any) => <tr key={m.missionId}><td>{m.title}</td><td className="text-right">{(m.minutes / 60).toFixed(1)}</td><td className="text-right"><Money v={m.valuedTime} /></td><td className="text-right"><Money v={m.fee} /></td><td className="text-right"><Money v={m.writeOff} /></td></tr>)}</tbody>
            </table>
          </div>
          <div className="card p-0">
            <table className="table">
              <thead><tr><th>Collaborateur</th><th className="text-right">Heures</th><th className="text-right">Taux facturable</th></tr></thead>
              <tbody>{prof.data.staff.map((s: any) => <tr key={s.userId}><td>{s.name}</td><td className="text-right">{(s.minutes / 60).toFixed(1)}</td><td className="text-right">{Math.round(s.rate * 100)} %</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'echeances' && (
        <div className="card p-0">
          {(dl.data ?? []).length === 0 ? <Empty>Aucune échéance.</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Client</th><th>Nature</th><th>Libellé</th></tr></thead>
              <tbody>{dl.data!.map((d: any, i: number) => <tr key={i} className={d.date < today() ? 'bg-red-50' : ''}><td>{date(d.date)}</td><td>{d.company}</td><td>{d.kind === 'MISSION' ? 'Mission' : 'Clôture'}</td><td>{d.label}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
