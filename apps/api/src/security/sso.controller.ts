import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { allowedEmail, authorizationUrl, discover, exchangeCode, newAuthRequest, OidcError, verifyIdToken } from '@jupiter/connectors';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators';
import { setSessionCookie } from '../auth/guards';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../common/prisma.service';
import type { TenantSecurity } from './security.controller';

const SSO_COOKIE = 'jc_sso';
const appUrl = () => process.env.PUBLIC_APP_URL ?? 'http://localhost:3000';
const redirectUri = () => `${process.env.PUBLIC_API_URL ?? 'http://localhost:4000'}/api/auth/sso/callback`;

/**
 * Authentification unique OIDC (édition Entreprise). L'utilisateur doit déjà être membre du locataire :
 * le SSO n'ouvre aucun compte. La double authentification est déléguée au fournisseur d'identité.
 */
@ApiTags('Authentification')
@Controller('auth/sso')
export class SsoController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private async tenantConfig(slug: string) {
    const t = await this.db.client.tenant.findUnique({ where: { slug } });
    const sso = (t?.security as TenantSecurity | null)?.sso;
    if (!t || !sso?.enabled) throw new OidcError('SSO_INACTIF', 'Authentification unique non activée pour ce locataire.');
    const secret = sso.clientSecretEnc ? await this.db.forTenant(t.id, (tx) => this.crypto.decryptJson<string>(tx, t.id, sso.clientSecretEnc!)) : undefined;
    return { tenant: t, sso, cfg: { issuer: sso.issuer, clientId: sso.clientId, clientSecret: secret, redirectUri: redirectUri() } };
  }

  private fail(res: Response, code: string) {
    res.clearCookie(SSO_COOKIE, { path: '/api/auth/sso' });
    res.redirect(302, `${appUrl()}/connexion?sso_erreur=${encodeURIComponent(code)}`);
  }

  @Public()
  @Get(':slug/start')
  async start(@Param('slug') slug: string, @Query('login_hint') hint: string | undefined, @Res() res: Response) {
    try {
      const { cfg } = await this.tenantConfig(slug);
      const d = await discover(cfg.issuer);
      const r = newAuthRequest();
      const state = jwt.sign({ slug, state: r.state, nonce: r.nonce, verifier: r.verifier }, config.jwtSecret, { expiresIn: '10m', algorithm: 'HS256' });
      // SameSite=Lax : le retour du fournisseur d'identité est une navigation intersite.
      res.cookie(SSO_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 10 * 60_000, path: '/api/auth/sso' });
      res.redirect(302, authorizationUrl(d, cfg, r, hint));
    } catch (e) {
      this.fail(res, e instanceof OidcError ? e.code : 'SSO_ERREUR');
    }
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Res() res: Response) {
    try {
      const raw = res.req.cookies?.[SSO_COOKIE] as string | undefined;
      if (!raw || !code || !state) throw new OidcError('ETAT', 'Session SSO absente ou expirée.');
      const saved = jwt.verify(raw, config.jwtSecret, { algorithms: ['HS256'] }) as { slug: string; state: string; nonce: string; verifier: string };
      if (saved.state !== state) throw new OidcError('ETAT', 'Paramètre state invalide.');
      const { tenant, sso, cfg } = await this.tenantConfig(saved.slug);
      const d = await discover(cfg.issuer);
      const idToken = await exchangeCode(d, cfg, code, saved.verifier);
      const jwksRes = await fetch(d.jwks_uri);
      const claims = verifyIdToken(idToken, (await jwksRes.json()) as never, { issuer: cfg.issuer, clientId: cfg.clientId, nonce: saved.nonce, nowSec: Math.floor(Date.now() / 1000) });
      const email = allowedEmail(claims, sso.emailDomains);
      const user = await this.db.client.user.findUnique({ where: { email } });
      const member = user && (await this.db.client.membership.findFirst({ where: { userId: user.id, tenantId: tenant.id } }));
      if (!user || !member) throw new OidcError('NON_MEMBRE', 'Aucun compte Jupiter Compta pour cette adresse dans ce locataire.');
      await this.db.forTenant(tenant.id, (tx) => this.audit.log(tx, tenant.id, user.id, 'CONNEXION_SSO', `user:${user.id}`, { issuer: cfg.issuer }));
      res.clearCookie(SSO_COOKIE, { path: '/api/auth/sso' });
      setSessionCookie(res, this.auth.sign({ sub: user.id, tid: tenant.id, mfa: true, stage: 'session' }));
      res.redirect(302, `${appUrl()}/`);
    } catch (e) {
      this.fail(res, e instanceof OidcError ? e.code : 'SSO_ERREUR');
    }
  }
}
