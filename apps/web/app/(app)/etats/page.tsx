'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FySelect } from '@/components/FySelect';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { bp, date } from '@/lib/format';

type Tab = 'bilan' | 'resultat' | 'tft' | 'analyse' | 'controles';

export default function Etats() {
  const { company, dec } = useSession();
  const [fy, setFy] = useState('');
  const [tab, setTab] = useState<Tab>('bilan');
  const q = useQuery({ queryKey: ['statements', company?.id, fy], queryFn: () => api<any>(`/companies/${company!.id}/reports/statements${fy ? `?fiscalYearId=${fy}` : ''}`), enabled: !!company });
  if (!company) return null;
  const d = q.data;
  const M = ({ v }: { v?: string }) => (v === undefined ? <span /> : <Money v={v} dec={dec} />);
  const prev = d?.previous;
  const prevRow = (kind: 'assets' | 'liabilities', ref: string) => prev?.balanceSheet[kind].find((r: any) => r.ref === ref);
  return (
    <div className="space-y-4">
      <PageTitle title="États financiers — système normal" sub={d ? `${d.company.name} · Exercice du ${date(d.fiscalYear.startDate)} au ${date(d.fiscalYear.endDate)} · en ${d.company.currency}` : ''}>
        <FySelect value={fy} onChange={setFy} />
        <button className="btn-ghost" onClick={() => window.print()}>Imprimer</button>
      </PageTitle>
      {d?.blocked && <Alert kind="error">Production des états bloquée : un contrôle bloquant échoue (image fidèle). Voir l’onglet Contrôles.</Alert>}
      <div className="no-print flex flex-wrap gap-2">
        {(['bilan', 'resultat', 'tft', 'analyse', 'controles'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(t)}>
            {{ bilan: 'Bilan', resultat: 'Compte de résultat', tft: 'Tableau des flux de trésorerie', analyse: 'Analyse financière', controles: 'Contrôles' }[t]}
          </button>
        ))}
      </div>
      {d && tab === 'bilan' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-3">Actif</h2>
            <table className="table mt-1">
              <thead><tr><th>Réf</th><th>Actif</th><th className="text-right">Brut</th><th className="text-right">Amort./Dépréc.</th><th className="text-right">Net N</th><th className="text-right">Net N-1</th></tr></thead>
              <tbody>
                {d.current.balanceSheet.assets.map((r: any) => (
                  <tr key={r.ref} className={r.total ? 'total' : ''}>
                    <td className="text-xs">{r.ref}</td><td>{r.label}</td>
                    <td className="text-right"><M v={r.gross} /></td><td className="text-right"><M v={r.depreciation} /></td><td className="text-right"><M v={r.net} /></td>
                    <td className="text-right text-slate-500"><M v={prevRow('assets', r.ref)?.net} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-3">Passif</h2>
            <table className="table mt-1">
              <thead><tr><th>Réf</th><th>Passif</th><th className="text-right">Net N</th><th className="text-right">Net N-1</th></tr></thead>
              <tbody>
                {d.current.balanceSheet.liabilities.map((r: any) => (
                  <tr key={r.ref} className={r.total ? 'total' : ''}>
                    <td className="text-xs">{r.ref}</td><td>{r.label}</td><td className="text-right"><M v={r.value} /></td>
                    <td className="text-right text-slate-500"><M v={prevRow('liabilities', r.ref)?.value} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {d && tab === 'resultat' && (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Réf</th><th>Libellé</th><th className="text-right">Exercice N</th><th className="text-right">Exercice N-1</th></tr></thead>
            <tbody>
              {d.current.incomeStatement.rows.map((r: any) => (
                <tr key={r.ref} className={r.total ? 'total' : ''}>
                  <td className="text-xs">{r.ref}</td><td>{r.label}</td><td className="text-right"><M v={r.value} /></td>
                  <td className="text-right text-slate-500"><M v={prev?.incomeStatement.values[r.ref]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && tab === 'tft' && (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Réf</th><th>Libellé</th><th className="text-right">Exercice N</th><th className="text-right">Exercice N-1</th></tr></thead>
            <tbody>
              {d.current.cashFlow.rows.map((r: any) => (
                <tr key={r.ref} className={r.total ? 'total' : ''}>
                  <td className="text-xs">{r.ref}</td><td>{r.label}</td><td className="text-right"><M v={r.value} /></td>
                  <td className="text-right text-slate-500"><M v={prev?.cashFlow.values[r.ref]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && tab === 'analyse' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-0">
            <h2 className="px-4 pt-3">Soldes significatifs de gestion</h2>
            <table className="table mt-1"><tbody>
              {Object.entries({ margeCommerciale: 'Marge commerciale', chiffreAffaires: 'Chiffre d’affaires', valeurAjoutee: 'Valeur ajoutée', ebe: 'Excédent brut d’exploitation', resultatExploitation: 'Résultat d’exploitation', resultatFinancier: 'Résultat financier', rao: 'Résultat des activités ordinaires', rhao: 'Résultat HAO', resultatNet: 'Résultat net', caf: 'Capacité d’autofinancement' }).map(([k, l]) => (
                <tr key={k}><td>{l}</td><td className="text-right"><M v={d.current.analysis.sig[k]} /></td></tr>
              ))}
            </tbody></table>
          </div>
          <div className="space-y-4">
            <div className="card p-0">
              <h2 className="px-4 pt-3">Équilibre financier</h2>
              <table className="table mt-1"><tbody>
                <tr><td>Fonds de roulement net global (FRNG)</td><td className="text-right"><M v={d.current.analysis.equilibre.frng} /></td></tr>
                <tr><td>Besoin en fonds de roulement (BFR)</td><td className="text-right"><M v={d.current.analysis.equilibre.bfr} /></td></tr>
                <tr><td>Trésorerie nette (FRNG – BFR)</td><td className="text-right"><M v={d.current.analysis.equilibre.tresorerieNette} /></td></tr>
              </tbody></table>
            </div>
            <div className="card p-0">
              <h2 className="px-4 pt-3">Ratios</h2>
              <table className="table mt-1"><tbody>
                {Object.entries({ autonomieFinanciere: 'Autonomie financière (CP / total bilan)', liquiditeGenerale: 'Liquidité générale', rentabiliteCapitauxPropres: 'Rentabilité des capitaux propres', margeNette: 'Marge nette', endettement: 'Endettement (dettes fin. / CP)' }).map(([k, l]) => (
                  <tr key={k}><td>{l}</td><td className="text-right">{bp(d.current.analysis.ratiosBp[k])}</td></tr>
                ))}
              </tbody></table>
            </div>
          </div>
        </div>
      )}
      {d && tab === 'controles' && (
        <div className="space-y-2">
          {d.controls.map((c: any) => (
            <Alert key={c.code} kind={c.ok ? 'ok' : c.blocking ? 'error' : 'warn'}>
              {c.ok ? '✓' : '✗'} {c.label} {c.detail ? `— ${c.detail}` : ''} {c.blocking ? '' : '(alerte)'}
            </Alert>
          ))}
          <p className="text-xs text-slate-500">TODO(expert-comptable, lot L2) : libellés et rattachements à confronter à l’AUDCIF page par page ; notes annexes et états SMT à compléter.</p>
        </div>
      )}
    </div>
  );
}
