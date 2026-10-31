'use client';
import { Fragment, useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Empty, Money, PageTitle, Status } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { DECIMALS, date } from '@/lib/format';

interface IcLine { description: string; quantity: number; net: string; account: string; itemId: string | null }
interface Ic { id: string; number: string; date: string; status: string; sellerName: string; buyerName: string; totalNet: string; totalVat: string; totalGross: string; reason: string | null; lines: IcLine[] }
interface Choice { account: string; itemId: string; warehouseId: string }

/** Factures intragroupe : liaison des sociétés du groupe, boîte de réception, acceptation ou refus motivé. */
export default function Intragroupe() {
  const { company, companies } = useSession();
  const dec = DECIMALS[company?.currency ?? 'XOF'] ?? 2;
  const [data, setData] = useState<{ incoming: Ic[]; outgoing: Ic[] } | null>(null);
  const [items, setItems] = useState<{ id: string; code: string; label: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; label?: string; name?: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [reason, setReason] = useState('');
  const [sister, setSister] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const sisters = (companies ?? []).filter((c) => c.id !== company?.id);

  const load = () => company && api<{ incoming: Ic[]; outgoing: Ic[] }>(`/companies/${company.id}/intercompany-invoices`).then(setData).catch((e) => setMsg({ kind: 'error', text: errorText(e) }));
  useEffect(() => {
    load();
    if (company) {
      api<any[]>(`/companies/${company.id}/stock/items`).then(setItems).catch(() => setItems([]));
      api<any[]>(`/companies/${company.id}/stock/warehouses`).then(setWarehouses).catch(() => setWarehouses([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);
  if (!company) return null;

  const start = (ic: Ic) => { setOpen(ic.id); setReason(''); setChoices(ic.lines.map((l) => ({ account: l.account.startsWith('701') ? '601100' : '632800', itemId: '', warehouseId: '' }))); };
  const act = (path: string, body: unknown, ok: string) => api(`/companies/${company.id}/intercompany-invoices/${path}`, { method: 'POST', body })
    .then(() => { setMsg({ kind: 'ok', text: ok }); setOpen(null); load(); }).catch((e) => setMsg({ kind: 'error', text: errorText(e) }));

  return (
    <div className="space-y-4">
      <PageTitle title="Opérations intragroupe" sub={`${company.name} — factures entre sociétés du groupe : réception, acceptation ou refus, élimination en consolidation`} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="card space-y-2">
        <h2 className="font-semibold">Relier une société du groupe</h2>
        <p className="text-sm opacity-75">Chaque société devient client (4112) et fournisseur (4012) de l’autre. Toute facture émise à ce client est transmise à la société destinataire pour acceptation.</p>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={sister} onChange={(e) => setSister(e.target.value)}><option value="">— société —</option>{sisters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className="btn-primary" disabled={!sister} onClick={() => api(`/companies/${company.id}/group-links`, { method: 'POST', body: { sisterCompanyId: sister } }).then(() => setMsg({ kind: 'ok', text: 'Sociétés reliées : les tiers « société du groupe » sont créés dans les deux dossiers.' })).catch((e) => setMsg({ kind: 'error', text: errorText(e) }))}>Relier</button>
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Factures reçues des sociétés du groupe</h2>
        {!data?.incoming.length ? <Empty>Aucune facture intragroupe reçue.</Empty> : (
          <table className="table text-sm">
            <thead><tr><th>N°</th><th>Date</th><th>Émetteur</th><th className="text-right">TTC</th><th>Statut</th><th></th></tr></thead>
            <tbody>{data.incoming.map((ic) => (
              <Fragment key={ic.id}>
                <tr>
                  <td>{ic.number}</td><td>{date(ic.date)}</td><td>{ic.sellerName}</td><td className="text-right"><Money v={ic.totalGross} dec={dec} /></td>
                  <td><Status s={ic.status} />{ic.reason && <div className="text-xs opacity-70">{ic.reason}</div>}</td>
                  <td>{ic.status === 'EN_ATTENTE' && <button className="btn-ghost" onClick={() => start(ic)}>Traiter</button>}</td>
                </tr>
                {open === ic.id && (
                  <tr><td colSpan={6}>
                    <div className="space-y-2 rounded border p-3">
                      {ic.lines.map((l, i) => (
                        <div key={i} className="grid gap-2 md:grid-cols-[1fr_8rem_12rem_10rem]">
                          <div className="text-sm">{l.description} — {l.quantity} × · <Money v={l.net} dec={dec} /> HT</div>
                          <input className="input font-mono" title="Compte de charge, de stock ou d’immobilisation" value={choices[i]?.account ?? ''} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? { ...c, account: e.target.value } : c)))} />
                          <select className="input" value={choices[i]?.itemId ?? ''} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? { ...c, itemId: e.target.value } : c)))}><option value="">(pas d’entrée en stock)</option>{items.map((it) => <option key={it.id} value={it.id}>{it.code} — {it.label}</option>)}</select>
                          <select className="input" value={choices[i]?.warehouseId ?? ''} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? { ...c, warehouseId: e.target.value } : c)))}><option value="">dépôt</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label ?? w.name ?? w.id}</option>)}</select>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-end gap-2">
                        <button className="btn-primary" onClick={() => act(`${ic.id}/accept`, { lines: choices.map((c) => ({ account: c.account, ...(c.itemId ? { itemId: c.itemId, warehouseId: c.warehouseId || undefined } : {}) })) }, 'Facture acceptée : écriture d’achat créée en brouillon dans le journal ACH, à valider.')}>Accepter</button>
                        <input className="input w-80" placeholder="Motif du refus" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <button className="btn-ghost" disabled={reason.length < 5} onClick={() => act(`${ic.id}/reject`, { reason }, 'Facture refusée : l’émetteur en est informé.')}>Refuser</button>
                      </div>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Factures émises vers les sociétés du groupe</h2>
        {!data?.outgoing.length ? <Empty>Aucune facture intragroupe émise. Émettez une facture (menu Factures) à un client « société du groupe ».</Empty> : (
          <table className="table text-sm">
            <thead><tr><th>N°</th><th>Date</th><th>Destinataire</th><th className="text-right">TTC</th><th>Statut</th></tr></thead>
            <tbody>{data.outgoing.map((ic) => (
              <tr key={ic.id}><td>{ic.number}</td><td>{date(ic.date)}</td><td>{ic.buyerName}</td><td className="text-right"><Money v={ic.totalGross} dec={dec} /></td>
                <td><Status s={ic.status} />{ic.status === 'REJETEE' && <div className="text-xs text-red-700">Refusée : {ic.reason} — annulez-la par un avoir (menu Factures).</div>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
