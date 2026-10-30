/** Vérifie que chaque compte utilisé existe dans le plan de référence et est imputable. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OpResult } from './core';

const plan = new Map(
  readFileSync(join(__dirname, '../../../data/plan_comptes_syscohada_revise_6chiffres.csv'), 'utf8')
    .split('\n').slice(1).filter(Boolean).map((l) => { const c = l.split(';'); return [c[0]!, c[5] === 'oui'] as const; }),
);

export function unknownAccounts(results: OpResult[]): string[] {
  const out = new Set<string>();
  for (const r of results) for (const e of r.entries) for (const l of e.lines) if (plan.get(l.account) !== true) out.add(l.account);
  return [...out].sort();
}
