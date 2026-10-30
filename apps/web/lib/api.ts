import { deviceHeaders } from './device';

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
  const method = opts.method ?? 'GET';
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'JupiterCompta', ...(await deviceHeaders(method, `/api${path}`)) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!res.ok) {
    if (typeof window !== 'undefined') {
      if (res.status === 401 && !path.startsWith('/auth/')) window.location.href = '/connexion';
      if (res.status === 403 && data?.code === 'MFA_REQUISE') window.location.href = '/connexion?etape=mfa';
      if (res.status === 403 && data?.code === 'POSTE_NON_AUTORISE' && !window.location.pathname.startsWith('/securite')) window.location.href = '/securite';
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

/** Télécharge un fichier produit par l'API (Word, Excel) via POST ou GET. */
export async function apiDownload(path: string, fileName: string, body?: unknown): Promise<void> {
  const method = body === undefined ? 'GET' : 'POST';
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'JupiterCompta', ...(await deviceHeaders(method, `/api${path}`)) },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data?.code ?? 'ERREUR', data?.message ?? 'Erreur', data?.details);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
