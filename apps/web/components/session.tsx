'use client';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DECIMALS } from '@/lib/format';

export interface Me {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  mfa: boolean;
  mfaEnabled: boolean;
  isStaff: boolean;
  tenant: { id: string; name: string; type: string; edition: string; modules: string[] };
}
export interface Company {
  id: string;
  name: string;
  currency: string;
  country: string;
  system: string;
  legalForm: string;
  taxId?: string;
  rccm?: string;
  logoDataUrl?: string | null;
  fiscalYears: { id: string; label: string; startDate: string; endDate: string; closed: boolean }[];
}

interface Ctx {
  me: Me;
  companies: Company[];
  company: Company | null;
  setCompanyId: (id: string) => void;
  dec: number;
  can: (...roles: string[]) => boolean;
  has: (module: string) => boolean;
}
const SessionCtx = createContext<Ctx | null>(null);

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('Session absente');
  return c;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<Company[]>('/companies'), enabled: !!me.data && me.data.tenant.modules.includes('COMPTABILITE') });
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setCompanyId(localStorage.getItem('jc.company'));
    } catch {}
  }, []);
  if (me.isLoading || !me.data) {
    return <div className="flex h-screen items-center justify-center text-nuit">Chargement…</div>;
  }
  const list = companies.data ?? [];
  const company = list.find((c) => c.id === companyId) ?? list[0] ?? null;
  const value: Ctx = {
    me: me.data,
    companies: list,
    company,
    setCompanyId: (id) => {
      setCompanyId(id);
      try {
        localStorage.setItem('jc.company', id);
      } catch {}
    },
    dec: company ? DECIMALS[company.currency] ?? 2 : 2,
    can: (...roles) => me.data!.roles.includes('ADMIN') || roles.some((r) => me.data!.roles.includes(r)),
    has: (m) => me.data!.tenant.modules.includes(m),
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
