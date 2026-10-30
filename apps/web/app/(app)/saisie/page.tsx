'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AccountInput, useAccounts, useThirdParties } from '@/components/AccountInput';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { money, parseMoney, today } from '@/lib/format';

interface Line {
  account: string;
  thirdPartyId: string;
  label: string;
  debit: string;
  credit: string;
  /** Code analytique (centre d'analyse, produit, projet) pour les comptes de gestion. */
  analytic: string;
  fx: null | { currency: string; foreignAmount: string; rate: string; rateSource: string; rateDate: string };
}
const empty = (): Line => ({ account: '', thirdPartyId: '', label: '', debit: '', credit: '', analytic: '', fx: null });

/** Modèles d'écritures (docs/04 §3) — les montants sont saisis ensuite. */
const TEMPLATES: Record<string, { journal: string; label: string; lines: Partial<Line>[] }> = {
  loyer: { journal: 'BQ1', label: 'Loyer du mois', lines: [{ account: '622200' }, { account: '521100' }] },
  electricite: { journal: 'ACH', label: 'Facture d’électricité', lines: [{ account: '605200' }, { account: '445200' }, { account: '401100' }] },
  achat_tva: { journal: 'ACH', label: 'Achat de marchandises avec TVA', lines: [{ account: '601100' }, { account: '445200' }, { account: '401100' }] },
  vente_tva: { journal: 'VTE', label: 'Vente de services avec TVA', lines: [{ account: '411100' }, { account: '706100' }, { account: '443200' }] },
  caisse_banque: { journal: 'CAI', label: 'Versement caisse en banque', lines: [{ account: '585000' }, { account: '571100' }] },
  mobile_money: { journal: 'MM1', label: 'Encaissement mobile money', lines: [{ account: '552000' }, { account: '411100' }] },
};

