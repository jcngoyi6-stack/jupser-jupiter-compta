export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Appel à l'API (même origine, cookie de session httpOnly, en-tête anti-CSRF). */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'JupiterCompta' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!res.ok) {
    if (typeof window !== 'undefined') {
      if (res.status === 401 && !path.startsWith('/auth/')) window.location.href = '/connexion';
      if (res.status === 403 && data?.code === 'MFA_REQUISE') window.location.href = '/connexion?etape=mfa';
    }
    throw new ApiError(res.status, data?.code ?? 'ERREUR', data?.message ?? 'Erreur', data?.details ?? data?.issues);
  }
  return data as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const det = Array.isArray(e.details) ? e.details.map((d: any) => (d.line ? `Ligne ${d.line} : ` : '') + (d.message ?? d.path)).join(' · ') : '';
    return det ? `${e.message} ${det}` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
