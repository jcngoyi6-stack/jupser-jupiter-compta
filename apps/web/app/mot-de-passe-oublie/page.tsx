'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

/** Demande d'un lien de réinitialisation du mot de passe. */
export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      setDone((await api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { email } })).message);
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
        <h1 className="mt-2 text-center">Mot de passe oublié</h1>
        {done ? (
          <p className="mt-6 rounded bg-green-50 px-3 py-2 text-sm text-green-800">{done} Pensez à vérifier les courriers indésirables. Le lien est valable une heure.</p>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-slate-500">Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
            <label className="label mt-6" htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {err && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? '…' : 'Recevoir le lien'}</button>
          </>
        )}
        <p className="mt-4 text-center text-sm"><a href="/connexion" className="text-turquoise-700">Retour à la connexion</a></p>
      </form>
    </div>
  );
}
