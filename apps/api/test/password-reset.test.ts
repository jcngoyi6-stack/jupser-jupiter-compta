/** Mot de passe oublié : lien à usage unique, révocation des sessions, absence de divulgation des comptes. */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, H, login, makeTenant, PW, type Ctx } from './helpers';

let ctx: Ctx;
let email: string;

beforeAll(async () => {
  ctx = await boot();
  const t = await makeTenant(ctx, 'MDP', { compta: ['COMPTABLE'] });
  email = t.users.compta!.email;
});
afterAll(async () => ctx?.app.close());

const lastToken = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessagingService } = require('../dist/erp/messaging.service');
  const sent = ctx.app.get(MessagingService).sent as { to: string; text: string }[];
  const m = [...sent].reverse().find((x) => x.to === email);
  return m?.text.match(/jeton=([\w-]+)/)?.[1];
};

describe('réinitialisation du mot de passe', () => {
  it('réponse neutre, lien par courriel, nouveau mot de passe, sessions révoquées, lien à usage unique', async () => {
    const session = await login(ctx, { email });
    expect((await session.get('/api/auth/me')).status).toBe(200);
    const unknown = await request(ctx.server).post('/api/auth/password/forgot').set(H).send({ email: 'personne@exemple.cd' });
    const known = await request(ctx.server).post('/api/auth/password/forgot').set(H).send({ email });
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    const token = lastToken()!;
    expect(token).toBeTruthy();
    await new Promise((r) => setTimeout(r, 1100));
    expect((await request(ctx.server).post('/api/auth/password/reset').set(H).send({ token, password: 'faible' })).body.code).toBe('MOT_DE_PASSE_FAIBLE');
    const ok = await request(ctx.server).post('/api/auth/password/reset').set(H).send({ token, password: 'Nouveau-Secret-2026' });
    expect(ok.status).toBe(200);
    expect((await session.get('/api/auth/me')).status).toBe(401);
    expect((await request(ctx.server).post('/api/auth/password/reset').set(H).send({ token, password: 'Autre-Secret-2026' })).body.code).toBe('LIEN_INVALIDE');
    expect((await request(ctx.server).post('/api/auth/login').send({ email, password: PW })).status).not.toBe(200);
    expect((await request(ctx.server).post('/api/auth/login').send({ email, password: 'Nouveau-Secret-2026' })).status).toBe(200);
  });

  it('une nouvelle demande invalide le lien précédent ; limitation et en-tête obligatoire', async () => {
    await request(ctx.server).post('/api/auth/password/forgot').set(H).send({ email });
    const first = lastToken()!;
    await request(ctx.server).post('/api/auth/password/forgot').set(H).send({ email });
    expect((await request(ctx.server).post('/api/auth/password/reset').set(H).send({ token: first, password: 'Encore-Secret-2026' })).body.code).toBe('LIEN_INVALIDE');
    expect((await request(ctx.server).post('/api/auth/password/forgot').set(H).send({ email })).status).toBe(429);
    expect((await request(ctx.server).post('/api/auth/password/forgot').send({ email: 'x@exemple.cd' })).status).toBe(403);
  });
});
