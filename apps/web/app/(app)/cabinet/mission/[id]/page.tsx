'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, PageTitle, Status } from '@/components/ui';
import { api, apiDownload, errorText } from '@/lib/api';
import { useAction } from '@/lib/hooks';

const CYCLES: Record<string, string> = {
  TRESORERIE: 'Trésorerie', VENTES_CLIENTS: 'Ventes – clients', ACHATS_FOURNISSEURS: 'Achats – fournisseurs', STOCKS: 'Stocks',
  IMMOBILISATIONS: 'Immobilisations', PERSONNEL: 'Personnel', FISCALITE: 'Fiscalité', CAPITAUX_PROPRES: 'Capitaux propres',
};
const DOCS: [string, string][] = [
  ['lettre-mission', 'Lettre de mission'], ['demande-pieces', 'Demande de pièces'], ['lettre-affirmation', 'Lettre d’affirmation'],
  ['confirmation-client', 'Confirmation client'], ['confirmation-fournisseur', 'Confirmation fournisseur'], ['confirmation-banque', 'Confirmation bancaire'], ['confirmation-avocat', 'Lettre à l’avocat'],
];
const INDEPENDENCE = [
  ['interets_financiers', 'Un membre de l’équipe détient-il des intérêts financiers chez le client ?'],
  ['liens_familiaux', 'Existe-t-il des liens familiaux ou personnels avec la direction ?'],
  ['autres_services', 'Le cabinet fournit-il des services incompatibles (tenue + audit) ?'],
  ['dependance_honoraires', 'Les honoraires de ce client représentent-ils une part excessive du chiffre du cabinet ?'],
];

