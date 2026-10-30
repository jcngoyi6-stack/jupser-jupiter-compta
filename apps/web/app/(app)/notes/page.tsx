'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FySelect } from '@/components/FySelect';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function Notes() {
  const { company, dec, can } = useSession();
  const qc = useQueryClient();
  const [fy, setFy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ['notes', company?.id, fy], queryFn: () => api<any>(`/companies/${company!.id}/reports/notes${fy ? `?fiscalYearId=${fy}` : ''}`), enabled: !!company });
  const save = useMutation({
    mutationFn: ({ n, validate }: { n: any; validate: boolean }) => api(`/companies/${company!.id}/reports/notes/${n.number}`, { method: 'PUT', body: { fiscalYearId: q.data.fiscalYear.id, title: n.title, text: edits[n.number] ?? n.text, validate } }),
    onSuccess: () => { setMsg({ kind: 'ok', text: 'Note enregistrée.' }); qc.invalidateQueries({ queryKey: ['notes'] }); },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  if (!company) return null;
  const writer = can('CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE');
  return (
    <div className="space-y-4">
      <PageTitle title="Notes annexes" sub="Tableaux chiffrés générés depuis la comptabilité ; textes proposés puis validés (version figée)">
        <FySelect value={fy} onChange={setFy} />
        <button className="btn-ghost" onClick={() => window.print()}>Imprimer</button>
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {q.data?.texts.map((n: any) => (
        <div key={n.number} className="card space-y-2">
          <div className="flex items-center justify-between"><h2>Note {n.number} — {n.title}</h2><Status s={n.status === 'PROPOSITION' ? 'BROUILLON_IA' : n.status} /></div>
          <textarea className="input h-32" disabled={n.status === 'VALIDE' || !writer} value={edits[n.number] ?? n.text} onChange={(e) => setEdits({ ...edits, [n.number]: e.target.value })} />
          {writer && n.status !== 'VALIDE' && (
            <div className="no-print flex gap-2"><button className="btn-ghost" onClick={() => save.mutate({ n, validate: false })}>Enregistrer</button><button className="btn-primary" onClick={() => confirm('Valider et figer cette note ?') && save.mutate({ n, validate: true })}>Valider</button></div>
          )}
        </div>
      ))}
      {q.data?.tables.map((t: any) => (
        <div key={t.number} className="card overflow-x-auto p-0">
          <h2 className="px-4 pt-3">Note {t.number} — {t.title}</h2>
          <table className="table mt-1">
            <thead><tr><th>Rubrique</th>{t.columns.map((c: string) => <th key={c} className="text-right">{c}</th>)}</tr></thead>
            <tbody>{t.rows.map((r: any, i: number) => <tr key={i} className={r.label === 'TOTAL' ? 'total' : ''}><td>{r.label}</td>{r.values.map((v: string, j: number) => <td key={j} className="text-right"><Money v={v} dec={dec} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
