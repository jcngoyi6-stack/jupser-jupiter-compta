'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { money } from '@/lib/format';

const COUNTRIES: [string, string][] = [['CD', 'République démocratique du Congo'], ['CI', 'Côte d’Ivoire'], ['SN', 'Sénégal'], ['CM', 'Cameroun'], ['GA', 'Gabon'], ['BJ', 'Bénin'], ['BF', 'Burkina Faso'], ['ML', 'Mali'], ['NE', 'Niger'], ['TG', 'Togo'], ['TD', 'Tchad'], ['CF', 'Centrafrique'], ['CG', 'Congo'], ['GQ', 'Guinée équatoriale'], ['GN', 'Guinée'], ['GW', 'Guinée-Bissau'], ['KM', 'Comores']];

/** Assistant d'ouverture (docs/14) : identité, activité et système (normal/SMT), exercice. */
export default function Nouvelle() {
  const router = useRouter();
  const qc = useQueryClient();
  const { setCompanyId } = useSession();
  const year = new Date().getUTCFullYear();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({
    name: '', legalForm: 'SARL', country: 'CD', rccm: '', taxId: '', nationalId: '', employerNo: '', address: '', sector: '',
    activity: 'SERVICES', expectedTurnover: '', eurRate: '', systemChoice: '', newCompany: false, creationDate: '', fiscalYearStart: `${year}-01-01`, fiscalYearEnd: `${year}-12-31`, shareCapital: '', headcount: '1', logoDataUrl: '',
  });
  const [smt, setSmt] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const assess = useMutation({
    mutationFn: () => api<any>('/companies/smt-assessment', { method: 'POST', body: { country: f.country, activity: f.activity, expectedTurnover: f.expectedTurnover || '0', eurRate: f.eurRate || undefined } }),
    onSuccess: (r) => { setSmt(r); setStep(3); },
    onError: (e) => setMsg(errorText(e)),
  });
  const create = useMutation({
    mutationFn: () =>
      api<any>('/companies', {
        method: 'POST',
        body: {
          name: f.name, legalForm: f.legalForm, country: f.country, activity: f.activity, expectedTurnover: f.expectedTurnover || '0',
          rccm: f.rccm || undefined, taxId: f.taxId || undefined, nationalId: f.nationalId || undefined, employerNo: f.employerNo || undefined, address: f.address || undefined, sector: f.sector || undefined,
          eurRate: f.eurRate || undefined, systemChoice: f.systemChoice || undefined, shareCapital: f.shareCapital || undefined, headcount: Number(f.headcount) || 1,
          ...(f.newCompany ? { creationDate: f.creationDate } : { fiscalYearStart: f.fiscalYearStart, fiscalYearEnd: f.fiscalYearEnd }),
          logoDataUrl: f.logoDataUrl || undefined,
        },
      }),
    onSuccess: (r) => { setCompanyId(r.company.id); qc.invalidateQueries(); router.push('/'); },
    onError: (e) => setMsg(errorText(e)),
  });
  const onLogo = (file?: File) => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => set({ logoDataUrl: String(rd.result) });
    rd.readAsDataURL(file);
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title="Ouvrir un dossier" sub={`Étape ${step} / 4`} />
      {msg && <Alert>{msg}</Alert>}
      {step === 1 && (
        <div className="card grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Dénomination *</label><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div><label className="label">Forme juridique</label><select className="input" value={f.legalForm} onChange={(e) => set({ legalForm: e.target.value })}>{['SARL', 'SARLU', 'SA', 'SAS', 'SASU', 'SNC', 'SCS', 'GIE', 'Entreprise individuelle', 'Coopérative', 'Établissement public'].map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label className="label">Pays</label><select className="input" value={f.country} onChange={(e) => set({ country: e.target.value })}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div>
          <div><label className="label">RCCM</label><input className="input" value={f.rccm} onChange={(e) => set({ rccm: e.target.value })} /></div>
          <div><label className="label">Identification nationale</label><input className="input" value={f.nationalId} onChange={(e) => set({ nationalId: e.target.value })} /></div>
          <div><label className="label">NIF</label><input className="input" value={f.taxId} onChange={(e) => set({ taxId: e.target.value })} /></div>
          <div><label className="label">N° d’employeur (CNSS)</label><input className="input" value={f.employerNo} onChange={(e) => set({ employerNo: e.target.value })} /></div>
          <div className="col-span-2"><label className="label">Adresse</label><input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} /></div>
          <div className="col-span-2"><label className="label">Logo (apparaîtra sur vos documents)</label><input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => onLogo(e.target.files?.[0])} />{f.logoDataUrl && <img src={f.logoDataUrl} alt="" className="mt-2 h-14" />}</div>
          <div className="col-span-2 text-right"><button className="btn-primary" disabled={!f.name} onClick={() => setStep(2)}>Suivant</button></div>
        </div>
      )}
      {step === 2 && (
        <div className="card grid grid-cols-2 gap-3">
          <div><label className="label">Activité principale</label><select className="input" value={f.activity} onChange={(e) => set({ activity: e.target.value })}><option value="NEGOCE">Négoce</option><option value="ARTISANAT">Artisanat et assimilés</option><option value="SERVICES">Services</option></select></div>
          <div><label className="label">Secteur</label><input className="input" value={f.sector} onChange={(e) => set({ sector: e.target.value })} /></div>
          <div><label className="label">Chiffre d’affaires HT annuel prévu (monnaie locale)</label><input className="input" value={f.expectedTurnover} onChange={(e) => set({ expectedTurnover: e.target.value })} /></div>
          {!['CI', 'SN', 'BJ', 'BF', 'ML', 'NE', 'TG', 'GW', 'CM', 'GA', 'TD', 'CF', 'CG', 'GQ'].includes(f.country) && (
            <div><label className="label">Cours 1 EUR = ? (banque centrale)</label><input className="input" value={f.eurRate} onChange={(e) => set({ eurRate: e.target.value })} placeholder="Cours BCC du jour" /></div>
          )}
          <div className="col-span-2 flex justify-between"><button className="btn-ghost" onClick={() => setStep(1)}>Retour</button><button className="btn-primary" onClick={() => assess.mutate()}>Évaluer le système comptable</button></div>
        </div>
      )}
      {step === 3 && smt && (
        <div className="card space-y-3">
          <h2>Système comptable</h2>
          <Alert kind="info">
            Devise de tenue imposée : <b>{smt.currency}</b> (monnaie ayant cours légal). {smt.calc}
            {smt.thresholdLocal && <> Seuil : {money(smt.thresholdLocal)} {smt.currency}.</>}
          </Alert>
          {smt.eligible !== null && <Alert kind={smt.eligible ? 'ok' : 'warn'}>{smt.explanation}</Alert>}
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={f.systemChoice !== 'SMT'} onChange={() => set({ systemChoice: 'NORMAL' })} /> Système normal</label>
            <label className={`flex items-center gap-2 ${smt.eligible ? '' : 'opacity-40'}`}><input type="radio" disabled={!smt.eligible} checked={f.systemChoice === 'SMT'} onChange={() => set({ systemChoice: 'SMT' })} /> Système minimal de trésorerie (SMT)</label>
          </div>
          <div className="flex justify-between"><button className="btn-ghost" onClick={() => setStep(2)}>Retour</button><button className="btn-primary" onClick={() => setStep(4)}>Suivant</button></div>
        </div>
      )}
      {step === 4 && (
        <div className="card grid grid-cols-2 gap-3">
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.newCompany} onChange={(e) => set({ newCompany: e.target.checked })} /> Société nouvellement créée (premier exercice proposé selon la date de création)</label>
          {f.newCompany ? (
            <div><label className="label">Date de création</label><input type="date" className="input" value={f.creationDate} onChange={(e) => set({ creationDate: e.target.value })} /></div>
          ) : (
            <>
              <div><label className="label">Début d’exercice</label><input type="date" className="input" value={f.fiscalYearStart} onChange={(e) => set({ fiscalYearStart: e.target.value })} /></div>
              <div><label className="label">Fin d’exercice</label><input type="date" className="input" value={f.fiscalYearEnd} onChange={(e) => set({ fiscalYearEnd: e.target.value })} /></div>
            </>
          )}
          <div><label className="label">Capital social</label><input className="input" value={f.shareCapital} onChange={(e) => set({ shareCapital: e.target.value })} /></div>
          <div><label className="label">Effectif</label><input className="input" value={f.headcount} onChange={(e) => set({ headcount: e.target.value })} /></div>
          <p className="col-span-2 text-xs text-slate-500">Le plan comptable SYSCOHADA révisé (comptes à 6 chiffres) et les journaux types (achats, ventes, banque, caisse, mobile money, OD, paie, à-nouveaux) seront créés automatiquement.</p>
          <div className="col-span-2 flex justify-between"><button className="btn-ghost" onClick={() => setStep(3)}>Retour</button><button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>Ouvrir le dossier</button></div>
        </div>
      )}
    </div>
  );
}
