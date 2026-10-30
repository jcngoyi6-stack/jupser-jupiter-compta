import { convert } from '@jupiter/fx';
import { divRound, type EntryLineInput } from '@jupiter/ledger';
import { applyRate, progressiveTax, RuleSet, RuleTrace, type Bracket } from '@jupiter/tax-engine';

/**
 * Paie RDC (régime IS-IRPP, loi n°23/053) — tous les paramètres viennent des règles fiscales versionnées.
 * TODO(fiscaliste) : valider l'ordre d'application (réduction pour charges de famille → plafond 30 % → minimum).
 */
export interface PayElement {
  code: string;
  label: string;
  amount: bigint; // unités mineures, dans la devise du contrat
  taxable: boolean;
  contributable: boolean; // soumis CNSS
  account?: string; // compte de charge (défaut 661100)
}

export interface PayslipInput {
  employeeId: string;
  country: string;
  payDate: string; // AAAA-MM-JJ
  contractCurrency: string; // CDF ou USD
  currencyDecimals: number;
  localDecimals: number; // CDF : 2
  fxRate?: string | null; // 1 USD = x CDF (cours officiel BCC du jour de paie)
  fxSource?: string | null;
  elements: PayElement[];
  dependents: number; // personnes à charge
  deductions?: { code: string; label: string; amount: bigint }[]; // avances, prêts (devise locale)
  headcount: number; // effectif de l'entreprise (taux INPP)
}

export interface PayslipLine {
  code: string;
  label: string;
  base?: bigint;
  rate?: string;
  employee?: bigint;
  employer?: bigint;
  gain?: bigint;
}

export interface Payslip {
  employeeId: string;
  gross: bigint;
  contributableBase: bigint;
  taxableBase: bigint;
  cnssEmployee: bigint;
  irppBeforeReduction: bigint;
  familyReduction: bigint;
  irpp: bigint;
  otherDeductions: bigint;
  net: bigint;
  employer: { cnssPensions: bigint; cnssRisks: bigint; cnssFamily: bigint; inpp: bigint; onem: bigint; total: bigint };
  totalCost: bigint;
  lines: PayslipLine[];
  convertedElements: (PayElement & { local: bigint })[];
  banner: string | null;
  rulesUsed: { tax: string; param: string; status: string; legalRef: string }[];
}

function inppRate(table: { max: number | null; taux: string }[], headcount: number): string {
  const row = table.find((r) => r.max === null || headcount <= r.max);
  if (!row) throw new Error('Grille INPP invalide');
  return row.taux;
}

