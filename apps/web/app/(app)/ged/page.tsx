'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export default function Ged() {
  const { company, dec } = useSession();
  const { run, msg } = useAction();
  const [q, setQ] = useState('');
  const docs = useQuery({ queryKey: ['ged', q], queryFn: () => api<any[]>(`/ged/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  const upload = async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const text = file.type.startsWith('text/') ? await file.text() : '';
    run({ path: '/ged/documents', body: { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64: btoa(bin), text, companyId: company?.id }, ok: (r) => `Document classé : ${r.category} — conservation jusqu’au ${date(r.retentionUntil)}.` });
  };
  const open = async (id: string) => {
    const d = await api<any>(`/ged/documents/${id}/content`);
    const a = document.createElement('a');
    a.href = `data:${d.mimeType};base64,${d.base64}`;
    a.download = d.fileName;
    a.click();
  };
  return (
    <div className="space-y-4">
      <PageTitle title="Archivage électronique (GED)" sub="Classement automatique, recherche plein texte, empreinte SHA-256 et horodatage, durées de conservation">
        <input className="input w-64" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="btn-primary cursor-pointer">Déposer<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      </PageTitle>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card overflow-x-auto p-0"><table className="table"><thead><tr><th>Document</th><th>Catégorie</th><th>Date</th><th className="text-right">Montant</th><th>Mots-clés</th><th>Conservation</th><th>Empreinte</th><th></th></tr></thead>
        <tbody>{docs.data?.map((d) => <tr key={d.id}><td>{d.title}</td><td>{d.category}</td><td>{date(d.docDate)}</td><td className="text-right">{d.amount && <Money v={d.amount} dec={dec} />}</td><td className="text-xs">{d.tags.join(', ')}</td><td>{date(d.retentionUntil)}</td><td className="font-mono text-[10px]">{d.sha256.slice(0, 12)}…</td><td><button className="btn-ghost px-2 py-1 text-xs" onClick={() => open(d.id)}>Ouvrir</button></td></tr>)}</tbody></table></div>
    </div>
  );
}
