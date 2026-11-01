-- Réinitialisation du mot de passe par courriel ; révocation des sessions après changement
ALTER TABLE "app_user" ADD COLUMN "password_changed_at" TIMESTAMP(3);

CREATE TABLE "password_reset" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_token_hash_key" ON "password_reset"("token_hash");
CREATE INDEX "password_reset_user_id_idx" ON "password_reset"("user_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "password_reset" TO jupiter_app;