export function computePayslip(rules: RuleSet, i: PayslipInput): Payslip {
  const t = new RuleTrace();
  const d = i.payDate;
  const c = i.country;
  const toLocal = (amt: bigint) => {
    if (i.contractCurrency === 'CDF') return amt;
    if (!i.fxRate) throw new Error('Cours de change obligatoire pour une paie en devise.');
    return convert(amt, i.fxRate, i.currencyDecimals, i.localDecimals);
  };
  const convertedElements = i.elements.map((e) => ({ ...e, local: toLocal(e.amount) }));
  const gross = convertedElements.reduce((s, e) => s + e.local, 0n);
  const contributableBase = convertedElements.filter((e) => e.contributable).reduce((s, e) => s + e.local, 0n);
  let taxableBase = convertedElements.filter((e) => e.taxable).reduce((s, e) => s + e.local, 0n);

  const cnssRate = t.use(rules.find<string>(c, 'CNSS', 'salarie', d));
  const cnssEmployee = applyRate(contributableBase, cnssRate);
  const cnssDeductible = t.use(rules.find<boolean>(c, 'IRPP_SALAIRES', 'cnss_deductible', d));
  if (cnssDeductible) taxableBase -= cnssEmployee;

  const brackets = t.use(rules.find<Bracket[]>(c, 'IRPP_SALAIRES', 'bareme_annuel', d));
  const unit = 10n ** BigInt(i.localDecimals);
  const minMonthly = BigInt(t.use(rules.find<number>(c, 'IRPP_SALAIRES', 'minimum_mensuel', d))) * unit;
  const capRate = t.use(rules.find<string>(c, 'IRPP_SALAIRES', 'plafond_taux_revenu', d));
  const perPerson = t.use(rules.find<string>(c, 'IRPP_SALAIRES', 'reduction_par_personne', d));
  const maxPersons = t.use(rules.find<number>(c, 'IRPP_SALAIRES', 'max_personnes', d));

  const irppBeforeReduction = progressiveTax(taxableBase, brackets, i.localDecimals, 12);
  const persons = BigInt(Math.min(Math.max(i.dependents, 0), maxPersons));
  const familyReduction = divRound(applyRate(irppBeforeReduction, perPerson) * persons, 1n);
  let irpp = irppBeforeReduction - familyReduction;
  const cap = applyRate(taxableBase, capRate);
  if (irpp > cap) irpp = cap;
  if (taxableBase > 0n && irpp < minMonthly) irpp = minMonthly;

  const otherDeductions = (i.deductions ?? []).reduce((s, x) => s + x.amount, 0n);
  const net = gross - cnssEmployee - irpp - otherDeductions;

  const pensionsRate = t.use(rules.find<string>(c, 'CNSS', 'employeur_pensions', d));
  const risksRate = t.use(rules.find<string>(c, 'CNSS', 'employeur_risques_pro', d));
  const familyRate = t.use(rules.find<string>(c, 'CNSS', 'employeur_prestations_familiales', d));
  const inppTable = t.use(rules.find<{ max: number | null; taux: string }[]>(c, 'INPP', 'taux_par_effectif', d));
  const onemRate = t.use(rules.find<string>(c, 'ONEM', 'employeur', d));
  const inppR = inppRate(inppTable, i.headcount);
  const employer = {
    cnssPensions: applyRate(contributableBase, pensionsRate),
    cnssRisks: applyRate(contributableBase, risksRate),
    cnssFamily: applyRate(contributableBase, familyRate),
    inpp: applyRate(gross, inppR),
    onem: applyRate(gross, onemRate),
    total: 0n,
  };
  employer.total = employer.cnssPensions + employer.cnssRisks + employer.cnssFamily + employer.inpp + employer.onem;

  const lines: PayslipLine[] = [
    ...convertedElements.map((e) => ({ code: e.code, label: e.label, gain: e.local })),
    { code: 'CNSS', label: 'CNSS (pensions, risques pro., prestations familiales)', base: contributableBase, rate: cnssRate, employee: cnssEmployee, employer: employer.cnssPensions + employer.cnssRisks + employer.cnssFamily },
    { code: 'IRPP', label: 'IRPP retenu à la source (IS-IRPP)', base: taxableBase, employee: irpp },
    { code: 'INPP', label: 'INPP', base: gross, rate: inppR, employer: employer.inpp },
    { code: 'ONEM', label: 'ONEM', base: gross, rate: onemRate, employer: employer.onem },
    ...(i.deductions ?? []).map((x) => ({ code: x.code, label: x.label, employee: x.amount })),
  ];

  return {
    employeeId: i.employeeId,
    gross,
    contributableBase,
    taxableBase,
    cnssEmployee,
    irppBeforeReduction,
    familyReduction,
    irpp,
    otherDeductions,
    net,
    employer,
    totalCost: gross + employer.total,
    lines,
    convertedElements,
    banner: t.banner,
    rulesUsed: t.used.map((r) => ({ tax: r.tax, param: r.param, status: r.status, legalRef: r.legalRef })),
  };
}

/**
 * Écriture de paie (journal PAIE) : 661/663 ↔ 422/431/4472, charges patronales 664/641 ↔ 431/4478.
 * TODO(expert-comptable) : confirmer les comptes INPP/ONEM (641500/641300 ↔ 447800).
 */
export function payrollEntryLines(slips: Payslip[], employeeThirdParty: (id: string) => string): EntryLineInput[] {
  const charges = new Map<string, bigint>();
  const lines: EntryLineInput[] = [];
  let cnssEmp = 0n;
  let irpp = 0n;
  let pens = 0n;
  let risks = 0n;
  let fam = 0n;
  let inpp = 0n;
  let onem = 0n;
  for (const s of slips) {
    for (const e of s.convertedElements) {
      const acc = e.account ?? '661100';
      charges.set(acc, (charges.get(acc) ?? 0n) + e.local);
    }
    const tp = employeeThirdParty(s.employeeId);
    lines.push({ account: '422000', thirdPartyId: tp, debit: 0n, credit: s.net });
    if (s.otherDeductions) lines.push({ account: '421100', thirdPartyId: tp, debit: 0n, credit: s.otherDeductions });
    cnssEmp += s.cnssEmployee;
    irpp += s.irpp;
    pens += s.employer.cnssPensions;
    risks += s.employer.cnssRisks;
    fam += s.employer.cnssFamily;
    inpp += s.employer.inpp;
    onem += s.employer.onem;
  }
  const out: EntryLineInput[] = [...[...charges.entries()].map(([account, v]) => ({ account, debit: v, credit: 0n })), ...lines];
  const push = (account: string, debit: bigint, credit: bigint) => {
    if (debit || credit) out.push({ account, debit, credit });
  };
  push('664100', pens + risks + fam, 0n);
  push('641500', inpp, 0n);
  push('641300', onem, 0n);
  push('431300', 0n, cnssEmp + pens);
  push('431200', 0n, risks);
  push('431100', 0n, fam);
  push('447200', 0n, irpp);
  push('447800', 0n, inpp + onem);
  return out;
}
