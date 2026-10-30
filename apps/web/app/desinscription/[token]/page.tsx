'use client';
import { use, useState } from 'react';

export default function Desinscription({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [done, setDone] = useState<boolean | null>(null);
  const go = async () => {
    const r = await fetch(`/api/unsubscribe/${token}`, { method: 'POST' });
    setDone((await r.json()).ok);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="card max-w-md text-center">
        <img src="/brand/icone_Jupiter_Compta.svg" alt="" className="mx-auto h-12" />
        <h1 className="mt-3">Désinscription</h1>
        {done === null && <><p className="mt-3 text-sm">Vous ne recevrez plus de messages commerciaux de cet expéditeur.</p><button className="btn-primary mt-4" onClick={go}>Confirmer la désinscription</button></>}
        {done === true && <p className="mt-3 font-semibold text-emerald-700">Votre désinscription est enregistrée.</p>}
        {done === false && <p className="mt-3 text-red-700">Lien invalide ou expiré.</p>}
      </div>
    </div>
  );
}
