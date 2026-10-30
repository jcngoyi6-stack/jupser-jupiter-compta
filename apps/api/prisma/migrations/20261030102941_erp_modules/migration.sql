-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "badge_id" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "contract_type" TEXT NOT NULL DEFAULT 'CDI',
ADD COLUMN     "department" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "leave_balance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "third_party" ADD COLUMN     "loyalty_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "segment" TEXT;

-- CreateTable
CREATE TABLE "stock_item" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'u',
    "kind" TEXT NOT NULL DEFAULT 'MARCHANDISE',
    "method" TEXT NOT NULL DEFAULT 'CMUP',
    "stock_account" TEXT NOT NULL,
    "purchase_account" TEXT NOT NULL,
    "sales_account" TEXT NOT NULL,
    "variation_account" TEXT NOT NULL,
    "sale_price" BIGINT NOT NULL DEFAULT 0,
    "reorder_level" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stock_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_move" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty_milli" BIGINT NOT NULL,
    "unit_cost" BIGINT NOT NULL,
    "total_cost" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "lot" TEXT,
    "expiry" TEXT,
    "entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BROUILLON',
    "lines" JSONB NOT NULL,
    "total_net" BIGINT NOT NULL,
    "total_vat" BIGINT NOT NULL,
    "expense_account" TEXT NOT NULL,
    "analytic" TEXT,
    "approvals" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "components" JSONB NOT NULL,
    "routing" JSONB NOT NULL DEFAULT '[]',
    "overhead_rate" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "bom_id" UUID NOT NULL,
    "qty_milli" BIGINT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LANCE',
    "cost_sheet" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "org" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'PROSPECT',
    "value" BIGINT NOT NULL DEFAULT 0,
    "owner_id" UUID,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "segment" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BROUILLON',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_message" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "contact_type" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVOYE',
    "token" TEXT NOT NULL,

    CONSTRAINT "campaign_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CONGE_PAYE',
    "from_date" TEXT NOT NULL,
    "to_date" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DEMANDE',
    "decided_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "check_in" TEXT,
    "check_out" TEXT,
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'FINGERTEC',
    "validated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_opening" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "criteria" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OUVERT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_opening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "scores" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'CANDIDAT',

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "members" TEXT[],
    "is_private" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "participants" JSONB NOT NULL,
    "minutes" TEXT,
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'CONVOQUEE',
    "created_by" UUID NOT NULL,

    CONSTRAINT "meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "assignee_id" UUID NOT NULL,
    "due_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'A_FAIRE',
    "source" TEXT NOT NULL DEFAULT 'MANUEL',
    "link" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "third_party_id" UUID,
    "doc_date" TEXT,
    "amount" BIGINT,
    "fiscal_year" TEXT,
    "retention_until" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT,
    "data_enc" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "entry_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "correspondent" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "service" TEXT,
    "assignee_id" UUID,
    "due_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENREGISTRE',
    "document_id" UUID,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "responsible_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EN_COURS',
    "budget_minutes" INTEGER NOT NULL DEFAULT 0,
    "fee_amount" BIGINT NOT NULL DEFAULT 0,
    "hourly_rate" BIGINT NOT NULL DEFAULT 0,
    "deadline" TEXT,
    "review" JSONB NOT NULL DEFAULT '{}',
    "audit" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_evaluation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "results" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIF',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_item_company_id_code_key" ON "stock_item"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_company_id_code_key" ON "warehouse"("company_id", "code");

-- CreateIndex
CREATE INDEX "stock_move_company_id_item_id_idx" ON "stock_move"("company_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_company_id_number_key" ON "purchase_order"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_company_id_number_key" ON "work_order"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_message_token_key" ON "campaign_message"("token");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employee_id_date_key" ON "attendance"("employee_id", "date");

-- CreateIndex
CREATE INDEX "message_channel_id_created_at_idx" ON "message"("channel_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mail_tenant_id_number_key" ON "mail"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "device_fingerprint_key" ON "device"("fingerprint");
SELECT jc_apply_rls();
