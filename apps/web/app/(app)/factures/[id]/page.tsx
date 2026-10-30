'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, today } from '@/lib/format';

/** Facture imprimable (A4) : logo de l'abonné, mentions légales, QR de vérification. */
export default function Facture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { company, dec, can } = useSession();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const q = useQuery({ queryKey: ['sales-doc', id], queryFn: () => api<any>(`/companies/${company!.id}/sales-documents/${id}`), enabled: !!company });
  const avoir = useMutation({
    mutationFn: (reason: string) => api(`/companies/${company!.id}/invoices/${id}/credit-note`, { method: 'POST', body: { date: today(), reason } }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => setErr(errorText(e)),
  });
  const d = q.data;
  if (!d) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="no-print flex gap-2">
        <button className="btn-primary" onClick={() => window.print()}>Imprimer / PDF</button>
        {d.type === 'FACTURE' && d.status === 'EMISE' && can('COMPTABLE', 'CHEF_COMPTABLE') && (
          <button className="btn-danger" onClick={() => { const r = prompt('Motif de l’avoir :'); if (r) avoir.mutate(r); }}>Annuler par avoir</button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      <div className="card relative bg-white p-10">
        {d.status === 'ANNULEE' && <div className="absolute right-10 top-24 rotate-12 rounded border-4 border-red-500 px-4 py-1 text-3xl font-bold text-red-500">ANNULÉE</div>}
        <div className="flex items-start justify-between">
          <div>
            {d.company.logoDataUrl ? <img src={d.company.logoDataUrl} alt="" className="mb-2 h-16" /> : null}
            <div className="text-lg font-bold text-nuit">{d.company.name}</div>
            <div className="text-xs text-slate-600">
              {d.company.legalForm} · {d.company.address}<br />
              RCCM : {d.company.rccm ?? '—'} · Id. Nat. : {d.company.nationalId ?? '—'} · NIF : {d.company.taxId ?? '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-nuit">{d.type === 'AVOIR' ? 'FACTURE D’AVOIR' : 'FACTURE'}</div>
            <div className="font-semibold">{d.number}</div>
            <div className="text-sm">Date : {date(d.date)}</div>
          </div>
        </div>
        <div className="mt-6 rounded-md bg-slate-50 p-3 text-sm">
          <div className="label">Client</div>
          <div className="font-semibold">{d.client.name}</div>
          <div className="text-xs">NIF : {d.client.taxId ?? '—'}</div>
        </div>
        <table className="table mt-6">
          <thead><tr><th>Désignation</th><th className="text-right">Qté</th><th className="text-right">P.U. HT</th><th className="text-right">TVA</th><th className="text-right">Montant HT</th></tr></thead>
          <tbody>
            {d.lines.map((l: any, i: number) => (
              <tr key={i}><td>{l.description}</td><td className="text-right">{l.quantity}</td><td className="text-right"><Money v={l.unitPrice} dec={dec} /></td><td className="text-right">{Number(l.vatRate) * 100} %</td><td className="text-right"><Money v={l.net} dec={dec} /></td></tr>
            ))}
            <tr><td colSpan={4} className="text-right">Total HT</td><td className="text-right"><Money v={d.totalNet} dec={dec} /></td></tr>
            <tr><td colSpan={4} className="text-right">TVA</td><td className="text-right"><Money v={d.totalVat} dec={dec} /></td></tr>
            <tr className="total"><td colSpan={4} className="text-right">Total TTC ({d.currency})</td><td className="text-right"><Money v={d.totalGross} dec={dec} /></td></tr>
          </tbody>
        </table>
        <div className="mt-8 flex items-end justify-between">
          <div className="max-w-sm text-[10px] text-slate-500">
            Document vérifiable : scannez le code QR ou rendez-vous sur {d.url}<br />
            Empreinte SHA-256 : <span className="break-all font-mono">{d.hash}</span>
          </div>
          <img src={d.qrDataUrl} alt="QR de vérification" className="h-32 w-32" />
        </div>
        <div className="mt-6 border-t pt-2 text-center text-[10px] text-slate-400">Émis avec Jupiter Compta — JUPSER</div>
      </div>
    </div>
  );
}
