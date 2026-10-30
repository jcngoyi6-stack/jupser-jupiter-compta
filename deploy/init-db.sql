-- Rôles de Jupiter Compta : propriétaire (migrations) et applicatif (sans contournement de la sécurité par ligne).
CREATE ROLE jupiter_owner LOGIN PASSWORD 'owner_dev_pw' CREATEDB BYPASSRLS;
CREATE ROLE jupiter_app LOGIN PASSWORD 'app_dev_pw' NOBYPASSRLS;
CREATE DATABASE jupiter OWNER jupiter_owner;
