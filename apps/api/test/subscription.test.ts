/** Passage de l'essai à l'abonnement payant : rappels, paiement, activation automatique. */
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeTenant, PW, type Agent, type Ctx } from './helpers';

let ctx: Ctx;
let admin: Agent, staff: Agent;
let tenantId: string;
let adminEmail: string;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'ESSAI', { admin: ['ADMIN'] });
  tenantId = t.tenant.id;
  adminEmail = t.users.admin!.email;
  await ctx.db.client.tenant.update({ where: { id: tenantId }, data: { edition: 'PRO', trialEndsAt: new Date(`${day(7)}T00:00:00Z`) } });
  admin = await login(ctx, t.users.admin!);
  const auth = ctx.app.get(require('../dist/auth/auth.service').AuthService);
  const staffEmail = `staff.${Date.now()}@jupser.cd`;
  const s = await ctx.db.client.user.create({ data: { email: staffEmail, fullName: 'Console', passwordHash: await auth.hash(PW), isJupserStaff: true } });
  await require('../dist/common/jupser-tenant').ensureJupserMembership(ctx.db, s.id);
  staff = await login(ctx, { email: staffEmail });
});
afterAll(async () => ctx?.app.close());

describe('fin d’essai et passage au payant', () => {
  it('rappel J-7 envoyé une seule fois aux administrateurs', async () => {
    const r1 = await staff.post('/api/console/billing/reminders').set(H).send({ today: day(0) });
    expect(r1.status).toBe(200);
    expect(r1.body.find((x: any) => x.tenantId === tenantId)).toMatchObject({ key: 'ESSAI_J-7', to: [adminEmail] });
    const r2 = await staff.post('/api/console/billing/reminders').set(H).send({ today: day(0) });
    expect(r2.body.find((x: any) => x.tenantId === tenantId)).toBeUndefined();
    expect((await admin.post('/api/console/billing/reminders').set(H).send({})).status).toBe(403);
  });

  it('paiement pendant l’essai : édition choisie, période payée à partir de la fin de l’essai', async () => {
    const c = await admin.post('/api/billing/checkout').set(H).send({ method: 'MOBILE_MONEY', months: 12, edition: 'ERP' });
    expect(c.status).toBe(201);
    expect(c.body.payment.edition).toBe('ERP');
    const body = { externalRef: c.body.payment.externalRef, status: 'PAYE' };
    const sig = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret').update(JSON.stringify(body)).digest('hex');
    expect((await request(ctx.server).post('/api/billing/webhook/simulator').set('x-signature', sig).send(body)).body.status).toBe('PAYE');
    const s = (await admin.get('/api/billing/subscription')).body;
    expect(s.tenant).toMatchObject({ edition: 'ERP', computedStatus: 'ACTIF' });
    const end = new Date(`${day(7)}T00:00:00Z`);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    expect(s.tenant.paidUntil.slice(0, 10)).toBe(end.toISOString().slice(0, 10));
    expect(s.tenant.modules).toContain('CONSOLIDATION');
  });

  it('édition inadaptée au nombre d’utilisateurs refusée', async () => {
    await ctx.db.client.membership.createMany({ data: await Promise.all([1, 2].map(async (i) => {
      const u = await ctx.db.client.user.create({ data: { email: `u${i}.${Date.now()}@test.cd`, fullName: 'U', passwordHash: 'x' } });
      return { tenantId, userId: u.id, roles: ['COMPTABLE'] };
    })) });
    expect((await admin.post('/api/billing/checkout').set(H).send({ method: 'CARTE', months: 1, edition: 'TPE' })).body.code).toBe('EDITION_INADAPTEE');
  });
});
