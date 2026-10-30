import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { config } from './common/config';

// Les montants (bigint, unités mineures) sont sérialisés en chaînes : aucune perte de précision.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'], bodyParser: true });
  app.useBodyParser('json', { limit: '15mb' });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    next();
  });
  const doc = new DocumentBuilder()
    .setTitle('Jupiter Compta — API')
    .setDescription('ERP SYSCOHADA révisé — JUPITER SERVICES SARLU (JUPSER)')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  return app;
}

if (require.main === module) {
  createApp()
    .then((app) => app.listen(config.port))
    .then(() => console.log(`Jupiter Compta API : http://localhost:${config.port}/api (documentation : /api/docs)`));
}
