'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function Consolidation() {
  const { companies } = useSession();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api<any[]>('/consolidation/groups') });
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<Record<string, { on: boolean; parent: boolean; method: string; pct: string; cost: string; rate: string }>>({});
  const [msg, setMsg] = useState('');
  const res = useQuery({ queryKey: ['conso', sel], queryFn: () => api<any>(`/consolidation/groups/${sel}/statements`), enabled: !!sel });
  const create = useMutation({
    mutationFn: () => api<any>('/consolidation/groups', { method: 'POST', body: { name, currency: companies.find((c) => members[c.id]?.parent)?.currency ?? 'CDF', members: Object.entries(members).filter(([, m]) => m.on).map(([companyId, m]) => ({ companyId, parent: m.parent, method: m.method, ownershipPct: m.pct || '100', investmentCost: m.cost || undefined, closingRate: m.rate || undefined, averageRate: m.rate || undefined })) } }),
    onSuccess: (g) => { setSel(g.id); qc.invalidateQueries({ queryKey: ['groups'] }); },
    onError: (e) => setMsg(errorText(e)),
  });
  const m = (id: string) => members[id] ?? { on: false, parent: false, method: 'IG', pct: '100', cost: '', rate: '' };
  const set = (id: string, p: Partial<ReturnType<typeof m>>) => setMembers({ ...members, [id]: { ...m(id), ...p } });
  const r = res.data;
  return (
    <div className="space-y-4">
      <PageTitle title="Consolidation" sub="Intégration globale, mise en équivalence, éliminations intragroupe, conversion des filiales" />
      {msg && <Alert>{msg}</Alert>}
      <div className="card space-y-2">
        <h2>Périmètre</h2>
        <input className="input" placeholder="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} />
        <table className="table"><thead><tr><th></th><th>Société</th><th>Mère</th><th>Méthode</th><th>% d’intérêt</th><th>Coût des titres (unités mineures)</th><th>Cours (filiale en devise)</th></tr></thead>
          <tbody>{companies.map((c) => (
            <tr key={c.id}>
              <td><input type="checkbox" checked={m(c.id).on} onChange={(e) => set(c.id, { on: e.target.checked })} /></td><td>{c.name} ({c.currency})</td>
              <td><input type="radio" name="parent" checked={m(c.id).parent} onChange={() => setMembers(Object.fromEntries(Object.entries({ ...members, [c.id]: { ...m(c.id), on: true } }).map(([k, v]) => [k, { ...v, parent: k === c.id }])))} /></td>
              <td><select className="input py-1" value={m(c.id).method} onChange={(e) => set(c.id, { method: e.target.value })}><option value="IG">Intégration globale</option><option value="IP">Intégration proportionnelle</option><option value="MEE">Mise en équivalence</option></select></td>
              <td><input className="input w-20 py-1" value={m(c.id).pct} onChange={(e) => set(c.id, { pct: e.target.value })} /></td>
              <td><input className="input w-36 py-1" value={m(c.id).cost} onChange={(e) => set(c.id, { cost: e.target.value })} /></td>
              <td><input className="input w-24 py-1" value={m(c.id).rate} onChange={(e) => set(c.id, { rate: e.target.value })} /></td>
            </tr>
          ))}</tbody></table>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => create.mutate()}>Créer le groupe</button>
          {groups.data?.map((g) => <button key={g.id} className={sel === g.id ? 'btn-accent' : 'btn-ghost'} onClick={() => setSel(g.id)}>{g.name}</button>)}
        </div>
      </div>
      {r && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-0"><h2 className="px-4 pt-3">Bilan consolidé (synthèse)</h2>
            <table className="table mt-1"><tbody>
              {r.balanceSheet.assets.filter((x: any) => x.total).map((x: any) => <tr key={x.ref} className="total"><td>{x.label}</td><td className="text-right"><Money v={x.net} /></td></tr>)}
              {r.balanceSheet.liabilities.filter((x: any) => x.total).map((x: any) => <tr key={x.ref}><td>{x.label}</td><td className="text-right"><Money v={x.value} /></td></tr>)}
            </tbody></table>
          </div>
          <div className="card p-0"><h2 className="px-4 pt-3">Retraitements</h2>
            <table className="table mt-1"><tbody>
              <tr><td>Résultat net consolidé</td><td className="text-right"><Money v={r.incomeStatement.values.XI} /></td></tr>
              <tr><td>dont part du groupe</td><td className="text-right"><Money v={r.groupResult} /></td></tr>
              <tr><td>dont intérêts minoritaires</td><td className="text-right"><Money v={r.minorityResult} /></td></tr>
              <tr><td>Intérêts minoritaires (capitaux propres)</td><td className="text-right"><Money v={r.minorityEquity} /></td></tr>
              <tr><td>Écart d’acquisition</td><td className="text-right"><Money v={r.goodwill} /></td></tr>
              <tr><td>Réserves consolidées (part du groupe)</td><td className="text-right"><Money v={r.summary?.groupReserves} /></td></tr>
              <tr><td>Quote-part dans les résultats des entités mises en équivalence</td><td className="text-right"><Money v={r.equityMethodResult} /></td></tr>
              <tr><td>Capitaux propres part du groupe</td><td className="text-right"><Money v={r.summary?.groupEquity} /></td></tr>
              <tr><td>Écart de conversion</td><td className="text-right"><Money v={r.translationDifference} /></td></tr>
              <tr><td>Comptes réciproques éliminés</td><td className="text-right">{r.eliminated.length}</td></tr>
            </tbody></table>
          </div>
        </div>
      )}
    </div>
  );
}
