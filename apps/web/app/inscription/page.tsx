'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

const EDITIONS = [
  ['TPE', 'TPE / SMT — trésorerie, factures, états SMT (2 utilisateurs)'],
  ['ESSENTIEL', 'Essentiel — comptabilité générale complète'],
  ['PRO', 'Pro — + fiscalité, analyse, budget, stocks, analytique'],
  ['ERP', 'Entreprise — tous les modules, multi-sociétés, consolidation'],
] as const;

/** Inscription à l'essai gratuit de 30 jours, sans carte bancaire. */
export default function Inscription() {
  const [f, setF] = useState({ organisation: '', type: 'ENTREPRISE', edition: 'PRO', fullName: '', email: '', phone: '', password: '', confirm: '', acceptTerms: false, website: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ trialEndsAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (f.password !== f.confirm) return setErr('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      const { confirm: _c, website, phone, ...rest } = f;
      setDone(await api<{ trialEndsAt: string }>('/signup', { method: 'POST', body: { ...rest, ...(phone ? { phone } : {}), ...(website ? { website } : {}) } }));
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-nuit p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <img src="/brand/icone_Jupiter_Compta.svg" alt="" className="mx-auto h-14 w-14" />
        <h1 className="mt-2 text-center">Essai gratuit de 30 jours</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Sans carte bancaire. Comptabilité SYSCOHADA révisé et gestion intégrée.</p>
        {done ? (
          <div className="mt-6 space-y-4 text-sm">
            <p className="rounded bg-green-50 px-3 py-2 text-green-800">Votre espace est prêt. L’essai court jusqu’au {done.trialEndsAt.split('-').reverse().join('/')}.</p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-700">
              <li>Connectez-vous avec votre adresse et votre mot de passe.</li>
              <li>Activez la double authentification (application Google Authenticator, Microsoft Authenticator…).</li>
              <li>Créez votre société avec l’assistant : pays, monnaie de tenue, système comptable.</li>
            </ol>
            <a href="/connexion" className="btn-primary block w-full text-center">Se connecter</a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <div><label className="label" htmlFor="org">Entreprise ou cabinet</label><input id="org" className="input" value={f.organisation} onChange={(e) => set({ organisation: e.target.value })} required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="type">Vous êtes</label>
                <select id="type" className="input" value={f.type} onChange={(e) => set({ type: e.target.value })}><option value="ENTREPRISE">Entreprise ou organisation</option><option value="CABINET">Cabinet d’expertise comptable</option></select></div>
              <div><label className="label" htmlFor="ed">Édition à essayer</label>
                <select id="ed" className="input" value={f.edition} onChange={(e) => set({ edition: e.target.value })}>{EDITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="fn">Nom et prénom</label><input id="fn" className="input" value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} required /></div>
              <div><label className="label" htmlFor="ph">Téléphone (facultatif)</label><input id="ph" className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
            </div>
            <div><label className="label" htmlFor="em">E-mail professionnel</label><input id="em" type="email" autoComplete="username" className="input" value={f.email} onChange={(e) => set({ email: e.target.value })} required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="pw">Mot de passe</label><input id="pw" type="password" autoComplete="new-password" className="input" value={f.password} onChange={(e) => set({ password: e.target.value })} required /></div>
              <div><label className="label" htmlFor="pw2">Confirmation</label><input id="pw2" type="password" autoComplete="new-password" className="input" value={f.confirm} onChange={(e) => set({ confirm: e.target.value })} required /></div>
            </div>
            <p className="text-xs text-slate-500">12 caractères au moins, avec minuscules, majuscules et chiffres.</p>
            {/* Champ piège pour les robots : invisible et ignoré par les personnes */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.website} onChange={(e) => set({ website: e.target.value })} />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={f.acceptTerms} onChange={(e) => set({ acceptTerms: e.target.checked })} required />
              <span>J’accepte les conditions générales d’utilisation et la politique de confidentialité de JUPSER.</span></label>
            {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Créer mon espace d’essai'}</button>
            <p className="text-center text-sm">Déjà inscrit ? <a href="/connexion" className="text-turquoise-700">Se connecter</a></p>
          </form>
        )}
      </div>
    </div>
  );
}
