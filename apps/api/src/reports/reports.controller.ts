import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequiresModule, type SessionUser } from '../auth/decorators';
import { PrismaService } from '../common/prisma.service';
import { ReportsService } from './reports.service';

@ApiTags('Livres et états financiers')
@RequiresModule('COMPTABILITE')
@Controller('companies/:companyId/reports')
export class ReportsController {
  constructor(
    private readonly db: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  @Get('trial-balance')
  trialBalance(@CurrentUser() u: SessionUser, @Param('companyId') c: string, @Query('fiscalYearId') fy?: string, @Query('to') to?: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.reports.trialBalance(tx, c, fy, to));
  }

  @Get('general-ledger')
  ledger(@CurrentUser() u: SessionUser, @Param('companyId') c: string, @Query('fiscalYearId') fy?: string, @Query('account') account?: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.reports.generalLedger(tx, c, fy, account));
  }

  @Get('journal')
  journal(@CurrentUser() u: SessionUser, @Param('companyId') c: string, @Query('fiscalYearId') fy?: string, @Query('journal') j?: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.reports.journalBook(tx, c, fy, j));
  }

  @RequiresModule('ETATS_FINANCIERS')
  @Get('statements')
  statements(@CurrentUser() u: SessionUser, @Param('companyId') c: string, @Query('fiscalYearId') fy?: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.reports.statements(tx, c, fy));
  }

  @Get('controls')
  controls(@CurrentUser() u: SessionUser, @Param('companyId') c: string, @Query('fiscalYearId') fy?: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.reports.controls(tx, c, fy));
  }

  @Get('exports/entries.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ecritures.csv"')
  exportCsv(@CurrentUser() u: SessionUser, @Param('companyId') c: string, @Query('fiscalYearId') fy?: string) {
    return this.db.forTenant(u.tenantId, (tx) => this.reports.exportCsv(tx, c, fy));
  }
}
