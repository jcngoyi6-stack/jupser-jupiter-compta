'use client';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, PageTitle } from '@/components/ui';
import { api, apiDownload, errorText } from '@/lib/api';

const SECTORS: [string, string][] = [['COMMERCE', 'Commerce'], ['INDUSTRIE', 'Industrie'], ['SERVICES', 'Services'], ['BTP', 'BTP'], ['MINES', 'Mines'], ['AGRICULTURE', 'Agriculture'], ['ONG', 'ONG / projets']];

export default function Manual() {
  const { company } = useSession();
  const [sector, setSector] = useState('COMMERCE');
  const [firm, setFirm] = useState('');
  const [positions, setPositions] = useState([{ id: 'dg', title: 'Directeur général' }, { id: 'daf', title: 'Responsable administratif et financier' }, { id: 'cpt', title: 'Comptable' }, { id: 'cai', title: 'Caissier' }, { id: 'mag', title: 'Magasinier' }]);
  const [risks, setRisks] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  if (!company) return null;
  const body = { companyId: company.id, sector, positions: positions.filter((p) => p.title), risks: risks.split('\n').filter(Boolean), firm: firm || undefined };
  const gen = async () => { try { setPreview(await api('/cabinet/manual', { method: 'POST', body })); setMsg(null); } catch (e) { setMsg({ kind: 'error', text: errorText(e) }); } };
  return (
    <div className="space-y-4">
      <PageTitle title="Manuel de procédures sur mesure" sub={`${company.name} — cycles selon le secteur, tâches affectées aux postes de l’organigramme, séparation des tâches contrôlée`} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <label className="text-sm">Secteur<select className="input" value={sector} onChange={(e) => setSector(e.target.value)}>{SECTORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-sm">Cabinet (charte du livrable)<input className="input" value={firm} onChange={(e) => setFirm(e.target.value)} /></label>
          <label className="text-sm">Risques identifiés au diagnostic (un par ligne)<textarea className="input h-24" value={risks} onChange={(e) => setRisks(e.target.value)} /></label>
        </div>
        <div className="card space-y-2">
          <h2 className="font-semibold">Organigramme (postes)</h2>
          {positions.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input className="input w-24" value={p.id} onChange={(e) => setPositions(positions.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} />
              <input className="input" value={p.title} onChange={(e) => setPositions(positions.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <button className="btn-ghost" onClick={() => setPositions(positions.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => setPositions([...positions, { id: `p${positions.length + 1}`, title: '' }])}>+ Poste</button>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" onClick={gen}>Générer l’aperçu</button>
        <button className="btn-ghost" onClick={() => apiDownload('/cabinet/manual?format=docx', `manuel-procedures-${company.name}.docx`, body).catch((e) => setMsg({ kind: 'error', text: errorText(e) }))}>Télécharger (Word)</button>
      </div>
      {preview && (
        <div className="space-y-4">
          <Alert kind="warn">Projet à revoir et valider par l’expert-comptable avant diffusion (version {preview.version}).</Alert>
          {preview.segregationIssues.length > 0 && (
            <div className="card"><h2 className="font-semibold">Cumuls de fonctions incompatibles</h2>
              <ul className="list-disc pl-5 text-sm">{preview.segregationIssues.map((s: any, i: number) => <li key={i}><b>{s.cycle}</b> — {s.duties.join(' / ')} : {s.compensatingControl}</li>)}</ul></div>
          )}
          {preview.chapters.map((c: any) => (
            <div key={c.cycle} className="card p-0">
              <h2 className="p-4 font-semibold">Cycle {c.cycle.toLowerCase()} <span className="font-normal text-slate-500">— {c.objective}</span></h2>
              <table className="table text-sm"><thead><tr><th>#</th><th>Acteur</th><th>Action</th><th>Document</th><th>Contrôle</th></tr></thead>
                <tbody>{c.procedures.map((p: any) => <tr key={p.step}><td>{p.step}</td><td>{p.actor}</td><td>{p.action}</td><td>{p.document}</td><td>{p.control ?? ''}</td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
