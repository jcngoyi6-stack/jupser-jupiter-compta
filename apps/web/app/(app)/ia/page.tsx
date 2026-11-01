'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useThirdParties } from '@/components/AccountInput';
import { useSession } from '@/components/session';
import { Alert, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { readBinary } from '@/lib/file';
import { date, today } from '@/lib/format';

export default function Ia() {
  const { company, can } = useSession();
  const qc = useQueryClient();
  const tps = useThirdParties();
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [inv, setInv] = useState({ supplierThirdPartyId: '', date: today(), number: '', netAmount: '', vatAmount: '', grossAmount: '', description: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const actions = useQuery({ queryKey: ['ai-actions'], queryFn: () => api<any[]>('/ai/actions') });
  const ask = useMutation({
    mutationFn: (question: string) => api<any>('/ai/ask', { method: 'POST', body: { question, companyId: company?.id, history: chat.slice(-10) } }),
    onSuccess: (r, question) => setChat((c) => [...c, { role: 'user', content: question }, { role: 'assistant', content: r.answer + (r.suggestions?.length ? `\n\nComptes suggérés : ${r.suggestions.map((s: any) => `${s.account} ${s.label}`).join(' ; ')}` : '') }]),
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  const propose = useMutation({
    mutationFn: () => api<any>(`/ai/companies/${company!.id}/purchase-proposal`, { method: 'POST', body: inv }),
    onSuccess: (r) => { setMsg({ kind: r.warnings.length ? 'warn' : 'ok', text: `Écriture proposée (BROUILLON_IA). ${r.warnings.join(' ')}` }); qc.invalidateQueries(); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  const ocr = useMutation({
    mutationFn: async (file: File) => api<any>(`/ai/companies/${company!.id}/ocr`, { method: 'POST', body: await readBinary(file) }),
    onSuccess: (r) => {
      const fmt = (v: string | null) => { if (v === null) return ''; const neg = v.startsWith('-'); const a = neg ? v.slice(1) : v; const d = company!.currency === 'CDF' || company!.currency === 'USD' || company!.currency === 'EUR' ? 2 : 0; const p = a.padStart(d + 1, '0'); return (neg ? '-' : '') + (d ? `${p.slice(0, -d)},${p.slice(-d)}` : p); };
      setInv({ ...inv, supplierThirdPartyId: r.supplier?.id ?? inv.supplierThirdPartyId, date: r.date ?? inv.date, number: r.number ?? '', netAmount: fmt(r.netAmount), vatAmount: fmt(r.vatAmount), grossAmount: fmt(r.grossAmount), description: r.description ?? '' });
      setMsg({ kind: r.warnings.length || !r.supplier ? 'warn' : 'ok', text: `Pièce lue (confiance ${Math.round(r.confidence * 100)} %) : vérifiez chaque champ avant de proposer l’écriture.${r.supplier ? '' : ` Fournisseur « ${r.supplierName ?? '?'} » non reconnu : choisissez-le.`} ${r.warnings.join(' ')}` });
    },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  const decide = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api(`/ai/actions/${id}/${accept ? 'accept' : 'reject'}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  return (
    <div className="space-y-4">
      <PageTitle title="Jupiter IA" sub="Guide comptable SYSCOHADA — aucune écriture n’est validée sans action humaine" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex h-[32rem] flex-col">
          <h2>Poser une question</h2>
          <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
            {chat.length === 0 && <p className="text-sm text-slate-500">Exemples : « Comment enregistrer un achat avec TVA ? », « Quel compte pour un abonnement internet ? »</p>}
            {chat.map((m, i) => (
              <div key={i} className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-10 bg-nuit text-white' : 'mr-10 bg-turquoise-50 text-nuit'}`}>{m.content}</div>
            ))}
            {ask.isPending && <p className="text-sm text-slate-500">Jupiter IA réfléchit…</p>}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { ask.mutate(q); setQ(''); } }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Votre question…" />
            <button className="btn-accent">Envoyer</button>
          </form>
        </div>
        {company && can('CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE') && (
          <div className="card space-y-2">
            <h2>Pièce → écriture</h2>
            <label className="block text-sm">Lire une pièce (photo ou PDF)<input type="file" accept="image/*,application/pdf" className="mt-1 block" onChange={(e) => e.target.files?.[0] && ocr.mutate(e.target.files[0])} /></label>
            {ocr.isPending && <p className="text-sm text-slate-500">Lecture de la pièce…</p>}
            <p className="text-xs text-slate-500">Les champs lus restent modifiables : l’écriture n’est proposée qu’en brouillon et doit être acceptée par un humain.</p>
            <select className="input" value={inv.supplierThirdPartyId} onChange={(e) => setInv({ ...inv, supplierThirdPartyId: e.target.value })}>
              <option value="">Fournisseur…</option>
              {tps.data?.filter((t) => t.type === 'FOURNISSEUR').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="N° de facture" value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} />
              <input type="date" className="input" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} />
              <input className="input" placeholder="Montant HT" value={inv.netAmount} onChange={(e) => setInv({ ...inv, netAmount: e.target.value })} />
              <input className="input" placeholder="TVA" value={inv.vatAmount} onChange={(e) => setInv({ ...inv, vatAmount: e.target.value })} />
              <input className="input" placeholder="TTC" value={inv.grossAmount} onChange={(e) => setInv({ ...inv, grossAmount: e.target.value })} />
              <input className="input" placeholder="Nature (ex. électricité)" value={inv.description} onChange={(e) => setInv({ ...inv, description: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={() => propose.mutate()}>Proposer l’écriture</button>
          </div>
        )}
      </div>
      <div className="card p-0">
        <h2 className="px-4 pt-3">Propositions de Jupiter IA</h2>
        <table className="table mt-1">
          <thead><tr><th>Date</th><th>Outil</th><th>Détail</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {actions.data?.map((a) => (
              <tr key={a.id}>
                <td>{date(a.createdAt)}</td><td>{a.tool}</td><td className="text-xs">{(a.result?.warnings ?? []).join(' ')} (confiance {Math.round((a.result?.confidence ?? 0) * 100)} %)</td>
                <td><Status s={a.status} /></td>
                <td className="whitespace-nowrap">
                  {a.status === 'PROPOSE' && can('CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE') && (
                    <>
                      <button className="btn-accent px-2 py-1 text-xs" onClick={() => decide.mutate({ id: a.id, accept: true })}>Accepter et valider</button>{' '}
                      <button className="btn-danger px-2 py-1 text-xs" onClick={() => decide.mutate({ id: a.id, accept: false })}>Rejeter</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
