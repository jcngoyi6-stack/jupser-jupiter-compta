'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FySelect } from '@/components/FySelect';
import { useSession } from '@/components/session';
import { Alert, Money, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

export default function Smt() {
  const { company, dec } = useSession();
  const [fy, setFy] = useState('');
  const q = useQuery({ queryKey: ['smt', company?.id, fy], queryFn: () => api<any>(`/companies/${company!.id}/reports/smt${fy ? `?fiscalYearId=${fy}` : ''}`), enabled: !!company });
  if (!company) return null;
  const d = q.data;
  const M = ({ v }: { v: string }) => <Money v={v} dec={dec} />;
  return (
    <div className="space-y-4">
      <PageTitle title="Système minimal de trésorerie" sub="Bilan et compte de résultat SMT, journal de trésorerie (art. 13 AUDCIF)"><FySelect value={fy} onChange={setFy} /><button className="btn-ghost" onClick={() => window.print()}>Imprimer</button></PageTitle>
      {d && (
        <>
          {!d.controls[0].ok && <Alert>Bilan SMT déséquilibré : vérifier l’inventaire des créances et dettes.</Alert>}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-0"><h2 className="px-4 pt-3">Compte de résultat SMT</h2><table className="table mt-1"><tbody>
              <tr><td>Ventes</td><td className="text-right"><M v={d.recettes.ventes} /></td></tr><tr><td>Autres recettes</td><td className="text-right"><M v={d.recettes.autres} /></td></tr>
              <tr className="total"><td>Total recettes</td><td className="text-right"><M v={d.totalRecettes} /></td></tr>
              {Object.entries({ achats: 'Achats', variationStocks: 'Variation des stocks', chargesExternes: 'Charges externes', impots: 'Impôts et taxes', personnel: 'Charges de personnel', autres: 'Autres charges' }).map(([k, l]) => <tr key={k}><td>{l}</td><td className="text-right"><M v={d.depenses[k]} /></td></tr>)}
              <tr className="total"><td>Total dépenses</td><td className="text-right"><M v={d.totalDepenses} /></td></tr>
              <tr className="total"><td>Résultat</td><td className="text-right"><M v={d.resultat} /></td></tr>
            </tbody></table></div>
            <div className="card p-0"><h2 className="px-4 pt-3">Bilan SMT</h2><table className="table mt-1"><tbody>
              {Object.entries({ immobilisations: 'Immobilisations', stocks: 'Stocks', creances: 'Créances', tresorerie: 'Trésorerie' }).map(([k, l]) => <tr key={k}><td>{l}</td><td className="text-right"><M v={d.actif[k]} /></td></tr>)}
              <tr className="total"><td>Total actif</td><td className="text-right"><M v={d.totalActif} /></td></tr>
              {Object.entries({ capital: 'Capital et réserves', resultat: 'Résultat', emprunts: 'Emprunts', dettes: 'Dettes', tresoreriePassif: 'Trésorerie passif' }).map(([k, l]) => <tr key={k}><td>{l}</td><td className="text-right"><M v={d.passif[k]} /></td></tr>)}
              <tr className="total"><td>Total passif</td><td className="text-right"><M v={d.totalPassif} /></td></tr>
            </tbody></table></div>
          </div>
          <div className="card p-0"><h2 className="px-4 pt-3">Journal de trésorerie</h2><table className="table mt-1"><thead><tr><th>Date</th><th>Compte</th><th>Libellé</th><th className="text-right">Recette</th><th className="text-right">Dépense</th></tr></thead>
            <tbody>{d.treasuryJournal.map((l: any) => <tr key={l.id}><td>{date(l.date)}</td><td className="num">{l.account}</td><td>{l.label}</td><td className="text-right"><M v={l.debit} /></td><td className="text-right"><M v={l.credit} /></td></tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
}
