'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date } from '@/lib/format';
import { readFileForApi } from '@/lib/file';

export default function Banque() {
  const { company, dec } = useSession();
  const qc = useQueryClient();
  const [account, setAccount] = useState('521100');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const q = useQuery({ queryKey: ['recon', company?.id, account], queryFn: () => api<any>(`/companies/${company!.id}/bank/${account}/reconciliation`), enabled: !!company && /^\d{6}$/.test(account) });
  const err = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });
  const imp = useMutation({ mutationFn: async (f: File) => api<any>(`/companies/${company!.id}/bank/${account}/statement`, { method: 'POST', body: await readFileForApi(f) }), onSuccess: (r) => { setMsg({ kind: 'ok', text: `${r.imported} ligne(s) importée(s).` }); qc.invalidateQueries(); }, onError: err });
  const match = useMutation({ mutationFn: (pairs: any[]) => api(`/companies/${company!.id}/bank/match`, { method: 'POST', body: { pairs } }), onSuccess: () => { setMsg({ kind: 'ok', text: 'Rapprochement enregistré.' }); qc.invalidateQueries(); }, onError: err });
  const reg = useMutation({ mutationFn: ({ id, acc }: { id: string; acc: string }) => api(`/companies/${company!.id}/bank/${account}/regularize`, { method: 'POST', body: { statementLineIds: [id], counterpartAccount: acc } }), onSuccess: () => { setMsg({ kind: 'ok', text: 'Écriture de régularisation proposée en brouillon.' }); qc.invalidateQueries(); }, onError: err });
  if (!company) return null;
  const d = q.data;
  return (
    <div className="space-y-4">
      <PageTitle title="Rapprochement bancaire et mobile money" sub="Import du relevé, correspondances proposées avec score, état de rapprochement">
        <input className="input num w-32" value={account} onChange={(e) => setAccount(e.target.value)} />
        <label className="btn-ghost cursor-pointer">Importer un relevé<input type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => e.target.files?.[0] && imp.mutate(e.target.files[0])} /></label>
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {d && (
        <>
          <div className="card grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <div>Solde comptable : <b><Money v={d.state.bookBalance} dec={dec} /></b></div>
            <div>Solde du relevé : <b><Money v={d.state.statementBalance} dec={dec} /></b></div>
            <div>{d.state.reconciled ? <span className="text-emerald-700">✓ Rapproché</span> : <span className="text-amber-700">Écart à justifier</span>}</div>
            <div>En comptabilité, pas en banque : <Money v={d.state.inBookNotBank} dec={dec} /></div>
            <div>En banque, pas en comptabilité : <Money v={d.state.inBankNotBook} dec={dec} /></div>
          </div>
          {d.proposals.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between"><h2>Correspondances proposées ({d.proposals.length})</h2><button className="btn-accent" onClick={() => match.mutate(d.proposals.map((p: any) => ({ statementLineId: p.statementLineId, entryLineId: p.bookId })))}>Tout accepter</button></div>
              <ul className="mt-2 text-sm">{d.proposals.map((p: any) => <li key={p.statementLineId}>Score {Math.round(p.score * 100)} % — {p.reasons.join(', ')}</li>)}</ul>
            </div>
          )}
          <div className="card p-0">
            <table className="table">
              <thead><tr><th>Date</th><th>Libellé du relevé</th><th className="text-right">Montant</th><th>État</th><th></th></tr></thead>
              <tbody>{d.statement.map((s: any) => (
                <tr key={s.id}><td>{date(s.date)}</td><td>{s.label}</td><td className="text-right"><Money v={s.amount} dec={dec} /></td><td>{s.matchedLineId ? 'Rapproché' : 'À traiter'}</td>
                  <td>{!s.matchedLineId && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { const acc = prompt('Compte de contrepartie (ex. 631800 frais bancaires) :', '631800'); if (acc) reg.mutate({ id: s.id, acc }); }}>Régulariser</button>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
