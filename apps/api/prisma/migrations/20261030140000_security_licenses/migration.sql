-- Sécurité du locataire (SSO OIDC, postes enrôlés obligatoires) et licences hors ligne signées Ed25519
ALTER TABLE "tenant" ADD COLUMN "slug" TEXT;
ALTER TABLE "tenant" ADD COLUMN "security" JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

CREATE TABLE "license" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "token_hash" TEXT NOT NULL,
    "issued_by" UUID NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "license_pkey" PRIMARY KEY ("id")
);

SELECT jc_apply_rls();
