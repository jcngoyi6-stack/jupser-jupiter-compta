'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from './session';

export interface Account {
  number: string;
  label: string;
  usageLabel?: string | null;
  imputable: boolean;
  collective: boolean;
  active: boolean;
}

export function useAccounts() {
  const { company } = useSession();
  return useQuery({
    queryKey: ['accounts', company?.id, 'imputable'],
    queryFn: () => api<Account[]>(`/companies/${company!.id}/accounts?imputable=true`),
    enabled: !!company,
    staleTime: 300_000,
  });
}

export function useThirdParties() {
  const { company } = useSession();
  return useQuery({ queryKey: ['third-parties', company?.id], queryFn: () => api<any[]>(`/companies/${company!.id}/third-parties`), enabled: !!company });
}

/** Saisie d'un compte : on tape « 571 » ou un mot du libellé ; la liste propose les comptes imputables. */
export function AccountInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const accounts = useAccounts();
  const known = accounts.data?.find((a) => a.number === value);
  return (
    <div>
      <input
        id={id}
        className={`input num ${value && !known ? 'border-red-400' : ''}`}
        list="jc-accounts"
        value={value}
        placeholder="Compte"
        onChange={(e) => onChange(e.target.value.split(' ')[0]!.replace(/\D/g, '').slice(0, 6))}
        onBlur={(e) => {
          const v = e.target.value.replace(/\D/g, '');
          if (v && v.length < 6) onChange(v.padEnd(6, '0'));
        }}
      />
      <div className="mt-0.5 truncate text-[11px] text-slate-500">{known ? known.usageLabel ?? known.label : value ? 'Compte inconnu ou non imputable' : ''}</div>
      <datalist id="jc-accounts">
        {accounts.data?.map((a) => (
          <option key={a.number} value={a.number}>
            {a.usageLabel ?? a.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}
