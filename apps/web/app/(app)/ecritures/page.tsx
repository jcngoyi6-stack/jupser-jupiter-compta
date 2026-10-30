'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Empty, Money, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, money, today } from "@/lib/format";

export default function Ecritures() {
  const { company, dec, can } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState(() => (typeof window !== 'undefined' && window.location.search.includes('brouillons') ? 'BROUILLON,BROUILLON_IA' : ''));
  const [journal, setJournal] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const q = useQuery({
    queryKey: ['entries', company?.id, status, journal, page],
    queryFn: () => api<any>(`/companies/${company!.id}/entries?page=${page}${status ? `&status=${status}` : ''}${journal ? `&journal=${journal}` : ''}`),
    enabled: !!company,
  });
  const journals = useQuery({ queryKey: ['journals', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/journals`), enabled: !!company });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'validate' | 'reverse' | 'delete' }) =>
      action === 'delete'
        ? api(`/companies/${company!.id}/entries/${id}`, { method: 'DELETE' })
        : api(`/companies/${company!.id}/entries/${id}/${action}`, { method: 'POST', body: action === 'reverse' ? { date: today() } : undefined }),
    onSuccess: (_r, v) => {
      setMsg({ kind: 'ok', text: { validate: 'Écriture validée.', reverse: 'Écriture contre-passée.', delete: 'Brouillon supprimé.' }[v.action] });
      qc.invalidateQueries();
    },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company) return null;
  const writer = can('CHEF_COMPTABLE', 'COMPTABLE', 'CAISSIER', 'EXPERT_EXTERNE', 'PAIE');
  return (
    <div className="space-y-4">
      <PageTitle title="Écritures" sub="Brouillons, écritures validées (immuables) et contre-passations">
        <select className="input w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous statuts</option>
          <option value="BROUILLON,BROUILLON_IA">Brouillons</option>
          <option value="BROUILLON_IA">Proposées par l’IA</option>
          <option value="VALIDE">Validées</option>
          <option value="CONTREPASSE">Contre-passées</option>
        </select>
        <select className="input w-44" value={journal} onChange={(e) => { setJournal(e.target.value); setPage(1); }}>
          <option value="">Tous journaux</option>
          {journals.data?.map((j) => <option key={j.code} value={j.code}>{j.code}</option>)}
        </select>
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {q.data?.items.length === 0 && <Empty>Aucune écriture.</Empty>}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Date</th><th>N°</th><th>Jnl</th><th>Pièce</th><th>Libellé</th><th className="text-right">Montant</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {q.data?.items.map((e: any) => {
              const total = e.lines.reduce((s: bigint, l: any) => s + BigInt(l.debit), 0n);
              return (
                <Fragment key={e.id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    <td>{date(e.date)}</td>
                    <td className="num text-xs">{e.number ?? '—'}</td>
                    <td>{e.journalCode}</td>
                    <td>{e.pieceRef}</td>
                    <td>{e.label}</td>
                    <td className="text-right"><Money v={total} dec={dec} /></td>
                    <td><Status s={e.status} /></td>
                    <td className="whitespace-nowrap text-right" onClick={(ev) => ev.stopPropagation()}>
                      {writer && (e.status === 'BROUILLON' || e.status === 'BROUILLON_IA') && (
                        <>
                          <button className="btn-accent px-2 py-1 text-xs" onClick={() => act.mutate({ id: e.id, action: 'validate' })}>Valider</button>{' '}
                          <button className="btn-danger px-2 py-1 text-xs" onClick={() => confirm('Supprimer ce brouillon ?') && act.mutate({ id: e.id, action: 'delete' })}>Suppr.</button>
                        </>
                      )}
                      {can('CHEF_COMPTABLE', 'COMPTABLE') && e.status === 'VALIDE' && (
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => confirm('Contre-passer cette écriture à la date du jour ?') && act.mutate({ id: e.id, action: 'reverse' })}>Contre-passer</button>
                      )}
                    </td>
                  </tr>
                  {open === e.id && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50">
                        <table className="table">
                          <tbody>
                            {e.lines.map((l: any) => (
                              <tr key={l.id}>
                                <td className="num w-28">{l.account}</td>
                                <td>{l.label ?? ''} {l.currency ? <span className="text-xs text-slate-500">({money(l.foreignAmount, 2)} {l.currency} au cours {l.rate} — {l.rateSource} du {date(l.rateDate)})</span> : null}</td>
                                <td className="w-40 text-right"><Money v={l.debit} dec={dec} /></td>
                                <td className="w-40 text-right"><Money v={l.credit} dec={dec} /></td>
                                <td className="w-12">{l.letter}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {e.hash && <p className="px-3 pb-2 font-mono text-[10px] text-slate-400">Empreinte : {e.hash}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {q.data && q.data.total > q.data.pageSize && (
        <div className="flex items-center gap-3 text-sm">
          <button className="btn-ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</button>
          Page {page} / {Math.ceil(q.data.total / q.data.pageSize)}
          <button className="btn-ghost" disabled={page * q.data.pageSize >= q.data.total} onClick={() => setPage(page + 1)}>Suivant</button>
        </div>
      )}
    </div>
  );
}
