import { Injectable } from '@nestjs/common';
import { computeAuditHash, GENESIS_HASH, verifyAuditChain, type AuditRecord } from '@jupiter/ledger';
import type { Tx } from './prisma.service';

/** Journal d'audit inaltérable, chaîné par empreintes SHA-256, par locataire (docs/08). */
@Injectable()
export class AuditService {
  async log(tx: Tx, tenantId: string, actor: string, action: string, object: string, payload: unknown = {}) {
    // verrou consultatif par locataire : séquence continue même en concurrence
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
    const last = await tx.auditLog.findFirst({ where: { tenantId }, orderBy: { seq: 'desc' } });
    const safePayload = JSON.parse(JSON.stringify(payload ?? {}, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    const rec = {
      seq: (last?.seq ?? 0) + 1,
      at: new Date().toISOString(),
      actor,
      action,
      object,
      payload: safePayload,
      prevHash: last?.hash ?? GENESIS_HASH,
    };
    const hash = computeAuditHash(rec);
    await tx.auditLog.create({ data: { tenantId, ...rec, hash } });
    return hash;
  }

  async verify(tx: Tx, tenantId: string) {
    const rows = await tx.auditLog.findMany({ where: { tenantId }, orderBy: { seq: 'asc' } });
    const res = verifyAuditChain(rows.map((r) => ({ ...r, payload: r.payload }) as AuditRecord));
    return { ...res, records: rows.length, lastHash: rows.at(-1)?.hash ?? GENESIS_HASH };
  }
}
