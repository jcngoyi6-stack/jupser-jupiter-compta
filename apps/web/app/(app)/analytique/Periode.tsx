'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Empty, Kpi, Status } from '@/components/ui';
import { api, apiDownload, errorText } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { n, num, pct, qty } from './fmt';

const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const endOfMonth = () => { const d = new Date(); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`; };
const VIEWS = [['synthese', 'Synthèse'], ['incorporation', 'Charges incorporables'], ['repartition', 'Tableau de répartition'], ['couts', 'Coûts'], ['concordance', 'Concordance'], ['journal', 'Journal classe 9']] as const;

export default function Periode() {
  const { company, can } = useSession();
  const write = can('CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE');
  const { run, msg, setMsg } = useAction();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(endOfMonth());
  const [dataset, setDataset] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('synthese');
  const [label, setLabel] = useState('');
  const periods = useQuery({ queryKey: ['cage-periods', company!.id], queryFn: () => api<any[]>(`/companies/${company!.id}/analytics/periods`) });
  const dec = ['XOF', 'XAF', 'GNF', 'KMF'].includes(company!.currency) ? 0 : 2;
  const fail = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });

  const collect = () => api<any>(`/companies/${company!.id}/analytics/collect?from=${from}&to=${to}`).then((d) => { setDataset(d); setRes(null); setLabel(`Période du ${from} au ${to}`); setMsg(null); }).catch(fail);
  const compute = () => api<any>(`/companies/${company!.id}/analytics/compute`, { method: 'POST', body: { dataset } }).then((r) => { setRes(r.results); setView('synthese'); setMsg(null); }).catch(fail);
  const open = (id: string) => api<any>(`/companies/${company!.id}/analytics/periods/${id}`).then((p) => { setDataset(p.input.dataset); setRes(p.results); setLabel(p.label); setView('synthese'); }).catch(fail);
  const setUnits = (code: string, v: string) => setDataset({ ...dataset, units: { ...dataset.units, [code]: n(v) } });

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card flex flex-wrap items-end gap-3">
        <label className="text-sm">Du<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Au<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn-primary" onClick={collect}>Collecter les données de la période</button>
        <p className="text-xs text-slate-500">Grand-livre (avec codes analytiques), stocks, ordres de fabrication, factures, budgets par centre et capitaux propres sont repris automatiquement.</p>
      </div>

      {dataset && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Données collectées — à vérifier avant calcul</h2>
          {dataset.warnings.map((w: string) => <Alert key={w} kind="warn">{w}</Alert>)}
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="Charges de la période" value={num(dataset.charges.reduce((s: number, c: any) => s + c.amount, 0), dec)} hint={`${dataset.charges.length} comptes`} />
            <Kpi label="Produits de la période" value={num(dataset.generalProducts, dec)} />
            <Kpi label="Résultat comptable" value={num(dataset.generalResult, dec)} />
            <Kpi label="Articles suivis" value={`${dataset.materials.length} matières · ${dataset.products.length} produits`} />
          </div>
          <div>
            <h3 className="text-sm font-medium">Unités d’œuvre des centres principaux (modifiables)</h3>
            <div className="mt-1 flex flex-wrap gap-3">
              {Object.entries(dataset.units).map(([c, v]) => (
                <label key={c} className="text-sm">{c}<input className="input num w-32" defaultValue={String(v)} onBlur={(e) => setUnits(c, e.target.value)} /></label>
              ))}
            </div>
          </div>
          <details className="text-sm"><summary className="cursor-pointer">Produits et matières (quantités et prix)</summary>
            <table className="table mt-2"><thead><tr><th>Article</th><th className="text-right">Stock initial</th><th className="text-right">Achetés / produits</th><th className="text-right">Vendus</th><th className="text-right">Prix de vente moyen</th></tr></thead>
              <tbody>
                {dataset.materials.map((m: any) => <tr key={m.code}><td>{m.code} — {m.label}</td><td className="text-right">{qty(m.opening.quantity)}</td><td className="text-right">{qty(m.purchases.quantity)}</td><td className="text-right">—</td><td className="text-right">—</td></tr>)}
                {dataset.products.map((p: any) => <tr key={p.code}><td>{p.code} — {p.label}</td><td className="text-right">{qty(p.opening.quantity)}</td><td className="text-right">{qty(p.produced)}</td><td className="text-right">{qty(p.sold)}</td><td className="text-right">{num(p.salePrice, dec)}</td></tr>)}
              </tbody></table>
          </details>
          <button className="btn-primary" onClick={compute}>Calculer les coûts et les résultats</button>
        </div>
      )}

      {res && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">{VIEWS.map(([k, l]) => <button key={k} className={view === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setView(k)}>{l}</button>)}</div>
          {res.warnings.length > 0 && <Alert kind="warn"><ul className="list-disc pl-5">{res.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul></Alert>}

          {view === 'synthese' && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Kpi label="Chiffre d’affaires analysé" value={num(res.summary.revenue, dec)} />
                <Kpi label="Résultat analytique" value={num(res.summary.analyticResult, dec)} />
                <Kpi label="Résultat comptable" value={num(res.summary.generalResult, dec)} />
                <Kpi label="Concordance" value={res.concordance.reconciled ? 'Vérifiée' : 'Écart'} hint={res.concordance.reconciled ? 'Résultats rapprochés' : `Écart ${num(res.concordance.gap, dec)}`} />
              </div>
              <div className="card p-0">
                <table className="table">
                  <thead><tr><th>Produit</th><th className="text-right">Quantité vendue</th><th className="text-right">Chiffre d’affaires</th><th className="text-right">Coût de revient</th><th className="text-right">Coût unitaire</th><th className="text-right">Résultat</th><th className="text-right">Marge</th></tr></thead>
                  <tbody>{res.summary.products.map((p: any) => (
                    <tr key={p.code} className={p.result < 0 ? 'bg-red-50' : ''}><td>{p.code} — {p.label}</td><td className="text-right">{qty(p.sold)}</td><td className="text-right">{num(p.revenue, dec)}</td><td className="text-right">{num(p.fullCost, dec)}</td><td className="text-right">{num(p.unitCost, dec)}</td><td className="text-right font-semibold">{num(p.result, dec)}</td><td className="text-right">{pct(p.margin)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              {write && (
                <div className="card flex flex-wrap items-end gap-2">
                  <label className="text-sm">Libellé de la période<input className="input w-72" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
                  <button className="btn-primary" disabled={label.length < 2} onClick={() => run({ path: `/companies/${company!.id}/analytics/periods`, body: { label, dataset }, ok: 'Période enregistrée en brouillon : elle doit être validée par une autre personne.' })}>Enregistrer la période</button>
                </div>
              )}
            </>
          )}

          {view === 'incorporation' && (
            <div className="card p-0">
              <table className="table text-sm"><tbody>
                <tr className="font-semibold"><td>Charges de la comptabilité générale</td><td className="text-right">{num(res.incorporation.generalCharges, dec)}</td></tr>
                {res.incorporation.nonIncorporable.map((x: any, i: number) => <tr key={i}><td>− {x.account} {x.label ?? ''} <span className="text-xs text-slate-500">({x.reason})</span></td><td className="text-right">{num(-x.amount, dec)}</td></tr>)}
                {res.incorporation.supplementary.map((x: any) => <tr key={x.label}><td>+ {x.label} (charge supplétive)</td><td className="text-right">{num(x.amount, dec)}</td></tr>)}
                {res.incorporation.calculated.map((x: any) => <tr key={x.label}><td>± {x.label} (économique {num(x.economic, dec)} − comptable {num(x.accounting, dec)})</td><td className="text-right">{num(x.difference, dec)}</td></tr>)}
                <tr className="font-semibold"><td>Charges incorporables aux coûts</td><td className="text-right">{num(res.incorporation.incorporable, dec)}</td></tr>
              </tbody></table>
            </div>
          )}

          {view === 'repartition' && (
            <div className="card overflow-x-auto p-0">
              <table className="table text-sm">
                <thead><tr><th>Centre</th><th>Nature</th><th className="text-right">Répartition primaire</th><th className="text-right">Après répartition secondaire</th><th>Unité d’œuvre</th><th className="text-right">Nombre</th><th className="text-right">Coût de l’UO</th><th className="text-right">Budget de la période</th><th className="text-right">Écart / budget</th></tr></thead>
                <tbody>{res.centres.map((c: any) => {
                  const u = res.distribution.unitCosts.find((x: any) => x.centre === c.code);
                  return <tr key={c.code}><td>{c.code} — {c.label}</td><td>{c.kind === 'PRINCIPAL' ? 'Principal' : 'Auxiliaire'}</td><td className="text-right">{num(c.primary, dec)}</td><td className="text-right">{num(c.afterSecondary, dec)}</td><td>{u?.unit ?? ''}</td><td className="text-right">{u ? qty(u.quantity) : ''}</td><td className="text-right font-semibold">{u ? num(u.unitCost, dec) : ''}</td><td className="text-right">{num(c.budget, dec)}</td><td className={`text-right ${c.budgetGap > 0 ? 'text-red-700' : ''}`}>{num(c.budgetGap, dec)}</td></tr>;
                })}</tbody>
              </table>
              {res.distribution.secondary.rows.length > 0 && <p className="p-3 text-xs text-slate-500">Prestations réciproques résolues par système d’équations : {Object.entries(res.distribution.secondary.auxiliaryTotals).map(([k, v]) => `${k} = ${num(v as number, dec)}`).join(' ; ')}.</p>}
              {res.distribution.rational.length > 0 && <p className="p-3 text-xs">Imputation rationnelle : {res.distribution.rational.map((r: any) => `${r.centre} coefficient ${num(r.coefficient, 3)}, ${r.nature === 'COUT_SOUS_ACTIVITE' ? 'coût de sous-activité' : r.nature === 'BONI_SURACTIVITE' ? 'boni de suractivité' : 'activité normale'} ${num(Math.abs(r.difference), dec)}`).join(' ; ')}.</p>}
            </div>
          )}

          {view === 'couts' && (
            <div className="space-y-3">
              {res.costs.materials.map((m: any) => (
                <div key={m.code} className="card text-sm"><h3 className="font-semibold">Matière {m.code} — {m.label}</h3>
                  <p>Coût d’achat : prix {num(m.purchaseCost.price, dec)}{m.purchaseCost.centres.map((c: any) => ` + ${c.centre} ${qty(c.quantity)} × ${num(c.unitCost, dec)}`).join('')} = <b>{num(m.purchaseCost.total, dec)}</b> (coût unitaire {num(m.purchaseCost.unitCost, dec)})</p>
                  <p>Stock : initial {qty(m.inventory.opening.quantity)} pour {num(m.inventory.opening.value, dec)} · sorties {qty(m.inventory.outputs.quantity)} au coût de {num(m.inventory.outputs.unitCost, dec)} · final {qty(m.inventory.closing.quantity)} pour {num(m.inventory.closing.value, dec)}</p>
                </div>
              ))}
              {res.costs.products.map((p: any) => (
                <div key={p.code} className="card text-sm"><h3 className="font-semibold">Produit {p.code} — {p.label}</h3>
                  <table className="table"><tbody>
                    {p.productionCost.materials.map((x: any) => <tr key={x.material}><td>Matière {x.material} : {qty(x.quantity)} × {num(x.unitCost, dec)}</td><td className="text-right">{num(x.amount, dec)}</td></tr>)}
                    {p.productionCost.direct.map((x: any) => <tr key={x.label}><td>{x.label}</td><td className="text-right">{num(x.amount, dec)}</td></tr>)}
                    {p.productionCost.centres.map((x: any) => <tr key={x.centre}><td>Centre {x.centre} : {qty(x.quantity)} UO × {num(x.unitCost, dec)}</td><td className="text-right">{num(x.amount, dec)}</td></tr>)}
                    {(p.productionCost.wipOpening > 0 || p.productionCost.wipClosing > 0) && <tr><td>En-cours initial − en-cours final</td><td className="text-right">{num(p.productionCost.wipOpening - p.productionCost.wipClosing, dec)}</td></tr>}
                    <tr className="font-semibold"><td>Coût de production de {qty(p.productionCost.quantity)} unités (unitaire {num(p.productionCost.unitCost, dec)})</td><td className="text-right">{num(p.productionCost.total, dec)}</td></tr>
                    <tr><td>Coût de production des {qty(p.fullCost.quantity)} unités vendues</td><td className="text-right">{num(p.fullCost.costOfSales, dec)}</td></tr>
                    <tr><td>Coût de distribution</td><td className="text-right">{num(p.fullCost.distribution.total, dec)}</td></tr>
                    <tr className="font-semibold"><td>Coût de revient</td><td className="text-right">{num(p.fullCost.total, dec)}</td></tr>
                    <tr><td>Chiffre d’affaires</td><td className="text-right">{num(p.revenue, dec)}</td></tr>
                    <tr className="font-semibold"><td>Résultat analytique</td><td className="text-right">{num(p.result, dec)}</td></tr>
                  </tbody></table>
                </div>
              ))}
            </div>
          )}

          {view === 'concordance' && (
            <div className="card p-0">
              <table className="table text-sm"><tbody>
                {res.concordance.items.filter((i: any) => i.amount !== 0 || i.label === 'Résultat analytique').map((i: any) => <tr key={i.label}><td>{i.label}</td><td className="text-xs text-slate-500">{i.account97 ?? ''}</td><td className="text-right">{num(i.amount, dec)}</td></tr>)}
                <tr className="font-semibold"><td>Résultat reconstitué</td><td /><td className="text-right">{num(res.concordance.computedGeneralResult, dec)}</td></tr>
                <tr className="font-semibold"><td>Résultat de la comptabilité générale</td><td /><td className="text-right">{num(res.concordance.generalLedgerResult, dec)}</td></tr>
              </tbody></table>
            </div>
          )}

          {view === 'journal' && (
            <div className="card overflow-x-auto p-0">
              <p className="p-3 text-xs text-slate-500">Plan analytique à 6 chiffres (comptes 92 à 99) validé par JUPSER le 30/10/2026 ; chaque entité peut créer des sous-comptes.</p>
              <table className="table text-sm">
                <thead><tr><th>Pièce</th><th>Compte</th><th>Libellé</th><th>Axe</th><th className="text-right">Débit</th><th className="text-right">Crédit</th></tr></thead>
                <tbody>{res.journal.entries.flatMap((e: any) => [
                  <tr key={e.ref} className="bg-slate-50"><td colSpan={6} className="font-semibold">{e.ref} — {e.label}</td></tr>,
                  ...e.lines.map((l: any, i: number) => <tr key={`${e.ref}-${i}`}><td /><td className="font-mono">{l.account}</td><td>{l.label}</td><td>{l.analytic ?? ''}</td><td className="text-right">{l.debit ? num(l.debit, dec) : ''}</td><td className="text-right">{l.credit ? num(l.credit, dec) : ''}</td></tr>),
                ])}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card p-0">
        <h2 className="p-4 font-semibold">Périodes analytiques</h2>
        {(periods.data ?? []).length === 0 ? <Empty>Aucune période enregistrée.</Empty> : (
          <table className="table text-sm">
            <thead><tr><th>Période</th><th>Dates</th><th>Statut</th><th className="text-right">Résultat analytique</th><th /></tr></thead>
            <tbody>{periods.data!.map((p) => (
              <tr key={p.id}><td>{p.label}</td><td>{p.fromDate} → {p.toDate}</td><td><Status s={p.status} /></td><td className="text-right">{num(p.summary?.analyticResult, dec)}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button className="text-turquoise underline" onClick={() => open(p.id)}>Ouvrir</button>
                  <button className="text-turquoise underline" onClick={() => apiDownload(`/companies/${company!.id}/analytics/periods/${p.id}/report.xlsx`, `analytique-${p.toDate}.xlsx`).catch(fail)}>Excel</button>
                  {p.status === 'BROUILLON' && can('CHEF_COMPTABLE', 'EXPERT_EXTERNE') && <button className="text-turquoise underline" onClick={() => run({ path: `/companies/${company!.id}/analytics/periods/${p.id}/validate`, ok: 'Période validée : ses coûts d’unité d’œuvre servent désormais aux ordres de fabrication.' })}>Valider</button>}
                  {p.status === 'BROUILLON' && write && <button className="text-red-700 underline" onClick={() => run({ path: `/companies/${company!.id}/analytics/periods/${p.id}`, method: 'DELETE', ok: 'Brouillon supprimé.' })}>Supprimer</button>}
                </td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
