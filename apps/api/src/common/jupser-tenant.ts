import { EDITION_MODULES } from '@jupiter/licensing';
import type { PrismaService } from './prisma.service';

/**
 * Espace interne de JUPSER : rattache les comptes du personnel (la connexion exige une appartenance) et sert à la
 * comptabilité de JUPSER elle-même. Idempotent.
 */
export async function ensureJupserMembership(db: PrismaService, userId: string) {
  const name = 'JUPSER (interne)';
  const tenant = (await db.client.tenant.findFirst({ where: { name } }))
    ?? (await db.client.tenant.create({
      data: { name, type: 'ENTREPRISE', edition: 'ERP', modules: EDITION_MODULES.ERP, subStatus: 'ACTIF', paidUntil: new Date('2099-12-31T00:00:00Z'), maxCompanies: 10, maxUsers: 200 },
    }));
  const existing = await db.client.membership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId } } });
  if (!existing) await db.client.membership.create({ data: { tenantId: tenant.id, userId, roles: ['ADMIN'] } });
  return tenant;
}
