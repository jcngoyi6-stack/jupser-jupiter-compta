/** Contrôle budgétaire : budget par compte (préfixe) et axe analytique, réalisé, engagements, écarts. */
export interface BudgetLine {
  prefix: string; // compte ou préfixe (ex. 62)
  analytic?: string | null;
  amount: bigint; // budget annuel (charges en positif, produits en positif)
}

export interface Actual {
  account: string;
  analytic?: string | null;
  net: bigint; // débit – crédit
}

export function budgetReport(budget: BudgetLine[], actuals: Actual[], commitments: { prefix: string; analytic?: string | null; amount: bigint }[] = []) {
  return budget.map((b) => {
    const match = (acc: string, an?: string | null) => acc.startsWith(b.prefix) && (!b.analytic || b.analytic === an);
    const charge = /^[26]/.test(b.prefix);
    const realized = actuals.filter((a) => match(a.account, a.analytic)).reduce((s, a) => s + (charge ? a.net : -a.net), 0n);
    const committed = commitments.filter((c) => c.prefix.startsWith(b.prefix) && (!b.analytic || b.analytic === c.analytic)).reduce((s, c) => s + c.amount, 0n);
    const available = b.amount - realized - committed;
    const usageBp = b.amount === 0n ? null : Number(((realized + committed) * 10000n) / b.amount);
    return { ...b, realized, committed, available, usageBp, overrun: charge && available < 0n };
  });
}

/** Vérifie une nouvelle dépense : BLOQUANT refuse le dépassement, ALERTE le signale. */
export function checkBudget(
  report: ReturnType<typeof budgetReport>,
  account: string,
  amount: bigint,
  analytic: string | null | undefined,
  mode: 'ALERTE' | 'BLOQUANT',
): { ok: boolean; warning?: string } {
  const line = report
    .filter((r) => account.startsWith(r.prefix) && (!r.analytic || r.analytic === analytic))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!line) return { ok: true };
  if (line.available - amount >= 0n) return { ok: true };
  const warning = `Dépassement budgétaire sur ${line.prefix}${line.analytic ? ' / ' + line.analytic : ''} : disponible ${line.available}, demandé ${amount}.`;
  return { ok: mode === 'ALERTE', warning };
}
