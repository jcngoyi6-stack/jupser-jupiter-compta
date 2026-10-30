'use client';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { PageTitle } from '@/components/ui';
import Dashboard from './Dashboard';
import Parametrage from './Parametrage';
import Periode from './Periode';
import Outils from './Outils';

const TABS = [
  ['periode', 'Calcul des coûts et résultats'],
  ['tableau', 'Tableau de bord'],
  ['parametrage', 'Paramétrage'],
  ['outils', 'Coûts partiels, ABC et contrôle de gestion'],
] as const;

export default function Analytique() {
  const { company } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('periode');
  if (!company) return null;
  return (
    <div className="space-y-4">
      <PageTitle title="Comptabilité analytique de gestion" sub={`${company.name} — coûts complets par centres d’analyse, coûts partiels, ABC, coûts préétablis ; journal en classe 9 (comptes 92 à 99) du SYSCOHADA révisé`}>
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(k)}>{l}</button>)}
      </PageTitle>
      {tab === 'periode' && <Periode />}
      {tab === 'tableau' && <Dashboard />}
      {tab === 'parametrage' && <Parametrage />}
      {tab === 'outils' && <Outils />}
    </div>
  );
}
