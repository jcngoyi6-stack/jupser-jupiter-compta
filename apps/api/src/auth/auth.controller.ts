import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { parse } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { AuthService } from './auth.service';
import { AllowWithoutMfa, CurrentUser, Public, type SessionUser } from './decorators';
import { SESSION_COOKIE, setSessionCookie } from './guards';

const MFA_COOKIE = 'jc_mfa';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: PrismaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = parse(z.object({ email: z.string().email(), password: z.string().min(1), tenantId: z.string().uuid().optional() }), body);
    const r = await this.auth.login(b.email, b.password, b.tenantId);
    if (r.stage === 'mfa_pending') {
      res.cookie(MFA_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', maxAge: 5 * 60_000, path: '/' });
      return { stage: r.stage };
    }
    setSessionCookie(res, r.token);
    return { stage: r.stage };
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body);
    const pending = (res.req.cookies?.[MFA_COOKIE] as string | undefined) ?? '';
    const token = await this.auth.verifyMfa(pending, b.code);
    res.clearCookie(MFA_COOKIE, { path: '/' });
    setSessionCookie(res, token);
    return { stage: 'session' };
  }

  @AllowWithoutMfa()
  @Post('mfa/setup')
  async setup(@CurrentUser() u: SessionUser) {
    return this.auth.mfaSetup(u);
  }

  @AllowWithoutMfa()
  @Post('mfa/enable')
  @HttpCode(200)
  async enable(@CurrentUser() u: SessionUser, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body);
    setSessionCookie(res, await this.auth.mfaEnable(u, b.code));
    return { mfaEnabled: true };
  }

  @AllowWithoutMfa()
  @Get('me')
  async me(@CurrentUser() u: SessionUser) {
    const tenant = await this.db.client.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const user = await this.db.client.user.findUniqueOrThrow({ where: { id: u.userId } });
    return {
      ...u,
      mfaEnabled: user.mfaEnabled,
      tenant: { id: tenant.id, name: tenant.name, type: tenant.type, edition: tenant.edition, modules: tenant.modules },
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }
}
