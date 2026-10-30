-- AlterTable
ALTER TABLE "company" ADD COLUMN     "einvoice_settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "sales_document" ADD COLUMN     "einvoice" JSONB,
ADD COLUMN     "payment_method" TEXT NOT NULL DEFAULT 'VIREMENT';

-- AlterTable
ALTER TABLE "third_party" ADD COLUMN     "address" TEXT,
ADD COLUMN     "client_type" TEXT NOT NULL DEFAULT 'PM',
ADD COLUMN     "consent_marketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unsubscribed" BOOLEAN NOT NULL DEFAULT false;
