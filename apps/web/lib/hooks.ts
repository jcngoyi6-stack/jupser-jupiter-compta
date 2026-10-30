'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from './api';

/** Mutation standard : appelle l'API, rafraîchit les données et expose un message. */
export function useAction() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const m = useMutation({
    mutationFn: (a: { path: string; method?: string; body?: unknown; ok?: string | ((r: any) => string) }) => api(a.path, { method: a.method ?? 'POST', body: a.body }).then((r) => ({ r, a })),
    onSuccess: ({ r, a }) => {
      setMsg({ kind: 'ok', text: typeof a.ok === 'function' ? a.ok(r) : a.ok ?? 'Enregistré.' });
      qc.invalidateQueries();
    },
    onError: (e) => setMsg({ kind: 'error', text: errorText(e) }),
  });
  return { run: m.mutate, runAsync: m.mutateAsync, msg, setMsg, pending: m.isPending };
}

export const qty = (milli: string | bigint) => {
  const v = BigInt(milli);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const s = (a / 1000n).toString() + (a % 1000n ? ',' + (a % 1000n).toString().padStart(3, '0').replace(/0+$/, '') : '');
  return (neg ? '-' : '') + s;
};
