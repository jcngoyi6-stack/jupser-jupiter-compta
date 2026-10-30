'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';

const ROLES = ['ADMIN', 'DIRECTION', 'CHEF_COMPTABLE', 'COMPTABLE', 'CAISSIER', 'PAIE', 'RH', 'FISCALITE', 'COMMERCIAL', 'AUDITEUR', 'EXPERT_EXTERNE', 'EMPLOYE'];

export default function Utilisateurs() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<any[]>('/users') });
  const [f, setF] = useState({ email: '', fullName: '', password: '', roles: ['COMPTABLE'] as string[] });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const add = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: f }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Utilisateur ajouté. La double authentification lui sera demandée à la première connexion si son rôle l’exige.' }); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  return (
    <div className="space-y-4">
      <PageTitle title="Utilisateurs et rôles" sub="Chaque utilisateur voit uniquement l’interface de sa direction (refus par défaut)" />
      <div className="card space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input className="input" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className="input" placeholder="Nom complet" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <input className="input" type="password" placeholder="Mot de passe initial (12 caractères min.)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-1">
              <input type="checkbox" checked={f.roles.includes(r)} onChange={(e) => setF({ ...f, roles: e.target.checked ? [...f.roles, r] : f.roles.filter((x) => x !== r) })} /> {r}
            </label>
          ))}
        </div>
        <button className="btn-primary" onClick={() => add.mutate()}>Ajouter</button>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      </div>
      <div className="card p-0">
        <table className="table">
          <thead><tr><th>Nom</th><th>E-mail</th><th>Rôles</th><th>Double auth.</th></tr></thead>
          <tbody>{users.data?.map((m) => <tr key={m.id}><td>{m.user.fullName}</td><td>{m.user.email}</td><td>{m.roles.join(', ')}</td><td>{m.user.mfaEnabled ? 'Active' : '—'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
