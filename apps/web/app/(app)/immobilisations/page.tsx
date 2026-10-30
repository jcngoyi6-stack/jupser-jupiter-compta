'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, today } from '@/lib/format';

interface Comp { label: string; cost: string; residualValue: string; method: string; years: string; degressiveCoefficient: string; fiscalMethod: string; fiscalYears: string; fiscalCoefficient: string }
const newComp = (label = ''): Comp => ({ label, cost: '', residualValue: '', method: 'LINEAIRE', years: '5', degressiveCoefficient: '', fiscalMethod: '', fiscalYears: '', fiscalCoefficient: '' });

export default function Immobilisations() {
  const { company, dec, can } = useSession();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [f, setF] = useState({ code: '', label: '', account: '244400', acquisitionDate: today(), inServiceDate: today() });
  const [comps, setComps] = useState<Comp[]>([newComp('Principal')]);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['assets', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/assets`), enabled: !!company });
  const err = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });
  const create = useMutation({
    mutationFn: () => api<any>(`/companies/${company!.id}/assets`, { method: 'POST', body: { ...f, components: comps.map((c) => ({ label: c.label, cost: c.cost, residualValue: c.residualValue || undefined, method: c.method, years: Number(c.years), degressiveCoefficient: c.degressiveCoefficient || undefined, fiscal: c.fiscalMethod ? { method: c.fiscalMethod, years: Number(c.fiscalYears || c.years), degressiveCoefficient: c.fiscalCoefficient || undefined } : undefined })) } }),
    onSuccess: (r) => { setMsg({ kind: r.warning ? 'warn' : 'ok', text: r.warning ?? 'Immobilisation enregistrée.' }); qc.invalidateQueries(); },
    onError: err,
  });
  const dot = useMutation({
    mutationFn: () => api(`/companies/${company!.id}/assets/depreciation`, { method: 'POST', body: { year: new Date().getUTCFullYear(), date: `${new Date().getUTCFullYear()}-12-31` } }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Écriture des dotations proposée en brouillon (à valider dans Écritures).' }); qc.invalidateQueries(); },
    onError: err,
  });
  const dispose = useMutation({
    mutationFn: ({ id, price }: { id: string; price: string }) => api<any>(`/companies/${company!.id}/assets/${id}/dispose`, { method: 'POST', body: { date: today(), price } }),
    onSuccess: (r) => { setMsg({ kind: 'ok', text: `Cession proposée en brouillon. VNC ${r.vnc}, résultat de cession ${r.gainOrLoss} (unités mineures).` }); qc.invalidateQueries(); },
    onError: err,
  });
  if (!company) return null;
  const writer = can('CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE');
  return (
    <div className="space-y-4">
      <PageTitle title="Immobilisations" sub="Approche par composants — linéaire, dégressif, unités d’œuvre — cessions (81x/82x)">
        {writer && <button className="btn-accent" onClick={() => dot.mutate()}>Proposer les dotations de l’exercice</button>}
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {writer && (
        <div className="card space-y-3">
          <h2>Nouvelle immobilisation</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <input className="input" placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            <input className="input md:col-span-2" placeholder="Désignation" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
            <input className="input num" placeholder="Compte (2xxxxx)" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} />
            <input type="date" className="input" value={f.inServiceDate} onChange={(e) => setF({ ...f, inServiceDate: e.target.value, acquisitionDate: e.target.value })} />
          </div>
          {comps.map((c, i) => {
            const set = (patch: Partial<Comp>) => setComps(comps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="space-y-2 rounded border border-slate-200 p-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  <input className="input md:col-span-2" placeholder="Composant" value={c.label} onChange={(e) => set({ label: e.target.value })} />
                  <input className="input" placeholder="Coût" value={c.cost} onChange={(e) => set({ cost: e.target.value })} />
                  <input className="input" placeholder="Valeur résiduelle" value={c.residualValue} onChange={(e) => set({ residualValue: e.target.value })} />
                  <select className="input" value={c.method} onChange={(e) => set({ method: e.target.value })}>
                    <option value="LINEAIRE">Linéaire</option>
                    <option value="DEGRESSIF">Dégressif à taux décroissant</option>
                    <option value="DEGRESSIF_COEFFICIENT">Dégressif à coefficient</option>
                    <option value="NON_AMORTISSABLE">Non amortissable</option>
                  </select>
                  <input className="input" placeholder="Durée (ans)" value={c.years} onChange={(e) => set({ years: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  {c.method === 'DEGRESSIF_COEFFICIENT' && <input className="input" placeholder="Coefficient" value={c.degressiveCoefficient} onChange={(e) => set({ degressiveCoefficient: e.target.value })} />}
                  <select className="input md:col-span-2" value={c.fiscalMethod} onChange={(e) => set({ fiscalMethod: e.target.value })} title="Plan fiscal (amortissements dérogatoires)">
                    <option value="">Plan fiscal identique</option>
                    <option value="LINEAIRE">Plan fiscal linéaire</option>
                    <option value="DEGRESSIF_COEFFICIENT">Plan fiscal dégressif à coefficient</option>
                  </select>
                  {c.fiscalMethod && <input className="input" placeholder="Durée fiscale" value={c.fiscalYears} onChange={(e) => set({ fiscalYears: e.target.value })} />}
                  {c.fiscalMethod === 'DEGRESSIF_COEFFICIENT' && <input className="input" placeholder="Coefficient fiscal" value={c.fiscalCoefficient} onChange={(e) => set({ fiscalCoefficient: e.target.value })} />}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">Dégressif à taux décroissant : méthode du guide d’application (application 13). Un plan fiscal différent génère les amortissements dérogatoires (851 / 151 / 861).</p>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setComps([...comps, newComp()])}>+ Composant</button>
            <button className="btn-primary" onClick={() => create.mutate()}>Enregistrer</button>
          </div>
        </div>
      )}
      <div className="card p-0">
        <table className="table">
          <thead><tr><th>Code</th><th>Désignation</th><th>Compte</th><th>Mise en service</th><th className="text-right">Coût</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {q.data?.map((a) => (
              <Fragment key={a.id}>
                <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <td>{a.code}</td><td>{a.label}</td><td className="num">{a.account}</td><td>{date(a.inServiceDate)}</td><td className="text-right"><Money v={a.cost} dec={dec} /></td><td>{a.status === 'CEDE' ? 'Cédée' : 'En service'}</td>
                  <td onClick={(e) => e.stopPropagation()}>{writer && a.status === 'EN_SERVICE' && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { const p = prompt('Prix de cession :'); if (p) dispose.mutate({ id: a.id, price: p }); }}>Céder</button>}</td>
                </tr>
                {open === a.id && a.schedule.map((s: any) => (
                  <tr key={a.id + s.label}><td colSpan={7} className="bg-slate-50">
                    <div className="font-semibold">{s.label}</div>
                    <table className="table"><thead><tr><th>Exercice</th><th className="text-right">Dotation</th><th className="text-right">Cumul</th><th className="text-right">VNC</th></tr></thead>
                      <tbody>{s.rows.map((r: any) => <tr key={r.year}><td>{r.year}</td><td className="text-right"><Money v={r.dotation} dec={dec} /></td><td className="text-right"><Money v={r.cumul} dec={dec} /></td><td className="text-right"><Money v={r.vnc} dec={dec} /></td></tr>)}</tbody></table>
                  </td></tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
