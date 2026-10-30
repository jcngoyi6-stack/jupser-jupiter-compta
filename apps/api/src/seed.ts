import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { EDITION_MODULES } from '@jupiter/licensing';
import { CompanyService } from './accounting/company.service';
import { EntriesService } from './accounting/entries.service';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import type { SessionUser } from './auth/decorators';
import { AuditService } from './common/audit.service';
import { PrismaService } from './common/prisma.service';
import { seedTaxRules } from './common/reference';
import { seedBoulangerie } from './seed-cage';

/**
 * Données de démonstration FICTIVES (aucune donnée réelle de client — CLAUDE.md).
 * Les cours de change saisis sont des valeurs d'exemple de type MANUEL, à remplacer par les cours BCC.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(PrismaService);
  const auth = app.get(AuthService);
  const companies = app.get(CompanyService);
  const entries = app.get(EntriesService);
  const audit = app.get(AuditService);

  const added = await seedTaxRules(db);
  if (added) console.log(`${added} règles fiscales et sociales chargées pour les 17 pays (statut A_VALIDER).`);

  const pw = process.env.SEED_PASSWORD ?? 'Jupiter-Demo-2026';
  const mkUser = async (email: string, fullName: string, staff = false) =>
    db.client.user.upsert({
      where: { email },
      create: { email, fullName, passwordHash: await auth.hash(pw), isJupserStaff: staff },
      update: {},
    });

  await mkUser('console@jupser.cd', 'Console JUPSER', true);
  const existing = await db.client.tenant.findFirst({ where: { name: 'Démo Kinshasa SARL' } });
  if (existing) {
    const adminUser = await db.client.user.findUniqueOrThrow({ where: { email: 'admin@demo.cd' } });
    const chefUser = await db.client.user.findUniqueOrThrow({ where: { email: 'chef@demo.cd' } });
    const base: SessionUser = { userId: adminUser.id, tenantId: existing.id, email: adminUser.email, fullName: adminUser.fullName, roles: ['ADMIN'], companyIds: [], mfa: true, isStaff: false };
    await seedBoulangerie(app, existing.id, base, { ...base, userId: chefUser.id, roles: ['CHEF_COMPTABLE'] });
    console.log('Données de démonstration déjà présentes (boulangerie de démonstration ajoutée si absente).');
    await app.close();
    return;
  }
  const tenant = await db.client.tenant.create({
    data: {
      name: 'Démo Kinshasa SARL',
      edition: 'ERP',
      modules: EDITION_MODULES.ERP,
      subStatus: 'ESSAI',
      trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
      maxCompanies: 10,
      maxUsers: 50,
      aiCredits: 500,
    },
  });
  const admin = await mkUser('admin@demo.cd', 'Admin Démo');
  const compta = await mkUser('comptable@demo.cd', 'Comptable Démo');
  const chef = await mkUser('chef@demo.cd', 'Chef comptable Démo');
  const dg = await mkUser('dg@demo.cd', 'Direction générale Démo');
  await db.client.membership.createMany({
    data: [
      { tenantId: tenant.id, userId: admin.id, roles: ['ADMIN'] },
      { tenantId: tenant.id, userId: compta.id, roles: ['COMPTABLE', 'CAISSIER'] },
      { tenantId: tenant.id, userId: chef.id, roles: ['CHEF_COMPTABLE', 'PAIE', 'FISCALITE'] },
      { tenantId: tenant.id, userId: dg.id, roles: ['DIRECTION'] },
    ],
  });
  const u: SessionUser = { userId: admin.id, tenantId: tenant.id, email: admin.email, fullName: admin.fullName, roles: ['ADMIN'], companyIds: [], mfa: true, isStaff: false };
  const uChef: SessionUser = { ...u, userId: chef.id, roles: ['CHEF_COMPTABLE'] };
  const year = new Date().getUTCFullYear();

  await db.forTenant(tenant.id, async (tx) => {
    await tx.fxRate.createMany({
      data: [
        { tenantId: tenant.id, currency: 'USD', quote: 'CDF', rate: '2850', date: `${year}-01-01`, source: 'Exemple (à remplacer par le cours BCC)', type: 'MANUEL' },
        { tenantId: tenant.id, currency: 'EUR', quote: 'CDF', rate: '3300', date: `${year}-01-01`, source: 'Exemple (à remplacer par le cours BCC)', type: 'MANUEL' },
      ],
    });
    const { company } = await companies.create(tx, u, {
      name: 'Démo Kinshasa SARL',
      legalForm: 'SARL',
      country: 'CD',
      rccm: 'CD/KNG/RCCM/00-B-00000 (fictif)',
      taxId: 'A0000000X (fictif)',
      nationalId: '01-000-N00000X (fictif)',
      address: 'Kinshasa/Gombe',
      sector: 'Services',
      activity: 'SERVICES',
      expectedTurnover: 900_000_000_00n,
      fiscalYearStart: `${year}-01-01`,
      fiscalYearEnd: `${year}-12-31`,
      shareCapital: 50_000_000_00n,
      headcount: 12,
    });
    const client = await tx.thirdParty.create({ data: { tenantId: tenant.id, companyId: company.id, type: 'CLIENT', code: 'C001', name: 'Client Exemple SA', account: '411100' } });
    const supplier = await tx.thirdParty.create({ data: { tenantId: tenant.id, companyId: company.id, type: 'FOURNISSEUR', code: 'F001', name: 'Fournisseur Exemple SARL', account: '401100' } });
    const post = async (journalCode: string, date: string, pieceRef: string, label: string, lines: { account: string; debit: bigint; credit: bigint; thirdPartyId?: string }[]) => {
      const d = await entries.createDraft(tx, u, company.id, { journalCode, date, pieceRef, label, lines });
      await entries.validate(tx, uChef, company.id, d.id);
    };
    const M = 1_000_000_00n;
    await post('OD', `${year}-01-02`, 'STATUTS', 'Constitution : capital libéré en banque', [
      { account: '521100', debit: 50n * M, credit: 0n },
      { account: '101300', debit: 0n, credit: 50n * M },
    ]);
    await post('ACH', `${year}-01-10`, 'F-2026-001', 'Achat fournitures et prestations', [
      { account: '605700', debit: 10n * M, credit: 0n },
      { account: '445200', debit: 16n * M / 10n, credit: 0n },
      { account: '401100', debit: 0n, credit: 116n * M / 10n, thirdPartyId: supplier.id },
    ]);
    await post('VTE', `${year}-01-20`, 'FA-DEMO-001', 'Prestations de services janvier', [
      { account: '411100', debit: 58n * M, credit: 0n, thirdPartyId: client.id },
      { account: '706100', debit: 0n, credit: 50n * M },
      { account: '443200', debit: 0n, credit: 8n * M },
    ]);
    await post('BQ1', `${year}-01-25`, 'VIR-001', 'Règlement client', [
      { account: '521100', debit: 30n * M, credit: 0n },
      { account: '411100', debit: 0n, credit: 30n * M, thirdPartyId: client.id },
    ]);
    await post('BQ1', `${year}-01-31`, 'LOYER-01', 'Loyer de janvier', [
      { account: '622200', debit: 3n * M, credit: 0n },
      { account: '521100', debit: 0n, credit: 3n * M },
    ]);
    await audit.log(tx, tenant.id, admin.id, 'DONNEES_DEMO', `company:${company.id}`);
  });
  await seedBoulangerie(app, tenant.id, u, uChef);
  console.log(`Démo prête. Comptes (mot de passe : ${pw}) :
  admin@demo.cd (administrateur), comptable@demo.cd, chef@demo.cd, dg@demo.cd, console@jupser.cd (console JUPSER)
  La double authentification est demandée à la première connexion des rôles sensibles.`);
  await app.close();
}

main().catch((e) => {
  console.error(e, JSON.stringify((e as { response?: unknown }).response));
  process.exit(1);
});
