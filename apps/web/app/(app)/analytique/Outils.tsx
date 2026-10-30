'use client';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { n, num, pct, qty } from './fmt';

function F({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return <label className="text-sm">{label}<input className="input num" value={v} onChange={(e) => set(e.target.value)} /></label>;
}
const lines = (s: string) => s.split('\n').map((l) => l.split(';').map((x) => x.trim())).filter((l) => l[0]);

/** Graphique du seuil : marge sur coût variable et charges fixes en fonction du chiffre d'affaires. */
function BreakEvenChart({ revenue, rate, fixed, threshold }: { revenue: number; rate: number; fixed: number; threshold: number | null }) {
  const maxX = Math.max(revenue, threshold ?? 0) * 1.2 || 1;
  const maxY = Math.max(maxX * rate, fixed) * 1.1 || 1;
  const X = (x: number) => 40 + (x / maxX) * 340;
  const Y = (y: number) => 170 - (y / maxY) * 150;
  return (
    <svg viewBox="0 0 400 190" className="w-full max-w-lg" role="img" aria-label="Seuil de rentabilité">
      <line x1="40" y1="170" x2="390" y2="170" stroke="currentColor" strokeOpacity=".3" />
      <line x1="40" y1="10" x2="40" y2="170" stroke="currentColor" strokeOpacity=".3" />
      <line x1={X(0)} y1={Y(fixed)} x2={X(maxX)} y2={Y(fixed)} stroke="#B45309" strokeWidth="2" />
      <line x1={X(0)} y1={Y(0)} x2={X(maxX)} y2={Y(maxX * rate)} stroke="#14A9CB" strokeWidth="2" />
      {threshold !== null && <><line x1={X(threshold)} y1="10" x2={X(threshold)} y2="170" stroke="#0D2747" strokeDasharray="4 3" /><text x={X(threshold) + 4} y="22" fontSize="10" fill="#0D2747">Seuil</text></>}
      <line x1={X(revenue)} y1="10" x2={X(revenue)} y2="170" stroke="#16a34a" strokeDasharray="2 3" />
      <text x="44" y={Y(fixed) - 4} fontSize="10" fill="#B45309">Charges fixes</text>
      <text x={X(maxX) - 120} y={Y(maxX * rate) + 14} fontSize="10" fill="#0e7490">Marge sur coût variable</text>
      <text x={X(revenue) + 3} y="184" fontSize="9" fill="#16a34a">CA réel</text>
    </svg>
  );
}

export default function Outils() {
  const { company } = useSession();
  const dec = ['XOF', 'XAF', 'GNF', 'KMF'].includes(company!.currency) ? 0 : 2;
  const [err, setErr] = useState<string | null>(null);
  const call = (name: string, body: unknown, set: (r: any) => void) => api(`/companies/${company!.id}/analytics/tools/${name}`, { method: 'POST', body }).then((r) => { set(r); setErr(null); }).catch((e) => setErr(errorText(e)));

  const [sr, setSr] = useState({ revenue: '120000000', variableCosts: '90000000', fixedCosts: '20000000', startDate: `${new Date().getFullYear()}-01-01` });
  const [srR, setSrR] = useState<any>(null);
  const [ir, setIr] = useState({ fixedCosts: '9000', variableCostPerUnit: '7', normalActivity: '2000', actualActivity: '400' });
  const [irR, setIrR] = useState<any>(null);
  const [cm, setCm] = useState({ rows: '0;400\n100;1000\n200;1500\n300;2400', price: '8' });
  const [cmR, setCmR] = useState<any>(null);
  const [abc, setAbc] = useState({ activities: 'A1;Réception des matières;40000;RECEPTIONS\nA2;Lancement des lots;60000;LOTS\nA3;Usinage;100000;HEURES\nA4;Contrôle qualité;20000;LOTS', volumes: 'RECEPTIONS;200\nLOTS;40\nHEURES;1000', products: 'X;1000;50000;RECEPTIONS=150,LOTS=10,HEURES=600;200000\nY;100;10000;RECEPTIONS=50,LOTS=30,HEURES=400;' });
  const [abcR, setAbcR] = useState<any>(null);
  const [ec, setEc] = useState({ mq: '2100', mp: '480', msq: '2000', msp: '500', oc: '260000', oa: '1100', osa: '1000', ona: '1200', obf: '120000', obv: '100' });
  const [ecR, setEcR] = useState<any>(null);
  const [pv, setPv] = useState({ series: '100 120 135 160 170 195', horizon: '4' });
  const [pvR, setPvR] = useState<any>(null);
  const [wl, setWl] = useState({ annualDemand: '3600', orderCost: '2000', unitPrice: '100', holdingRate: '0.1', leadTimeDays: '10', safetyStock: '50' });
  const [wlR, setWlR] = useState<any>(null);

  return (
    <div className="space-y-4">
      {err && <Alert kind="error">{err}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-semibold">Seuil de rentabilité (coûts variables)</h2>
          <div className="grid grid-cols-2 gap-2">
            <F label="Chiffre d’affaires" v={sr.revenue} set={(v) => setSr({ ...sr, revenue: v })} />
            <F label="Charges variables" v={sr.variableCosts} set={(v) => setSr({ ...sr, variableCosts: v })} />
            <F label="Charges fixes" v={sr.fixedCosts} set={(v) => setSr({ ...sr, fixedCosts: v })} />
            <label className="text-sm">Début d’exercice<input type="date" className="input" value={sr.startDate} onChange={(e) => setSr({ ...sr, startDate: e.target.value })} /></label>
          </div>
          <button className="btn-primary" onClick={() => call('seuil', { revenue: n(sr.revenue), variableCosts: n(sr.variableCosts), fixedCosts: n(sr.fixedCosts), startDate: sr.startDate }, setSrR)}>Calculer</button>
          {srR && (
            <div className="text-sm">
              <p>Marge sur coût variable {num(srR.margin, dec)} ({pct(srR.marginRate)}) · résultat {num(srR.result, dec)}</p>
              <p>Seuil <b>{num(srR.threshold, dec)}</b> · point mort au {srR.deadPointDays === null ? '—' : `${Math.ceil(srR.deadPointDays)}e jour (${srR.deadPointDate ?? 'hors exercice'})`}</p>
              <p>Marge de sécurité {num(srR.safetyMargin, dec)} · indice {pct(srR.safetyIndex)} · levier opérationnel {num(srR.operatingLeverage, 2)}</p>
              <BreakEvenChart revenue={n(sr.revenue)} rate={srR.marginRate} fixed={n(sr.fixedCosts)} threshold={srR.threshold} />
            </div>
          )}
        </div>

        <div className="card space-y-2">
          <h2 className="font-semibold">Imputation rationnelle des charges fixes</h2>
          <div className="grid grid-cols-2 gap-2">
            <F label="Charges fixes" v={ir.fixedCosts} set={(v) => setIr({ ...ir, fixedCosts: v })} />
            <F label="Coût variable unitaire" v={ir.variableCostPerUnit} set={(v) => setIr({ ...ir, variableCostPerUnit: v })} />
            <F label="Activité normale" v={ir.normalActivity} set={(v) => setIr({ ...ir, normalActivity: v })} />
            <F label="Activité réelle" v={ir.actualActivity} set={(v) => setIr({ ...ir, actualActivity: v })} />
          </div>
          <button className="btn-primary" onClick={() => call('imputation-rationnelle', Object.fromEntries(Object.entries(ir).map(([k, v]) => [k, n(v)])), setIrR)}>Calculer</button>
          {irR && <p className="text-sm">Coefficient {num(irR.coefficient, 3)} · charges fixes imputées {num(irR.imputedFixed, dec)} · coût unitaire {num(irR.unitCost, dec)} · {irR.nature === 'COUT_SOUS_ACTIVITE' ? 'coût de sous-activité' : irR.nature === 'BONI_SURACTIVITE' ? 'boni de suractivité' : 'activité normale'} : <b>{num(Math.abs(irR.difference), dec)}</b></p>}

          <h2 className="pt-3 font-semibold">Coût marginal</h2>
          <label className="block text-sm">Quantité;coût total (une tranche par ligne)<textarea className="input h-24 font-mono" value={cm.rows} onChange={(e) => setCm({ ...cm, rows: e.target.value })} /></label>
          <F label="Prix de vente unitaire" v={cm.price} set={(v) => setCm({ ...cm, price: v })} />
          <button className="btn-primary" onClick={() => call('cout-marginal', { rows: lines(cm.rows).map(([q, c]) => ({ quantity: n(q!), totalCost: n(c ?? '0') })), unitPrice: cm.price ? n(cm.price) : undefined }, setCmR)}>Calculer</button>
          {cmR && <><table className="table text-sm"><thead><tr><th className="text-right">Quantité</th><th className="text-right">Coût total</th><th className="text-right">Coût moyen</th><th className="text-right">Coût marginal</th><th className="text-right">Résultat</th></tr></thead><tbody>{cmR.rows.map((r: any) => <tr key={r.quantity}><td className="text-right">{qty(r.quantity)}</td><td className="text-right">{num(r.totalCost, dec)}</td><td className="text-right">{num(r.average, dec)}</td><td className="text-right">{num(r.marginal, dec)}</td><td className="text-right">{num(r.result, dec)}</td></tr>)}</tbody></table><p className="text-sm">Optimum technique (coût moyen minimal) : {qty(cmR.technicalOptimum)} · optimum économique (résultat maximal) : {qty(cmR.economicOptimum)}</p></>}
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Méthode ABC (coûts à base d’activités)</h2>
        <div className="grid gap-2 lg:grid-cols-3">
          <label className="text-sm">Activités : code;libellé;coût;inducteur<textarea className="input h-32 font-mono text-xs" value={abc.activities} onChange={(e) => setAbc({ ...abc, activities: e.target.value })} /></label>
          <label className="text-sm">Volumes : inducteur;volume<textarea className="input h-32 font-mono text-xs" value={abc.volumes} onChange={(e) => setAbc({ ...abc, volumes: e.target.value })} /></label>
          <label className="text-sm">Produits : code;quantité;coûts directs;INDUCTEUR=volume,…;chiffre d’affaires<textarea className="input h-32 font-mono text-xs" value={abc.products} onChange={(e) => setAbc({ ...abc, products: e.target.value })} /></label>
        </div>
        <button className="btn-primary" onClick={() => call('abc', {
          activities: lines(abc.activities).map(([code, label, cost, driver]) => ({ code: code!, label: label ?? code!, cost: n(cost ?? '0'), driver: driver ?? '' })),
          volumes: lines(abc.volumes).map(([driver, volume]) => ({ driver: driver!, volume: n(volume ?? '0') })),
          products: lines(abc.products).map(([code, quantity, direct, drivers, revenue]) => ({ code: code!, quantity: n(quantity ?? '0'), directCosts: n(direct ?? '0'), drivers: Object.fromEntries((drivers ?? '').split(',').filter((x) => x.includes('=')).map((x) => [x.split('=')[0]!.trim(), n(x.split('=')[1]!)])), revenue: revenue ? n(revenue) : undefined })),
        }, setAbcR)}>Calculer</button>
        {abcR && (
          <div className="grid gap-4 text-sm lg:grid-cols-2">
            <table className="table"><thead><tr><th>Inducteur</th><th>Activités</th><th className="text-right">Coût</th><th className="text-right">Volume</th><th className="text-right">Coût unitaire</th></tr></thead><tbody>{abcR.drivers.map((d: any) => <tr key={d.driver}><td>{d.label}</td><td>{d.activities.join(', ')}</td><td className="text-right">{num(d.cost, dec)}</td><td className="text-right">{qty(d.volume)}</td><td className="text-right">{num(d.unitCost, dec)}</td></tr>)}</tbody></table>
            <table className="table"><thead><tr><th>Produit</th><th className="text-right">Coûts indirects</th><th className="text-right">Coût total</th><th className="text-right">Coût unitaire</th><th className="text-right">Résultat</th></tr></thead><tbody>{abcR.products.map((p: any) => <tr key={p.code}><td>{p.code}</td><td className="text-right">{num(p.indirectTotal, dec)}</td><td className="text-right">{num(p.total, dec)}</td><td className="text-right">{num(p.unitCost, dec)}</td><td className="text-right">{num(p.result, dec)}</td></tr>)}</tbody></table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-semibold">Écarts sur coûts préétablis</h2>
          <p className="text-xs text-slate-500">Les écarts des ordres de fabrication réels sont calculés automatiquement à partir des prix standards du paramétrage (API « écarts sur coûts préétablis »).</p>
          <div className="grid grid-cols-4 gap-2">
            <F label="Matière : qté réelle" v={ec.mq} set={(v) => setEc({ ...ec, mq: v })} /><F label="Prix réel" v={ec.mp} set={(v) => setEc({ ...ec, mp: v })} />
            <F label="Qté préétablie" v={ec.msq} set={(v) => setEc({ ...ec, msq: v })} /><F label="Prix préétabli" v={ec.msp} set={(v) => setEc({ ...ec, msp: v })} />
            <F label="Centre : coût réel" v={ec.oc} set={(v) => setEc({ ...ec, oc: v })} /><F label="Activité réelle" v={ec.oa} set={(v) => setEc({ ...ec, oa: v })} />
            <F label="Activité préétablie" v={ec.osa} set={(v) => setEc({ ...ec, osa: v })} /><F label="Activité normale" v={ec.ona} set={(v) => setEc({ ...ec, ona: v })} />
            <F label="Budget fixe" v={ec.obf} set={(v) => setEc({ ...ec, obf: v })} /><F label="Budget variable / UO" v={ec.obv} set={(v) => setEc({ ...ec, obv: v })} />
          </div>
          <button className="btn-primary" onClick={() => call('ecarts', {
            materials: [{ label: 'Matière', actualQty: n(ec.mq), actualPrice: n(ec.mp), standardQtyForActualOutput: n(ec.msq), standardPrice: n(ec.msp) }],
            overheads: [{ label: 'Centre', actualCost: n(ec.oc), actualActivity: n(ec.oa), standardActivityForActualOutput: n(ec.osa), normalActivity: n(ec.ona), budgetFixed: n(ec.obf), budgetVariablePerUnit: n(ec.obv) }],
          }, setEcR)}>Analyser</button>
          {ecR && (
            <div className="text-sm">
              <p>Matière : écart global {num(ecR.materials[0].total, dec)} = sur quantité {num(ecR.materials[0].onQuantity, dec)} + sur prix {num(ecR.materials[0].onPrice, dec)} ({ecR.materials[0].favourable ? 'favorable' : 'défavorable'})</p>
              <p>Centre : écart global {num(ecR.overheads[0].total, dec)} = sur budget {num(ecR.overheads[0].onBudget, dec)} + sur activité {num(ecR.overheads[0].onActivity, dec)} + sur rendement {num(ecR.overheads[0].onEfficiency, dec)} (coût standard de l’UO {num(ecR.overheads[0].standardRate, dec)})</p>
            </div>
          )}
        </div>

        <div className="card space-y-2">
          <h2 className="font-semibold">Budgets : prévision des ventes et approvisionnements (Wilson)</h2>
          <label className="block text-sm">Ventes passées (séparées par des espaces)<input className="input num" value={pv.series} onChange={(e) => setPv({ ...pv, series: e.target.value })} /></label>
          <div className="flex gap-2"><F label="Horizon" v={pv.horizon} set={(v) => setPv({ ...pv, horizon: v })} /><button className="btn-ghost self-end" onClick={() => call('previsions', { series: pv.series.split(/\s+/).filter(Boolean).map(n), horizon: Math.round(n(pv.horizon)) }, setPvR)}>Prévoir</button></div>
          {pvR?.trend && <p className="text-sm">Tendance y = {num(pvR.trend.a, 2)} x + {num(pvR.trend.b, 2)} (R² {num(pvR.trend.r2, 3)}) → prévisions : {pvR.forecast.map((f: number) => num(f, 0)).join(' · ')}</p>}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <F label="Consommation annuelle" v={wl.annualDemand} set={(v) => setWl({ ...wl, annualDemand: v })} />
            <F label="Coût de passation" v={wl.orderCost} set={(v) => setWl({ ...wl, orderCost: v })} />
            <F label="Prix unitaire" v={wl.unitPrice} set={(v) => setWl({ ...wl, unitPrice: v })} />
            <F label="Taux de possession" v={wl.holdingRate} set={(v) => setWl({ ...wl, holdingRate: v })} />
            <F label="Délai (jours)" v={wl.leadTimeDays} set={(v) => setWl({ ...wl, leadTimeDays: v })} />
            <F label="Stock de sécurité" v={wl.safetyStock} set={(v) => setWl({ ...wl, safetyStock: v })} />
          </div>
          <button className="btn-ghost" onClick={() => call('wilson', Object.fromEntries(Object.entries(wl).map(([k, v]) => [k, n(v)])), setWlR)}>Quantité économique</button>
          {wlR && <p className="text-sm">Quantité économique <b>{qty(Math.round(wlR.economicQuantity))}</b> · {num(wlR.ordersPerYear, 1)} commandes par an (tous les {num(wlR.periodDays, 0)} jours) · coût total {num(wlR.totalCost, dec)} · point de commande {qty(Math.round(wlR.reorderPoint))}</p>}
        </div>
      </div>
    </div>
  );
}
