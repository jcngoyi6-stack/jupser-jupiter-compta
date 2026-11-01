'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Kpi, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { date, money } from '@/lib/format';

const STATUS: Record<string, string> = { ESSAI: 'Essai gratuit', ACTIF: 'Actif', IMPAYE: 'Impayé', LECTURE_SEULE: 'Lecture seule (impayé)', SUSPENDU: 'Suspendu', ARCHIVE: 'Archivé' };

export default function Abonnement() {
  const q = useQuery({ queryKey: ['subscription'], queryFn: () => api<any>('/billing/subscription') });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [edition, setEdition] = useState('');
  const pay = useMutation({
    mutationFn: (b: { method: string; months: number }) => api<any>('/billing/checkout', { method: 'POST', body: { ...b, edition } }),
    onSuccess: (r) => {
      if (r.redirectUrl) window.location.href = r.redirectUrl;
      else setMsg({ kind: 'info', text: `${r.instructions} Référence : ${r.payment.externalRef}` });
    },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  const d = q.data;
  if (!d) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Abonnement" sub="Prix = (édition + modules) × utilisateurs actifs — paiement mobile money ou carte" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Édition" value={d.tenant.edition} />
        <Kpi label="Statut" value={STATUS[d.tenant.computedStatus] ?? d.tenant.computedStatus} hint={d.tenant.paidUntil ? `Payé jusqu’au ${date(d.tenant.paidUntil)}` : d.tenant.trialEndsAt ? `Essai jusqu’au ${date(d.tenant.trialEndsAt)}` : ''} />
        <Kpi label="Utilisateurs" value={d.users} />
        <Kpi label="Mensuel / annuel (USD)" value={`${money(d.quote.monthlyUsdCents)} / ${money(d.quote.annualUsdCents)}`} hint="Annuel : 2 mois offerts" />
      </div>
      <div className="card space-y-3">
        <h2>{d.tenant.computedStatus === 'ESSAI' ? 'Passer à l’abonnement payant' : 'Payer'}</h2>
        {d.tenant.computedStatus === 'ESSAI' && <p className="text-sm text-slate-600">Vos données et votre paramétrage sont conservés ; la période payée commence à la fin de l’essai{d.tenant.trialEndsAt ? ` (${date(d.tenant.trialEndsAt)})` : ''} : aucun jour d’essai n’est perdu. L’abonnement est activé automatiquement dès la confirmation du paiement.</p>}
        <label className="text-sm">Édition
          <select className="input w-auto" value={edition || d.tenant.edition} onChange={(e) => setEdition(e.target.value)}>
            <option value="TPE">TPE / SMT</option><option value="ESSENTIEL">Essentiel</option><option value="PRO">Pro</option><option value="ERP">Entreprise (ERP complet)</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-accent" onClick={() => pay.mutate({ method: 'MOBILE_MONEY', months: 1 })}>Mobile money — 1 mois</button>
          <button className="btn-accent" onClick={() => pay.mutate({ method: 'MOBILE_MONEY', months: 12 })}>Mobile money — 12 mois</button>
          <button className="btn-primary" onClick={() => pay.mutate({ method: 'CARTE', months: 12 })}>Carte Visa / Mastercard — 12 mois</button>
        </div>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <p className="text-xs text-slate-500">Prestataire de paiement en mode simulation : le choix final (agrégateur mobile money, carte) se fait après appel d’offres. Aucune donnée de carte n’est stockée par Jupiter Compta. En cas d’impayé, l’accès passe en lecture seule à J+15 (consultation et exports toujours permis).</p>
      </div>
    </div>
  );
}
