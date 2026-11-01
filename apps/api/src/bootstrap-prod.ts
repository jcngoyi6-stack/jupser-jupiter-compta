import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { PrismaService } from './common/prisma.service';
import { ensureJupserMembership } from './common/jupser-tenant';
import { seedTaxRules } from './common/reference';

/**
 * Amorçage d'une installation de production : référentiels fiscaux et sociaux des 17 pays (statut A_VALIDER) et
 * premier compte du personnel JUPSER (console). Aucune donnée de démonstration. Idempotent : peut être relancé à chaque
 * déploiement. Le mot de passe initial n'est affiché qu'une fois ; la double authentification est exigée ensuite.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(PrismaService);
  const auth = app.get(AuthService);
  const added = await seedTaxRules(db);
  console.log(added ? `${added} règles fiscales et sociales chargées (statut A_VALIDER, à faire valider).` : 'Référentiels fiscaux déjà présents.');
  const email = process.env.BOOTSTRAP_STAFF_EMAIL?.toLowerCase();
  if (email) {
    const existing = await db.client.user.findUnique({ where: { email } });
    if (existing) {
      await ensureJupserMembership(db, existing.id);
      console.log(`Compte console ${email} déjà présent.`);
    } else {
      const password = `${randomBytes(12).toString('base64url')}-Jc9`;
      const user = await db.client.user.create({ data: { email, fullName: process.env.BOOTSTRAP_STAFF_NAME ?? 'Console JUPSER', passwordHash: await auth.hash(password), isJupserStaff: true } });
      await ensureJupserMembership(db, user.id);
      console.log(`Compte console créé : ${email}\nMot de passe initial (affiché une seule fois, à changer) : ${password}`);
    }
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
