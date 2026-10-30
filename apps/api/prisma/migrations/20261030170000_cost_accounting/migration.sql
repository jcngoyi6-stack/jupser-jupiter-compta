-- Comptabilité analytique de gestion (CAGE) : paramétrage et périodes calculées
CREATE TABLE "analytic_config" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "settings" JSONB NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "analytic_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "analytic_config_company_id_key" ON "analytic_config"("company_id");

CREATE TABLE "analytic_period" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "from_date" TEXT NOT NULL,
    "to_date" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BROUILLON',
    "created_by" UUID NOT NULL,
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytic_period_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytic_period_company_id_to_date_idx" ON "analytic_period"("company_id", "to_date");

-- Le module est inclus dans les éditions PRO et ERP : ajout aux locataires existants
UPDATE "tenant" SET "modules" = array_append("modules", 'COMPTABILITE_ANALYTIQUE')
 WHERE "edition" IN ('PRO', 'ERP') AND NOT ('COMPTABILITE_ANALYTIQUE' = ANY("modules"));

SELECT jc_apply_rls();
