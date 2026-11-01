/** Inscription en libre-service à l'essai gratuit de 30 jours. */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, PW, type Ctx } from './helpers';

let ctx: Ctx;

beforeAll(async () => { ctx = await boot(); });
afterAll(async () => ctx?.app.close());

describe('inscription à l’essai gratuit', () => {
  const email = `essai-${Date.now()}@exemple.cd`;
  const base = { organisation: 'Quincaillerie de démonstration', fullName: 'Gérant fictif', email, password: PW, acceptTerms: true, edition: 'PRO' };

  it('crée le locataire en essai, l’administrateur peut se connecter et créer sa société', async () => {
    const r = await request(ctx.server).post('/api/signup').set(H).send(base);
    expect(r.status).toBe(201);
    expect(r.body.edition).toBe('PRO');
    expect(r.body.trialEndsAt).toBe(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
    const agent = await login(ctx, { email });
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    const c = await agent.post('/api/companies').set(H).send({ name: 'Quincaillerie SARL', legalForm: 'SARL', country: 'CD', activity: 'NEGOCE', expectedTurnover: '50000000' });
    expect(c.status).toBe(201);
  });

  it('refuse : adresse déjà utilisée, mot de passe faible, conditions non acceptées, robot, en-tête absent', async () => {
    const post = (b: object) => request(ctx.server).post('/api/signup').set(H).send({ ...base, ...b });
    expect((await post({})).body.code).toBe('ADRESSE_DEJA_UTILISEE');
    expect((await post({ email: 'autre@exemple.cd', password: 'faible' })).body.code).toBe('MOT_DE_PASSE_FAIBLE');
    expect((await post({ email: 'autre@exemple.cd', acceptTerms: false })).status).toBe(400);
    expect((await post({ email: 'autre@exemple.cd', website: 'http://spam' })).status).toBe(400);
    expect((await request(ctx.server).post('/api/signup').send(base)).status).toBe(403);
  });

  it('limite à 5 inscriptions par heure et par adresse IP', async () => {
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await request(ctx.server).post('/api/signup').set(H).send({ ...base, email: `lot-${i}-${Date.now()}@exemple.cd` })).status;
    expect(last).toBe(429);
  });
});
