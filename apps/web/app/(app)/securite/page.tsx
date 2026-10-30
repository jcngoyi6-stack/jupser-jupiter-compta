'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { createDeviceKey, forgetDevice, loadDevice } from '@/lib/device';
import { date } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export default function Securite() {
  const { can } = useSession();
  const admin = can('ADMIN');
  const { run, msg, setMsg } = useAction();
  const [deviceName, setDeviceName] = useState('');
  const [localId, setLocalId] = useState<string | null>(null);
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api<any[]>('/devices') });
  const settings = useQuery({ queryKey: ['security-settings'], queryFn: () => api<any>('/security/settings'), enabled: admin, retry: false });
  const [f, setF] = useState({ slug: '', ssoEnabled: false, issuer: '', clientId: '', clientSecret: '', domains: '' });
  useEffect(() => { loadDevice().then((d) => setLocalId(d?.id ?? null)); }, []);
  useEffect(() => {
    const s = settings.data;
    if (s) setF({ slug: s.slug ?? '', ssoEnabled: !!s.sso?.enabled, issuer: s.sso?.issuer ?? '', clientId: s.sso?.clientId ?? '', clientSecret: '', domains: (s.sso?.emailDomains ?? []).join(', ') });
  }, [settings.data]);

  const enroll = async () => {
    try {
      const k = await createDeviceKey();
      const r = await api<any>('/devices/enroll', { method: 'POST', body: { name: deviceName || navigator.userAgent.slice(0, 60), publicKeyPem: k.publicKeyPem } });
      await k.save(r.id);
      setLocalId(r.id);
      setMsg({ kind: 'ok', text: r.status === 'ACTIF' ? 'Poste enrôlé et actif.' : 'Poste enrôlé : en attente d’approbation par l’administrateur.' });
      devices.refetch();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof DOMException ? 'Ce navigateur ne prend pas en charge les clés Ed25519 : mettez-le à jour.' : errorText(e) });
    }
  };
  const save = () => run({
    path: '/security/settings', method: 'PUT', ok: 'Paramètres de sécurité enregistrés.',
    body: { slug: f.slug || undefined, sso: f.issuer ? { enabled: f.ssoEnabled, issuer: f.issuer, clientId: f.clientId, clientSecret: f.clientSecret || undefined, emailDomains: f.domains.split(/[,\s]+/).filter(Boolean) } : undefined },
  });

  return (
    <div className="space-y-4">
      <PageTitle title="Sécurité" sub="Postes enrôlés (signature des requêtes), authentification unique (OIDC)" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card space-y-2">
        <h2 className="font-semibold">Ce poste</h2>
        {localId ? (
          <div className="flex items-center gap-3 text-sm">
            <span>Poste enrôlé (identifiant {localId.slice(0, 8)}…).</span>
            <button className="btn-ghost" onClick={async () => { await forgetDevice(); setLocalId(null); }}>Oublier la clé sur ce navigateur</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input className="input" placeholder="Nom du poste (ex. Portable comptabilité)" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
            <button className="btn-primary" onClick={enroll}>Enrôler ce poste</button>
          </div>
        )}
      </div>
      <div className="card p-0">
        <h2 className="p-4 font-semibold">{admin ? 'Postes du locataire' : 'Mes postes'}</h2>
        <table className="table text-sm">
          <thead><tr><th>Nom</th><th>Empreinte</th><th>Statut</th><th>Dernière activité</th><th /></tr></thead>
          <tbody>
            {(devices.data ?? []).map((d) => (
              <tr key={d.id}>
                <td>{d.name}{d.id === localId && ' (ce poste)'}</td><td className="font-mono text-xs">{d.fingerprint.slice(0, 16)}…</td><td><Status s={d.status} /></td><td>{d.lastSeenAt ? date(d.lastSeenAt.slice(0, 10)) : '—'}</td>
                <td className="space-x-2">
                  {admin && d.status === 'EN_ATTENTE' && <button className="text-turquoise underline" onClick={() => run({ path: `/devices/${d.id}/approve`, ok: 'Poste approuvé.' })}>Approuver</button>}
                  {d.status !== 'REVOQUE' && <button className="text-red-700 underline" onClick={() => run({ path: `/devices/${d.id}/revoke`, ok: 'Poste révoqué.' })}>Révoquer</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin && settings.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card space-y-2">
            <h2 className="font-semibold">Postes enrôlés obligatoires</h2>
            <p className="text-sm text-slate-600">Une fois activé, seules les requêtes signées par un poste approuvé sont acceptées. Enrôlez d’abord votre propre poste.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.data.requireEnrolledDevices} onChange={(e) => run({ path: '/security/settings', method: 'PUT', body: { requireEnrolledDevices: e.target.checked }, ok: e.target.checked ? 'Postes enrôlés désormais obligatoires.' : 'Contrôle des postes désactivé.' })} />
              Exiger un poste enrôlé pour tous les utilisateurs
            </label>
          </div>
          <div className="card space-y-2">
            <h2 className="font-semibold">Authentification unique (OIDC)</h2>
            <label className="text-sm">Identifiant du locataire (adresse de connexion)<input className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} /></label>
            <label className="text-sm">Émetteur (issuer)<input className="input" placeholder="https://login.microsoftonline.com/…/v2.0" value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Client ID<input className="input" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} /></label>
              <label className="text-sm">Secret client {settings.data.sso?.hasSecret && '(enregistré)'}<input type="password" className="input" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} /></label>
            </div>
            <label className="text-sm">Domaines autorisés<input className="input" placeholder="societe.cd" value={f.domains} onChange={(e) => setF({ ...f, domains: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ssoEnabled} onChange={(e) => setF({ ...f, ssoEnabled: e.target.checked })} />Activer</label>
            <p className="text-xs text-slate-500">URL de retour à déclarer chez le fournisseur : <code>/api/auth/sso/callback</code>. Seuls les utilisateurs déjà invités peuvent se connecter ; la double authentification est assurée par le fournisseur d’identité.</p>
            <button className="btn-primary" onClick={save}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  );
}
