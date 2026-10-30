'use client';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/session';
import { Empty } from '@/components/ui';
import { api } from '@/lib/api';
import { num, pct } from './fmt';

/** Évolution du résultat analytique et des marges par produit sur les périodes validées. */
export default function Dashboard() {
  const { company } = useSession();
  const q = useQuery({ queryKey: ['cage-dashboard', company!.id], queryFn: () => api<any[]>(`/companies/${company!.id}/analytics/dashboard`) });
  const dec = ['XOF', 'XAF', 'GNF', 'KMF'].includes(company!.currency) ? 0 : 2;
  const rows = q.data ?? [];
  if (!rows.length) return <div className="card"><Empty>Aucune période validée : calculez puis faites valider une période pour suivre son évolution.</Empty></div>;
  const products = [...new Set(rows.flatMap((r) => r.summary.products.map((p: any) => p.code)))] as string[];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.summary.analyticResult)));
  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-semibold">Résultat analytique par période</h2>
        <div className="mt-3 flex h-40 items-end gap-3" role="img" aria-label="Résultat analytique par période">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs">{num(r.summary.analyticResult, dec)}</span>
              <div className={`w-full rounded-t ${r.summary.analyticResult < 0 ? 'bg-red-400' : 'bg-turquoise'}`} style={{ height: `${(Math.abs(r.summary.analyticResult) / max) * 100}%` }} />
              <span className="text-xs text-slate-500">{r.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table text-sm">
          <thead><tr><th>Produit</th>{rows.map((r) => <th key={r.id} className="text-right">{r.label}</th>)}</tr></thead>
          <tbody>{products.map((code) => (
            <tr key={code}><td>{code}</td>{rows.map((r) => {
              const p = r.summary.products.find((x: any) => x.code === code);
              return <td key={r.id} className={`text-right ${p && p.result < 0 ? 'text-red-700' : ''}`}>{p ? `${num(p.result, dec)} (${pct(p.margin)})` : '—'}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
