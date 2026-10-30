import { authenticator } from 'otplib';
import request from 'supertest';
import { expect } from 'vitest';

process.env.JWT_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
/* eslint-disable @typescript-eslint/no-require-imports */
const { createApp } = require('../dist/main');
const { PrismaService } = require('../dist/common/prisma.service');
const { AuthService } = require('../dist/auth/auth.service');
const { seedTaxRules } = require('../dist/common/reference');
const { EDITION_MODULES } = require('@jupiter/licensing');
/* eslint-enable */

export const H = { 'X-Requested-With': 'JupiterCompta' };
export const PW = 'Test-Password-2026';
export const YEAR = new Date().getUTCFullYear();
const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export type Agent = ReturnType<typeof request.agent>;

export interface Ctx {
  app: any;
  db: any;
  server: any;
}

export async function boot(): Promise<Ctx> {
  const app = await createApp();
  await app.init();
  const db = app.get(PrismaService);
  await seedTaxRules(db);
  return { app, db, server: app.getHttpServer() };
}

export async function makeTenant(ctx: Ctx, name: string, roles: Record<string, string[]>, type = 'ENTREPRISE') {
  const auth = ctx.app.get(AuthService);
  const tenant = await ctx.db.client.tenant.create({
    data: { name, type, edition: 'ERP', modules: [...EDITION_MODULES.ERP, ...(type === 'CABINET' ? ['CABINET'] : [])], subStatus: 'ESSAI', trialEndsAt: new Date(Date.now() + 30 * 86_400_000), maxCompanies: 10, maxUsers: 20, aiCredits: 50 },
  });
  const users: Record<string, { id: string; email: string; secret?: string }> = {};
  for (const [key, r] of Object.entries(roles)) {
    const email = `${key}.${run}.${name.replace(/\W/g, '').toLowerCase()}@test.cd`;
    const u = await ctx.db.client.user.create({ data: { email, fullName: key, passwordHash: await auth.hash(PW) } });
    await ctx.db.client.membership.create({ data: { tenantId: tenant.id, userId: u.id, roles: r } });
    users[key] = { id: u.id, email };
  }
  return { tenant, users };
}

export async function login(ctx: Ctx, user: { email: string; secret?: string }): Promise<Agent> {
  const agent = request.agent(ctx.server);
  const r = await agent.post('/api/auth/login').send({ email: user.email, password: PW });
  expect(r.status).toBe(200);
  if (r.body.stage === 'mfa_setup_required') {
    const s = await agent.post('/api/auth/mfa/setup').set(H);
    user.secret = s.body.secret;
    await agent.post('/api/auth/mfa/enable').set(H).send({ code: authenticator.generate(user.secret!) });
  } else if (r.body.stage === 'mfa_pending') {
    await agent.post('/api/auth/mfa/verify').send({ code: authenticator.generate(user.secret!) });
  }
  return agent;
}

export async function makeCompany(admin: Agent, over: Record<string, unknown> = {}) {
  const r = await admin.post('/api/companies').set(H).send({
    name: 'Société Test', legalForm: 'SARL', country: 'CD', activity: 'SERVICES', expectedTurnover: '900000000', taxId: 'A1234567B',
    fiscalYearStart: `${YEAR}-01-01`, fiscalYearEnd: `${YEAR}-12-31`, shareCapital: '10000000', headcount: 5, ...over,
  });
  expect(r.status).toBe(201);
  return r.body as { company: { id: string }; fiscalYear: { id: string } };
}
