import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AccountingController } from './accounting/accounting.controller';
import { ComplementsController, ConsolidationController } from './accounting/complements.controller';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { CabinetController } from './cabinet/cabinet.controller';
import { SecurityController } from './security/security.controller';
import { SpecialOpsController } from './special-ops/special-ops.controller';
import { IntercompanyController } from './group/intercompany.controller';
import { SsoController } from './security/sso.controller';
import { ProjectsController } from './projects/projects.controller';
import { ClosingService } from './accounting/closing.service';
import { CompanyService } from './accounting/company.service';
import { EntriesService } from './accounting/entries.service';
import { AiController } from './ai/ai.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SecurityGuard } from './auth/guards';
import { BillingController } from './billing/billing.controller';
import { PaymentsService } from './billing/payments.service';
import { AuditService } from './common/audit.service';
import { CryptoService } from './common/crypto.service';
import { DbErrorFilter } from './common/errors';
import { PrismaService } from './common/prisma.service';
import { HealthController } from './common/health.controller';
import { PayrollController } from './payroll/payroll.controller';
import { StockController } from './erp/stock.controller';
import { StockService } from './erp/stock.service';
import { SalesCrmController, UnsubscribeController } from './erp/sales-crm.controller';
import { MessagingService } from './erp/messaging.service';
import { HrController } from './erp/hr.controller';
import { CollabController, GedController } from './erp/collab.controller';
import { StorageService } from './common/storage.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { EInvoiceService } from './sales/einvoice.service';
import { SalesController } from './sales/sales.controller';
import { TaxController } from './tax/tax.controller';

@Module({
  controllers: [
    HealthController,
    AuthController,
    AccountingController,
    ComplementsController,
    SpecialOpsController,
    IntercompanyController,
    CabinetController,
    AnalyticsController,
    SecurityController,
    SsoController,
    ProjectsController,
    ConsolidationController,
    ReportsController,
    TaxController,
    PayrollController,
    StockController,
    SalesCrmController,
    UnsubscribeController,
    HrController,
    CollabController,
    GedController,
    SalesController,
    AiController,
    BillingController,
  ],
  providers: [
    PrismaService,
    PaymentsService,
    AnalyticsService,
    CryptoService,
    AuditService,
    AuthService,
    CompanyService,
    EntriesService,
    ClosingService,
    ReportsService,
    EInvoiceService,
    StockService,
    MessagingService,
    StorageService,
    { provide: APP_GUARD, useClass: SecurityGuard },
    { provide: APP_FILTER, useClass: DbErrorFilter },
  ],
})
export class AppModule {}
