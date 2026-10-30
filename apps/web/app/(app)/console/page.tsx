'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Kpi, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, money } from '@/lib/format';

/** Console JUPSER : clients, abonnements, référentiels pays (validation des règles fiscales). */
export default function Console() {
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ['console'], queryFn: () => api<any>('/console/tenants') });
  const rules = useQuery({ queryKey: ['rules-all'], queryFn: () => api<any[]>('/tax-rules?country=CD') });
  const [f, setF] = useState({ name: '', type: 'ENTREPRISE', edition: 'ESSENTIEL', adminEmail: '', adminName: '', adminPassword: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [license, setLicense] = useState<{ tenant: string; token: string } | null>(null);
  const err = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });
  const create = useMutation({ mutationFn: () => api('/console/tenants', { method: 'POST', body: f }), onSuccess: () => { setMsg({ kind: 'ok', text: 'Client créé (essai 30 jours).' }); qc.invalidateQueries(); }, onError: err });
  const sub = useMutation({ mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`/console/tenants/${id}/subscription`, { method: 'POST', body }), onSuccess: () => qc.invalidateQueries(), onError: err });
  const validate = useMutation({ mutationFn: (id: string) => api(`/tax-rules/${id}/validate`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries(), onError: err });
  return (
    <div className="space-y-4">
      <PageTitle title="Console JUPSER" sub="Clients, abonnements, licences et référentiels pays" />
      {t.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Revenu mensuel récurrent" value={`${money(t.data.mrrUsdCents)} USD`} />
          <Kpi label="Clients" value={t.data.tenants.length} />
          <Kpi label="En essai" value={t.data.byStatus.ESSAI ?? 0} />
          <Kpi label="Impayés / lecture seule" value={(t.data.byStatus.IMPAYE ?? 0) + (t.data.byStatus.LECTURE_SEULE ?? 0)} />
        </div>
      )}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card grid grid-cols-2 gap-2 md:grid-cols-7">
        <input className="input md:col-span-2" placeholder="Raison sociale" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>ENTREPRISE</option><option>CABINET</option></select>
        <select className="input" value={f.edition} onChange={(e) => setF({ ...f, edition: e.target.value })}><option>TPE</option><option>ESSENTIEL</option><option>PRO</option><option>ERP</option></select>
        <input className="input" placeholder="E-mail admin" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} />
        <input className="input" placeholder="Nom admin" value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} />
        <input className="input" type="password" placeholder="Mot de passe" value={f.adminPassword} onChange={(e) => setF({ ...f, adminPassword: e.target.value })} />
        <button className="btn-primary md:col-span-7" onClick={() => create.mutate()}>Créer le client</button>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Client</th><th>Type</th><th>Édition</th><th>Statut</th><th>Échéance</th><th>Util.</th><th>Sociétés</th><th>Actions</th></tr></thead>
          <tbody>
            {t.data?.tenants.map((x: any) => (
              <tr key={x.id}>
                <td className="font-semibold">{x.name}</td><td>{x.type}</td><td>{x.edition}</td><td>{x.computedStatus}</td>
                <td>{date(x.paidUntil ?? x.trialEndsAt)}</td><td>{x._count.memberships}</td><td>{x._count.companies}</td>
                <td className="whitespace-nowrap">
                  <select className="input inline w-28 py-1" value={x.edition} onChange={(e) => sub.mutate({ id: x.id, body: { edition: e.target.value } })}><option>TPE</option><option>ESSENTIEL</option><option>PRO</option><option>ERP</option></select>{' '}
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1); sub.mutate({ id: x.id, body: { paidUntil: d.toISOString().slice(0, 10) } }); }}>+1 mois payé</button>{' '}
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => {
                    const until = prompt('Licence hors ligne — date de fin (AAAA-MM-JJ) :', `${new Date().getUTCFullYear() + 1}-12-31`);
                    if (!until) return;
                    const fp = prompt('Empreinte de l’installation (64 caractères hexadécimaux), vide pour une licence non liée :', '') || null;
                    api<any>(`/console/tenants/${x.id}/licenses`, { method: 'POST', body: { expiresAt: until, fingerprint: fp } })
                      .then((r) => { setLicense({ tenant: x.name, token: r.token }); setMsg({ kind: 'ok', text: 'Licence signée (Ed25519) émise.' }); })
                      .catch(err);
                  }}>Licence hors ligne</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {license && (
        <div className="card space-y-2">
          <h2>Licence de {license.tenant}</h2>
          <p className="text-sm text-slate-600">À copier dans l’installation sur site (tolérance hors connexion : 30 jours).</p>
          <textarea readOnly className="input h-28 font-mono text-xs" value={license.token} />
          <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(license.token)}>Copier</button>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-3">Référentiel RDC — règles fiscales et sociales</h2>
        <table className="table mt-1">
          <thead><tr><th>Impôt</th><th>Paramètre</th><th>Valeur</th><th>Référence légale</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {rules.data?.map((r) => (
              <tr key={r.id}><td>{r.tax}</td><td>{r.param}</td><td className="max-w-xs truncate text-xs">{JSON.stringify(r.value)}</td><td className="text-xs">{r.legalRef}</td><td><Status s={r.status} /></td>
                <td>{r.status === 'A_VALIDER' && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => confirm('Confirmez-vous, en tant que fiscaliste désigné, la validation de cette règle ?') && validate.mutate(r.id)}>Valider</button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
