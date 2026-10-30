import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { balanceGap, decimalsOf, sha256, validateSubAccount, type EntryLineInput } from '@jupiter/ledger';
import { z } from 'zod';
import { ACCOUNTING_WRITE, CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { legalCurrency } from '../common/data';
import { domainError, parse, zAccount, zAmount, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';
import { ClosingService } from './closing.service';
import { CompanyService } from './company.service';
import { EntriesService } from './entries.service';

const zLine = (dec: number) =>
  z.object({
    account: zAccount,
    thirdPartyId: z.string().uuid().nullish(),
    label: z.string().max(200).optional(),
    debit: zAmount(dec).default('0'),
    credit: zAmount(dec).default('0'),
    vatCode: z.string().nullish(),
    analytic: z.string().nullish(),
    fx: z
      .object({
        currency: z.string().length(3),
        foreignAmount: zAmount(2),
        rate: z.string().regex(/^\d+([.,]\d+)?$/),
        rateSource: z.string().min(1),
        rateDate: zDate,
      })
      .nullish(),
  });

const zEntry = (dec: number) =>
  z.object({
    journalCode: z.string().min(1),
    date: zDate,
    pieceRef: z.string().max(60),
    pieceDate: zDate.nullish(),
    label: z.string().max(200),
    lines: z.array(zLine(dec)).min(1).max(500),
  });

async function companyDecimals(tx: Tx, companyId: string) {
  const c = await tx.company.findUnique({ where: { id: companyId } });
  if (!c) throw domainError('SOCIETE_INCONNUE', 'Société introuvable.');
  return decimalsOf(c.currency);
}

@ApiTags('Comptabilité')
@RequiresModule('COMPTABILITE')
@Controller()
export class AccountingController {
  constructor(
    private readonly db: PrismaService,
    private readonly companies: CompanyService,
    private readonly entries: EntriesService,
    private readonly closing: ClosingService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  // ---------- Sociétés (dossiers) ----------
  @Get('companies')
  list(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) =>
      tx.company.findMany({
        where: u.companyIds.length ? { id: { in: u.companyIds } } : {},
        include: { fiscalYears: { orderBy: { startDate: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  @Get('companies/:companyId')
  one(@CurrentUser() u: SessionUser, @Param('companyId') id: string) {
    return this.db.forTenant(u.tenantId, (tx) =>
      tx.company.findUniqueOrThrow({ where: { id }, include: { fiscalYears: { include: { periods: { orderBy: { startDate: 'asc' } } }, orderBy: { startDate: 'asc' } } } }),
    );
  }

  @Post('companies/smt-assessment')
  @HttpCode(200)
  smt(@Body() body: unknown) {
    const b = parse(
      z.object({ country: z.string().length(2), activity: z.enum(['NEGOCE', 'ARTISANAT', 'SERVICES']), expectedTurnover: z.string(), eurRate: z.string().optional() }),
      body,
    );
    const dec = decimalsOf(legalCurrency(b.country));
    const turnover = parse(zAmount(dec), b.expectedTurnover);
    return this.companies.smtAssessment({ ...b, expectedTurnover: turnover });
  }

  @Roles('ADMIN')
  @Post('companies')
  create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: z.string().min(2),
        legalForm: z.string().min(2),
        country: z.string().length(2),
        rccm: z.string().optional(),
        taxId: z.string().optional(),
        nationalId: z.string().optional(),
        employerNo: z.string().optional(),
        address: z.string().optional(),
        sector: z.string().optional(),
        activity: z.enum(['NEGOCE', 'ARTISANAT', 'SERVICES']),
        expectedTurnover: z.string(),
        eurRate: z.string().optional(),
        systemChoice: z.enum(['NORMAL', 'SMT']).optional(),
        creationDate: zDate.optional(),
        fiscalYearStart: zDate.optional(),
        fiscalYearEnd: zDate.optional(),
        shareCapital: z.string().optional(),
        headcount: z.number().int().min(1).optional(),
        logoDataUrl: z.string().max(500_000).regex(/^data:image\/(png|jpeg|svg\+xml);base64,/).optional(),
      }),
      body,
    );
    const dec = decimalsOf(legalCurrency(b.country));
    return this.db.forTenant(u.tenantId, (tx) =>
      this.companies.create(tx, u, {
        ...b,
        expectedTurnover: parse(zAmount(dec), b.expectedTurnover),
        shareCapital: b.shareCapital ? parse(zAmount(dec), b.shareCapital) : undefined,
      }),
    );
  }

  @Roles('ADMIN', 'CHEF_COMPTABLE')
  @Patch('companies/:companyId')
  update(@CurrentUser() u: SessionUser, @Param('companyId') id: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const dec = await companyDecimals(tx, id);
      const b = parse(
        z.object({
          address: z.string().optional(),
          rccm: z.string().optional(),
          taxId: z.string().optional(),
          nationalId: z.string().optional(),
          employerNo: z.string().optional(),
          headcount: z.number().int().min(1).optional(),
          attachmentThreshold: zAmount(dec).nullish(),
          fourEyesThreshold: zAmount(dec).nullish(),
          logoDataUrl: z.string().max(500_000).regex(/^data:image\/(png|jpeg|svg\+xml);base64,/).optional(),
          einvoiceSettings: z.object({ enabled: z.boolean().optional(), nim: z.string().max(40).optional(), mode: z.enum(['PRODUCTION', 'SIMULATION']).optional() }).optional(),
        }),
        body,
      );
      const c = await tx.company.update({ where: { id }, data: b });
      await this.audit.log(tx, u.tenantId, u.userId, 'SOCIETE_MODIFIEE', `company:${id}`, Object.keys(b));
      return c;
    });
  }

  // ---------- Plan de comptes ----------
  @Get('companies/:companyId/accounts')
  accounts(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('q') q?: string, @Query('imputable') imputable?: string) {
    return this.db.forTenant(u.tenantId, (tx) =>
      tx.account.findMany({
        where: {
          companyId,
          ...(imputable === 'true' ? { imputable: true, active: true } : {}),
          ...(q ? { OR: [{ number: { startsWith: q } }, { label: { contains: q, mode: 'insensitive' } }, { usageLabel: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        orderBy: { number: 'asc' },
        take: q ? 50 : 2000,
      }),
    );
  }

  @Roles(...ACCOUNTING_WRITE)
  @Post('companies/:companyId/accounts')
  createAccount(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ number: zAccount, parent: zAccount, label: z.string().min(2) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const all = await tx.account.findMany({ where: { companyId } });
      const errors = validateSubAccount(b.number, b.parent, new Map(all.map((a) => [a.number, { official: a.official, class: a.class }])));
      if (errors.length) throw domainError('SOUS_COMPTE_INVALIDE', errors.join(' '));
      const parent = all.find((a) => a.number === b.parent)!;
      const acc = await tx.account.create({
        data: { tenantId: u.tenantId, companyId, number: b.number, official: parent.official, label: b.label, class: parent.class, parent: parent.number, imputable: true, collective: parent.collective, isCustom: true },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'COMPTE_CREE', `account:${b.number}`, { parent: b.parent });
      return acc;
    });
  }

  @Roles(...ACCOUNTING_WRITE)
  @Patch('companies/:companyId/accounts/:number')
  patchAccount(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('number') number: string, @Body() body: unknown) {
    const b = parse(z.object({ usageLabel: z.string().max(120).nullish(), active: z.boolean().optional(), imputable: z.boolean().optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const acc = await tx.account.findUniqueOrThrow({ where: { companyId_number: { companyId, number } } });
      if (b.imputable === true && !acc.imputable) {
        const children = await tx.account.count({ where: { companyId, parent: acc.official, NOT: { number } } });
        if (children > 0) throw domainError('COMPTE_SUBDIVISE', 'Ce compte est subdivisé : imputez ses sous-comptes.');
      }
      if (b.imputable === false || b.active === false) {
        const used = await tx.entryLine.count({ where: { account: number, entry: { companyId } } });
        if (used > 0 && b.imputable === false) throw domainError('COMPTE_MOUVEMENTE', 'Compte mouvementé : il reste imputable (désactivation possible).');
      }
      const r = await tx.account.update({ where: { id: acc.id }, data: b });
      await this.audit.log(tx, u.tenantId, u.userId, 'COMPTE_MODIFIE', `account:${number}`, b);
      return r;
    });
  }

  // ---------- Journaux et tiers ----------
  @Get('companies/:companyId/journals')
  journals(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.journal.findMany({ where: { companyId }, orderBy: { code: 'asc' } }));
  }

  @Roles('CHEF_COMPTABLE')
  @Post('companies/:companyId/journals')
  createJournal(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(
      z.object({
        code: z.string().regex(/^[A-Z0-9]{2,6}$/),
        label: z.string().min(2),
        type: z.enum(['ACHATS', 'VENTES', 'BANQUE', 'CAISSE', 'MOBILE_MONEY', 'OD', 'PAIE']),
        counterpartAccount: zAccount.optional(),
      }),
      body,
    );
    return this.db.forTenant(u.tenantId, async (tx) => {
      const j = await tx.journal.create({ data: { ...b, tenantId: u.tenantId, companyId } });
      await this.audit.log(tx, u.tenantId, u.userId, 'JOURNAL_CREE', `journal:${b.code}`);
      return j;
    });
  }

  @Get('companies/:companyId/third-parties')
  thirdParties(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('type') type?: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.thirdParty.findMany({ where: { companyId, ...(type ? { type } : {}) }, orderBy: { name: 'asc' } }));
  }

  @Roles(...ACCOUNTING_WRITE, 'COMMERCIAL', 'CAISSIER')
  @Post('companies/:companyId/third-parties')
  createThirdParty(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(
      z.object({
        type: z.enum(['CLIENT', 'FOURNISSEUR', 'SALARIE', 'AUTRE']),
        code: z.string().min(1).max(20),
        name: z.string().min(2),
        taxId: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        country: z.string().length(2).default('CD'),
        account: zAccount.optional(),
        clientType: z.enum(['PP', 'PM', 'PC', 'PL', 'AO']).default('PM'),
        address: z.string().optional(),
        consentMarketing: z.boolean().default(false),
      }),
      body,
    );
    const def = { CLIENT: '411100', FOURNISSEUR: '401000', SALARIE: '422000', AUTRE: '471000' }[b.type];
    return this.db.forTenant(u.tenantId, async (tx) => {
      const tp = await tx.thirdParty.create({ data: { ...b, account: b.account ?? def, tenantId: u.tenantId, companyId } });
      await this.audit.log(tx, u.tenantId, u.userId, 'TIERS_CREE', `third_party:${tp.id}`);
      return tp;
    });
  }

  // ---------- Écritures ----------
  @Get('companies/:companyId/entries')
  listEntries(
    @CurrentUser() u: SessionUser,
    @Param('companyId') companyId: string,
    @Query('status') status?: string,
    @Query('journal') journal?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
  ) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const j = journal ? await tx.journal.findUnique({ where: { companyId_code: { companyId, code: journal } } }) : null;
      const where = {
        companyId,
        ...(status ? { status: { in: status.split(',') as ('BROUILLON' | 'BROUILLON_IA' | 'VALIDE' | 'CONTREPASSE')[] } } : {}),
        ...(j ? { journalId: j.id } : {}),
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      };
      const take = 50;
      const [items, total, journals] = await Promise.all([
        tx.entry.findMany({ where, include: { lines: { orderBy: { lineNo: 'asc' } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take, skip: (Number(page) - 1) * take }),
        tx.entry.count({ where }),
        tx.journal.findMany({ where: { companyId } }),
      ]);
      const codes = new Map(journals.map((x) => [x.id, x.code]));
      return { items: items.map((e) => ({ ...e, journalCode: codes.get(e.journalId) })), total, page: Number(page), pageSize: take };
    });
  }

  @Get('companies/:companyId/entries/:id')
  getEntry(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const { entry, journal, result } = await this.entries.check(tx, companyId, id);
      return { ...entry, journalCode: journal.code, checks: result };
    });
  }

  /** Contrôle en temps réel pendant la saisie (indicateur d'équilibre). */
  @Post('companies/:companyId/entries/preview')
  @HttpCode(200)
  preview(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(zEntry(await companyDecimals(tx, companyId)), body);
      return { gap: balanceGap(b.lines as EntryLineInput[]) };
    });
  }

  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Post('companies/:companyId/entries')
  createEntry(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown, @Query('validate') validate?: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(zEntry(await companyDecimals(tx, companyId)), body);
      const draft = await this.entries.createDraft(tx, u, companyId, b as never);
      if (validate === 'true') return (await this.entries.validate(tx, u, companyId, draft.id)).entry;
      return draft;
    });
  }

  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Put('companies/:companyId/entries/:id')
  updateEntry(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const b = parse(zEntry(await companyDecimals(tx, companyId)), body);
      return this.entries.updateDraft(tx, u, companyId, id, b as never);
    });
  }

  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Delete('companies/:companyId/entries/:id')
  deleteEntry(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.entries.deleteDraft(tx, u, companyId, id));
  }

  @Roles(...ACCOUNTING_WRITE, 'PAIE')
  @Post('companies/:companyId/entries/:id/validate')
  @HttpCode(200)
  validateEntry(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.entries.validate(tx, u, companyId, id));
  }

  @Roles('CHEF_COMPTABLE', 'COMPTABLE')
  @Post('companies/:companyId/entries/:id/reverse')
  reverse(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ date: zDate }), body);
    return this.db.forTenant(u.tenantId, (tx) => this.entries.reverse(tx, u, companyId, id, b.date));
  }

  /** Pièce justificative chiffrée (AES-256-GCM), empreinte SHA-256 pour la valeur probante. */
  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Post('companies/:companyId/entries/:id/attachments')
  attach(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(
      z.object({ fileName: z.string().max(200), mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg']), base64: z.string().max(14_000_000) }),
      body,
    );
    return this.db.forTenant(u.tenantId, async (tx) => {
      await this.entries.get(tx, companyId, id);
      const data = Buffer.from(b.base64, 'base64');
      const digest = sha256(data);
      const a = await tx.attachment.create({
        data: { tenantId: u.tenantId, entryId: id, fileName: b.fileName, mimeType: b.mimeType, sha256: digest, dataEnc: await this.crypto.encryptBytes(tx, u.tenantId, data) },
        select: { id: true, fileName: true, sha256: true, createdAt: true },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'PIECE_JOINTE', `entry:${id}`, { sha256: digest });
      return a;
    });
  }

  @Get('companies/:companyId/attachments/:attId')
  async attachment(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('attId') attId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const a = await tx.attachment.findFirstOrThrow({ where: { id: attId, entry: { companyId } } });
      const data = await this.crypto.decryptBytes(tx, u.tenantId, a.dataEnc);
      return { fileName: a.fileName, mimeType: a.mimeType, sha256: a.sha256, intact: sha256(data) === a.sha256, base64: data.toString('base64') };
    });
  }

  // ---------- Périodes, exercices, lettrage ----------
  @Roles('CHEF_COMPTABLE', 'COMPTABLE')
  @Post('companies/:companyId/periods/:periodId/close')
  @HttpCode(200)
  closePeriod(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('periodId') periodId: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.closing.closePeriod(tx, u, companyId, periodId));
  }

  @Roles('CHEF_COMPTABLE')
  @Post('companies/:companyId/periods/:periodId/reopen')
  @HttpCode(200)
  reopenPeriod(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('periodId') periodId: string, @Body() body: unknown) {
    const b = parse(z.object({ reason: z.string() }), body);
    return this.db.forTenant(u.tenantId, (tx) => this.closing.reopenPeriod(tx, u, companyId, periodId, b.reason));
  }

  @Roles('CHEF_COMPTABLE')
  @Post('companies/:companyId/fiscal-years/:fyId/close')
  @HttpCode(200)
  closeYear(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('fyId') fyId: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.closing.closeFiscalYear(tx, u, companyId, fyId));
  }

  @Roles(...ACCOUNTING_WRITE)
  @Post('companies/:companyId/lettering/auto')
  @HttpCode(200)
  autoLetter(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ account: zAccount }), body);
    return this.db.forTenant(u.tenantId, (tx) => this.closing.autoLettering(tx, u, companyId, b.account));
  }

  @Roles(...ACCOUNTING_WRITE)
  @Post('companies/:companyId/lettering')
  @HttpCode(200)
  letter(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ lineIds: z.array(z.string().uuid()).min(2) }), body);
    return this.db.forTenant(u.tenantId, (tx) => this.closing.manualLettering(tx, u, companyId, b.lineIds));
  }

  @Get('companies/:companyId/open-items')
  openItems(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Query('account') account: string) {
    return this.db.forTenant(u.tenantId, (tx) =>
      tx.entryLine.findMany({
        where: { account: { startsWith: account ?? '411' }, entry: { companyId, status: { in: ['VALIDE', 'CONTREPASSE'] } } },
        include: { entry: { select: { date: true, number: true, pieceRef: true, label: true } } },
        orderBy: { entry: { date: 'asc' } },
      }),
    );
  }

  // ---------- Audit ----------
  @Roles('ADMIN', 'AUDITEUR', 'CHEF_COMPTABLE', 'EXPERT_EXTERNE')
  @Get('audit')
  auditLog(@CurrentUser() u: SessionUser, @Query('page') page = '1') {
    return this.db.forTenant(u.tenantId, async (tx) => ({
      items: await tx.auditLog.findMany({ orderBy: { seq: 'desc' }, take: 100, skip: (Number(page) - 1) * 100 }),
      verification: await this.audit.verify(tx, u.tenantId),
    }));
  }
}
