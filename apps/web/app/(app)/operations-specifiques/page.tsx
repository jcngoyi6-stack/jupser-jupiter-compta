'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Empty, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { DECIMALS, date } from '@/lib/format';

interface Op { id: string; label: string; chapter: string; applications: number[]; example: Record<string, unknown> }
interface Line { account: string; debit: string; credit: string; label?: string }
interface Entry { date?: string; label: string; lines: Line[] }
interface Result { entries: Entry[]; counterpartEntries?: Entry[]; notes?: string[]; values?: Record<string, unknown>; schedule?: unknown[]; missingAccounts?: string[] }

function Entries({ title, entries, dec }: { title: string; entries: Entry[]; dec: number }) {
  if (!entries.length) return null;
  return (
    <div className="card overflow-x-auto">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase opacity-70"><th>N°</th><th>Date</th><th>Libellé</th><th>Compte</th><th className="text-right">Débit</th><th className="text-right">Crédit</th></tr></thead>
        <tbody>
          {entries.flatMap((e, i) => e.lines.map((l, j) => (
            <tr key={`${i}-${j}`} className={j === 0 ? 'border-t' : ''}>
              <td>{j === 0 ? i + 1 : ''}</td>
              <td>{j === 0 && e.date ? date(e.date) : ''}</td>
              <td>{j === 0 ? e.label : ''}</td>
              <td className="font-mono">{l.account}</td>
              <td className="text-right">{l.debit !== '0' && <Money v={l.debit} dec={dec} />}</td>
              <td className="text-right">{l.credit !== '0' && <Money v={l.credit} dec={dec} />}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}

/** Opérations spécifiques du guide d'application : calcul, aperçu, puis écritures proposées en brouillon. */
export default function OperationsSpecifiques() {
  const { company, companies } = useSession();
  const dec = DECIMALS[company?.currency ?? 'XOF'] ?? 2;
  const [ops, setOps] = useState<Op[]>([]);
  const [sel, setSel] = useState<Op | null>(null);
  const [params, setParams] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok' | 'warn'; text: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [defaultDate, setDefaultDate] = useState('');
  const [linked, setLinked] = useState('');
  const sisters = (companies ?? []).filter((c) => c.id !== company?.id);
  const [ig, setIg] = useState({ targetCompanyId: '', kind: 'PRESTATION', amount: '', vatRate: '', date: '', label: '' });

  useEffect(() => {
    if (company) api<Op[]>(`/companies/${company.id}/special-ops`).then(setOps).catch((e) => setMsg({ kind: 'error', text: errorText(e) }));
  }, [company]);

  const groups = useMemo(() => {
    const f = filter.toLowerCase();
    const list = ops.filter((o) => !f || o.label.toLowerCase().includes(f) || o.chapter.toLowerCase().includes(f) || o.applications.some((a) => String(a) === f));
    return [...new Set(list.map((o) => o.chapter))].map((c) => [c, list.filter((o) => o.chapter === c)] as const);
  }, [ops, filter]);

  if (!company) return null;
  const choose = (o: Op) => { setSel(o); setParams(JSON.stringify(o.example, null, 2)); setResult(null); setMsg(null); };
  const parsed = () => { try { return JSON.parse(params) as Record<string, unknown>; } catch { setMsg({ kind: 'error', text: 'Paramètres : JSON invalide.' }); return null; } };
  const preview = async () => {
    const p = parsed();
    if (!p || !sel) return;
    try {
      const r = await api<Result>(`/companies/${company.id}/special-ops/${sel.id}/preview`, { method: 'POST', body: { params: p } });
      setResult(r);
      setMsg(r.missingAccounts?.length ? { kind: 'warn', text: `Comptes absents du plan du dossier : ${r.missingAccounts.join(', ')} — créez-les avant de générer les brouillons.` } : null);
    } catch (e) { setMsg({ kind: 'error', text: errorText(e) }); }
  };
  const drafts = async () => {
    const p = parsed();
    if (!p || !sel) return;
    try {
      const r = await api(`/companies/${company.id}/special-ops/${sel.id}/drafts`, { method: 'POST', body: { params: p, ...(defaultDate ? { defaultDate } : {}), ...(linked ? { counterpartCompanyId: linked } : {}) } }) as { created: number; counterpartCreated?: unknown[] };
      setMsg({ kind: 'ok', text: `${r.created} écriture(s) créée(s) en brouillon dans le journal OD${r.counterpartCreated?.length ? `, et ${r.counterpartCreated.length} dans la société liée` : ''} : à contrôler puis valider par un comptable.` });
    } catch (e) { setMsg({ kind: 'error', text: errorText(e) }); }
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Opérations spécifiques" sub={`${company.name} — écritures types du guide d’application du SYSCOHADA révisé (location-acquisition, titres, capital, subventions, emprunts obligataires, retraites, change, contrats, réévaluation, fusions, liquidation, consolidation…)`} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {sisters.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Opération intragroupe (une saisie, écritures miroirs dans les deux sociétés)</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <label className="text-sm">Société du groupe<select className="input" value={ig.targetCompanyId} onChange={(e) => setIg({ ...ig, targetCompanyId: e.target.value })}><option value="">—</option>{sisters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="text-sm">Nature<select className="input" value={ig.kind} onChange={(e) => setIg({ ...ig, kind: e.target.value })}>
              {[['PRESTATION', 'Refacturation de prestations'], ['VENTE_MARCHANDISES', 'Vente de marchandises'], ['PRET', 'Prêt accordé'], ['REMBOURSEMENT_PRET', 'Remboursement de prêt reçu'], ['INTERETS', 'Intérêts du prêt'], ['DIVIDENDE', 'Dividende versé'], ['REGLEMENT', 'Règlement reçu']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
            <label className="text-sm">Montant HT (unités mineures)<input className="input num" value={ig.amount} onChange={(e) => setIg({ ...ig, amount: e.target.value })} /></label>
            <label className="text-sm">Taux de TVA (ex. 0.16, selon le pack pays)<input className="input num" value={ig.vatRate} onChange={(e) => setIg({ ...ig, vatRate: e.target.value })} /></label>
            <label className="text-sm">Date<input type="date" className="input" value={ig.date} onChange={(e) => setIg({ ...ig, date: e.target.value })} /></label>
            <label className="text-sm">Libellé<input className="input" value={ig.label} onChange={(e) => setIg({ ...ig, label: e.target.value })} /></label>
          </div>
          <p className="mt-2 text-xs opacity-70">Votre société est l’émettrice (elle facture, prête, distribue ou encaisse). Comptes groupe 4112/4012 et 2771/1811, éliminés en consolidation avec les produits et charges réciproques.</p>
          <button className="btn-primary mt-2" onClick={() => api<{ reference: string }>(`/companies/${company.id}/special-ops/intercompany`, { method: 'POST', body: { ...ig, label: ig.label || undefined, vatRate: ig.vatRate ? Number(ig.vatRate) : undefined } })
            .then((r) => setMsg({ kind: 'ok', text: `Écritures miroirs créées en brouillon dans les deux sociétés (référence IG-…-${r.reference}).` }))
            .catch((e) => setMsg({ kind: 'error', text: errorText(e) }))}>Créer les écritures dans les deux sociétés</button>
        </details>
      )}
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="card max-h-[75vh] space-y-3 overflow-y-auto">
          <input className="input" placeholder="Rechercher (libellé, chapitre, n° d’application)" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {groups.length === 0 && <Empty>Aucune opération.</Empty>}
          {groups.map(([chapter, list]) => (
            <div key={chapter}>
              <div className="text-xs font-semibold uppercase opacity-60">{chapter}</div>
              {list.map((o) => (
                <button key={o.id} className={`block w-full rounded px-2 py-1 text-left text-sm ${sel?.id === o.id ? 'bg-sky-100 dark:bg-sky-900' : 'hover:bg-black/5'}`} onClick={() => choose(o)}>
                  {o.label} <span className="opacity-60">({o.applications.map((a) => `app. ${a}`).join(', ')})</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {!sel ? <Empty>Choisissez une opération : l’exemple du guide est pré-rempli et modifiable.</Empty> : (
            <>
              <div className="card space-y-2">
                <h2 className="font-semibold">{sel.label}</h2>
                <p className="text-sm opacity-75">Montants en unités mineures de la devise du dossier (chaînes de chiffres) ; taux en décimal (0,08 = 8 %) ; dates au format AAAA-MM-JJ ; taux de TVA et d’impôt à reprendre du pack fiscal du pays.</p>
                <textarea className="input h-72 font-mono text-xs" value={params} onChange={(e) => setParams(e.target.value)} spellCheck={false} />
                <div className="flex flex-wrap items-end gap-2">
                  <button className="btn-ghost" onClick={preview}>Calculer et prévisualiser</button>
                  <label className="text-sm">Date par défaut<input type="date" className="input" value={defaultDate} onChange={(e) => setDefaultDate(e.target.value)} /></label>
                  {sisters.length > 0 && (
                    <label className="text-sm">Écritures de l’autre partie dans
                      <select className="input" value={linked} onChange={(e) => setLinked(e.target.value)}>
                        <option value="">(ne pas les passer)</option>
                        {sisters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                  <button className="btn-primary" onClick={drafts}>Créer les écritures en brouillon</button>
                  <button className="btn-ghost" onClick={() => choose(sel)}>Réinitialiser l’exemple</button>
                </div>
              </div>
              {result && (
                <>
                  {result.values && Object.keys(result.values).length > 0 && (
                    <div className="card">
                      <h3 className="mb-2 font-semibold">Valeurs calculées</h3>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
                        {Object.entries(result.values).map(([k, v]) => <div key={k}><dt className="text-xs opacity-60">{k}</dt><dd className="font-mono">{String(v)}</dd></div>)}
                      </dl>
                    </div>
                  )}
                  <Entries title="Écritures proposées (ce dossier)" entries={result.entries} dec={dec} />
                  <Entries title="Écritures chez l’autre partie (pour information)" entries={result.counterpartEntries ?? []} dec={dec} />
                  {result.notes?.length ? <Alert kind="info">{result.notes.join(' ')}</Alert> : null}
                  {result.schedule?.length ? (
                    <details className="card"><summary className="cursor-pointer font-semibold">Échéancier / détail ({result.schedule.length} lignes)</summary><pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(result.schedule, null, 2)}</pre></details>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
