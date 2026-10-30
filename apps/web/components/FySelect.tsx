'use client';
import { useSession } from './session';

export function FySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { company } = useSession();
  return (
    <select className="input w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Exercice en cours</option>
      {company?.fiscalYears.map((f) => (
        <option key={f.id} value={f.id}>
          Exercice {f.label} {f.closed ? '(clôturé)' : ''}
        </option>
      ))}
    </select>
  );
}
