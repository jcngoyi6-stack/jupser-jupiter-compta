import { BadRequestException } from '@nestjs/common';
import { parseAmount } from '@jupiter/ledger';
import { z, type ZodTypeAny } from 'zod';

export function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new BadRequestException({
      code: 'VALIDATION',
      message: 'Données invalides',
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

/** Montant décimal (chaîne) → unités mineures. */
export const zAmount = (decimals = 2) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    try {
      return parseAmount(typeof v === 'number' ? String(v) : v, decimals);
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
      return z.NEVER;
    }
  });

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date AAAA-MM-JJ attendue');
export const zAccount = z.string().regex(/^\d{6}$/, 'Compte à 6 chiffres attendu');

export function domainError(code: string, message: string, details?: unknown) {
  return new BadRequestException({ code, message, details });
}
