'use client';
import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { api } from '@/lib/api';
import { date, DECIMALS, money } from '@/lib/format';

/** Page publique de vérification d'un document par son code QR (docs/13). */
export default function Verify({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const q = useQuery({ queryKey: ['verify', hash], queryFn: () => api<any>(`/verify/${hash}`) });
  const d = q.data;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="card w-full max-w-md text-center">
        <img src="/brand/icone_Jupiter_Compta.svg" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-3">Vérification de document</h1>
        {q.isLoading && <p className="mt-4">Vérification…</p>}
        {d && !d.authentic && <p className="mt-4 rounded bg-red-50 p-3 font-semibold text-red-700">Document inconnu : il n’a pas été émis par Jupiter Compta ou a été falsifié.</p>}
        {d?.authentic && (
          <>
            <p className={`mt-4 rounded p-3 font-semibold ${d.cancelled ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {d.cancelled ? 'Document authentique mais ANNULÉ (remplacé par un avoir).' : 'Document authentique.'}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
              <dt className="text-slate-500">Émetteur</dt><dd className="font-semibold">{d.issuer}</dd>
              <dt className="text-slate-500">NIF</dt><dd>{d.issuerTaxId ?? '—'}</dd>
              <dt className="text-slate-500">Document</dt><dd>{d.type} {d.number}</dd>
              <dt className="text-slate-500">Date</dt><dd>{date(d.date)}</dd>
              <dt className="text-slate-500">Montant TTC</dt><dd className="num">{money(d.total, DECIMALS[d.currency] ?? 2)} {d.currency}</dd>
            </dl>
          </>
        )}
        <p className="mt-6 break-all font-mono text-[10px] text-slate-400">SHA-256 : {hash}</p>
        <p className="mt-2 text-xs text-slate-400">Service de vérification Jupiter Compta — JUPSER</p>
      </div>
    </div>
  );
}
