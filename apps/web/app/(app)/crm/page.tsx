'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

const STAGES = ['PROSPECT', 'QUALIFIE', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU'];

export default function Crm() {
  const { company, dec } = useSession();
  const { run, msg } = useAction();
  const leads = useQuery({ queryKey: ['leads', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/crm/leads`), enabled: !!company });
  const dash = useQuery({ queryKey: ['crm', company?.id], queryFn: () => api<any>(`/companies/${company!.id}/crm/dashboard`), enabled: !!company });
  const camps = useQuery({ queryKey: ['camps', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/crm/campaigns`), enabled: !!company });
  const [l, setL] = useState({ name: '', org: '', phone: '', email: '', value: '', consent: false });
  const [c, setC] = useState({ name: '', channel: 'SMS', message: 'Bonjour {{nom}}, ', audience: 'TOUS' });
  if (!company) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Marketing et CRM" sub="Prospects, pipeline, segmentation RFM, campagnes SMS / WhatsApp / e-mail avec consentement et désinscription" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-3 md:grid-cols-6">
        {dash.data?.pipeline.map((p: any) => <div key={p.stage} className="card"><div className="label">{p.stage}</div><div className="text-xl font-bold text-nuit">{p.count}</div><div className="text-xs"><Money v={p.value} dec={dec} /></div></div>)}
      </div>
      <div className="card grid grid-cols-2 gap-2 md:grid-cols-7">
        <input className="input" placeholder="Nom" value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} />
        <input className="input" placeholder="Organisation" value={l.org} onChange={(e) => setL({ ...l, org: e.target.value })} />
        <input className="input" placeholder="Téléphone" value={l.phone} onChange={(e) => setL({ ...l, phone: e.target.value })} />
        <input className="input" placeholder="E-mail" value={l.email} onChange={(e) => setL({ ...l, email: e.target.value })} />
        <input className="input" placeholder="Valeur estimée" value={l.value} onChange={(e) => setL({ ...l, value: e.target.value })} />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.consent} onChange={(e) => setL({ ...l, consent: e.target.checked })} /> Consent aux messages</label>
        <button className="btn-primary" onClick={() => run({ path: `/companies/${company.id}/crm/leads`, body: { ...l, email: l.email || undefined, value: l.value || '0' }, ok: 'Prospect ajouté.' })}>Ajouter</button>
      </div>
      <div className="card overflow-x-auto p-0"><table className="table"><thead><tr><th>Prospect</th><th>Contact</th><th className="text-right">Valeur</th><th>Consentement</th><th>Étape</th></tr></thead>
        <tbody>{leads.data?.map((x) => (
          <tr key={x.id}><td>{x.name} <span className="text-xs text-slate-500">{x.org}</span></td><td className="text-xs">{x.phone} {x.email}</td><td className="text-right"><Money v={x.value} dec={dec} /></td><td>{x.unsubscribed ? 'Désinscrit' : x.consent ? 'Oui' : 'Non'}</td>
            <td><select className="input py-1" value={x.stage} onChange={(e) => run({ path: `/companies/${company.id}/crm/leads/${x.id}/stage`, body: { stage: e.target.value }, ok: e.target.value === 'GAGNE' ? 'Affaire gagnée : client créé.' : 'Étape mise à jour.' })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></td></tr>
        ))}</tbody></table></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2>Nouvelle campagne</h2>
          <input className="input" placeholder="Nom" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <div className="flex gap-2">
            <select className="input" value={c.channel} onChange={(e) => setC({ ...c, channel: e.target.value })}><option>SMS</option><option>WHATSAPP</option><option>EMAIL</option></select>
            <select className="input" value={c.audience} onChange={(e) => setC({ ...c, audience: e.target.value })}><option value="TOUS">Clients et prospects</option><option value="CLIENTS">Clients</option><option value="PROSPECTS">Prospects</option></select>
          </div>
          <textarea className="input h-24" value={c.message} onChange={(e) => setC({ ...c, message: e.target.value })} />
          <p className="text-xs text-slate-500">Seuls les contacts ayant donné leur consentement reçoivent le message ; un lien de désinscription est ajouté automatiquement.</p>
          <button className="btn-accent" onClick={() => run({ path: `/companies/${company.id}/crm/campaigns`, body: c, ok: (r) => `Campagne envoyée : ${r.stats.sent} message(s), ${r.stats.excludedNoConsent} contact(s) exclu(s) faute de consentement.` })}>Envoyer</button>
        </div>
        <div className="card p-0"><h2 className="px-4 pt-3">Segmentation RFM des clients</h2><table className="table mt-1"><tbody>
          {dash.data?.segments.map((s: any) => <tr key={s.id}><td>{s.name}</td><td>{s.segment}</td><td className="text-xs">R{s.r} F{s.f} M{s.m}</td></tr>)}
        </tbody></table></div>
      </div>
      <div className="card p-0"><table className="table"><thead><tr><th>Campagne</th><th>Canal</th><th>Statut</th><th>Statistiques</th></tr></thead>
        <tbody>{camps.data?.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.channel}</td><td>{x.status}</td><td className="text-xs">{JSON.stringify(x.stats)}</td></tr>)}</tbody></table></div>
    </div>
  );
}
