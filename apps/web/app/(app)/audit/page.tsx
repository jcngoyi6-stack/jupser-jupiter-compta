'use client';
import { useQuery } from '@tanstack/react-query';
import { Alert, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';

export default function Audit() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<any>('/audit') });
  const v = q.data?.verification;
  return (
    <div className="space-y-4">
      <PageTitle title="Piste d’audit" sub="Journal inaltérable, chaîné par empreintes SHA-256" />
      {v && (v.ok ? <Alert kind="ok">Chaîne intègre : {v.records} enregistrements vérifiés. Dernière empreinte : <span className="font-mono text-xs">{v.lastHash}</span></Alert> : <Alert>Chaîne rompue à l’enregistrement n° {v.brokenAt} : altération détectée.</Alert>)}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>N°</th><th>Horodatage</th><th>Acteur</th><th>Action</th><th>Objet</th><th>Empreinte</th></tr></thead>
          <tbody>
            {q.data?.items.map((r: any) => (
              <tr key={r.id}><td>{r.seq}</td><td className="text-xs">{new Date(r.at).toLocaleString('fr-FR')}</td><td className="font-mono text-xs">{r.actor.slice(0, 8)}</td><td>{r.action}</td><td className="text-xs">{r.object}</td><td className="font-mono text-[10px] text-slate-400">{r.hash.slice(0, 16)}…</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
