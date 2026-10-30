'use client';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { readFileForApi } from '@/lib/file';

type Line = { account: string; label: string; debit: string; credit: string; suggestion: { target: string | null; confidence: number; reason: string } };

/** Import de la balance du client (N et N-1), correspondance mémorisée, production des états et analyse — sans écriture. */
export default function BalanceStatements() {
  const { company, dec } = useSession();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [cur, setCur] = useState<Line[]>([]);
  const [prior, setPrior] = useState<Line[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  if (!company) return null;
  const fmt = (v: string) => { const s = BigInt(v).toString().padStart(dec + 1, '0'); return dec ? `${s.slice(0, -dec)}.${s.slice(-dec)}` : s; };
  const load = async (file: File, which: 'N' | 'N1') => {
    try {
      const r = await api<any>(`/companies/${company.id}/imports/balance/preview`, { method: 'POST', body: await readFileForApi(file) });
      if (which === 'N') setCur(r.lines); else setPrior(r.lines);
      setTargets((t) => ({ ...Object.fromEntries(r.lines.map((l: Line) => [l.account, l.suggestion.target ?? ''])), ...t }));
      setMsg(r.errors.length ? { kind: 'warn', text: r.errors.join(' · ') } : { kind: 'ok', text: `Balance ${which === 'N' ? 'N' : 'N-1'} à ${r.layout} colonnes : ${r.lines.length} comptes reconnus.` });
    } catch (e) { setMsg({ kind: 'error', text: errorText(e) }); }
  };
  const map = (ls: Line[]) => ls.map((l) => ({ source: l.account, target: targets[l.account], debit: fmt(l.debit), credit: fmt(l.credit) }));
  const produce = async () => {
    try {
      setResult(await api('/cabinet/balance-statements', { method: 'POST', body: { companyId: company.id, lines: map(cur), prior: prior.length ? map(prior) : undefined } }));
      setMsg({ kind: 'ok', text: 'États produits ; correspondances mémorisées pour ce client.' });
    } catch (e) { setMsg({ kind: 'error', text: errorText(e) }); }
  };
  const accounts = [...new Map([...cur, ...prior].map((l) => [l.account, l])).values()];
  return (
    <div className="space-y-4">
      <PageTitle title="États financiers depuis une balance" sub={`${company.name} — balance Excel/CSV à 4, 6 ou 8 colonnes, correspondance vers le plan SYSCOHADA, contrôles et comparaison N/N-1`} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="card text-sm">Balance de l’exercice N<input type="file" accept=".csv,.xlsx,.txt" className="mt-2 block" onChange={(e) => e.target.files?.[0] && load(e.target.files[0], 'N')} /></label>
        <label className="card text-sm">Balance N-1 (facultatif)<input type="file" accept=".csv,.xlsx,.txt" className="mt-2 block" onChange={(e) => e.target.files?.[0] && load(e.target.files[0], 'N1')} /></label>
      </div>
      {accounts.length > 0 && (
        <div className="card p-0">
          <table className="table text-sm">
            <thead><tr><th>Compte client</th><th>Libellé</th><th>Compte SYSCOHADA</th><th>Proposition</th></tr></thead>
            <tbody>{accounts.map((l) => (
              <tr key={l.account} className={!/^\d{6}$/.test(targets[l.account] ?? '') ? 'bg-amber-50' : ''}>
                <td className="num">{l.account}</td><td>{l.label}</td>
                <td><input className="input num w-28 py-1" value={targets[l.account] ?? ''} onChange={(e) => setTargets({ ...targets, [l.account]: e.target.value })} /></td>
                <td className="text-xs">{Math.round(l.suggestion.confidence * 100)} % — {l.suggestion.reason}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="p-4"><button className="btn-primary" disabled={!cur.length || accounts.some((l) => !/^\d{6}$/.test(targets[l.account] ?? ''))} onClick={produce}>Produire les états</button></div>
        </div>
      )}
      {result && (
        <>
          <Alert kind={result.controls.balanced && !result.controls.unknownAccounts.length ? 'ok' : 'warn'}>
            {result.controls.balanced ? 'Balance équilibrée.' : `Balance déséquilibrée : écart ${result.controls.difference}.`}
            {result.controls.unknownAccounts.length > 0 && ` Comptes absents du plan : ${result.controls.unknownAccounts.join(', ')}.`}
            {result.controls.abnormalBalances.length > 0 && ` ${result.controls.abnormalBalances.length} solde(s) de sens anormal.`}
          </Alert>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-0"><h2 className="p-4 font-semibold">Compte de résultat</h2>
              <table className="table text-sm"><tbody>{result.incomeStatement.rows.map((r: any) => <tr key={r.ref}><td>{r.ref}</td><td>{r.label}</td><td className="text-right"><Money v={r.value} dec={dec} /></td><td className="text-right text-slate-500">{result.prior && <Money v={result.prior.incomeStatement.values[r.ref]} dec={dec} />}</td></tr>)}</tbody></table>
            </div>
            <div className="card p-0"><h2 className="p-4 font-semibold">Bilan</h2>
              <table className="table text-sm"><tbody>
                {result.balanceSheet.assets.map((r: any) => <tr key={`a${r.ref}`}><td>{r.ref}</td><td>{r.label}</td><td className="text-right"><Money v={r.net} dec={dec} /></td></tr>)}
                {result.balanceSheet.liabilities.map((r: any) => <tr key={`p${r.ref}`}><td>{r.ref}</td><td>{r.label}</td><td className="text-right"><Money v={r.value} dec={dec} /></td></tr>)}
              </tbody></table>
            </div>
          </div>
          {result.variations.length > 0 && (
            <div className="card p-0"><h2 className="p-4 font-semibold">Variations significatives N/N-1 (à commenter)</h2>
              <table className="table text-sm"><tbody>{result.variations.map((v: any) => <tr key={v.account}><td>{v.account}</td><td>{v.label}</td><td className="text-right">{Math.round(v.change).toLocaleString('fr-FR')}</td><td className="text-right">{v.pct === null ? 'nouveau' : `${Math.round(v.pct * 100)} %`}</td></tr>)}</tbody></table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
