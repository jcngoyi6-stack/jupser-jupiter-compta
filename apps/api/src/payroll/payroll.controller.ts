import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { convert, pickRate, type FxRate } from '@jupiter/fx';
import { computeGenericPayslip, MissingValueError } from '@jupiter/tax-engine';
import { payrollVariables } from '@jupiter/operations';
import { decimalsOf } from '@jupiter/ledger';
import { computePayslip, payrollEntryLines, type PayElement, type Payslip } from '@jupiter/payroll';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { domainError, parse, zAccount, zAmount, zDate } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { loadRules } from '../tax/tax.controller';

const zElement = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  amount: z.string(),
  taxable: z.boolean(),
  contributable: z.boolean(),
  account: zAccount.optional(),
});

@ApiTags('GRH et paie')
@RequiresModule('GRH_PAIE_RECRUTEMENT')
@Roles('PAIE', 'RH')
@Controller('companies/:companyId/payroll')
export class PayrollController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly entries: EntriesService,
    private readonly audit: AuditService,
  ) {}

  @Get('employees')
  employees(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const rows = await tx.employee.findMany({ where: { companyId }, orderBy: { matricule: 'asc' } });
      return Promise.all(
        rows.map(async ({ salaryEnc, ...e }) => ({ ...e, elements: await this.crypto.decryptJson<PayElement[]>(tx, u.tenantId, salaryEnc) })),
      );
    });
  }

  @Post('employees')
  createEmployee(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(
      z.object({
        matricule: z.string().min(1),
        fullName: z.string().min(2),
        position: z.string().optional(),
        hireDate: zDate,
        currency: z.enum(['CDF', 'USD', 'EUR', 'XOF', 'XAF', 'GNF', 'KMF']),
        dependents: z.number().int().min(0).max(30),
        elements: z.array(zElement).min(1),
        badgeId: z.string().optional(),
        email: z.string().email().optional(),
        userId: z.string().uuid().optional(),
        department: z.string().optional(),
      }),
      body,
    );
    const dec = decimalsOf(b.currency);
    const elements: PayElement[] = b.elements.map((e) => ({ ...e, amount: parse(zAmount(dec), e.amount) }));
    return this.db.forTenant(u.tenantId, async (tx) => {
      const tp = await tx.thirdParty.create({
        data: { tenantId: u.tenantId, companyId, type: 'SALARIE', code: `SAL-${b.matricule}`, name: b.fullName, account: '422000' },
      });
      const e = await tx.employee.create({
        data: {
          tenantId: u.tenantId,
          companyId,
          matricule: b.matricule,
          fullName: b.fullName,
          position: b.position,
          hireDate: b.hireDate,
          currency: b.currency,
          dependents: b.dependents,
          thirdPartyId: tp.id,
          badgeId: b.badgeId,
          email: b.email,
          userId: b.userId,
          department: b.department,
          salaryEnc: await this.crypto.encryptJson(tx, u.tenantId, elements),
        },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'SALARIE_CREE', `employee:${e.id}`);
      const { salaryEnc: _s, ...rest } = e;
      return rest;
    });
  }

  @Get('runs')
  runs(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const runs = await tx.payrollRun.findMany({ where: { companyId }, orderBy: { period: 'desc' } });
      return Promise.all(runs.map(async ({ resultEnc, ...r }) => ({ ...r, result: await this.crypto.decryptJson(tx, u.tenantId, resultEnc) })));
    });
  }

  /** Paie des 16 autres pays : moteur générique alimenté par le pack pays (barème saisi par le fiscaliste). */
  private generic(rules: Awaited<ReturnType<typeof loadRules>>, company: { country: string; currency: string }, e: { id: string; fullName: string; matricule: string; currency: string }, elements: PayElement[], payDate: string, rate: string | null) {
    const dec = decimalsOf(company.currency);
    const local = elements.map((x) => ({ ...x, local: rate ? convert(x.amount, rate, decimalsOf(e.currency), dec) : x.amount }));
    const sumIf = (f: (x: (typeof local)[number]) => boolean) => local.filter(f).reduce((s, x) => s + x.local, 0n);
    try {
      const g = computeGenericPayslip(rules, { country: company.country, payDate, decimals: dec, gross: sumIf(() => true), contributableBase: sumIf((x) => x.contributable), taxableBase: sumIf((x) => x.taxable) });
      return {
        employeeId: e.id, fullName: e.fullName, matricule: e.matricule, rate,
        gross: g.gross, cnssEmployee: g.employeeContributions, irpp: g.incomeTax, net: g.net, otherDeductions: 0n,
        employer: { cnssPensions: g.employerContributions, cnssRisks: 0n, cnssFamily: 0n, inpp: 0n, onem: 0n, total: g.employerContributions },
        totalCost: g.totalCost, convertedElements: local, banner: g.banner, contributions: g.contributions,
      } as unknown as Payslip & { fullName: string; matricule: string };
    } catch (err) {
      if (err instanceof MissingValueError) throw domainError('PACK_PAYS_INCOMPLET', err.message);
      throw err;
    }
  }

  /** Calcul de la paie du mois et écriture de paie en brouillon (validation à quatre yeux). */
  @Post('runs')
  run(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), payDate: zDate }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      if (await tx.payrollRun.findUnique({ where: { companyId_period: { companyId, period: b.period } } })) {
        throw domainError('PAIE_EXISTANTE', `La paie ${b.period} est déjà calculée.`);
      }
      const employees = await tx.employee.findMany({ where: { companyId, active: true } });
      if (!employees.length) throw domainError('AUCUN_SALARIE', 'Aucun salarié actif.');
      const rules = await loadRules(tx);
      const rates = (await tx.fxRate.findMany({ where: { quote: company.currency } })) as unknown as FxRate[];
      const slips: (Payslip & { fullName: string; matricule: string; rate?: string | null })[] = [];
      const warnings: string[] = [];
      for (const e of employees) {
        const elements = await this.crypto.decryptJson<PayElement[]>(tx, u.tenantId, e.salaryEnc);
        // Présence biométrique validée → heures supplémentaires et retards, sans ressaisie
        const att = await tx.attendance.findMany({ where: { employeeId: e.id, date: { startsWith: b.period }, validated: true } });
        if (att.length) {
          const hsPct = rules.tryFind<number | null>(company.country, 'PRESENCE', 'majoration_hs_pct', b.payDate)?.value;
          const hours = rules.tryFind<number | null>(company.country, 'PRESENCE', 'heures_mensuelles', b.payDate)?.value;
          const deductLate = rules.tryFind<boolean>(company.country, 'PRESENCE', 'retenue_retards', b.payDate)?.value ?? false;
          const base = elements.find((x) => x.code === 'BASE')?.amount ?? 0n;
          if (hsPct == null || !hours) {
            if (att.some((a) => a.overtimeMinutes > 0)) warnings.push(`${e.fullName} : heures supplémentaires non payées — majoration ou durée légale non paramétrée (pack ${company.country}).`);
          } else {
            const hourly = base / BigInt(hours);
            const v = payrollVariables(att.map((a) => ({ badge: '', date: a.date, checkIn: a.checkIn, checkOut: a.checkOut, workedMinutes: a.workedMinutes, lateMinutes: a.lateMinutes, overtimeMinutes: a.overtimeMinutes, absent: a.absent })), hourly, hsPct, deductLate);
            if (v.overtimePay > 0n) elements.push({ code: 'HS', label: `Heures supplémentaires (${(v.overtimeMinutes / 60).toFixed(2)} h)`, amount: v.overtimePay, taxable: true, contributable: true, account: '661200' });
            if (v.lateDeduction > 0n) elements.push({ code: 'RETARD', label: `Retenue retards (${v.lateMinutes} min)`, amount: -v.lateDeduction, taxable: true, contributable: true, account: '661100' });
          }
        }
        const rate = e.currency === company.currency ? null : pickRate(rates, e.currency, company.currency, b.payDate);
        if (e.currency !== company.currency && !rate) {
          throw domainError('COURS_ABSENT', `Cours officiel ${e.currency}/${company.currency} du ${b.payDate} manquant (BCC).`);
        }
        if (company.country !== 'CD') {
          slips.push(this.generic(rules, company, e, elements, b.payDate, rate?.rate ?? null));
          continue;
        }
        const s = computePayslip(rules, {
          employeeId: e.id,
          country: company.country,
          payDate: b.payDate,
          contractCurrency: e.currency,
          currencyDecimals: decimalsOf(e.currency),
          localDecimals: decimalsOf(company.currency),
          fxRate: rate?.rate,
          fxSource: rate?.source,
          elements,
          dependents: e.dependents,
          headcount: company.headcount,
        });
        slips.push({ ...s, fullName: e.fullName, matricule: e.matricule, rate: rate?.rate });
      }
      const tpOf = new Map(employees.map((e) => [e.id, e.thirdPartyId]));
      const draft = await this.entries.createDraft(
        tx,
        u,
        companyId,
        { journalCode: 'PAIE', date: b.payDate, pieceRef: `PAIE-${b.period}`, label: `Paie ${b.period}`, lines: payrollEntryLines(slips, (id) => tpOf.get(id)!) },
        'PAIE',
      );
      const run = await tx.payrollRun.create({
        data: {
          tenantId: u.tenantId,
          companyId,
          period: b.period,
          payDate: b.payDate,
          entryId: draft.id,
          resultEnc: await this.crypto.encryptJson(tx, u.tenantId, slips),
        },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'PAIE_CALCULEE', `payroll_run:${run.id}`, { period: b.period, employees: slips.length });
      return { id: run.id, period: b.period, entryId: draft.id, payslips: slips, banner: slips[0]?.banner ?? null, warnings };
    });
  }
}
