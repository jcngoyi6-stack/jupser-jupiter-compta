'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useThirdParties } from '@/components/AccountInput';
import { useSession } from '@/components/session';
import { Alert, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function Tiers() {
  const { company } = useSession();
  const qc = useQueryClient();
  const tps = useThirdParties();
  const [f, setF] = useState({ type: 'CLIENT', code: '', name: '', taxId: '', phone: '', email: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api(`/companies/${company!.id}/third-parties`, { method: 'POST', body: { ...f, taxId: f.taxId || undefined, phone: f.phone || undefined, email: f.email || undefined } }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Tiers créé.' }); setF({ ...f, code: '', name: '', taxId: '', phone: '', email: '' }); qc.invalidateQueries({ queryKey: ['third-parties'] }); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Tiers" sub="Clients, fournisseurs, salariés — rattachés à leur compte collectif" />
      <div className="card grid grid-cols-2 gap-3 md:grid-cols-7">
        <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="CLIENT">Client (411)</option><option value="FOURNISSEUR">Fournisseur (401)</option><option value="SALARIE">Salarié (422)</option><option value="AUTRE">Autre</option>
        </select>
        <input className="input" placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <input className="input md:col-span-2" placeholder="Raison sociale / nom" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="NIF" value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} />
        <input className="input" placeholder="Téléphone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <button className="btn-primary" onClick={() => create.mutate()}>Ajouter</button>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card p-0">
        <table className="table">
          <thead><tr><th>Code</th><th>Nom</th><th>Type</th><th>Compte</th><th>NIF</th><th>Contact</th></tr></thead>
          <tbody>
            {tps.data?.map((t) => (
              <tr key={t.id}><td>{t.code}</td><td className="font-semibold">{t.name}</td><td>{t.type}</td><td className="num">{t.account}</td><td>{t.taxId}</td><td>{t.phone} {t.email}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
