-- Interconnexion des sociétés d'un groupe : tiers « société du groupe » et factures intragroupe avec acceptation
ALTER TABLE "third_party" ADD COLUMN "group_company_id" UUID;

CREATE TABLE "intercompany_invoice" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "seller_company_id" UUID NOT NULL,
    "buyer_company_id" UUID NOT NULL,
    "sales_document_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "total_net" BIGINT NOT NULL,
    "total_vat" BIGINT NOT NULL,
    "total_gross" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "decision" JSONB,
    "reason" TEXT,
    "buyer_entry_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "intercompany_invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "intercompany_invoice_sales_document_id_key" ON "intercompany_invoice"("sales_document_id");
CREATE INDEX "intercompany_invoice_buyer_company_id_status_idx" ON "intercompany_invoice"("buyer_company_id", "status");
CREATE INDEX "intercompany_invoice_seller_company_id_idx" ON "intercompany_invoice"("seller_company_id");

SELECT jc_apply_rls();