export default function Saisie() {
  const { company, dec, has } = useSession();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const tps = useThirdParties();
  const cage = useQuery({ queryKey: ['cage-config', company?.id], queryFn: () => api<any>(`/companies/${company!.id}/analytics/config`), enabled: !!company && has('COMPTABILITE_ANALYTIQUE'), retry: false });
  const centres: { code: string; label: string }[] = cage.data?.settings?.centres ?? [];
  const journals = useQuery({ queryKey: ['journals', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/journals`), enabled: !!company });
  const [journalCode, setJournal] = useState('OD');
  const [dt, setDate] = useState(today());
  const [pieceRef, setPiece] = useState('');
  const [label, setLabel] = useState('');
  const [lines, setLines] = useState<Line[]>([empty(), empty()]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const totals = useMemo(() => {
    let d = 0n;
    let c = 0n;
    let invalid = false;
    for (const l of lines) {
      const dv = parseMoney(l.debit, dec);
      const cv = parseMoney(l.credit, dec);
      if (dv === null || cv === null) invalid = true;
      d += dv ?? 0n;
      c += cv ?? 0n;
    }
    return { d, c, gap: d - c, invalid };
  }, [lines, dec]);

  const collective = (acc: string) => accounts.data?.find((a) => a.number === acc)?.collective ?? /^4[012]/.test(acc);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: (validate: boolean) =>
      api(`/companies/${company!.id}/entries${validate ? '?validate=true' : ''}`, {
        method: 'POST',
        body: {
          journalCode,
          date: dt,
          pieceRef,
          label,
          lines: lines
            .filter((l) => l.account)
            .map((l) => ({
              account: l.account,
              thirdPartyId: l.thirdPartyId || null,
              label: l.label || undefined,
              debit: l.debit || '0',
              credit: l.credit || '0',
              analytic: /^[678]/.test(l.account) && l.analytic ? l.analytic : null,
              fx: l.fx ? { ...l.fx, rate: l.fx.rate.replace(',', '.') } : null,
            })),
        },
      }),
    onSuccess: (e: any) => {
      setMsg({ kind: 'ok', text: e.number ? `Écriture validée : ${e.number}` : 'Brouillon enregistré.' });
      setLines([empty(), empty()]);
      setPiece('');
      setLabel('');
      qc.invalidateQueries();
    },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });

  const applyTemplate = (k: string) => {
    const t = TEMPLATES[k];
    if (!t) return;
    setJournal(t.journal);
    setLabel(t.label);
    setLines(t.lines.map((l) => ({ ...empty(), ...l })));
  };
  /** Contrepartie automatique : solde l'écriture sur la dernière ligne vide. */
  const balance = () => {
    const i = lines.findIndex((l) => l.account && !l.debit && !l.credit);
    if (i < 0 || totals.gap === 0n) return;
    const v = money(totals.gap < 0n ? -totals.gap : totals.gap, dec);
    set(i, totals.gap > 0n ? { credit: v } : { debit: v });
  };

  if (!company) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Saisie d’écriture" sub="Grille classique, modèles d’écritures — contrôles bloquants appliqués à la validation">
        <select className="input w-64" onChange={(e) => applyTemplate(e.target.value)} defaultValue="">
          <option value="" disabled>Modèle d’écriture…</option>
          <option value="loyer">Loyer</option>
          <option value="electricite">Facture d’électricité</option>
          <option value="achat_tva">Achat avec TVA</option>
          <option value="vente_tva">Vente avec TVA</option>
          <option value="caisse_banque">Versement caisse → banque</option>
          <option value="mobile_money">Encaissement mobile money</option>
        </select>
      </PageTitle>
      <div className="card grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <label className="label">Journal</label>
          <select className="input" value={journalCode} onChange={(e) => setJournal(e.target.value)}>
            {journals.data?.filter((j) => j.type !== 'AN' && j.type !== 'IA').map((j) => (
              <option key={j.code} value={j.code}>{j.code} — {j.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={dt} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Pièce justificative *</label>
          <input className="input" value={pieceRef} onChange={(e) => setPiece(e.target.value)} placeholder="N° de facture, reçu…" />
        </div>
        <div>
          <label className="label">Libellé *</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-44">Compte</th>
              <th className="w-52">Tiers / analytique</th>
              <th>Libellé de ligne</th>
              <th className="w-40 text-right">Débit ({company.currency})</th>
              <th className="w-40 text-right">Crédit ({company.currency})</th>
              <th className="w-28"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="align-top">
                <td><AccountInput value={l.account} onChange={(v) => set(i, { account: v })} /></td>
                <td>
                  {collective(l.account) ? (
                    <select className={`input ${!l.thirdPartyId ? 'border-amber-400' : ''}`} value={l.thirdPartyId} onChange={(e) => set(i, { thirdPartyId: e.target.value })}>
                      <option value="">Tiers obligatoire…</option>
                      {tps.data?.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                    </select>
                  ) : /^[678]/.test(l.account) && centres.length > 0 ? (
                    <select className="input" title="Code analytique" value={l.analytic} onChange={(e) => set(i, { analytic: e.target.value })}>
                      <option value="">Analytique : clé de répartition</option>
                      {centres.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td>
                  <input className="input" value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
                  {l.fx && (
                    <div className="mt-1 grid grid-cols-4 gap-1">
                      <select className="input" value={l.fx.currency} onChange={(e) => set(i, { fx: { ...l.fx!, currency: e.target.value } })}>
                        <option>USD</option><option>EUR</option>
                      </select>
                      <input className="input" placeholder="Montant devise" value={l.fx.foreignAmount} onChange={(e) => set(i, { fx: { ...l.fx!, foreignAmount: e.target.value } })} />
                      <input className="input" placeholder="Cours" value={l.fx.rate} onChange={(e) => set(i, { fx: { ...l.fx!, rate: e.target.value } })} />
                      <input className="input" placeholder="Source (BCC)" value={l.fx.rateSource} onChange={(e) => set(i, { fx: { ...l.fx!, rateSource: e.target.value } })} />
                    </div>
                  )}
                </td>
                <td><input className="input num text-right" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} /></td>
                <td><input className="input num text-right" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} /></td>
                <td className="whitespace-nowrap text-right">
                  <button className="text-xs text-turquoise-700 hover:underline" onClick={() => set(i, { fx: l.fx ? null : { currency: 'USD', foreignAmount: '', rate: '', rateSource: 'BCC', rateDate: dt } })}>
                    {l.fx ? '− devise' : '+ devise'}
                  </button>{' '}
                  <button className="text-xs text-red-600 hover:underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 2}>
                    Suppr.
                  </button>
                </td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={3}>
                <button className="btn-ghost mr-2" onClick={() => setLines((ls) => [...ls, empty()])}>+ Ligne</button>
                <button className="btn-ghost" onClick={balance} disabled={totals.gap === 0n}>Équilibrer</button>
              </td>
              <td className="text-right"><Money v={totals.d} dec={dec} /></td>
              <td className="text-right"><Money v={totals.c} dec={dec} /></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div className={`mt-3 rounded-md px-4 py-2 text-sm font-semibold ${totals.gap === 0n && totals.d > 0n ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          Équilibre Σ Débit – Σ Crédit : <Money v={totals.gap} dec={dec} /> {company.currency} {totals.invalid && ' — montant invalide'}
          {totals.gap === 0n && totals.d > 0n ? ' ✓ écriture équilibrée' : ''}
        </div>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="flex gap-3">
        <button className="btn-ghost" disabled={save.isPending} onClick={() => save.mutate(false)}>Enregistrer en brouillon</button>
        <button className="btn-primary" disabled={save.isPending || totals.gap !== 0n || totals.d === 0n} onClick={() => save.mutate(true)}>
          Valider l’écriture
        </button>
      </div>
      <p className="text-xs text-slate-500">Une écriture validée est définitive : elle ne peut être corrigée que par contre-passation (inaltérabilité, AUDCIF).</p>
    </div>
  );
}
