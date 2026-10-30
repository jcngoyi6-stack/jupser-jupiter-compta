'use client';
import { money } from '@/lib/format';

export function Money({ v, dec = 2, className = '' }: { v: string | bigint | number | null | undefined; dec?: number; className?: string }) {
  const s = money(v as string, dec, { blankZero: false });
  const neg = s.startsWith('-');
  return <span className={`num whitespace-nowrap ${neg ? 'text-red-700' : ''} ${className}`}>{s}</span>;
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  const c = { error: 'border-red-300 bg-red-50 text-red-800', ok: 'border-emerald-300 bg-emerald-50 text-emerald-800', warn: 'border-amber-300 bg-amber-50 text-amber-800', info: 'border-turquoise-100 bg-turquoise-50 text-nuit' }[kind];
  return <div className={`rounded-md border px-4 py-2 text-sm ${c}`}>{children}</div>;
}

export function Status({ s }: { s: string }) {
  const m: Record<string, string> = {
    VALIDE: 'bg-emerald-100 text-emerald-800',
    BROUILLON: 'bg-slate-200 text-slate-700',
    BROUILLON_IA: 'bg-turquoise-100 text-turquoise-700',
    CONTREPASSE: 'bg-amber-100 text-amber-800',
    EMISE: 'bg-emerald-100 text-emerald-800',
    ANNULEE: 'bg-red-100 text-red-800',
    A_VALIDER: 'bg-amber-100 text-amber-800',
  };
  const label: Record<string, string> = { BROUILLON_IA: 'Brouillon IA', CONTREPASSE: 'Contre-passée', VALIDE: 'Validée', BROUILLON: 'Brouillon', A_VALIDER: 'À valider', ANNULEE: 'Annulée', EMISE: 'Émise' };
  return <span className={`badge ${m[s] ?? 'bg-slate-100 text-slate-700'}`}>{label[s] ?? s}</span>;
}

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      <div className="no-print flex gap-2">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-1 text-xl font-bold text-nuit">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}
