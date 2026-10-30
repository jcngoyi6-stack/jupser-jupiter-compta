'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useThirdParties } from '@/components/AccountInput';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, today } from '@/lib/format';

interface L { description: string; quantity: string; unitPrice: string; vat: 'NORMAL' | 'REDUIT' | 'EXONERE' | 'EXPORT' }

export default function Factures() {
  const { company, dec } = useSession();
  const qc = useQueryClient();
  const tps = useThirdParties();
  const docs = useQuery({ queryKey: ['sales', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/sales-documents`), enabled: !!company });
  const [client, setClient] = useState('');
  const [dt, setDt] = useState(today());
  const [pay, setPay] = useState('CREDIT');
  const [lines, setLines] = useState<L[]>([{ description: '', quantity: '1', unitPrice: '', vat: 'NORMAL' }]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api<any>(`/companies/${company!.id}/invoices`, { method: 'POST', body: { date: dt, thirdPartyId: client, paymentMethod: pay, exportSale: lines.some((l) => l.vat === 'EXPORT'), lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity.replace(',', '.')) })) } }),
    onSuccess: (d) => { setMsg({ kind: 'ok', text: `Facture ${d.number} émise — écriture ${d.entryNumber} générée automatiquement.` }); setLines([{ description: '', quantity: '1', unitPrice: '', vat: 'NORMAL' }]); qc.invalidateQueries(); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company) return null;
  const set = (i: number, p: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <div className="space-y-4">
      <PageTitle title="Factures avec code QR" sub="Une facture émise génère son écriture comptable (journal VTE) ; elle ne s’annule que par avoir. En RDC : facture normalisée certifiée par le dispositif électronique fiscal (DGI)." />
      <div className="card space-y-3">
        <h2>Nouvelle facture</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label">Client</label>
            <select className="input" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">Choisir…</option>
              {tps.data?.filter((t) => t.type === 'CLIENT').map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
            </select>
          </div>
          <div><label className="label">Date</label><input type="date" className="input" value={dt} onChange={(e) => setDt(e.target.value)} /></div>
          <div><label className="label">Règlement</label><select className="input" value={pay} onChange={(e) => setPay(e.target.value)}><option value="CREDIT">À crédit</option><option value="ESPECES">Espèces</option><option value="VIREMENT">Virement</option><option value="MOBILE_MONEY">Mobile money</option><option value="CARTE">Carte</option><option value="CHEQUE">Chèque</option></select></div>
        </div>
        <table className="table">
          <thead><tr><th>Désignation</th><th className="w-24">Qté</th><th className="w-44">Prix unitaire HT</th><th className="w-40">TVA</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><input className="input" value={l.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                <td><input className="input num text-right" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></td>
                <td><input className="input num text-right" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></td>
                <td>
                  <select className="input" value={l.vat} onChange={(e) => set(i, { vat: e.target.value as L['vat'] })}>
                    <option value="NORMAL">Taux normal</option><option value="REDUIT">Taux réduit</option><option value="EXONERE">Exonéré</option><option value="EXPORT">Exportation</option>
                  </select>
                </td>
                <td><button className="text-xs text-red-600" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>Suppr.</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setLines([...lines, { description: '', quantity: '1', unitPrice: '', vat: 'NORMAL' }])}>+ Ligne</button>
          <button className="btn-primary" disabled={!client || create.isPending} onClick={() => create.mutate()}>Émettre la facture</button>
        </div>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      </div>
      <div className="card p-0">
        <table className="table">
          <thead><tr><th>N°</th><th>Date</th><th>Type</th><th className="text-right">HT</th><th className="text-right">TVA</th><th className="text-right">TTC</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {docs.data?.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold">{d.number}</td><td>{date(d.date)}</td><td>{d.type}</td>
                <td className="text-right"><Money v={d.totalNet} dec={dec} /></td><td className="text-right"><Money v={d.totalVat} dec={dec} /></td><td className="text-right"><Money v={d.totalGross} dec={dec} /></td>
                <td><Status s={d.status} /></td>
                <td><Link className="text-turquoise-700 hover:underline" href={`/factures/${d.id}`}>Ouvrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
