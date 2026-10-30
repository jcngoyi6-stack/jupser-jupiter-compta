'use client';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { FySelect } from '@/components/FySelect';
import { useSession } from '@/components/session';
import { Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

type Tab = 'balance' | 'grand-livre' | 'journal';

export default function Livres() {
  const { company, dec } = useSession();
  const [tab, setTab] = useState<Tab>('balance');
  const [fy, setFy] = useState('');
  const [account, setAccount] = useState('');
  const qs = fy ? `fiscalYearId=${fy}` : '';
  const tb = useQuery({ queryKey: ['tb', company?.id, fy], queryFn: () => api<any>(`/companies/${company!.id}/reports/trial-balance?${qs}`), enabled: !!company && tab === 'balance' });
  const gl = useQuery({ queryKey: ['gl', company?.id, fy, account], queryFn: () => api<any>(`/companies/${company!.id}/reports/general-ledger?${qs}&account=${account}`), enabled: !!company && tab === 'grand-livre' });
  const jn = useQuery({ queryKey: ['jn', company?.id, fy], queryFn: () => api<any>(`/companies/${company!.id}/reports/journal?${qs}`), enabled: !!company && tab === 'journal' });
  if (!company) return null;
  const M = ({ v }: { v: string }) => <Money v={v} dec={dec} />;
  return (
    <div className="space-y-4">
      <PageTitle title="Livres obligatoires" sub={`${company.name} — ${company.currency}`}>
        <FySelect value={fy} onChange={setFy} />
        <a className="btn-ghost" href={`/api/companies/${company.id}/reports/exports/entries.csv?${qs}`}>Export des écritures (CSV)</a>
        <a className="btn-ghost" href={`/api/companies/${company.id}/reports/dsf.xlsx?${qs}`}>DSF / liasse (Excel)</a>
        <button className="btn-ghost" onClick={() => window.print()}>Imprimer</button>
      </PageTitle>
      <div className="no-print flex gap-2">
        {(['balance', 'grand-livre', 'journal'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(t)}>
            {{ balance: 'Balance générale', 'grand-livre': 'Grand-livre', journal: 'Livre-journal' }[t]}
          </button>
        ))}
      </div>
      {tab === 'balance' && tb.data && (
        <div className="card overflow-x-auto p-0">
          <h2 className="px-4 pt-4">Balance générale à 6 colonnes — exercice {tb.data.fiscalYear.label}</h2>
          <table className="table mt-2">
            <thead>
              <tr><th>Compte</th><th>Intitulé</th><th className="text-right">Ouv. débit</th><th className="text-right">Ouv. crédit</th><th className="text-right">Mvt débit</th><th className="text-right">Mvt crédit</th><th className="text-right">Solde débit</th><th className="text-right">Solde crédit</th></tr>
            </thead>
            <tbody>
              {tb.data.rows.map((r: any) => (
                <tr key={r.account} className="hover:bg-slate-50">
                  <td className="num"><button className="text-turquoise-700 hover:underline" onClick={() => { setAccount(r.account); setTab('grand-livre'); }}>{r.account}</button></td>
                  <td>{r.label}</td>
                  <td className="text-right"><M v={r.openingDebit} /></td><td className="text-right"><M v={r.openingCredit} /></td>
                  <td className="text-right"><M v={r.movementDebit} /></td><td className="text-right"><M v={r.movementCredit} /></td>
                  <td className="text-right"><M v={r.closingDebit} /></td><td className="text-right"><M v={r.closingCredit} /></td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={2}>Totaux</td>
                {(['openingDebit', 'openingCredit', 'movementDebit', 'movementCredit', 'closingDebit', 'closingCredit'] as const).map((k) => <td key={k} className="text-right"><M v={tb.data.totals[k]} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {tab === 'grand-livre' && (
        <div className="space-y-3">
          <input className="input no-print w-60" placeholder="Filtrer par compte (ex. 411)" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ''))} />
          {gl.data?.accounts.map((a: any) => (
            <div key={a.account} className="card overflow-x-auto p-0">
              <h2 className="px-4 pt-3">Compte {a.account}</h2>
              <table className="table mt-1">
                <thead><tr><th>Date</th><th>Jnl</th><th>N°</th><th>Pièce</th><th>Libellé</th><th>Let.</th><th className="text-right">Débit</th><th className="text-right">Crédit</th><th className="text-right">Solde</th></tr></thead>
                <tbody>
                  {a.lines.map((l: any) => (
                    <tr key={l.id}><td>{date(l.date)}</td><td>{l.journalCode}</td><td className="num text-xs">{l.entryNumber}</td><td>{l.pieceRef}</td><td>{l.label}</td><td>{l.letter}</td>
                      <td className="text-right"><M v={l.debit} /></td><td className="text-right"><M v={l.credit} /></td><td className="text-right"><M v={l.runningBalance} /></td></tr>
                  ))}
                  <tr className="total"><td colSpan={6}>Total</td><td className="text-right"><M v={a.totalDebit} /></td><td className="text-right"><M v={a.totalCredit} /></td><td className="text-right"><M v={a.balance} /></td></tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      {tab === 'journal' && jn.data && (
        <div className="space-y-4">
          <div className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-3">Centralisation mensuelle des journaux</h2>
            <table className="table mt-1">
              <thead><tr><th>Mois</th><th>Journal</th><th className="text-right">Débit</th><th className="text-right">Crédit</th></tr></thead>
              <tbody>{jn.data.centralisation.map((c: any) => <tr key={c.journal + c.month}><td>{c.month}</td><td>{c.journal}</td><td className="text-right"><M v={c.debit} /></td><td className="text-right"><M v={c.credit} /></td></tr>)}</tbody>
            </table>
          </div>
          <div className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-3">Livre-journal</h2>
            <table className="table mt-1">
              <thead><tr><th>N°</th><th>Date</th><th>Compte</th><th>Libellé</th><th className="text-right">Débit</th><th className="text-right">Crédit</th></tr></thead>
              <tbody>
                {jn.data.entries.map((e: any) => (
                  <Fragment key={e.id}>
                    <tr className="bg-slate-50"><td className="num text-xs font-semibold">{e.number}</td><td>{date(e.date)}</td><td colSpan={4} className="font-semibold">{e.label} — pièce {e.pieceRef}</td></tr>
                    {e.lines.map((l: any) => <tr key={l.id}><td></td><td></td><td className="num">{l.account}</td><td>{l.label}</td><td className="text-right"><M v={l.debit} /></td><td className="text-right"><M v={l.credit} /></td></tr>)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
