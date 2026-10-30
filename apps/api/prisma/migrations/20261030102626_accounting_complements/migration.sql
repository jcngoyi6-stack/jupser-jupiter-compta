-- AlterTable
ALTER TABLE "company" ADD COLUMN     "budget_mode" TEXT NOT NULL DEFAULT 'ALERTE',
ADD COLUMN     "methods" JSONB NOT NULL DEFAULT '{"depreciation":"LINEAIRE","stocks":"CMUP"}';

-- AlterTable
ALTER TABLE "third_party" ADD COLUMN     "payment_terms_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "fixed_asset" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "acquisition_date" TEXT NOT NULL,
    "in_service_date" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "booked_years" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'EN_SERVICE',
    "disposal_date" TEXT,
    "disposal_price" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_line" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "account" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reference" TEXT,
    "matched_line_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'INITIAL',
    "prefix" TEXT NOT NULL,
    "analytic" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL,

    CONSTRAINT "budget_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_text" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BROUILLON',
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),

    CONSTRAINT "note_text_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mapping" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,

    CONSTRAINT "account_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_adjustment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "tax_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_forecast_item" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "cash_forecast_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidation_group" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "members" JSONB NOT NULL,

    CONSTRAINT "consolidation_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_company_id_code_key" ON "fixed_asset"("company_id", "code");

-- CreateIndex
CREATE INDEX "bank_statement_line_company_id_account_idx" ON "bank_statement_line"("company_id", "account");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_fiscal_year_id_version_prefix_analytic_key" ON "budget_line"("fiscal_year_id", "version", "prefix", "analytic");

-- CreateIndex
CREATE UNIQUE INDEX "note_text_fiscal_year_id_number_key" ON "note_text"("fiscal_year_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "account_mapping_company_id_source_key" ON "account_mapping"("company_id", "source");

-- RLS générique : toute table portant tenant_id (hors tables globales) est isolée par locataire.
CREATE OR REPLACE FUNCTION jc_apply_rls() RETURNS void AS $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
           WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE'
             AND c.table_name NOT IN ('membership')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO jupiter_app', t);
  END LOOP;
END $$ LANGUAGE plpgsql;
SELECT jc_apply_rls();
