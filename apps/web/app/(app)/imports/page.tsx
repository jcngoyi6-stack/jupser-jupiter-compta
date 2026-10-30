'use client';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { readFileForApi } from '@/lib/file';

export default function Imports() {
  const { company, dec } = useSession();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const err = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });
  const prev = useMutation({
    mutationFn: async (file: File) => api<any>(`/companies/${company!.id}/imports/balance/preview`, { method: 'POST', body: await readFileForApi(file) }),
    onSuccess: (r) => { setPreview(r); setTargets(Object.fromEntries(r.lines.map((l: any) => [l.account, l.suggestion.target ?? '']))); setMsg(r.errors.length ? { kind: 'warn', text: r.errors.join(' · ') } : { kind: 'ok', text: `Balance à ${r.layout} colonnes reconnue : ${r.lines.length} comptes.` }); },
    onError: err,
  });
  const commit = useMutation({
    mutationFn: () => {
      const fy = company!.fiscalYears.find((f) => !f.closed)!;
      const fmt = (v: string) => { const s = BigInt(v).toString().padStart(dec + 1, '0'); return dec ? `${s.slice(0, -dec)}.${s.slice(-dec)}` : s; };
      return api<any>(`/companies/${company!.id}/imports/balance/commit`, { method: 'POST', body: { date: fy.startDate, lines: preview.lines.map((l: any) => ({ source: l.account, target: targets[l.account], debit: fmt(l.debit), credit: fmt(l.credit) })) } });
    },
    onSuccess: (r) => setMsg({ kind: 'ok', text: `À-nouveaux générés et validés : ${r.entry.number}. Correspondances mémorisées pour l’an prochain.` }),
    onError: err,
  });
  const journal = useMutation({
    mutationFn: async (file: File) => api<any>(`/companies/${company!.id}/imports/journal`, { method: 'POST', body: await readFileForApi(file) }),
    onSuccess: (r) => setMsg({ kind: 'ok', text: `${r.drafts} écriture(s) importée(s) en brouillon : validez-les dans Écritures (contrôles appliqués).` }),
    onError: err,
  });
  if (!company) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Imports" sub="Balance d’ouverture, journal d’écritures (Excel ou CSV) — reconnaissance des colonnes et correspondance vers le plan SYSCOHADA" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <h2>Balance d’ouverture (société existante)</h2>
          <p className="text-xs text-slate-500">Balance à 4, 6 ou 8 colonnes : Compte, Intitulé, Débit, Crédit (le solde de clôture est la dernière paire).</p>
          <input type="file" accept=".csv,.txt,.xlsx" onChange={(e) => e.target.files?.[0] && prev.mutate(e.target.files[0])} />
        </div>
        <div className="card space-y-2">
          <h2>Journal d’écritures</h2>
          <p className="text-xs text-slate-500">Colonnes : Journal, Date, Pièce, Compte, Libellé, Débit, Crédit. Les écritures arrivent en brouillon.</p>
          <input type="file" accept=".csv,.txt,.xlsx" onChange={(e) => e.target.files?.[0] && journal.mutate(e.target.files[0])} />
        </div>
      </div>
      {preview && (
        <div className="card p-0">
          <table className="table">
            <thead><tr><th>Compte client</th><th>Intitulé</th><th className="text-right">Débit</th><th className="text-right">Crédit</th><th>Compte SYSCOHADA</th><th>Confiance</th></tr></thead>
            <tbody>
              {preview.lines.map((l: any) => (
                <tr key={l.account}>
                  <td className="num">{l.account}</td><td>{l.label}</td><td className="text-right"><Money v={l.debit} dec={dec} /></td><td className="text-right"><Money v={l.credit} dec={dec} /></td>
                  <td><input className="input num w-28 py-1" value={targets[l.account] ?? ''} onChange={(e) => setTargets({ ...targets, [l.account]: e.target.value })} /></td>
                  <td className="text-xs">{Math.round(l.suggestion.confidence * 100)} % — {l.suggestion.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4"><button className="btn-primary" onClick={() => commit.mutate()}>Générer les à-nouveaux</button></div>
        </div>
      )}
    </div>
  );
}
