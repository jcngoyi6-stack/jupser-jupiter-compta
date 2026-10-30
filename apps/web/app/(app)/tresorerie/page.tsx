'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, money, today } from '@/lib/format';

export default function Tresorerie() {
  const { company, dec, can } = useSession();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [rate, setRate] = useState({ currency: 'USD', rate: '', date: today(), source: 'BCC — taux indicatif', type: 'OFFICIEL' });
  const [conv, setConv] = useState({ amount: '100', currency: 'USD' });
  const [aged, setAged] = useState('411');
  const [letterAcc, setLetterAcc] = useState('411100');
  const rates = useQuery({ queryKey: ['fx'], queryFn: () => api<any[]>('/fx-rates') });
  const agedQ = useQuery({ queryKey: ['aged', company?.id, aged], queryFn: () => api<any[]>(`/companies/${company!.id}/aged-balance?account=${aged}`), enabled: !!company });
  const convQ = useMutation({ mutationFn: () => api<any>('/fx-rates/convert', { method: 'POST', body: { ...conv, quote: company!.currency, date: today() } }), onError: (e) => setMsg({ kind: 'error', text: errorText(e) }) });
  const ok = (text: string) => () => { setMsg({ kind: 'ok', text }); qc.invalidateQueries(); };
  const err = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });
  const addRate = useMutation({ mutationFn: () => api('/fx-rates', { method: 'POST', body: { ...rate, quote: company!.currency } }), onSuccess: ok('Cours enregistré (source et date tracées).'), onError: err });
  const reval = useMutation({ mutationFn: () => api<any>(`/companies/${company!.id}/fx/revaluation`, { method: 'POST', body: { date: today() } }), onSuccess: (r: any) => { setMsg({ kind: 'ok', text: `${r.drafts.length} écriture(s) d’écart de conversion proposée(s) en brouillon.` }); qc.invalidateQueries(); }, onError: err });
  const letter = useMutation({ mutationFn: () => api<any>(`/companies/${company!.id}/lettering/auto`, { method: 'POST', body: { account: letterAcc } }), onSuccess: (r: any) => { setMsg({ kind: 'ok', text: `${r.groups.length} lettrage(s) effectué(s).` }); qc.invalidateQueries(); }, onError: err });
  if (!company) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Trésorerie, tiers et devises" sub={`Devise de tenue : ${company.currency} — cours conservés avec source, date et type`} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2>Cours de change</h2>
          {can('CHEF_COMPTABLE', 'COMPTABLE', 'CAISSIER') && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <select className="input" value={rate.currency} onChange={(e) => setRate({ ...rate, currency: e.target.value })}><option>USD</option><option>EUR</option></select>
              <input className="input" placeholder={`1 ${rate.currency} = ? ${company.currency}`} value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} />
              <input type="date" className="input" value={rate.date} onChange={(e) => setRate({ ...rate, date: e.target.value })} />
              <select className="input" value={rate.type} onChange={(e) => setRate({ ...rate, type: e.target.value })}><option value="OFFICIEL">Officiel</option><option value="MARCHE">Marché</option><option value="MANUEL">Manuel</option></select>
              <button className="btn-primary" onClick={() => addRate.mutate()}>Ajouter</button>
              <input className="input md:col-span-5" placeholder="Source" value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} />
            </div>
          )}
          <table className="table">
            <thead><tr><th>Date</th><th>Devise</th><th className="text-right">Cours</th><th>Type</th><th>Source</th></tr></thead>
            <tbody>{rates.data?.slice(0, 12).map((r) => <tr key={r.id}><td>{date(r.date)}</td><td>{r.currency}/{r.quote}</td><td className="num text-right">{r.rate.replace('.', ',')}</td><td>{r.type}</td><td className="text-xs">{r.source}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="space-y-4">
          <div className="card space-y-2">
            <h2>Convertisseur</h2>
            <div className="flex gap-2">
              <input className="input" value={conv.amount} onChange={(e) => setConv({ ...conv, amount: e.target.value })} />
              <select className="input w-28" value={conv.currency} onChange={(e) => setConv({ ...conv, currency: e.target.value })}><option>USD</option><option>EUR</option></select>
              <button className="btn-ghost" onClick={() => convQ.mutate()}>Convertir</button>
            </div>
            {convQ.data && <p className="text-sm">= <b>{money(convQ.data.result, dec)} {company.currency}</b> au cours {convQ.data.rate.rate} ({convQ.data.rate.source}, {date(convQ.data.rate.date)})</p>}
          </div>
          {can('CHEF_COMPTABLE', 'COMPTABLE') && (
            <div className="card space-y-2">
              <h2>Travaux de clôture</h2>
              <button className="btn-ghost w-full" onClick={() => reval.mutate()}>Réévaluer les créances et dettes en devises (478/479)</button>
              <div className="flex gap-2">
                <input className="input num" value={letterAcc} onChange={(e) => setLetterAcc(e.target.value)} />
                <button className="btn-ghost whitespace-nowrap" onClick={() => letter.mutate()}>Lettrage automatique</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="card p-0">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2>Balance âgée</h2>
          <select className="input w-56" value={aged} onChange={(e) => setAged(e.target.value)}><option value="411">Clients (411)</option><option value="401">Fournisseurs (401)</option></select>
        </div>
        <table className="table mt-2">
          <thead><tr><th>Tiers</th><th className="text-right">0–30 j</th><th className="text-right">31–60 j</th><th className="text-right">61–90 j</th><th className="text-right">&gt; 90 j</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {agedQ.data?.map((r, i) => (
              <tr key={i}><td>{r.thirdParty?.name ?? '—'}</td>{r.buckets.map((b: string, j: number) => <td key={j} className="text-right"><Money v={b} dec={dec} /></td>)}<td className="text-right font-semibold"><Money v={r.total} dec={dec} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
