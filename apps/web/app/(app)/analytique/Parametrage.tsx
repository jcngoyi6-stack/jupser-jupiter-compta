'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { n } from './fmt';

const SOURCES: [string, string][] = [['MANUEL', 'Saisie manuelle'], ['QTE_ACHETEE', 'Quantités achetées'], ['HEURES_PRODUCTION', 'Heures des ordres de fabrication'], ['QTE_PRODUITE', 'Quantités produites'], ['QTE_VENDUE', 'Quantités vendues'], ['CA_100', '100 F de chiffre d’affaires']];
const FNS: [string, string][] = [['APPROVISIONNEMENT', 'Approvisionnement'], ['PRODUCTION', 'Production'], ['DISTRIBUTION', 'Distribution'], ['ADMINISTRATION', 'Administration'], ['AUTRE', 'Autre']];

export default function Parametrage() {
  const { company, can } = useSession();
  const edit = can('CHEF_COMPTABLE', 'EXPERT_EXTERNE');
  const { run, msg } = useAction();
  const q = useQuery({ queryKey: ['cage-config', company!.id], queryFn: () => api<any>(`/companies/${company!.id}/analytics/config`) });
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (q.data) setS(structuredClone(q.data.settings)); }, [q.data]);
  if (!s) return null;
  const codes: string[] = s.centres.map((c: any) => c.code);
  const aux = s.centres.filter((c: any) => c.kind !== 'PRINCIPAL');
  const setCentre = (i: number, patch: any) => setS({ ...s, centres: s.centres.map((c: any, j: number) => (j === i ? { ...c, ...patch } : c)) });
  const setKey = (i: number, patch: any) => setS({ ...s, keys: s.keys.map((k: any, j: number) => (j === i ? { ...k, ...patch } : k)) });
  const total = (o: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {!q.data.configured && <Alert kind="info">Paramétrage proposé par défaut : adaptez les centres, les clés et les unités d’œuvre à l’organisation de l’entreprise, puis enregistrez.</Alert>}

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 font-semibold">Centres d’analyse</h2>
        <table className="table text-sm">
          <thead><tr><th>Code</th><th>Libellé</th><th>Type</th><th>Fonction</th><th>Unité d’œuvre</th><th>Source des UO</th><th>Part fixe</th><th>Activité normale</th><th /></tr></thead>
          <tbody>{s.centres.map((c: any, i: number) => (
            <tr key={i}>
              <td><input className="input w-20 py-1" disabled={!edit} value={c.code} onChange={(e) => setCentre(i, { code: e.target.value.toUpperCase() })} /></td>
              <td><input className="input py-1" disabled={!edit} value={c.label} onChange={(e) => setCentre(i, { label: e.target.value })} /></td>
              <td><select className="input py-1" disabled={!edit} value={c.kind} onChange={(e) => setCentre(i, { kind: e.target.value })}><option value="PRINCIPAL">Principal</option><option value="AUXILIAIRE">Auxiliaire</option><option value="STRUCTURE">Structure</option></select></td>
              <td><select className="input py-1" disabled={!edit} value={c.fn ?? 'AUTRE'} onChange={(e) => setCentre(i, { fn: e.target.value })}>{FNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td><input className="input py-1" disabled={!edit || c.kind !== 'PRINCIPAL'} value={c.unit ?? ''} onChange={(e) => setCentre(i, { unit: e.target.value })} /></td>
              <td><select className="input py-1" disabled={!edit || c.kind !== 'PRINCIPAL'} value={c.unitSource ?? 'MANUEL'} onChange={(e) => setCentre(i, { unitSource: e.target.value, valueBase: e.target.value === 'CA_100' })}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td><input className="input num w-20 py-1" disabled={!edit || c.kind !== 'PRINCIPAL'} placeholder="0 à 1" defaultValue={c.fixedShare ?? ''} onBlur={(e) => setCentre(i, { fixedShare: e.target.value ? n(e.target.value) : undefined })} /></td>
              <td><input className="input num w-24 py-1" disabled={!edit || c.kind !== 'PRINCIPAL'} defaultValue={c.normalActivity ?? ''} onBlur={(e) => setCentre(i, { normalActivity: e.target.value ? n(e.target.value) : undefined })} /></td>
              <td>{edit && <button className="text-red-700" onClick={() => setS({ ...s, centres: s.centres.filter((_: any, j: number) => j !== i) })}>×</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {edit && <div className="p-3"><button className="btn-ghost" onClick={() => setS({ ...s, centres: [...s.centres, { code: `C${s.centres.length + 1}`, label: 'Nouveau centre', kind: 'PRINCIPAL', fn: 'PRODUCTION', unitSource: 'MANUEL' }] })}>+ Centre</button></div>}
        <p className="px-4 pb-3 text-xs text-slate-500">Part fixe et activité normale activent l’imputation rationnelle des charges fixes du centre (coût de sous-activité ou boni de suractivité). Un centre de production dont le code est celui d’un poste de gamme valorise les ordres de fabrication après validation d’une période.</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 font-semibold">Répartition primaire — clés par compte de charges</h2>
        <table className="table text-sm">
          <thead><tr><th>Préfixe de compte</th><th>Libellé</th>{codes.map((c) => <th key={c} className="text-right">{c} %</th>)}<th className="text-right">Total</th><th /></tr></thead>
          <tbody>{s.keys.map((k: any, i: number) => (
            <tr key={i}>
              <td><input className="input num w-24 py-1" disabled={!edit} value={k.prefix} onChange={(e) => setKey(i, { prefix: e.target.value.replace(/\D/g, '') })} /></td>
              <td><input className="input py-1" disabled={!edit} value={k.label} onChange={(e) => setKey(i, { label: e.target.value })} /></td>
              {codes.map((c) => <td key={c}><input className="input num w-16 py-1 text-right" disabled={!edit} defaultValue={k.shares[c] ?? ''} onBlur={(e) => { const sh = { ...k.shares }; if (e.target.value) sh[c] = n(e.target.value); else delete sh[c]; setKey(i, { shares: sh }); }} /></td>)}
              <td className={`text-right ${Math.abs(total(k.shares) - 100) > 0.001 ? 'text-amber-700' : ''}`}>{total(k.shares)}</td>
              <td>{edit && <button className="text-red-700" onClick={() => setS({ ...s, keys: s.keys.filter((_: any, j: number) => j !== i) })}>×</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {edit && <div className="p-3"><button className="btn-ghost" onClick={() => setS({ ...s, keys: [...s.keys, { prefix: '', label: '', shares: {} }] })}>+ Clé</button></div>}
        <p className="px-4 pb-3 text-xs text-slate-500">La clé du préfixe le plus long s’applique. Les lignes d’écritures portant un code analytique de centre sont affectées directement. Les comptes sans clé sont des charges directes (achats, main-d’œuvre directe).</p>
      </div>

      {aux.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <h2 className="p-4 font-semibold">Répartition secondaire — centres auxiliaires (prestations réciproques admises)</h2>
          <table className="table text-sm">
            <thead><tr><th>Centre auxiliaire</th>{codes.map((c) => <th key={c} className="text-right">→ {c} %</th>)}<th className="text-right">Total</th></tr></thead>
            <tbody>{aux.map((a: any) => (
              <tr key={a.code}><td>{a.code} — {a.label}</td>
                {codes.map((c) => <td key={c}><input className="input num w-16 py-1 text-right" disabled={!edit || c === a.code} defaultValue={s.transfers[a.code]?.[c] ?? ''} onBlur={(e) => { const t = { ...(s.transfers[a.code] ?? {}) }; if (e.target.value) t[c] = n(e.target.value); else delete t[c]; setS({ ...s, transfers: { ...s.transfers, [a.code]: t } }); }} /></td>)}
                <td className={`text-right ${Math.abs(total(s.transfers[a.code]) - 100) > 0.001 ? 'text-red-700' : ''}`}>{total(s.transfers[a.code])}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold">Charges supplétives et méthode des stocks</h2>
          <label className="block">Rémunération des capitaux propres (taux annuel)<input className="input num" disabled={!edit} defaultValue={s.supplementary.equityRate} onBlur={(e) => setS({ ...s, supplementary: { ...s.supplementary, equityRate: n(e.target.value) } })} /></label>
          <label className="block">Rémunération annuelle de l’exploitant<input className="input num" disabled={!edit} defaultValue={s.supplementary.ownerAnnual} onBlur={(e) => setS({ ...s, supplementary: { ...s.supplementary, ownerAnnual: n(e.target.value) } })} /></label>
          <label className="block">Centre qui reçoit les charges supplétives<select className="input" disabled={!edit} value={s.supplementary.centre ?? ''} onChange={(e) => setS({ ...s, supplementary: { ...s.supplementary, centre: e.target.value || undefined } })}><option value="">Charge directe</option>{codes.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="block">Valorisation des sorties de stock<select className="input" disabled={!edit} value={s.method} onChange={(e) => setS({ ...s, method: e.target.value })}><option value="CMUP_PERIODE">Coût moyen pondéré de la période</option><option value="CMUP_ENTREE">Coût moyen après chaque entrée</option><option value="PEPS">Premier entré, premier sorti</option></select></label>
        </div>
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold">Charges non incorporables et coûts préétablis</h2>
          <label className="block">Préfixes non incorporables (par défaut 81, 83, 85, 87, 89)<input className="input" disabled={!edit} defaultValue={(s.rules.nonIncorporablePrefixes ?? []).join(' ')} onBlur={(e) => setS({ ...s, rules: { ...s.rules, nonIncorporablePrefixes: e.target.value.split(/[\s,;]+/).filter(Boolean).length ? e.target.value.split(/[\s,;]+/).filter(Boolean) : undefined } })} /></label>
          <label className="block">Comptes exclus des coûts (pénalités, dons… — séparés par des espaces)<input className="input" disabled={!edit} defaultValue={Object.entries(s.rules.overrides).filter(([, v]) => v === 'NON_INCORPORABLE').map(([k]) => k).join(' ')} onBlur={(e) => setS({ ...s, rules: { ...s.rules, overrides: Object.fromEntries(e.target.value.split(/[\s,;]+/).filter(Boolean).map((a) => [a, 'NON_INCORPORABLE'])) } })} /></label>
          <label className="block">Prix standards par article (CODE=prix, séparés par des espaces)<input className="input" disabled={!edit} defaultValue={Object.entries(s.standards.prices).map(([k, v]) => `${k}=${v}`).join(' ')} onBlur={(e) => setS({ ...s, standards: { ...s.standards, prices: Object.fromEntries(e.target.value.split(/\s+/).filter((x) => x.includes('=')).map((x) => [x.split('=')[0], n(x.split('=')[1]!)])) } })} /></label>
          <label className="block">Taux horaires standards par poste (POSTE=taux)<input className="input" disabled={!edit} defaultValue={Object.entries(s.standards.hourlyRates).map(([k, v]) => `${k}=${v}`).join(' ')} onBlur={(e) => setS({ ...s, standards: { ...s.standards, hourlyRates: Object.fromEntries(e.target.value.split(/\s+/).filter((x) => x.includes('=')).map((x) => [x.split('=')[0], n(x.split('=')[1]!)])) } })} /></label>
        </div>
      </div>
      {edit && <button className="btn-primary" onClick={() => run({ path: `/companies/${company!.id}/analytics/config`, method: 'PUT', body: s, ok: 'Paramétrage analytique enregistré.' })}>Enregistrer le paramétrage</button>}
    </div>
  );
}
