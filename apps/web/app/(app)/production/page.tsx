'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date, today } from '@/lib/format';
import { qty, useAction } from '@/lib/hooks';

export default function Production() {
  const { company, dec } = useSession();
  const { run, runAsync, msg } = useAction();
  const items = useQuery({ queryKey: ['items', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/stock/items`), enabled: !!company });
  const boms = useQuery({ queryKey: ['boms', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/production/boms`), enabled: !!company });
  const wos = useQuery({ queryKey: ['wos', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/production/work-orders`), enabled: !!company });
  const whs = useQuery({ queryKey: ['wh', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/stock/warehouses`), enabled: !!company });
  const [b, setB] = useState({ productId: '', overheadRate: '0.10', comps: [{ itemId: '', qty: '' }], poste: 'Atelier', minutes: '0', hourlyRate: '' });
  const [of, setOf] = useState({ bomId: '', qty: '' });
  const [sim, setSim] = useState<any>(null);
  if (!company) return null;
  const name = (id: string) => items.data?.find((i) => i.id === id)?.label ?? id;
  const ofBody = () => ({ bomId: of.bomId, qty: of.qty, date: today(), warehouseId: whs.data?.[0]?.id });
  return (
    <div className="space-y-4">
      <PageTitle title="Production" sub="Nomenclatures, gammes, ordres de fabrication et coût de revient (matières + main-d’œuvre + frais)" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card space-y-2">
        <h2>Nomenclature</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <select className="input" value={b.productId} onChange={(e) => setB({ ...b, productId: e.target.value })}><option value="">Produit fabriqué…</option>{items.data?.filter((i) => ['PRODUIT_FINI', 'SEMI_FINI'].includes(i.kind)).map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
          <input className="input" placeholder="Poste de charge" value={b.poste} onChange={(e) => setB({ ...b, poste: e.target.value })} />
          <input className="input" placeholder="Minutes / unité" value={b.minutes} onChange={(e) => setB({ ...b, minutes: e.target.value })} />
          <input className="input" placeholder="Coût horaire" value={b.hourlyRate} onChange={(e) => setB({ ...b, hourlyRate: e.target.value })} />
          <input className="input" placeholder="Taux de frais (0.10)" value={b.overheadRate} onChange={(e) => setB({ ...b, overheadRate: e.target.value })} />
        </div>
        {b.comps.map((c, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <select className="input" value={c.itemId} onChange={(e) => setB({ ...b, comps: b.comps.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)) })}><option value="">Composant…</option>{items.data?.filter((i) => !['PRODUIT_FINI'].includes(i.kind)).map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}</select>
            <input className="input" placeholder="Quantité par unité" value={c.qty} onChange={(e) => setB({ ...b, comps: b.comps.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setB({ ...b, comps: [...b.comps, { itemId: '', qty: '' }] })}>+ Composant</button>
          <button className="btn-primary" onClick={() => run({ path: `/companies/${company.id}/production/boms`, body: { productId: b.productId, overheadRate: b.overheadRate, components: b.comps.filter((c) => c.itemId), routing: b.hourlyRate ? [{ poste: b.poste, minutes: Number(b.minutes), hourlyRate: b.hourlyRate }] : [] }, ok: 'Nomenclature enregistrée.' })}>Enregistrer</button>
        </div>
      </div>
      <div className="card space-y-2">
        <h2>Ordre de fabrication</h2>
        <div className="flex flex-wrap gap-2">
          <select className="input w-72" value={of.bomId} onChange={(e) => setOf({ ...of, bomId: e.target.value })}><option value="">Nomenclature…</option>{boms.data?.map((x) => <option key={x.id} value={x.id}>{name(x.productId)}</option>)}</select>
          <input className="input w-40" placeholder="Quantité" value={of.qty} onChange={(e) => setOf({ ...of, qty: e.target.value })} />
          <button className="btn-ghost" onClick={async () => setSim((await runAsync({ path: `/companies/${company.id}/production/work-orders`, body: { ...ofBody(), simulate: true }, ok: 'Coût prévisionnel calculé.' })).r)}>Simuler le coût</button>
          <button className="btn-accent" onClick={() => run({ path: `/companies/${company.id}/production/work-orders`, body: ofBody(), ok: (r) => `OF ${r.number} terminé : matières consommées, produit entré en stock.` })}>Lancer et terminer l’OF</button>
        </div>
        {sim && (
          <table className="table"><tbody>
            <tr><td>Matières</td><td className="text-right"><Money v={sim.sheet.materialCost} dec={dec} /></td></tr>
            <tr><td>Main-d’œuvre</td><td className="text-right"><Money v={sim.sheet.labourCost} dec={dec} /></td></tr>
            <tr><td>Frais indirects</td><td className="text-right"><Money v={sim.sheet.overhead} dec={dec} /></td></tr>
            <tr className="total"><td>Coût de revient total</td><td className="text-right"><Money v={sim.sheet.total} dec={dec} /></td></tr>
            <tr><td>Coût unitaire</td><td className="text-right"><Money v={sim.sheet.unitCost} dec={dec} /></td></tr>
          </tbody></table>
        )}
      </div>
      <div className="card p-0"><table className="table"><thead><tr><th>N°</th><th>Date</th><th>Produit</th><th className="text-right">Quantité</th><th className="text-right">Coût de revient</th></tr></thead>
        <tbody>{wos.data?.map((w) => <tr key={w.id}><td>{w.number}</td><td>{date(w.date)}</td><td>{name(boms.data?.find((x) => x.id === w.bomId)?.productId)}</td><td className="text-right">{qty(w.qtyMilli)}</td><td className="text-right"><Money v={w.costSheet?.total} dec={dec} /></td></tr>)}</tbody></table></div>
    </div>
  );
}
