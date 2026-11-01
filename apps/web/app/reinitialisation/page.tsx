'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, errorText } from '@/lib/api';

function Reset() {
  const token = useSearchParams().get('jeton') ?? '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pw !== confirm) return setErr('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      await api('/auth/password/reset', { method: 'POST', body: { token, password: pw } });
      setDone(true);
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-nuit p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <img src="/brand/icone_Jupiter_Compta.svg" alt="" className="mx-auto h-14 w-14" />
        <h1 className="mt-2 text-center">Nouveau mot de passe</h1>
        {done ? (
          <>
            <p className="mt-6 rounded bg-green-50 px-3 py-2 text-sm text-green-800">Mot de passe modifié. Vos sessions ouvertes ont été fermées par sécurité.</p>
            <a href="/connexion" className="btn-primary mt-6 block w-full text-center">Se connecter</a>
          </>
        ) : !token ? (
          <p className="mt-6 rounded bg-red-50 px-3 py-2 text-sm text-red-700">Lien incomplet : utilisez le lien reçu par courriel, ou <a href="/mot-de-passe-oublie" className="underline">faites une nouvelle demande</a>.</p>
        ) : (
          <>
            <label className="label mt-6" htmlFor="pw">Nouveau mot de passe</label>
            <input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <label className="label mt-4" htmlFor="pw2">Confirmation</label>
            <input id="pw2" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <p className="mt-2 text-xs text-slate-500">12 caractères au moins, avec minuscules, majuscules et chiffres.</p>
            {err && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
          </>
        )}
      </form>
    </div>
  );
}

export default function Page() {
  return <Suspense><Reset /></Suspense>;
}
