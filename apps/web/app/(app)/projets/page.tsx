'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Empty, Kpi, PageTitle } from '@/components/ui';
import { api, apiDownload, errorText } from '@/lib/api';
import { useAction } from '@/lib/hooks';

const n = (s: string | number) => Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
const list = (s: string) => s.split(/[;\s]+/).filter(Boolean).map(n);
const fr = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('fr-FR'));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(2)} %`);
const yrs = (v: number | null | undefined) => (v === null || v === undefined ? 'non récupéré' : `${v.toFixed(2)} ans`);

const BLANK = {
  name: '', promoter: '', sector: '', location: '', country: 'CD', currency: 'CDF', years: '5', discountRate: '0.12', taxRate: '', taxHolidayYears: '0',
  investments: [{ label: 'Équipements', year: '0', amount: '', lifeYears: '5' }],
  products: [{ name: 'Produit', volumes: '', price: '', unitVariableCost: '', priceGrowth: '0' }],
  fixedCosts: '', personnelCosts: '', receivableDays: '30', inventoryDays: '30', payableDays: '30',
  loans: [] as { amount: string; rate: string; years: string; deferral: string }[], subsidy: '0', jobs: '0',
};
type Form = typeof BLANK;

function toInput(f: Form) {
  return {
    name: f.name, promoter: f.promoter || undefined, sector: f.sector || undefined, location: f.location || undefined, country: f.country || undefined, currency: f.currency,
    years: n(f.years), discountRate: n(f.discountRate), taxRate: n(f.taxRate), taxHolidayYears: n(f.taxHolidayYears),
    investments: f.investments.filter((i) => i.amount).map((i) => ({ label: i.label, year: n(i.year), amount: n(i.amount), lifeYears: n(i.lifeYears) })),
    products: f.products.filter((p) => p.volumes).map((p) => ({ name: p.name, volumes: list(p.volumes), price: n(p.price), unitVariableCost: n(p.unitVariableCost), priceGrowth: n(p.priceGrowth) })),
    fixedCosts: list(f.fixedCosts), personnelCosts: list(f.personnelCosts),
    workingCapital: { receivableDays: n(f.receivableDays), inventoryDays: n(f.inventoryDays), payableDays: n(f.payableDays) },
    loans: f.loans.filter((l) => l.amount).map((l) => ({ amount: n(l.amount), rate: n(l.rate), years: n(l.years), deferral: n(l.deferral) })),
    subsidy: n(f.subsidy), jobs: n(f.jobs),
  };
}

function fromInput(i: any): Form {
  const s = (a: number[] | undefined) => (a ?? []).join(' ; ');
  return {
    ...BLANK, name: i.name ?? '', promoter: i.promoter ?? '', sector: i.sector ?? '', location: i.location ?? '', country: i.country ?? '', currency: i.currency,
    years: String(i.years), discountRate: String(i.discountRate), taxRate: String(i.taxRate), taxHolidayYears: String(i.taxHolidayYears ?? 0),
    investments: i.investments.map((x: any) => ({ label: x.label, year: String(x.year), amount: String(x.amount), lifeYears: String(x.lifeYears) })),
    products: i.products.map((p: any) => ({ name: p.name, volumes: s(p.volumes), price: String(p.price), unitVariableCost: String(p.unitVariableCost), priceGrowth: String(p.priceGrowth ?? 0) })),
    fixedCosts: s(i.fixedCosts), personnelCosts: s(i.personnelCosts),
    receivableDays: String(i.workingCapital?.receivableDays ?? 0), inventoryDays: String(i.workingCapital?.inventoryDays ?? 0), payableDays: String(i.workingCapital?.payableDays ?? 0),
    loans: (i.loans ?? []).map((l: any) => ({ amount: String(l.amount), rate: String(l.rate), years: String(l.years), deferral: String(l.deferral ?? 0) })), subsidy: String(i.subsidy ?? 0), jobs: String(i.jobs ?? 0),
  };
}

function Field({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return <label className={`text-sm ${wide ? 'md:col-span-2' : ''}`}>{label}<input className="input" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Criteria({ title, c }: { title: string; c: any }) {
  return (
    <div className="card space-y-1 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <p>VAN : <b>{fr(c.npv)}</b></p><p>TRI : <b>{pct(c.irr)}</b> — TRI modifié : {pct(c.mirr)}</p>
      <p>Délai de récupération : {yrs(c.payback)} — actualisé : {yrs(c.discountedPayback)}</p>
      <p>Indice de profitabilité : {c.profitabilityIndex === null ? '—' : c.profitabilityIndex.toFixed(3)} — annuité équivalente : {fr(c.equivalentAnnuity)}</p>
    </div>
  );
}

export default function Projects() {
  const { me } = useSession();
  const { run, runAsync, msg, setMsg } = useAction();
  const [f, setF] = useState<Form>(BLANK);
  const [id, setId] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [mc, setMc] = useState({ iterations: '2000', priceMin: '0.85', priceMax: '1.1', volumeSd: '0.1' });
  const [cmp, setCmp] = useState<string[]>([]);
  const [cmpRes, setCmpRes] = useState<any[] | null>(null);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<any[]>('/projects') });
  const set = (k: keyof Form, v: any) => setF({ ...f, [k]: v });
  const fail = (e: unknown) => setMsg({ kind: 'error', text: errorText(e) });

  const compute = () => api('/projects/compute', { method: 'POST', body: toInput(f) }).then(setRes).catch(fail);
  const save = async () => {
    const r: any = await runAsync({ path: id ? `/projects/${id}` : '/projects', method: id ? 'PUT' : 'POST', body: { name: f.name, input: toInput(f) }, ok: 'Projet enregistré.' }).catch(() => null);
    if (r?.r?.id) setId(r.r.id);
  };
  const open = async (pid: string) => {
    const p = await api<any>(`/projects/${pid}`);
    setId(pid); setF(fromInput({ ...p.input, name: p.name })); setRes({ result: p.result, taxCheck: p.taxCheck }); setRisk(null);
  };
  const analyse = () => api(`/projects/${id}/risk`, { method: 'POST', body: {
    scenarios: [{ name: 'Pessimiste', probability: 0.25, multipliers: { price: 0.9, volume: 0.85, variableCost: 1.1 } }, { name: 'Réaliste', probability: 0.5, multipliers: {} }, { name: 'Optimiste', probability: 0.25, multipliers: { price: 1.05, volume: 1.1 } }],
    monteCarlo: { iterations: n(mc.iterations), seed: 42, distributions: { price: { type: 'triangular', min: n(mc.priceMin), mode: 1, max: n(mc.priceMax) }, volume: { type: 'normal', mean: 1, sd: n(mc.volumeSd) } } },
  } }).then(setRisk).catch(fail);

  const r = res?.result;
  const maxBin = risk?.monteCarlo ? Math.max(...risk.monteCarlo.histogram.map((b: any) => b.count)) : 1;
  return (
    <div className="space-y-4">
      <PageTitle title="Évaluation des projets d’investissement" sub="Flux prévisionnels, VAN, TRI, délais, indice de profitabilité, sensibilité, scénarios et Monte-Carlo">
        <button className="btn-ghost" onClick={() => { setF(BLANK); setId(null); setRes(null); setRisk(null); }}>Nouveau projet</button>
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="card p-0">
        {(projects.data ?? []).length === 0 ? <Empty>Aucun projet enregistré.</Empty> : (
          <table className="table text-sm"><thead><tr><th /><th>Projet</th><th className="text-right">VAN économique</th><th className="text-right">TRI</th><th /></tr></thead>
            <tbody>{projects.data!.map((p: any) => (
              <tr key={p.id}><td><input type="checkbox" checked={cmp.includes(p.id)} onChange={(e) => setCmp(e.target.checked ? [...cmp, p.id] : cmp.filter((x) => x !== p.id))} /></td>
                <td>{p.name}</td><td className="text-right">{fr(p.results?.economic?.npv)}</td><td className="text-right">{pct(p.results?.economic?.irr)}</td>
                <td className="space-x-2"><button className="text-turquoise underline" onClick={() => open(p.id).catch(fail)}>Ouvrir</button><button className="text-red-700 underline" onClick={() => run({ path: `/projects/${p.id}`, method: 'DELETE', ok: 'Projet supprimé.' })}>Supprimer</button></td></tr>
            ))}</tbody></table>
        )}
        {cmp.length >= 2 && <div className="p-4"><button className="btn-ghost" onClick={() => api<any[]>('/projects/compare', { method: 'POST', body: { ids: cmp } }).then(setCmpRes).catch(fail)}>Comparer {cmp.length} projets</button></div>}
        {cmpRes && <table className="table text-sm"><thead><tr><th>Rang</th><th>Projet</th><th className="text-right">VAN</th><th className="text-right">TRI</th><th className="text-right">IP</th><th className="text-right">Annuité éq.</th></tr></thead><tbody>{cmpRes.map((c) => <tr key={c.name}><td>{c.rank}</td><td>{c.name}</td><td className="text-right">{fr(c.npv)}</td><td className="text-right">{pct(c.irr)}</td><td className="text-right">{c.profitabilityIndex?.toFixed(3) ?? '—'}</td><td className="text-right">{fr(c.equivalentAnnuity)}</td></tr>)}</tbody></table>}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">1. Fiche du projet</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Nom du projet" value={f.name} onChange={(v) => set('name', v)} wide />
          <Field label="Promoteur" value={f.promoter} onChange={(v) => set('promoter', v)} />
          <Field label="Secteur" value={f.sector} onChange={(v) => set('sector', v)} />
          <Field label="Localisation" value={f.location} onChange={(v) => set('location', v)} />
          <Field label="Pays (code)" value={f.country} onChange={(v) => set('country', v.toUpperCase())} />
          <Field label="Devise" value={f.currency} onChange={(v) => set('currency', v.toUpperCase())} />
          <Field label="Durée de vie (ans)" value={f.years} onChange={(v) => set('years', v)} />
          <Field label="Taux d’actualisation (CMPC)" value={f.discountRate} onChange={(v) => set('discountRate', v)} />
          <Field label="Taux d’IS (pack pays)" value={f.taxRate} onChange={(v) => set('taxRate', v)} />
          <Field label="Exonération (ans, Code des investissements)" value={f.taxHolidayYears} onChange={(v) => set('taxHolidayYears', v)} wide />
        </div>
        <h2 className="font-semibold">2. Investissements</h2>
        {f.investments.map((it, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-4">
            {(['label', 'year', 'amount', 'lifeYears'] as const).map((k) => <Field key={k} label={{ label: 'Libellé', year: 'Année (0 = démarrage)', amount: 'Montant', lifeYears: 'Durée d’amortissement (0 = terrain)' }[k]} value={it[k]} onChange={(v) => set('investments', f.investments.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} />)}
          </div>
        ))}
        <button className="btn-ghost" onClick={() => set('investments', [...f.investments, { label: '', year: '0', amount: '', lifeYears: '5' }])}>+ Investissement</button>
        <h2 className="font-semibold">3. Exploitation</h2>
        {f.products.map((p, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-5">
            <Field label="Produit" value={p.name} onChange={(v) => set('products', f.products.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
            <Field label="Volumes par année (;)" value={p.volumes} onChange={(v) => set('products', f.products.map((x, j) => (j === i ? { ...x, volumes: v } : x)))} />
            <Field label="Prix unitaire" value={p.price} onChange={(v) => set('products', f.products.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
            <Field label="Coût variable unitaire" value={p.unitVariableCost} onChange={(v) => set('products', f.products.map((x, j) => (j === i ? { ...x, unitVariableCost: v } : x)))} />
            <Field label="Évolution annuelle du prix" value={p.priceGrowth} onChange={(v) => set('products', f.products.map((x, j) => (j === i ? { ...x, priceGrowth: v } : x)))} />
          </div>
        ))}
        <button className="btn-ghost" onClick={() => set('products', [...f.products, { name: '', volumes: '', price: '', unitVariableCost: '', priceGrowth: '0' }])}>+ Produit</button>
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Charges fixes par année (;)" value={f.fixedCosts} onChange={(v) => set('fixedCosts', v)} wide />
          <Field label="Charges de personnel par année (;)" value={f.personnelCosts} onChange={(v) => set('personnelCosts', v)} wide />
          <Field label="Délai clients (jours)" value={f.receivableDays} onChange={(v) => set('receivableDays', v)} />
          <Field label="Rotation des stocks (jours)" value={f.inventoryDays} onChange={(v) => set('inventoryDays', v)} />
          <Field label="Délai fournisseurs (jours)" value={f.payableDays} onChange={(v) => set('payableDays', v)} />
          <Field label="Emplois créés" value={f.jobs} onChange={(v) => set('jobs', v)} />
        </div>
        <h2 className="font-semibold">4. Financement</h2>
        {f.loans.map((l, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-4">
            {(['amount', 'rate', 'years', 'deferral'] as const).map((k) => <Field key={k} label={{ amount: 'Montant emprunté', rate: 'Taux', years: 'Durée (ans)', deferral: 'Différé (ans)' }[k]} value={l[k]} onChange={(v) => set('loans', f.loans.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} />)}
          </div>
        ))}
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => set('loans', [...f.loans, { amount: '', rate: '0.12', years: '5', deferral: '0' }])}>+ Emprunt</button><Field label="Subvention" value={f.subsidy} onChange={(v) => set('subsidy', v)} /></div>
        <div className="flex gap-2"><button className="btn-primary" onClick={compute}>Calculer</button><button className="btn-ghost" disabled={f.name.length < 2} onClick={save}>Enregistrer</button></div>
      </div>

      {r && (
        <>
          {res.taxCheck && res.taxCheck.status !== 'VALIDE' && <Alert kind="warn">{res.taxCheck.message}{res.taxCheck.packRate !== undefined && ` (pack : ${pct(res.taxCheck.packRate)})`}</Alert>}
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="VAN économique" value={fr(r.economic.npv)} hint={r.economic.npv >= 0 ? 'Projet créateur de valeur' : 'Projet destructeur de valeur'} />
            <Kpi label="TRI économique" value={pct(r.economic.irr)} />
            <Kpi label="Délai de récupération" value={yrs(r.economic.payback)} />
            <Kpi label="VAN pour l’actionnaire" value={fr(r.financial.npv)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2"><Criteria title="Rentabilité économique (avant financement)" c={r.economic} /><Criteria title="Rentabilité financière (actionnaire)" c={r.financial} /></div>
          <div className="card overflow-x-auto p-0">
            <table className="table text-sm">
              <thead><tr><th>Année</th><th className="text-right">CA</th><th className="text-right">EBE</th><th className="text-right">Dotations</th><th className="text-right">Intérêts</th><th className="text-right">IS</th><th className="text-right">Résultat net</th><th className="text-right">CAF</th><th className="text-right">Invest.</th><th className="text-right">Δ BFR</th><th className="text-right">Flux éco.</th><th className="text-right">Flux action.</th></tr></thead>
              <tbody>{r.rows.map((x: any) => <tr key={x.year}><td>{x.year}</td>{[x.revenue, x.ebitda, x.depreciation, x.interest, x.tax, x.netIncome, x.caf, x.investment, x.deltaWorkingCapital, x.economicFlow, x.equityFlow].map((v, i) => <td key={i} className="text-right">{fr(v)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="card text-sm">Seuil de rentabilité : {r.breakEven.map((b: any) => `année ${b.year} : ${fr(b.revenue)}`).join(' · ')} — Impact : valeur ajoutée {fr(r.economicImpact.valueAdded)}, salaires {fr(r.economicImpact.wages)}, impôts {fr(r.economicImpact.taxes)}, {r.economicImpact.jobs} emplois.</div>
        </>
      )}

      {id && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Analyse de risque</h2>
          <div className="grid gap-2 md:grid-cols-4">
            <Field label="Itérations Monte-Carlo" value={mc.iterations} onChange={(v) => setMc({ ...mc, iterations: v })} />
            <Field label="Prix : coefficient minimum" value={mc.priceMin} onChange={(v) => setMc({ ...mc, priceMin: v })} />
            <Field label="Prix : coefficient maximum" value={mc.priceMax} onChange={(v) => setMc({ ...mc, priceMax: v })} />
            <Field label="Volumes : écart-type" value={mc.volumeSd} onChange={(v) => setMc({ ...mc, volumeSd: v })} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={analyse}>Lancer l’analyse</button>
            <button className="btn-ghost" onClick={() => apiDownload(`/projects/${id}/report.docx`, `evaluation-${f.name}.docx`, { brand: me.tenant.name }).catch(fail)}>Rapport d’évaluation (Word)</button>
          </div>
          {risk && (
            <div className="grid gap-4 text-sm lg:grid-cols-2">
              <div><h3 className="font-medium">Sensibilité de la VAN et valeurs critiques</h3>
                <table className="table"><thead><tr><th>Variable</th>{risk.sensitivity[0].points.map((p: any) => <th key={p.delta} className="text-right">{p.delta > 0 ? '+' : ''}{Math.round(p.delta * 100)} %</th>)}<th className="text-right">Variation critique</th></tr></thead>
                  <tbody>{risk.sensitivity.map((s: any) => <tr key={s.variable}><td>{({ price: 'Prix', volume: 'Volumes', variableCost: 'Coûts variables', fixedCost: 'Charges fixes', investment: 'Investissement', discountRate: 'Taux d’actualisation' } as any)[s.variable]}</td>{s.points.map((p: any) => <td key={p.delta} className="text-right">{fr(p.npv)}</td>)}<td className="text-right">{s.criticalChange === null ? '—' : `${(s.criticalChange * 100).toFixed(1)} %`}</td></tr>)}</tbody></table></div>
              <div className="space-y-2">
                <h3 className="font-medium">Scénarios</h3>
                <ul>{risk.scenarios.results.map((s: any) => <li key={s.name}>{s.name} : VAN {fr(s.npv)} — TRI {pct(s.irr)}</li>)}</ul>
                <p>VAN espérée : <b>{fr(risk.scenarios.expectedNpv)}</b></p>
                <h3 className="font-medium">Monte-Carlo ({risk.monteCarlo.iterations} tirages)</h3>
                <p>VAN moyenne {fr(risk.monteCarlo.mean)} — écart-type {fr(risk.monteCarlo.sd)} — intervalle 5 %–95 % [{fr(risk.monteCarlo.p5)} ; {fr(risk.monteCarlo.p95)}]</p>
                <p>Probabilité de VAN négative : <b>{pct(risk.monteCarlo.probabilityNegative)}</b></p>
                <div className="flex h-32 items-end gap-px" role="img" aria-label="Distribution de la VAN">
                  {risk.monteCarlo.histogram.map((b: any, i: number) => <div key={i} title={`${fr(b.from)} à ${fr(b.to)} : ${b.count}`} className={b.to <= 0 ? 'bg-red-400' : 'bg-turquoise'} style={{ height: `${(b.count / maxBin) * 100}%`, flex: 1 }} />)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