export default function Mission() {
  const { id } = useParams<{ id: string }>();
  const { run, msg, setMsg } = useAction();
  const q = useQuery({ queryKey: ['mission-audit', id], queryFn: () => api<any>(`/cabinet/missions/${id}/audit`) });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const an = useQuery({ queryKey: ['mission-analytics', id], queryFn: () => api<any>(`/cabinet/missions/${id}/audit/analytics`), enabled: showAnalytics });
  const [plan, setPlan] = useState({ name: 'Total bilan', base: '', rate: '0.01', performanceRatio: '0.75', trivialRatio: '0.05' });
  const [risks, setRisks] = useState<Record<string, { inherent: number; control: number }>>({});
  const [indep, setIndep] = useState<Record<string, boolean>>({});
  const [point, setPoint] = useState('');
  const [mis, setMis] = useState({ description: '', amount: '' });
  const [docP, setDocP] = useState({ firm: '', firmAddress: '', partner: '', fee: '', recipient: '', balance: '' });
  if (!q.data) return null;
  const m = q.data.mission;
  const review = m.review ?? { stage: 'PREPARATION', points: [] };
  const locked = review.stage === 'VERROUILLE';
  const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
  const act = (action: string) => run({ path: `/cabinet/missions/${id}/review`, body: { action }, ok: 'Circuit de revue mis à jour.' });

  return (
    <div className="space-y-4">
      <PageTitle title={m.title} sub={`Mission ${m.type.toLowerCase()} — circuit préparateur → réviseur → associé signataire`}>
        <Status s={review.stage} />
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Alert kind="warn">Programmes de travail et seuils inspirés des normes ISA : référentiel « à valider » par un expert-comptable membre de l’ordre.</Alert>

      <div className="card space-y-2">
        <h2 className="font-semibold">Revue</h2>
        <div className="flex flex-wrap gap-2">
          {review.stage === 'PREPARATION' && <button className="btn-primary" onClick={() => act('SOUMETTRE')}>Soumettre en revue</button>}
          {review.stage === 'REVUE' && <button className="btn-primary" onClick={() => act('APPROUVER')}>Approuver (réviseur)</button>}
          {review.stage === 'SIGNATURE' && <button className="btn-primary" onClick={() => act('SIGNER')}>Signer (associé)</button>}
          {(review.stage === 'REVUE' || review.stage === 'SIGNATURE') && <button className="btn-ghost" onClick={() => act('RENVOYER')}>Renvoyer au préparateur</button>}
        </div>
        <ul className="space-y-1 text-sm">
          {review.points.map((p: any) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className={p.resolved ? 'line-through text-slate-400' : ''}>{p.text}</span>
              {!p.resolved && !locked && <button className="text-turquoise underline" onClick={() => run({ path: `/cabinet/missions/${id}/review/points/${p.id}/resolve`, ok: 'Point résolu.' })}>Résoudre</button>}
            </li>
          ))}
        </ul>
        {!locked && <div className="flex gap-2"><input className="input" placeholder="Nouveau point de revue" value={point} onChange={(e) => setPoint(e.target.value)} /><button className="btn-ghost" disabled={point.length < 3} onClick={() => { run({ path: `/cabinet/missions/${id}/review/points`, body: { text: point }, ok: 'Point ajouté.' }); setPoint(''); }}>Ajouter</button></div>}
      </div>

      {m.type === 'AUDIT' || m.type === 'REVISION' ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card space-y-2">
              <h2 className="font-semibold">Acceptation — indépendance</h2>
              {INDEPENDENCE.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!indep[k]} onChange={(e) => setIndep({ ...indep, [k]: e.target.checked })} />{l}</label>)}
              <button className="btn-ghost" disabled={locked} onClick={() => run({ path: `/cabinet/missions/${id}/audit/independence`, method: 'PUT', body: { answers: Object.fromEntries(INDEPENDENCE.map(([k]) => [k, !!indep[k]])) }, ok: 'Questionnaire enregistré.' })}>Enregistrer</button>
              {q.data.independence && <p className="text-sm">{q.data.independence.accepted ? '✅ Aucune menace déclarée : mission acceptable.' : '⛔ Menace déclarée : acceptation à reconsidérer.'}</p>}
            </div>
            <div className="card space-y-2">
              <h2 className="font-semibold">Planification — seuil de signification</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label>Référence<input className="input" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></label>
                <label>Montant de référence<input className="input num" value={plan.base} onChange={(e) => setPlan({ ...plan, base: e.target.value })} /></label>
                <label>Taux retenu (jugement)<input className="input num" value={plan.rate} onChange={(e) => setPlan({ ...plan, rate: e.target.value })} /></label>
                <label>Ratio seuil de planification<input className="input num" value={plan.performanceRatio} onChange={(e) => setPlan({ ...plan, performanceRatio: e.target.value })} /></label>
                <label>Ratio anomalies insignifiantes<input className="input num" value={plan.trivialRatio} onChange={(e) => setPlan({ ...plan, trivialRatio: e.target.value })} /></label>
              </div>
              <table className="table text-sm"><thead><tr><th>Cycle</th><th>Risque inhérent</th><th>Risque de contrôle</th></tr></thead><tbody>
                {Object.entries(CYCLES).map(([c, l]) => (
                  <tr key={c}><td>{l}</td>
                    {(['inherent', 'control'] as const).map((k) => <td key={k}><select className="input py-1" value={risks[c]?.[k] ?? 0} onChange={(e) => setRisks({ ...risks, [c]: { ...(risks[c] ?? { inherent: 1, control: 1 }), [k]: Number(e.target.value) } })}><option value={0}>—</option><option value={1}>Faible</option><option value={2}>Moyen</option><option value={3}>Élevé</option></select></td>)}
                  </tr>
                ))}
              </tbody></table>
              <button className="btn-primary" disabled={locked || !plan.base} onClick={() => run({ path: `/cabinet/missions/${id}/audit/planning`, method: 'PUT', ok: 'Planification enregistrée.', body: {
                benchmarks: [{ name: plan.name, base: num(plan.base), rate: num(plan.rate) }], selected: plan.name, performanceRatio: num(plan.performanceRatio), trivialRatio: num(plan.trivialRatio),
                risks: Object.entries(risks).filter(([, r]) => r.inherent && r.control).map(([cycle, r]) => ({ cycle, ...r })),
              } })}>Calculer et enregistrer</button>
              {q.data.planning && <p className="text-sm">Seuil : <b>{Math.round(q.data.planning.result.overall).toLocaleString('fr-FR')}</b> — planification : {Math.round(q.data.planning.result.performance).toLocaleString('fr-FR')} — insignifiant : {Math.round(q.data.planning.result.trivial).toLocaleString('fr-FR')}</p>}
            </div>
          </div>

          <div className="card p-0">
            <h2 className="p-4 font-semibold">Programmes de travail et feuilles de travail</h2>
            <table className="table text-sm">
              <thead><tr><th>Réf.</th><th>Cycle</th><th>Risque</th><th>Assertion</th><th>Procédure</th><th>Statut</th><th>Revue</th></tr></thead>
              <tbody>
                {q.data.programmes.flatMap((c: any) => c.procedures.map((p: any) => (
                  <tr key={`${c.cycle}:${p.ref}`}>
                    <td>{p.workpaper}</td><td>{CYCLES[c.cycle]}</td><td>{c.risk?.level ?? '—'}</td><td>{p.assertion}</td><td>{p.procedure}</td>
                    <td><select className="input py-1" disabled={locked} value={p.status} onChange={(e) => run({ path: `/cabinet/missions/${id}/audit/workpapers/${c.cycle}:${p.ref}`, method: 'PUT', body: { status: e.target.value, conclusion: p.conclusion }, ok: 'Feuille mise à jour.' })}>
                      <option value="A_FAIRE">À faire</option><option value="EN_COURS">En cours</option><option value="TERMINE">Terminé</option></select></td>
                    <td>{p.reviewedBy ? '✔' : p.status === 'TERMINE' && !locked ? <button className="text-turquoise underline" onClick={() => run({ path: `/cabinet/missions/${id}/audit/workpapers/${c.cycle}:${p.ref}`, method: 'PUT', body: { status: 'TERMINE', conclusion: p.conclusion, review: true }, ok: 'Feuille revue.' })}>Réviser</button> : ''}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          <div className="card space-y-2">
            <h2 className="font-semibold">Anomalies relevées</h2>
            <table className="table text-sm"><thead><tr><th>Réf.</th><th>Description</th><th className="text-right">Montant</th><th>Corrigée</th></tr></thead>
              <tbody>{q.data.misstatements.map((x: any) => <tr key={x.ref}><td>{x.ref}</td><td>{x.description}</td><td className="text-right">{x.amount.toLocaleString('fr-FR')}</td><td>{x.adjusted ? 'Oui' : 'Non'}</td></tr>)}</tbody></table>
            {!locked && <div className="flex gap-2"><input className="input" placeholder="Description" value={mis.description} onChange={(e) => setMis({ ...mis, description: e.target.value })} /><input className="input num w-40" placeholder="Montant" value={mis.amount} onChange={(e) => setMis({ ...mis, amount: e.target.value })} /><button className="btn-ghost" onClick={() => run({ path: `/cabinet/missions/${id}/audit/misstatements`, body: { description: mis.description, amount: num(mis.amount) }, ok: 'Anomalie ajoutée.' })}>Ajouter</button></div>}
            {q.data.summary && <Alert kind={q.data.summary.exceedsMateriality ? 'warn' : 'ok'}>Anomalies non corrigées : {q.data.summary.uncorrected.toLocaleString('fr-FR')} — {q.data.summary.exceedsMateriality ? 'supérieures au seuil : opinion avec réserve à envisager.' : 'inférieures au seuil.'}</Alert>}
          </div>

          <div className="card space-y-2">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Procédures automatisées</h2><button className="btn-ghost" onClick={() => setShowAnalytics(true)}>Lancer les analyses</button></div>
            {an.isLoading && <p className="text-sm">Analyse en cours…</p>}
            {an.data && (
              <div className="grid gap-4 text-sm lg:grid-cols-2">
                <div><h3 className="font-medium">Loi de Benford (premier chiffre)</h3><p>Écart absolu moyen : {an.data.benford.mad?.toFixed?.(4) ?? '—'} — {an.data.benford.conform === null ? 'échantillon insuffisant (< 50)' : an.data.benford.conform ? 'conforme' : 'non conforme : à investiguer'}</p></div>
                <div><h3 className="font-medium">Séquences et doublons</h3><p>{an.data.sequenceGaps.length} journal(aux) avec trous ; {an.data.possibleDuplicates.length} pièce(s) en double.</p></div>
                <div className="lg:col-span-2"><h3 className="font-medium">Écritures inhabituelles ({an.data.unusualEntries.length})</h3>
                  <table className="table"><tbody>{an.data.unusualEntries.slice(0, 30).map((e: any) => <tr key={e.id}><td>{e.date}</td><td>{e.description}</td><td className="text-right">{e.amount.toLocaleString('fr-FR')}</td><td className="text-xs">{e.flags.join(', ')}</td></tr>)}</tbody></table></div>
                <div><h3 className="font-medium">Échantillon clients (unité monétaire)</h3><ul>{an.data.customerSample.selected.map((s: any) => <li key={s.id}>{s.id} {s.label} — {s.amount.toLocaleString('fr-FR')}</li>)}</ul></div>
                <div><h3 className="font-medium">Revue analytique N/N-1</h3><ul>{an.data.analyticalReview.slice(0, 15).map((r: any) => <li key={r.account}>{r.account} {r.label} : {r.change.toLocaleString('fr-FR')} {r.pct !== null && `(${Math.round(r.pct * 100)} %)`}</li>)}</ul></div>
              </div>
            )}
          </div>
        </>
      ) : null}

      <div className="card space-y-2">
        <h2 className="font-semibold">Documents de mission (Word, projets à valider)</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <input className="input" placeholder="Nom du cabinet" value={docP.firm} onChange={(e) => setDocP({ ...docP, firm: e.target.value })} />
          <input className="input" placeholder="Adresse du cabinet" value={docP.firmAddress} onChange={(e) => setDocP({ ...docP, firmAddress: e.target.value })} />
          <input className="input" placeholder="Associé signataire" value={docP.partner} onChange={(e) => setDocP({ ...docP, partner: e.target.value })} />
          <input className="input" placeholder="Honoraires (texte)" value={docP.fee} onChange={(e) => setDocP({ ...docP, fee: e.target.value })} />
          <input className="input" placeholder="Destinataire (confirmations)" value={docP.recipient} onChange={(e) => setDocP({ ...docP, recipient: e.target.value })} />
          <input className="input" placeholder="Solde à confirmer" value={docP.balance} onChange={(e) => setDocP({ ...docP, balance: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          {DOCS.map(([k, l]) => (
            <button key={k} className="btn-ghost" disabled={docP.firm.length < 2 || docP.partner.length < 2}
              onClick={() => apiDownload(`/cabinet/missions/${id}/documents/${k}`, `${k}.docx`, { ...docP, fee: docP.fee || undefined, balance: docP.balance || undefined }).catch((e) => setMsg({ kind: 'error', text: errorText(e) }))}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
