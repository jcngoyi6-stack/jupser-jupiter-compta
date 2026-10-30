import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Traduit les erreurs des triggers d'intégrité (JC_*) et les erreurs Prisma en réponses claires ;
 * ne divulgue jamais de détail interne pour les autres erreurs.
 */
@Catch()
export class DbErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Erreurs');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpException) {
      const body = err.getResponse();
      res.status(err.getStatus()).json(typeof body === 'string' ? { message: body } : body);
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    const m = /(JC_[A-Z_]+): ([^\n"]+)/.exec(msg);
    if (m) {
      res.status(409).json({ code: m[1], message: m[2] });
      return;
    }
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') {
      res.status(409).json({ code: 'DOUBLON', message: 'Cet enregistrement existe déjà.' });
      return;
    }
    if (code === 'P2025' || (err as Error)?.name === 'NotFoundError') {
      res.status(404).json({ code: 'INTROUVABLE', message: 'Enregistrement introuvable.' });
      return;
    }
    this.log.error(msg, (err as Error)?.stack);
    res.status(500).json({ code: 'ERREUR_INTERNE', message: 'Erreur interne. Elle a été journalisée.' });
  }
}
