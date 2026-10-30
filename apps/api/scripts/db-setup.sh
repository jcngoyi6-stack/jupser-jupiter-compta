#!/usr/bin/env bash
# Crée les rôles et la base PostgreSQL de Jupiter Compta (à exécuter avec un compte superutilisateur).
# Usage : DB_NAME=jupiter ./scripts/db-setup.sh
set -euo pipefail
DB_NAME="${DB_NAME:-jupiter}"
PSQL="${PSQL:-sudo -u postgres psql -v ON_ERROR_STOP=1}"
$PSQL <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jupiter_owner') THEN
    CREATE ROLE jupiter_owner LOGIN PASSWORD 'owner_dev_pw' CREATEDB BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jupiter_app') THEN
    CREATE ROLE jupiter_app LOGIN PASSWORD 'app_dev_pw' NOBYPASSRLS;
  END IF;
END \$\$;
SQL
$PSQL -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || $PSQL -c "CREATE DATABASE ${DB_NAME} OWNER jupiter_owner"
echo "Base ${DB_NAME} prête. Lancez : pnpm --filter @jupiter/api exec prisma migrate deploy"
