-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('ENTREPRISE', 'CABINET');

-- CreateEnum
CREATE TYPE "AccountingSystem" AS ENUM ('NORMAL', 'SMT');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('BROUILLON', 'BROUILLON_IA', 'VALIDE', 'CONTREPASSE');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OUVERTE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('A_VALIDER', 'VALIDE');

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TenantType" NOT NULL DEFAULT 'ENTREPRISE',
    "edition" TEXT NOT NULL DEFAULT 'ESSENTIEL',
    "modules" TEXT[],
    "max_users" INTEGER NOT NULL DEFAULT 5,
    "max_companies" INTEGER NOT NULL DEFAULT 1,
    "ai_credits" INTEGER NOT NULL DEFAULT 100,
    "sub_status" TEXT NOT NULL DEFAULT 'ESSAI',
    "trial_ends_at" DATE,
    "paid_until" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mfa_secret_enc" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "is_jupser_staff" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "roles" TEXT[],
    "company_ids" TEXT[],

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_form" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "system" "AccountingSystem" NOT NULL DEFAULT 'NORMAL',
    "rccm" TEXT,
    "tax_id" TEXT,
    "national_id" TEXT,
    "employer_no" TEXT,
    "address" TEXT,
    "sector" TEXT,
    "activity" TEXT NOT NULL DEFAULT 'SERVICES',
    "share_capital" BIGINT NOT NULL DEFAULT 0,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "attachment_threshold" BIGINT,
    "four_eyes_threshold" BIGINT,
    "doc_sequences" JSONB NOT NULL DEFAULT '{}',
    "logo_data_url" TEXT,
    "system_decision" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_year" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OUVERTE',

    CONSTRAINT "period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "official" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "usage_label" TEXT,
    "class" INTEGER NOT NULL,
    "parent" TEXT,
    "imputable" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "collective" BOOLEAN NOT NULL DEFAULT false,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "counterpart_account" TEXT,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_sequence" (
    "tenant_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "journal_sequence_pkey" PRIMARY KEY ("journal_id","fiscal_year_id")
);

-- CreateTable
CREATE TABLE "third_party" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CD',
    "account" TEXT NOT NULL,

    CONSTRAINT "third_party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "seq" INTEGER,
    "number" TEXT,
    "date" TEXT NOT NULL,
    "piece_ref" TEXT NOT NULL,
    "piece_date" TEXT,
    "label" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'BROUILLON',
    "origin" TEXT NOT NULL DEFAULT 'MANUEL',
    "hash" TEXT,
    "prev_hash" TEXT,
    "reversal_of_id" UUID,
    "reversed_by_id" UUID,
    "created_by" UUID NOT NULL,
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_line" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "account" TEXT NOT NULL,
    "third_party_id" UUID,
    "label" TEXT,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT,
    "foreign_amount" BIGINT,
    "rate" TEXT,
    "rate_source" TEXT,
    "rate_date" TEXT,
    "vat_code" TEXT,
    "analytic" TEXT,
    "letter" TEXT,

    CONSTRAINT "entry_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "data_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "fx_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rule" (
    "id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "tax" TEXT NOT NULL,
    "param" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "status" "RuleStatus" NOT NULL DEFAULT 'A_VALIDER',
    "legal_ref" TEXT NOT NULL,
    "validated_by" TEXT,
    "validated_at" TIMESTAMP(3),

    CONSTRAINT "tax_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "matricule" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "position" TEXT,
    "hire_date" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "salary_enc" TEXT NOT NULL,
    "dependents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "third_party_id" UUID NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "pay_date" TEXT NOT NULL,
    "fx_rate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CALCULEE',
    "result_enc" TEXT NOT NULL,
    "entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_document" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "third_party_id" UUID NOT NULL,
    "lines" JSONB NOT NULL,
    "total_net" BIGINT NOT NULL,
    "total_vat" BIGINT NOT NULL,
    "total_gross" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EMISE',
    "hash" TEXT NOT NULL,
    "cancelled_by_id" UUID,
    "entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_action" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID,
    "tool" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PROPOSE',
    "user_id" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "months" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "external_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "at" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_key" (
    "tenant_id" UUID NOT NULL,
    "wrapped_key" TEXT NOT NULL,

    CONSTRAINT "tenant_key_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tenant_id_user_id_key" ON "membership"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_year_company_id_label_key" ON "fiscal_year"("company_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "account_company_id_number_key" ON "account"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_company_id_code_key" ON "journal"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "third_party_company_id_code_key" ON "third_party"("company_id", "code");

-- CreateIndex
CREATE INDEX "entry_company_id_date_idx" ON "entry"("company_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "entry_journal_id_fiscal_year_id_seq_key" ON "entry"("journal_id", "fiscal_year_id", "seq");

-- CreateIndex
CREATE INDEX "entry_line_account_idx" ON "entry_line"("account");

-- CreateIndex
CREATE UNIQUE INDEX "employee_company_id_matricule_key" ON "employee"("company_id", "matricule");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_company_id_period_key" ON "payroll_run"("company_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "sales_document_hash_key" ON "sales_document"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "sales_document_company_id_type_number_key" ON "sales_document"("company_id", "type", "number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_external_ref_key" ON "payment"("external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_tenant_id_seq_key" ON "audit_log"("tenant_id", "seq");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_year" ADD CONSTRAINT "fiscal_year_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period" ADD CONSTRAINT "period_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_line" ADD CONSTRAINT "entry_line_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
