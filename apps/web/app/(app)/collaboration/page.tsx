'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date, today } from '@/lib/format';
import { useAction } from '@/lib/hooks';

type Tab = 'messagerie' | 'taches' | 'reunions';

export default function Collaboration() {
  const { me, can } = useSession();
  const { run, msg } = useAction();
  const [tab, setTab] = useState<Tab>('taches');
  const [channel, setChannel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const users = useQuery({ queryKey: ['users-min'], queryFn: () => api<any[]>('/users').catch(() => []) });
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<any[]>('/collab/channels') });
  const messages = useQuery({ queryKey: ['messages', channel], queryFn: () => api<any[]>(`/collab/channels/${channel}/messages`), enabled: !!channel, refetchInterval: 5000 });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => api<any[]>('/collab/tasks') });
  const meetings = useQuery({ queryKey: ['meetings'], queryFn: () => api<any[]>('/collab/meetings') });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api<any[]>('/collab/alerts') });
  const [t, setT] = useState({ title: '', assigneeId: me.userId, dueDate: today() });
  const [m, setM] = useState({ title: '', agenda: '', date: `${today()}T09:00`, location: '', participants: [] as string[] });
  const people = users.data?.map((u: any) => ({ id: u.user.id, name: u.user.fullName })) ?? [{ id: me.userId, name: me.fullName }];
  return (
    <div className="space-y-4">
      <PageTitle title="Collaboration" sub="Messagerie interne, tâches, réunions et convocations, alertes automatiques" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {alerts.data && alerts.data.length > 0 && <div className="space-y-1">{alerts.data.map((a, i) => <Alert key={i} kind={a.level === 'error' ? 'error' : 'warn'}>{a.text}</Alert>)}</div>}
      <div className="flex gap-2">{(['taches', 'messagerie', 'reunions'] as Tab[]).map((x) => <button key={x} className={tab === x ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(x)}>{{ taches: 'Tâches', messagerie: 'Messagerie', reunions: 'Réunions' }[x]}</button>)}</div>
      {tab === 'taches' && (
        <>
          <div className="card grid grid-cols-2 gap-2 md:grid-cols-4">
            <input className="input md:col-span-2" placeholder="Tâche" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
            <select className="input" value={t.assigneeId} onChange={(e) => setT({ ...t, assigneeId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <div className="flex gap-2"><input type="date" className="input" value={t.dueDate} onChange={(e) => setT({ ...t, dueDate: e.target.value })} /><button className="btn-primary" onClick={() => run({ path: '/collab/tasks', body: t, ok: 'Tâche créée.' })}>Créer</button></div>
          </div>
          <div className="card p-0"><table className="table"><thead><tr><th>Tâche</th><th>Échéance</th><th>Origine</th><th>Statut</th></tr></thead>
            <tbody>{tasks.data?.map((x) => <tr key={x.id} className={x.dueDate && x.dueDate < today() && x.status !== 'TERMINEE' ? 'bg-red-50' : ''}><td>{x.title}</td><td>{date(x.dueDate)}</td><td>{x.source}</td>
              <td><select className="input py-1" value={x.status} onChange={(e) => run({ path: `/collab/tasks/${x.id}/status`, body: { status: e.target.value }, ok: 'Tâche mise à jour.' })}><option value="A_FAIRE">À faire</option><option value="EN_COURS">En cours</option><option value="TERMINEE">Terminée</option></select></td></tr>)}</tbody></table></div>
        </>
      )}
      {tab === 'messagerie' && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="card space-y-1 p-3">
            {channels.data?.map((c) => <button key={c.id} className={`block w-full rounded px-2 py-1 text-left text-sm ${channel === c.id ? 'bg-turquoise text-white' : 'hover:bg-slate-100'}`} onClick={() => setChannel(c.id)}># {c.name}</button>)}
            <button className="btn-ghost mt-2 w-full" onClick={() => { const n = prompt('Nom du canal :'); if (n) run({ path: '/collab/channels', body: { name: n }, ok: 'Canal créé.' }); }}>+ Canal</button>
          </div>
          <div className="card flex h-[28rem] flex-col md:col-span-3">
            <div className="flex-1 space-y-2 overflow-y-auto">{messages.data?.map((x) => <div key={x.id} className="text-sm"><b className="text-nuit">{x.author}</b> <span className="text-xs text-slate-400">{new Date(x.createdAt).toLocaleString('fr-FR')}</span><div>{x.body} {x.link && <a className="text-turquoise-700 underline" href={x.link}>ouvrir</a>}</div></div>)}</div>
            {channel && <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text) { run({ path: `/collab/channels/${channel}/messages`, body: { body: text }, ok: 'Message envoyé.' }); setText(''); } }}><input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" /><button className="btn-accent">Envoyer</button></form>}
          </div>
        </div>
      )}
      {tab === 'reunions' && (
        <>
          <div className="card space-y-2">
            <h2>Convoquer une réunion</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <input className="input" placeholder="Objet" value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} />
              <input type="datetime-local" className="input" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
              <input className="input" placeholder="Lieu ou lien visio" value={m.location} onChange={(e) => setM({ ...m, location: e.target.value })} />
            </div>
            <textarea className="input h-20" placeholder="Ordre du jour" value={m.agenda} onChange={(e) => setM({ ...m, agenda: e.target.value })} />
            <div className="flex flex-wrap gap-3 text-sm">{people.map((p) => <label key={p.id} className="flex items-center gap-1"><input type="checkbox" checked={m.participants.includes(p.id)} onChange={(e) => setM({ ...m, participants: e.target.checked ? [...m.participants, p.id] : m.participants.filter((x) => x !== p.id) })} />{p.name}</label>)}</div>
            <button className="btn-primary" onClick={() => run({ path: '/collab/meetings', body: m, ok: 'Convocation envoyée.' })}>Convoquer</button>
          </div>
          {meetings.data?.map((x) => (
            <div key={x.id} className="card space-y-1">
              <h2>{x.title} — {x.date.replace('T', ' ')} — {x.location}</h2>
              <p className="whitespace-pre-wrap text-sm">{x.agenda}</p>
              <p className="text-xs">Accusés de réception : {x.participants.filter((p: any) => p.ack).length}/{x.participants.length} {x.participants.some((p: any) => p.userId === me.userId && !p.ack) && <button className="btn-ghost ml-2 px-2 py-0 text-xs" onClick={() => run({ path: `/collab/meetings/${x.id}/ack`, ok: 'Présence confirmée.' })}>Accuser réception</button>}</p>
              {x.minutes ? <div className="rounded bg-slate-50 p-2 text-sm"><b>Procès-verbal :</b> {x.minutes}</div> : x.createdBy === me.userId && <button className="btn-ghost" onClick={() => { const pv = prompt('Procès-verbal :'); const dec = prompt('Décision (sera transformée en tâche pour vous) :'); if (pv) run({ path: `/collab/meetings/${x.id}/minutes`, body: { minutes: pv, decisions: dec ? [{ text: dec, assigneeId: me.userId }] : [] }, ok: 'PV enregistré, décisions transformées en tâches.' }); }}>Rédiger le PV</button>}
            </div>
          ))}
        </>
      )}
      {!can('ADMIN') && <p className="text-xs text-slate-400">Seuls vos canaux, tâches et réunions sont affichés.</p>}
    </div>
  );
}
