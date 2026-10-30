'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, errorText } from '@/lib/api';

type Step = 'login' | 'code' | 'setup';

function Login() {
  const params = useSearchParams();
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setStep('setup');
    try {
      setSetup(await api('/auth/mfa/setup', { method: 'POST' }));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  useEffect(() => {
    if (params.get('etape') === 'mfa') void startSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (step === 'login') {
        const r = await api<{ stage: string }>('/auth/login', { method: 'POST', body: { email, password } });
        if (r.stage === 'session') window.location.href = '/';
        else if (r.stage === 'mfa_pending') setStep('code');
        else await startSetup();
      } else if (step === 'code') {
        await api('/auth/mfa/verify', { method: 'POST', body: { code } });
        window.location.href = '/';
      } else {
        await api('/auth/mfa/enable', { method: 'POST', body: { code } });
        window.location.href = '/';
      }
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col items-center justify-center bg-white p-10 lg:flex">
        <img src="/brand/logo_jupiter_compta.png" alt="Jupiter Compta — Précision. Conformité. Sérénité." className="w-[420px]" />
        <p className="mt-6 max-w-md text-center text-sm text-slate-500">
          ERP de gestion d’entreprise conforme au SYSCOHADA révisé et à l’Acte uniforme relatif au droit comptable et à l’information financière.
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center bg-nuit p-6">
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
          <img src="/brand/icone_Jupiter_Compta.svg" alt="" className="mx-auto h-14 w-14 lg:hidden" />
          <h1 className="text-center">{step === 'login' ? 'Connexion' : step === 'code' ? 'Double authentification' : 'Activer la double authentification'}</h1>
          {step === 'login' && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="email">E-mail</label>
                <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="pw">Mot de passe</label>
                <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
          )}
          {step === 'code' && <p className="mt-4 text-sm text-slate-600">Saisissez le code à 6 chiffres de votre application d’authentification.</p>}
          {step === 'setup' && (
            <div className="mt-4 text-sm text-slate-600">
              <p>Votre rôle exige la double authentification (comptabilité, paie, fiscalité, administration). Scannez ce code avec Google Authenticator, Microsoft Authenticator ou équivalent :</p>
              {setup && (
                <>
                  <img src={setup.qrDataUrl} alt="QR de configuration" className="mx-auto my-3 h-44 w-44" />
                  <p className="break-all text-center font-mono text-xs">{setup.secret}</p>
                </>
              )}
            </div>
          )}
          {step !== 'login' && (
            <div className="mt-4">
              <label className="label" htmlFor="code">Code</label>
              <input id="code" className="input text-center text-lg tracking-[0.5em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
            </div>
          )}
          {err && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button className="btn-primary mt-6 w-full" disabled={busy}>
            {busy ? '…' : step === 'login' ? 'Se connecter' : 'Valider'}
          </button>
          <p className="mt-6 text-center text-xs text-slate-400">Précision. Conformité. Sérénité.</p>
        </form>
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-300">
          Un logiciel <img src="/brand/logo_jupser.png" alt="JUPSER" className="h-8 rounded bg-white px-1" />
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
