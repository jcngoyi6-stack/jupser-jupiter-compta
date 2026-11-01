import { ForbiddenException, Injectable } from '@nestjs/common';
import { convertXafThreshold, pickRate } from '@jupiter/fx';
import { checkQuota } from '@jupiter/licensing';
import { decimalsOf, isCollective, monthlyPeriods, parseChartCsv, proposeFirstFiscalYear } from '@jupiter/ledger';
import { SMT_THRESHOLDS_XAF, smtEligible } from '@jupiter/tax-engine';
import type { SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { legalCurrency, readData } from '../common/data';
import { domainError } from '../common/http';
import type { Tx } from '../common/prisma.service';

export interface CompanyWizardInput {
  name: string;
  legalForm: string;
  country: string;
  rccm?: string;
  taxId?: string;
  nationalId?: string;
  employerNo?: string;
  address?: string;
  sector?: string;
  activity: 'NEGOCE' | 'ARTISANAT' | 'SERVICES';
  expectedTurnover: bigint; // devise de tenue, unités mineures
  eurRate?: string; // 1 EUR = x devise locale (pour convertir le seuil SMT hors zone franc)
  systemChoice?: 'NORMAL' | 'SMT';
  creationDate?: string; // société nouvelle
  fiscalYearStart?: string;
  fiscalYearEnd?: string;
  shareCapital?: bigint;
  headcount?: number;
  logoDataUrl?: string;
}

export const DEFAULT_JOURNALS = [
  { code: 'ACH', label: 'Achats', type: 'ACHATS', counterpartAccount: null },
  { code: 'VTE', label: 'Ventes', type: 'VENTES', counterpartAccount: null },
  { code: 'BQ1', label: 'Banque principale', type: 'BANQUE', counterpartAccount: '521100' },
  { code: 'CAI', label: 'Caisse', type: 'CAISSE', counterpartAccount: '571100' },
  { code: 'MM1', label: 'Mobile money', type: 'MOBILE_MONEY', counterpartAccount: '552000' },
  { code: 'OD', label: 'Opérations diverses', type: 'OD', counterpartAccount: null },
  { code: 'PAIE', label: 'Paie', type: 'PAIE', counterpartAccount: null },
  { code: 'AN', label: 'À-nouveaux', type: 'AN', counterpartAccount: null },
  { code: 'IA', label: 'Brouillons Jupiter IA', type: 'IA', counterpartAccount: null },
];

@Injectable()
export class CompanyService {
  constructor(private readonly audit: AuditService) {}

  /** Proposition du système comptable (art. 11 et 13 AUDCIF) avec le calcul affiché. */
  smtAssessment(i: Pick<CompanyWizardInput, 'country' | 'activity' | 'expectedTurnover' | 'eurRate'>, rates: { rate: string; date: string }[] = []) {
    const currency = legalCurrency(i.country);
    const dec = decimalsOf(currency);
    const thresholdXaf = SMT_THRESHOLDS_XAF[i.activity];
    let thresholdLocal: bigint;
    let calc: string;
    if (currency === 'XAF' || currency === 'XOF') {
      thresholdLocal = thresholdXaf * 10n ** BigInt(dec);
      calc = `Seuil légal : ${thresholdXaf} FCFA (parité 1 XAF = 1 XOF).`;
    } else {
      const eur = i.eurRate ?? rates.at(-1)?.rate;
      if (!eur) return { currency, eligible: null, thresholdLocal: null, calc: `Cours EUR/${currency} nécessaire pour convertir le seuil de ${thresholdXaf} FCFA.` };
      thresholdLocal = convertXafThreshold(thresholdXaf, eur, dec);
      calc = `${thresholdXaf} FCFA ÷ 655,957 × ${eur} ${currency}/EUR (cours de la banque centrale).`;
    }
    const eligible = smtEligible(i.expectedTurnover, thresholdLocal);
    return {
      currency,
      eligible,
      thresholdLocal,
      calc,
      recommendation: eligible ? 'SMT' : 'NORMAL',
      explanation: eligible
        ? "Chiffre d'affaires sous le seuil : le système minimal de trésorerie (SMT) est possible ; le système normal reste permis."
        : "Chiffre d'affaires au-dessus du seuil : le système normal est obligatoire.",
    };
  }

  async create(tx: Tx, u: SessionUser, i: CompanyWizardInput) {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const count = await tx.company.count();
    const q = checkQuota('companies', count, { users: tenant.maxUsers, companies: tenant.maxCompanies, aiCredits: tenant.aiCredits });
    if (!q.ok) throw new ForbiddenException({ code: 'QUOTA', message: q.message });

    const rates = (await tx.fxRate.findMany({ where: { currency: 'EUR', quote: legalCurrency(i.country) } }))
      .map((r) => ({ ...r, type: r.type as 'OFFICIEL' }));
    const picked = pickRate(rates, 'EUR', legalCurrency(i.country), new Date().toISOString().slice(0, 10));
    const smt = this.smtAssessment(i, picked ? [picked] : []);
    const system = i.systemChoice ?? (smt.recommendation as 'NORMAL' | 'SMT' | undefined) ?? 'NORMAL';
    if (system === 'SMT' && smt.eligible === false) {
      throw domainError('SMT_NON_ELIGIBLE', "Le chiffre d'affaires dépasse le seuil du SMT : système normal obligatoire.");
    }

    let fyStart = i.fiscalYearStart;
    let fyEnd = i.fiscalYearEnd;
    if (i.creationDate && !fyStart) {
      const p = proposeFirstFiscalYear(i.creationDate);
      fyStart = p.start;
      fyEnd = p.end;
    }
    const year = new Date().getUTCFullYear();
    fyStart ??= `${year}-01-01`;
    fyEnd ??= `${fyStart.slice(0, 4)}-12-31`;

    const company = await tx.company.create({
      data: {
        tenantId: u.tenantId,
        name: i.name,
        legalForm: i.legalForm,
        country: i.country,
        currency: smt.currency,
        system,
        rccm: i.rccm,
        taxId: i.taxId,
        nationalId: i.nationalId,
        employerNo: i.employerNo,
        address: i.address,
        sector: i.sector,
        activity: i.activity,
        shareCapital: i.shareCapital ?? 0n,
        headcount: i.headcount ?? 1,
        logoDataUrl: i.logoDataUrl,
        systemDecision: JSON.parse(
          JSON.stringify({ ...smt, chosen: system, decidedBy: u.userId, at: new Date().toISOString() }, (_k, v) =>
            typeof v === 'bigint' ? v.toString() : v,
          ),
        ),
      },
    });
    const chart = parseChartCsv(readData('plan_comptes_syscohada_revise_6chiffres.csv'));
    await tx.account.createMany({
      data: chart.map((a) => ({
        tenantId: u.tenantId,
        companyId: company.id,
        number: a.number,
        official: a.official,
        label: a.label,
        class: a.class,
        parent: a.parent,
        imputable: a.imputable,
        collective: isCollective(a.number),
      })),
    });
    await tx.journal.createMany({ data: DEFAULT_JOURNALS.map((j) => ({ ...j, tenantId: u.tenantId, companyId: company.id })) });
    const fy = await this.createFiscalYear(tx, u.tenantId, company.id, fyStart, fyEnd!);
    await this.audit.log(tx, u.tenantId, u.userId, 'SOCIETE_CREEE', `company:${company.id}`, { system, smt: smt.calc });
    return { company, fiscalYear: fy, smt };
  }

  async createFiscalYear(tx: Tx, tenantId: string, companyId: string, start: string, end: string) {
    const label = end.slice(0, 4);
    return tx.fiscalYear.create({
      data: {
        tenantId,
        companyId,
        label,
        startDate: start,
        endDate: end,
        periods: { create: monthlyPeriods(start, end).map((p) => ({ tenantId, label: p.label, startDate: p.start, endDate: p.end })) },
      },
      include: { periods: true },
    });
  }
}
