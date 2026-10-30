import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { config } from './config';

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Accès base. Toute opération métier passe par `forTenant`, qui positionne `app.tenant_id`
 * dans la transaction : la Row Level Security PostgreSQL filtre alors toutes les lectures/écritures.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });

  async forTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return fn(tx);
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
