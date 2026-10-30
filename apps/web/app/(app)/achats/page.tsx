'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useThirdParties } from '@/components/AccountInput';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date, today } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const LABEL: Record<string, string> = { A_APPROUVER: 'À approuver', VALIDE: 'Approuvé (engagé)', RECU: 'Reçu', FACTURE: 'Facturé', ANNULE: 'Annulé' };

export default function Achats() {
  const { company, dec, can } = useSession();
  const { run, msg } = useAction();
  const tps = useThirdParties();
  const items = useQuery({ queryKey: ['items', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/stock/items`), enabled: !!company });
  const whs = useQuery({ queryKey: ['wh', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/stock/warehouses`), enabled: !!company });
  const pos = useQuery({ queryKey: ['po', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/purchases`), enabled: !!company });
  const [f, setF] = useState({ supplierId: '', date: today(), expenseAccount: '601100', analytic: '' });
  const [lines, setLines] = useState([{ itemId: '', description: '', qty: '1', unitPrice: '', vat: 'NORMAL' }]);
  if (!company) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Achats" sub="Demande → bon de commande → approbation (direction/finance) → réception → facture fournisseur" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select className="input" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}><option value="">Fournisseur…</option>{tps.data?.filter((t) => t.type === 'FOURNISSEUR').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <input className="input num" placeholder="Compte de charge" value={f.expenseAccount} onChange={(e) => setF({ ...f, expenseAccount: e.target.value })} />
          <input className="input" placeholder="Axe analytique (budget)" value={f.analytic} onChange={(e) => setF({ ...f, analytic: e.target.value })} />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <select className="input" value={l.itemId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: e.target.value, description: items.data?.find((it) => it.id === e.target.value)?.label ?? x.description } : x)))}><option value="">Article (facultatif)</option>{items.data?.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}</select>
            <input className="input" placeholder="Désignation" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <input className="input" placeholder="Quantité" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            <input className="input" placeholder="Prix unitaire HT" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} />
            <select className="input" value={l.vat} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, vat: e.target.value } : x)))}><option value="NORMAL">TVA normale</option><option value="REDUIT">TVA réduite</option><option value="EXONERE">Exonéré</option></select>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setLines([...lines, { itemId: '', description: '', qty: '1', unitPrice: '', vat: 'NORMAL' }])}>+ Ligne</button>
          <button className="btn-primary" onClick={() => run({ path: `/companies/${company.id}/purchases`, body: { ...f, analytic: f.analytic || undefined, lines: lines.map((l) => ({ ...l, itemId: l.itemId || undefined })) }, ok: 'Bon de commande soumis à approbation.' })}>Émettre le bon de commande</button>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th className="text-right">HT</th><th className="text-right">TVA</th><th>Statut</th><th></th></tr></thead>
          <tbody>{pos.data?.map((p) => (
            <tr key={p.id}><td>{p.number}</td><td>{date(p.date)}</td><td>{tps.data?.find((t) => t.id === p.supplierId)?.name}</td><td className="text-right"><Money v={p.totalNet} dec={dec} /></td><td className="text-right"><Money v={p.totalVat} dec={dec} /></td><td>{LABEL[p.status] ?? p.status}</td>
              <td className="whitespace-nowrap">
                {p.status === 'A_APPROUVER' && can('DIRECTION', 'CHEF_COMPTABLE') && <button className="btn-accent px-2 py-1 text-xs" onClick={() => run({ path: `/companies/${company.id}/purchases/${p.id}/approve`, ok: 'Approuvé.' })}>Approuver</button>}
                {p.status === 'VALIDE' && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run({ path: `/companies/${company.id}/purchases/${p.id}/receive`, body: { date: today(), warehouseId: whs.data?.[0]?.id }, ok: 'Réception enregistrée, stock mis à jour.' })}>Réceptionner</button>}
                {['VALIDE', 'RECU'].includes(p.status) && can('COMPTABLE', 'CHEF_COMPTABLE') && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { const n = prompt('N° de facture fournisseur :'); if (n) run({ path: `/companies/${company.id}/purchases/${p.id}/invoice`, body: { date: today(), supplierInvoiceNumber: n }, ok: (r) => `Facture comptabilisée : ${r.number}` }); }}>Facture reçue</button>}
              </td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
