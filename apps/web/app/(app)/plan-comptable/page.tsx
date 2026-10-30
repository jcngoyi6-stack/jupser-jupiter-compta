'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function Plan() {
  const { company, can } = useSession();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [form, setForm] = useState({ number: '', parent: '', label: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const list = useQuery({ queryKey: ['chart', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/accounts`), enabled: !!company });
  const create = useMutation({
    mutationFn: () => api(`/companies/${company!.id}/accounts`, { method: 'POST', body: form }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Sous-compte créé.' }); setForm({ number: '', parent: '', label: '' }); qc.invalidateQueries(); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  const patch = useMutation({
    mutationFn: ({ number, body }: { number: string; body: unknown }) => api(`/companies/${company!.id}/accounts/${number}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company) return null;
  const rows = (list.data ?? []).filter((a) => (!cls || a.class === Number(cls)) && (!q || a.number.startsWith(q) || (a.usageLabel ?? a.label).toLowerCase().includes(q.toLowerCase())));
  const writer = can('CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE');
  return (
    <div className="space-y-4">
      <PageTitle title="Plan comptable SYSCOHADA révisé" sub={`${list.data?.length ?? 0} comptes à 6 chiffres — subdivisions rattachées au compte officiel`}>
        <input className="input w-60" placeholder="Rechercher (n° ou libellé)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-40" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">Toutes classes</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => <option key={c} value={c}>Classe {c}</option>)}
        </select>
      </PageTitle>
      {writer && (
        <div className="card flex flex-wrap items-end gap-3">
          <div><label className="label">Nouveau compte</label><input className="input w-32 num" maxLength={6} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.replace(/\D/g, '') })} placeholder="571110" /></div>
          <div><label className="label">Compte parent</label><input className="input w-32 num" maxLength={6} value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value.replace(/\D/g, '') })} placeholder="571100" /></div>
          <div className="flex-1"><label className="label">Libellé</label><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Caisse Goma" /></div>
          <button className="btn-primary" onClick={() => create.mutate()}>Créer le sous-compte</button>
        </div>
      )}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card max-h-[65vh] overflow-y-auto p-0">
        <table className="table">
          <thead className="sticky top-0"><tr><th>N°</th><th>Officiel</th><th>Intitulé</th><th>Libellé d’usage</th><th>Imputable</th><th>Actif</th></tr></thead>
          <tbody>
            {rows.slice(0, 600).map((a) => (
              <tr key={a.number} className={a.imputable ? '' : 'bg-slate-50 font-semibold text-nuit'}>
                <td className="num">{a.number}</td>
                <td className="num text-xs text-slate-500">{a.official}</td>
                <td>{a.label} {a.isCustom && <span className="badge bg-turquoise-50 text-turquoise-700">subdivision</span>}</td>
                <td>
                  {writer && a.imputable ? (
                    <input className="input py-1" defaultValue={a.usageLabel ?? ''} onBlur={(e) => e.target.value !== (a.usageLabel ?? '') && patch.mutate({ number: a.number, body: { usageLabel: e.target.value || null } })} />
                  ) : (a.usageLabel ?? '')}
                </td>
                <td>{a.imputable ? 'Oui' : 'Non'}</td>
                <td>
                  <input type="checkbox" checked={a.active} disabled={!writer} onChange={(e) => patch.mutate({ number: a.number, body: { active: e.target.checked } })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
