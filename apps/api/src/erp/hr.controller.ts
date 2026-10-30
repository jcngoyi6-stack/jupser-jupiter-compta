import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { toDecimalString, decimalsOf } from '@jupiter/ledger';
import { absences, parseFingertec, rankCandidates, summarize, validateCriteria, workingDays } from '@jupiter/operations';
import { z } from 'zod';
import { CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { domainError, parse, zDate } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { readRows } from '../common/spreadsheet';

const SCHEDULE = { start: '08:00', dailyMinutes: 480, graceMinutes: 10, workDays: [1, 2, 3, 4, 5] };

@ApiTags('GRH, présence, recrutement')
@RequiresModule('GRH_PAIE_RECRUTEMENT')
@Controller('companies/:companyId/hr')
export class HrController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  // ---------- Congés ----------
  @Get('leaves')
  leaves(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const self = !u.roles.some((r) => ['ADMIN', 'RH', 'PAIE', 'DIRECTION'].includes(r));
      const me = self ? await tx.employee.findFirst({ where: { companyId, userId: u.userId } }) : null;
      return tx.leave.findMany({ where: { companyId, ...(self ? { employeeId: me?.id ?? '00000000-0000-0000-0000-000000000000' } : {}) }, orderBy: { fromDate: 'desc' } });
    });
  }

  /** Demande de congé : par le salarié (libre-service) ou par les RH. */
  @Roles('RH', 'PAIE', 'EMPLOYE')
  @Post('leaves')
  requestLeave(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ employeeId: z.string().uuid().optional(), type: z.enum(['CONGE_PAYE', 'MALADIE', 'SANS_SOLDE', 'CIRCONSTANCE', 'MATERNITE']).default('CONGE_PAYE'), fromDate: zDate, toDate: zDate }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const emp = b.employeeId && u.roles.some((r) => ['ADMIN', 'RH', 'PAIE'].includes(r))
        ? await tx.employee.findFirstOrThrow({ where: { id: b.employeeId, companyId } })
        : await tx.employee.findFirst({ where: { companyId, userId: u.userId } });
      if (!emp) throw domainError('SALARIE_INCONNU', 'Aucun dossier salarié associé à votre compte.');
      if (b.toDate < b.fromDate) throw domainError('DATES', 'Période invalide.');
      const days = workingDays(b.fromDate, b.toDate, SCHEDULE).length * 100;
      return tx.leave.create({ data: { tenantId: u.tenantId, companyId, employeeId: emp.id, type: b.type, fromDate: b.fromDate, toDate: b.toDate, days } });
    });
  }

  @Roles('RH', 'DIRECTION')
  @Post('leaves/:id/decide')
  @HttpCode(200)
  decide(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ approve: z.boolean() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const l = await tx.leave.findFirstOrThrow({ where: { id, companyId } });
      if (l.status !== 'DEMANDE') throw domainError('STATUT', 'Demande déjà traitée.');
      const emp = await tx.employee.findUniqueOrThrow({ where: { id: l.employeeId } });
      if (emp.userId === u.userId) throw domainError('QUATRE_YEUX', 'Vous ne pouvez pas valider votre propre congé.');
      if (b.approve && l.type === 'CONGE_PAYE') {
        if (emp.leaveBalance < l.days) throw domainError('SOLDE_INSUFFISANT', 'Solde de congés insuffisant.');
        await tx.employee.update({ where: { id: emp.id }, data: { leaveBalance: { decrement: l.days } } });
      }
      await this.audit.log(tx, u.tenantId, u.userId, b.approve ? 'CONGE_APPROUVE' : 'CONGE_REFUSE', `leave:${id}`);
      return tx.leave.update({ where: { id }, data: { status: b.approve ? 'APPROUVE' : 'REFUSE', decidedBy: u.userId } });
    });
  }

  /** Acquisition mensuelle des congés (paramètre : jours par mois × 100, ex. 150 = 1,5 jour). */
  @Roles('RH', 'PAIE')
  @Post('leaves/accrue')
  @HttpCode(200)
  accrue(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ daysPerMonthX100: z.number().int().min(0).max(1000) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => tx.employee.updateMany({ where: { companyId, active: true }, data: { leaveBalance: { increment: b.daysPerMonthX100 } } }));
  }

  // ---------- Présence biométrique ----------
  /** Import des pointages FingerTec (ou autre terminal via BiometricProvider) → présence journalière. */
  @Roles('RH', 'PAIE')
  @Post('attendance/import')
  importAttendance(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ content: z.string().optional(), base64: z.string().optional(), fileName: z.string().optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const punches = parseFingertec(await readRows(b));
      const emps = await tx.employee.findMany({ where: { companyId } });
      const byBadge = new Map(emps.map((e) => [e.badgeId ?? e.matricule, e]));
      let n = 0;
      const unknown = new Set<string>();
      for (const d of summarize(punches, SCHEDULE)) {
        const e = byBadge.get(d.badge);
        if (!e) {
          unknown.add(d.badge);
          continue;
        }
        const data = { checkIn: d.checkIn, checkOut: d.checkOut, workedMinutes: d.workedMinutes, lateMinutes: d.lateMinutes, overtimeMinutes: d.overtimeMinutes, absent: false, validated: false };
        await tx.attendance.upsert({ where: { employeeId_date: { employeeId: e.id, date: d.date } }, create: { tenantId: u.tenantId, companyId, employeeId: e.id, date: d.date, ...data }, update: data });
        n++;
      }
      await this.audit.log(tx, u.tenantId, u.userId, 'POINTAGES_IMPORTES', `company:${companyId}`, { days: n });
      return { days: n, unknownBadges: [...unknown] };
    });
  }

  @Get('attendance')
  attendance(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('month') month: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = month ?? new Date().toISOString().slice(0, 7);
      const rows = await tx.attendance.findMany({ where: { companyId, date: { startsWith: m } }, orderBy: [{ date: 'asc' }] });
      const emps = await tx.employee.findMany({ where: { companyId, active: true } });
      const leaves = await tx.leave.findMany({ where: { companyId, status: 'APPROUVE' } });
      const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const days = workingDays(`${m}-01`, last < today ? last : today, SCHEDULE);
      const summary = emps.map((e) => {
        const mine = rows.filter((r) => r.employeeId === e.id);
        const onLeave = new Set(leaves.filter((l) => l.employeeId === e.id).flatMap((l) => workingDays(l.fromDate, l.toDate, SCHEDULE)));
        return {
          employeeId: e.id, name: e.fullName, matricule: e.matricule,
          daysPresent: mine.length,
          lateMinutes: mine.reduce((s, r) => s + r.lateMinutes, 0),
          overtimeMinutes: mine.reduce((s, r) => s + r.overtimeMinutes, 0),
          unjustifiedAbsences: absences(days, new Set(mine.map((r) => r.date)), onLeave),
          validated: mine.length > 0 && mine.every((r) => r.validated),
        };
      });
      return { month: m, rows, summary };
    });
  }

  /** Validation par le responsable : les heures validées alimentent la paie sans ressaisie. */
  @Roles('RH', 'DIRECTION')
  @Post('attendance/validate')
  @HttpCode(200)
  validateAttendance(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), body);
    return this.db.forTenant(u.tenantId, (tx) => tx.attendance.updateMany({ where: { companyId, date: { startsWith: b.month } }, data: { validated: true } }));
  }

  // ---------- Recrutement ----------
  @Get('jobs')
  jobs(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const jobs = await tx.jobOpening.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
      return Promise.all(jobs.map(async (j) => {
        const cands = await tx.candidate.findMany({ where: { jobId: j.id } });
        return { ...j, ranking: rankCandidates(j.criteria as never, cands.map((c) => ({ id: c.id, name: c.name, scores: c.scores as never }))) };
      }));
    });
  }

  @Roles('RH')
  @Post('jobs')
  createJob(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ title: z.string().min(2), description: z.string().default(''), criteria: z.array(z.object({ code: z.string().min(1), label: z.string().min(2), weight: z.number() })) }), body);
    const errors = validateCriteria(b.criteria);
    if (errors.length) throw domainError('CRITERES', errors.join(' '));
    return this.db.forTenant(u.tenantId, (tx) => tx.jobOpening.create({ data: { ...b, tenantId: u.tenantId, companyId } }));
  }

  @Roles('RH')
  @Post('jobs/:jobId/candidates')
  addCandidate(@CurrentUser() u: SessionUser, @Param('jobId') jobId: string, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().min(2), email: z.string().email().optional(), phone: z.string().optional() }), body);
    return this.db.forTenant(u.tenantId, (tx) => tx.candidate.create({ data: { ...b, tenantId: u.tenantId, jobId } }));
  }

  /** Notation par plusieurs évaluateurs (0 à 20 par critère). */
  @Roles('RH', 'DIRECTION')
  @Post('candidates/:id/scores')
  @HttpCode(200)
  score(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ scores: z.array(z.object({ criterion: z.string(), score: z.number().min(0).max(20) })).min(1) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const c = await tx.candidate.findUniqueOrThrow({ where: { id } });
      const others = (c.scores as { evaluator: string }[]).filter((s) => s.evaluator !== u.userId);
      return tx.candidate.update({ where: { id }, data: { scores: [...others, ...b.scores.map((s) => ({ ...s, evaluator: u.userId }))] } });
    });
  }

  // ---------- Libre-service salarié, bulletins, déclarations ----------
  @Roles('EMPLOYE', 'RH', 'PAIE')
  @Get('me')
  me(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const e = await tx.employee.findFirst({ where: { companyId, userId: u.userId } });
      if (!e) return { employee: null, payslips: [], attendance: [] };
      const runs = await tx.payrollRun.findMany({ where: { companyId }, orderBy: { period: 'desc' }, take: 24 });
      const payslips = [];
      for (const r of runs) {
        const slips = await this.crypto.decryptJson<{ employeeId: string }[]>(tx, u.tenantId, r.resultEnc);
        const mine = slips.find((s) => s.employeeId === e.id);
        if (mine) payslips.push({ period: r.period, payDate: r.payDate, runId: r.id, slip: mine });
      }
      const { salaryEnc: _s, ...emp } = e;
      return { employee: emp, payslips, attendance: await tx.attendance.findMany({ where: { employeeId: e.id }, orderBy: { date: 'desc' }, take: 31 }) };
    });
  }

  /** Bulletin de paie (données à imprimer ; le salarié n'accède qu'au sien). */
  @Roles('EMPLOYE', 'RH', 'PAIE')
  @Get('payslips/:runId/:employeeId')
  payslip(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('runId') runId: string, @Param('employeeId') employeeId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const e = await tx.employee.findFirstOrThrow({ where: { id: employeeId, companyId } });
      const hr = u.roles.some((r) => ['ADMIN', 'RH', 'PAIE'].includes(r));
      if (!hr && e.userId !== u.userId) throw domainError('PERIMETRE', 'Bulletin d’un autre salarié.');
      const run = await tx.payrollRun.findFirstOrThrow({ where: { id: runId, companyId } });
      const slips = await this.crypto.decryptJson<{ employeeId: string }[]>(tx, u.tenantId, run.resultEnc);
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const { salaryEnc: _s, ...emp } = e;
      return { company, employee: emp, period: run.period, payDate: run.payDate, slip: slips.find((s) => s.employeeId === employeeId) };
    });
  }

  /** Déclaration sociale mensuelle (CNSS/CNPS/IPRES…) au format CSV à déposer auprès de l'organisme. */
  @Roles('PAIE', 'RH')
  @Get('declarations/:runId.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  declaration(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('runId') runId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirstOrThrow({ where: { id: runId, companyId } });
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const d = decimalsOf(company.currency);
      const slips = await this.crypto.decryptJson<{ matricule: string; fullName: string; gross: bigint; cnssEmployee: bigint; irpp: bigint; employer: { total: bigint } }[]>(tx, u.tenantId, run.resultEnc);
      const f = (v: bigint) => toDecimalString(v, d).replace('.', ',');
      // TODO(fiscaliste) : gabarits officiels des organismes (CNSS RDC, CNPS, IPRES…) pays par pays
      const header = `Employeur;${company.name};N° employeur;${company.employerNo ?? ''};Période;${run.period}\nMatricule;Nom;Salaire brut;Cotisation salariale;Cotisations patronales;Retenue impôt sur salaires`;
      return [header, ...slips.map((s) => [s.matricule, s.fullName, f(s.gross), f(s.cnssEmployee), f(s.employer.total), f(s.irpp)].join(';'))].join('\n');
    });
  }
}
