'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { today } from '@/lib/format';
import { qty, useAction } from '@/lib/hooks';

export default function Stocks() {
  const { company, dec, can } = useSession();
  const { run, msg } = useAction();
  const items = useQuery({ queryKey: ['items', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/stock/items`), enabled: !!company });
  const whs = useQuery({ queryKey: ['wh', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/stock/warehouses`), enabled: !!company });
  const [it, setIt] = useState({ code: '', label: '', kind: 'MARCHANDISE', unit: 'u', salePrice: '', reorderLevel: '0' });
  const [mv, setMv] = useState({ type: 'ENTREE', itemId: '', warehouseId: '', toWarehouseId: '', date: today(), qty: '', unitCost: '', reference: '' });
  const [counts, setCounts] = useState<Record<string, string>>({});
  if (!company) return null;
  const wh = mv.warehouseId || whs.data?.[0]?.id || '';
  return (
    <div className="space-y-4">
      <PageTitle title="Stocks" sub={`Inventaire permanent — chaque mouvement génère son écriture (31x… ↔ 603x/73x) — valorisation CMUP ou FIFO`} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card grid grid-cols-2 gap-2 md:grid-cols-7">
        <input className="input" placeholder="Code" value={it.code} onChange={(e) => setIt({ ...it, code: e.target.value })} />
        <input className="input md:col-span-2" placeholder="Désignation" value={it.label} onChange={(e) => setIt({ ...it, label: e.target.value })} />
        <select className="input" value={it.kind} onChange={(e) => setIt({ ...it, kind: e.target.value })}><option value="MARCHANDISE">Marchandise</option><option value="MATIERE">Matière première</option><option value="FOURNITURE">Fourniture</option><option value="SEMI_FINI">Produit intermédiaire</option><option value="PRODUIT_FINI">Produit fini</option></select>
        <input className="input" placeholder="Prix de vente" value={it.salePrice} onChange={(e) => setIt({ ...it, salePrice: e.target.value })} />
        <input className="input" placeholder="Seuil d’alerte" value={it.reorderLevel} onChange={(e) => setIt({ ...it, reorderLevel: e.target.value })} />
        <button className="btn-primary" onClick={() => run({ path: `/companies/${company.id}/stock/items`, body: { ...it, salePrice: it.salePrice || '0' }, ok: 'Article créé.' })}>Créer l’article</button>
      </div>
      <div className="card grid grid-cols-2 gap-2 md:grid-cols-8">
        <select className="input" value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })}><option value="ENTREE">Bon d’entrée</option><option value="SORTIE">Bon de sortie</option><option value="TRANSFERT">Transfert</option></select>
        <select className="input md:col-span-2" value={mv.itemId} onChange={(e) => setMv({ ...mv, itemId: e.target.value })}><option value="">Article…</option>{items.data?.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.label}</option>)}</select>
        <select className="input" value={wh} onChange={(e) => setMv({ ...mv, warehouseId: e.target.value })}>{whs.data?.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select>
        {mv.type === 'TRANSFERT' && <select className="input" value={mv.toWarehouseId} onChange={(e) => setMv({ ...mv, toWarehouseId: e.target.value })}><option value="">Vers…</option>{whs.data?.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select>}
        <input className="input" placeholder="Quantité" value={mv.qty} onChange={(e) => setMv({ ...mv, qty: e.target.value })} />
        {mv.type === 'ENTREE' && <input className="input" placeholder="Coût unitaire" value={mv.unitCost} onChange={(e) => setMv({ ...mv, unitCost: e.target.value })} />}
        <input className="input" placeholder="Référence" value={mv.reference} onChange={(e) => setMv({ ...mv, reference: e.target.value })} />
        <button className="btn-accent" onClick={() => run({ path: `/companies/${company.id}/stock/moves`, body: { ...mv, warehouseId: wh, unitCost: mv.unitCost || undefined, toWarehouseId: mv.toWarehouseId || undefined }, ok: 'Mouvement enregistré et comptabilisé.' })}>Enregistrer</button>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Code</th><th>Article</th><th>Nature</th><th>Méthode</th><th className="text-right">Quantité</th><th className="text-right">Coût unitaire</th><th className="text-right">Valeur</th><th>Inventaire physique</th></tr></thead>
          <tbody>{items.data?.map((i) => (
            <tr key={i.id} className={i.belowReorder ? 'bg-amber-50' : ''}>
              <td>{i.code}</td><td>{i.label} {i.belowReorder && <span className="badge bg-amber-100 text-amber-800">stock bas</span>}</td><td className="text-xs">{i.kind} ({i.stockAccount})</td><td>{i.method}</td>
              <td className="num text-right">{qty(i.qtyMilli)} {i.unit}</td><td className="text-right"><Money v={i.unitCost} dec={dec} /></td><td className="text-right"><Money v={i.value} dec={dec} /></td>
              <td><input className="input w-24 py-1" placeholder="compté" value={counts[i.id] ?? ''} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} /></td>
            </tr>
          ))}</tbody>
        </table>
        {can('CHEF_COMPTABLE', 'COMPTABLE') && <div className="p-4"><button className="btn-ghost" onClick={() => run({ path: `/companies/${company.id}/stock/inventory`, body: { date: today(), warehouseId: wh, counts: Object.entries(counts).filter(([, v]) => v).map(([itemId, counted]) => ({ itemId, counted })) }, ok: (r) => `${r.length} écart(s) d’inventaire comptabilisé(s).` })}>Valider l’inventaire physique</button></div>}
      </div>
    </div>
  );
}
