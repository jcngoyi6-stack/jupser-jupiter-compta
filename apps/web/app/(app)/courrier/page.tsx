'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date, today } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export default function Courrier() {
  const { run, msg } = useAction();
  const mail = useQuery({ queryKey: ['mail'], queryFn: () => api<any[]>('/mail') });
  const users = useQuery({ queryKey: ['users-min'], queryFn: () => api<any[]>('/users').catch(() => []) });
  const [f, setF] = useState({ direction: 'ARRIVE', date: today(), correspondent: '', subject: '', service: '', assigneeId: '', dueDate: '' });
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const answer = async (m: any) => {
    const r = await api<any>('/ai/ask', { method: 'POST', body: { question: `Rédige une réponse courte et courtoise, sur papier en-tête de l'entreprise, au courrier de ${m.correspondent} ayant pour objet « ${m.subject} ».` } });
    setDraft({ id: m.id, text: r.answer });
  };
  return (
    <div className="space-y-4">
      <PageTitle title="Courrier" sub="Registre arrivé / départ, affectation, circuit de traitement, relances, réponse rédigée par Jupiter IA" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card grid grid-cols-2 gap-2 md:grid-cols-7">
        <select className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="ARRIVE">Arrivé</option><option value="DEPART">Départ</option></select>
        <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input className="input" placeholder="Correspondant" value={f.correspondent} onChange={(e) => setF({ ...f, correspondent: e.target.value })} />
        <input className="input md:col-span-2" placeholder="Objet" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <select className="input" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}><option value="">Affecter à…</option>{users.data?.map((u: any) => <option key={u.user.id} value={u.user.id}>{u.user.fullName}</option>)}</select>
        <button className="btn-primary" onClick={() => run({ path: '/mail', body: { ...f, assigneeId: f.assigneeId || undefined, dueDate: f.dueDate || undefined, service: f.service || undefined }, ok: (r) => `Courrier enregistré sous le n° ${r.number}.` })}>Enregistrer</button>
      </div>
      {draft && <div className="card"><h2>Projet de réponse (à relire)</h2><textarea className="input mt-2 h-40" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></div>}
      <div className="card overflow-x-auto p-0"><table className="table"><thead><tr><th>N°</th><th>Date</th><th>Correspondant</th><th>Objet</th><th>Statut</th><th></th></tr></thead>
        <tbody>{mail.data?.map((m) => <tr key={m.id} className={m.dueDate && m.dueDate < today() && m.status !== 'TRAITE' ? 'bg-red-50' : ''}><td>{m.number}</td><td>{date(m.date)}</td><td>{m.correspondent}</td><td>{m.subject}</td><td>{m.status}</td>
          <td className="whitespace-nowrap"><select className="input inline w-36 py-1" value="" onChange={(e) => e.target.value && run({ path: `/mail/${m.id}/step`, body: { action: e.target.value }, ok: 'Circuit mis à jour.' })}><option value="">Étape…</option><option value="TRANSMIS">Transmis</option><option value="EN_TRAITEMENT">En traitement</option><option value="TRAITE">Traité</option><option value="CLASSE">Classé</option></select> {m.direction === 'ARRIVE' && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => answer(m)}>Réponse IA</button>}</td></tr>)}</tbody></table></div>
    </div>
  );
}
