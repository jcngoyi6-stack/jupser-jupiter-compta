import { createHash } from 'node:crypto';

/** Sérialisation canonique (clés triées, bigint en chaîne) pour un hachage reproductible. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function sha256(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex');
}

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditRecord {
  seq: number;
  at: string;
  actor: string;
  action: string;
  object: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}

export function computeAuditHash(r: Omit<AuditRecord, 'hash'>): string {
  return sha256(
    canonicalJson({ seq: r.seq, at: r.at, actor: r.actor, action: r.action, object: r.object, payload: r.payload }) +
      '|' +
      r.prevHash,
  );
}

/** Vérifie la chaîne d'audit : chaque maillon référence l'empreinte du précédent. */
export function verifyAuditChain(records: AuditRecord[]): { ok: boolean; brokenAt?: number } {
  let prev = GENESIS_HASH;
  for (const r of [...records].sort((a, b) => a.seq - b.seq)) {
    if (r.prevHash !== prev) return { ok: false, brokenAt: r.seq };
    if (computeAuditHash(r) !== r.hash) return { ok: false, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true };
}

/** Empreinte d'une écriture validée (inaltérabilité). */
export function entryHash(entry: {
  number: string;
  date: string;
  journalCode: string;
  pieceRef: string;
  label: string;
  lines: { account: string; debit: bigint; credit: bigint; thirdPartyId?: string | null }[];
  prevHash: string;
}): string {
  return sha256(canonicalJson(entry));
}
