#!/bin/sh
# Rôles de Jupiter Compta : propriétaire (migrations) et applicatif (soumis à la sécurité au niveau des lignes).
set -eu
psql -v ON_ERROR_STOP=1 --username postgres <<SQL
CREATE ROLE jupiter_owner LOGIN PASSWORD '${DB_OWNER_PASSWORD}' CREATEDB BYPASSRLS;
CREATE ROLE jupiter_app LOGIN PASSWORD '${DB_APP_PASSWORD}' NOBYPASSRLS;
CREATE DATABASE jupiter OWNER jupiter_owner;
SQL
