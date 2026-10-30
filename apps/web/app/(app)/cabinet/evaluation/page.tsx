'use client';
import { useState } from 'react';
import { Alert, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';

const n = (s: string) => Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
const fr = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('fr-FR'));
const LEVERS: [string, string][] = [['REDUCTION_COUTS', 'Réduction des charges fixes (taux)'], ['REDUCTION_EFFECTIFS', 'Réduction de la masse salariale (taux)'], ['CESSION_ACTIF', 'Cession d’actif (montant)'], ['AUGMENTATION_CAPITAL', 'Augmentation de capital (montant)'], ['ABANDON_CREANCES', 'Abandon de créances (montant)'], ['REECHELONNEMENT', 'Rééchelonnement de la dette (durée)'], ['CROISSANCE_CA', 'Croissance du chiffre d’affaires (taux)']];

function F({ k, label, obj, set }: { k: string; label: string; obj: any; set: (x: any) => void }) {
  return <label className="text-sm">{label}<input className="input num" value={obj[k]} onChange={(e) => set({ ...obj, [k]: e.target.value })} /></label>;
}

export default function Evaluation() {
  const [tab, setTab] = useState<'valuation' | 'restructuring'>('valuation');
  const [msg, setMsg] = useState<string | null>(null);
  const [v, setV] = useState({ equity: '', nonValues: '0', revaluation: '0', taxRate: '0.3', profit: '', capRate: '0.15', normalReturn: '0.1', gwRate: '0.15', gwYears: '5', fcf: '', wacc: '0.14', growth: '0.03', netDebt: '0', ebitda: '', evMultiple: '5', netIncome: '', per: '8' });
  const [vr, setVr] = useState<any>(null);
  const [b, setB] = useState({ revenue: '', variableCostRate: '0.6', fixedCosts: '', personnel: '', debt: '', interestRate: '0.12', cash: '', annualDebtRepayment: '', taxRate: '0.3', depreciation: '' });
  const [levers, setLevers] = useState<{ kind: string; year: string; value: string; cost: string }[]>([{ kind: 'REDUCTION_COUTS', year: '1', value: '0.1', cost: '0' }]);
  const [rr, setRr] = useState<any>(null);
  const valuate = async () => {
    try {
      setVr(await api('/cabinet/valuation', { method: 'POST', body: {
        ancc: { equity: n(v.equity), intangibleNonValues: n(v.nonValues), adjustments: n(v.revaluation) ? [{ label: 'Plus-values de réévaluation', amount: n(v.revaluation) }] : [], deferredTaxRate: n(v.taxRate) },
        earnings: v.profit ? { normativeProfit: n(v.profit), capitalisationRate: n(v.capRate) } : undefined,
        goodwill: v.profit ? { profit: n(v.profit), normalReturn: n(v.normalReturn), discountRate: n(v.gwRate), years: n(v.gwYears) } : undefined,
        dcf: v.fcf ? { freeCashFlows: v.fcf.split(/[;\s]+/).filter(Boolean).map(n), discountRate: n(v.wacc), terminalGrowth: n(v.growth), netDebt: n(v.netDebt) } : undefined,
        multiples: v.ebitda || v.netIncome ? { metrics: { EBE: n(v.ebitda), RN: n(v.netIncome) }, netDebt: n(v.netDebt), multiples: [...(v.ebitda ? [{ name: 'VE/EBE', metric: 'EBE', multiple: n(v.evMultiple), isEnterpriseValue: true }] : []), ...(v.netIncome ? [{ name: 'PER', metric: 'RN', multiple: n(v.per) }] : [])] } : undefined,
      } }));
      setMsg(null);
    } catch (e) { setMsg(errorText(e)); }
  };
  const restructure = async () => {
    try {
      setRr(await api('/cabinet/restructuring', { method: 'POST', body: { base: Object.fromEntries(Object.entries(b).map(([k, x]) => [k, n(x)])), years: 5, scenarios: [{ name: 'Plan de restructuration', levers: levers.map((l) => ({ kind: l.kind, year: n(l.year), value: l.kind === 'REECHELONNEMENT' ? 0 : n(l.value), newTermYears: l.kind === 'REECHELONNEMENT' ? n(l.value) : undefined, cost: n(l.cost) })) }] } }));
      setMsg(null);
    } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <div className="space-y-4">
      <PageTitle title="Évaluation d’entreprise et restructuration" sub="Méthodes patrimoniales, de rendement, DCF et comparables ; scénarios de redressement sur 5 ans">
        <button className={tab === 'valuation' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('valuation')}>Évaluation</button>
        <button className={tab === 'restructuring' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('restructuring')}>Restructuration</button>
      </PageTitle>
      {msg && <Alert kind="error">{msg}</Alert>}
      <Alert kind="info">Les taux (capitalisation, actualisation, croissance, multiples) relèvent du jugement de l’évaluateur. Résultats = projet à valider.</Alert>
      {tab === 'valuation' ? (
        <>
          <div className="card grid gap-2 md:grid-cols-4">
            <F k="equity" label="Capitaux propres" obj={v} set={setV} /><F k="nonValues" label="Non-valeurs" obj={v} set={setV} /><F k="revaluation" label="Plus-values latentes" obj={v} set={setV} /><F k="taxRate" label="Impôt latent (taux)" obj={v} set={setV} />
            <F k="profit" label="Bénéfice normatif" obj={v} set={setV} /><F k="capRate" label="Taux de capitalisation" obj={v} set={setV} /><F k="normalReturn" label="Rémunération normale ANCC" obj={v} set={setV} /><F k="gwYears" label="Durée de la rente (ans)" obj={v} set={setV} />
            <label className="text-sm md:col-span-2">Flux de trésorerie disponibles (séparés par ;)<input className="input num" value={v.fcf} onChange={(e) => setV({ ...v, fcf: e.target.value })} /></label><F k="wacc" label="CMPC" obj={v} set={setV} /><F k="growth" label="Croissance à l’infini" obj={v} set={setV} />
            <F k="netDebt" label="Dette financière nette" obj={v} set={setV} /><F k="ebitda" label="EBE" obj={v} set={setV} /><F k="evMultiple" label="Multiple VE/EBE" obj={v} set={setV} /><F k="netIncome" label="Résultat net" obj={v} set={setV} />
            <F k="per" label="PER" obj={v} set={setV} />
            <div className="flex items-end"><button className="btn-primary" onClick={valuate}>Évaluer</button></div>
          </div>
          {vr && (
            <div className="card p-0">
              <table className="table"><thead><tr><th>Méthode</th><th className="text-right">Valeur</th><th className="text-right">Pondération</th></tr></thead>
                <tbody>{vr.synthesis.methods.map((m: any) => <tr key={m.name}><td>{m.name}</td><td className="text-right">{fr(m.value)}</td><td className="text-right">{Math.round(m.share * 100)} %</td></tr>)}</tbody>
                <tfoot><tr className="font-semibold"><td>Valeur retenue (moyenne pondérée)</td><td className="text-right">{fr(vr.synthesis.weighted)}</td><td className="text-right">fourchette {fr(vr.synthesis.low)} – {fr(vr.synthesis.high)}</td></tr></tfoot>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card grid gap-2 md:grid-cols-5">
            {([['revenue', 'Chiffre d’affaires'], ['variableCostRate', 'Taux de charges variables'], ['fixedCosts', 'Charges fixes'], ['personnel', 'Charges de personnel'], ['depreciation', 'Dotations'], ['debt', 'Dette financière'], ['interestRate', 'Taux d’intérêt'], ['annualDebtRepayment', 'Remboursement annuel'], ['cash', 'Trésorerie initiale'], ['taxRate', 'Taux d’IS']] as const).map(([k, l]) => <F key={k} k={k} label={l} obj={b} set={setB} />)}
          </div>
          <div className="card space-y-2">
            <h2 className="font-semibold">Leviers</h2>
            {levers.map((l, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-5">
                <select className="input md:col-span-2" value={l.kind} onChange={(e) => setLevers(levers.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>{LEVERS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                <input className="input num" placeholder="Année" value={l.year} onChange={(e) => setLevers(levers.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />
                <input className="input num" placeholder="Valeur" value={l.value} onChange={(e) => setLevers(levers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <input className="input num" placeholder="Coût de mise en œuvre" value={l.cost} onChange={(e) => setLevers(levers.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
              </div>
            ))}
            <div className="flex gap-2"><button className="btn-ghost" onClick={() => setLevers([...levers, { kind: 'CESSION_ACTIF', year: '1', value: '', cost: '0' }])}>+ Levier</button><button className="btn-primary" onClick={restructure}>Simuler</button></div>
          </div>
          {rr && rr.scenarios.map((s: any) => (
            <div key={s.name} className="card p-0">
              <h2 className="p-4 font-semibold">{s.name} — {s.viable ? 'trésorerie positive sur l’horizon' : `trésorerie négative (minimum ${fr(s.minCash)})`}</h2>
              <table className="table text-sm"><thead><tr><th>Année</th><th className="text-right">CA</th><th className="text-right">EBE</th><th className="text-right">Résultat</th><th className="text-right">Dette</th><th className="text-right">Trésorerie</th><th className="text-right">Dette / EBE</th></tr></thead>
                <tbody>{s.rows.map((r: any) => <tr key={r.year} className={r.cash < 0 ? 'bg-red-50' : ''}><td>{r.year}</td><td className="text-right">{fr(r.revenue)}</td><td className="text-right">{fr(r.ebitda)}</td><td className="text-right">{fr(r.netIncome)}</td><td className="text-right">{fr(r.debt)}</td><td className="text-right">{fr(r.cash)}</td><td className="text-right">{r.debtToEbitda === null ? '—' : r.debtToEbitda.toFixed(1)}</td></tr>)}</tbody></table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
