#!/bin/sh
# Sauvegarde quotidienne chiffrée (AES-256, phrase secrète) de la base, rétention configurable.
# Restauration : voir docs/DEPLOIEMENT_PRODUCTION.md. Copiez aussi /backups hors du serveur (stockage objet, autre site).
set -eu
apk add --no-cache gnupg >/dev/null 2>&1 || true
while true; do
  f="/backups/jupiter-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
  if pg_dump -h db -U postgres -d jupiter -Fc | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$f"; then
    echo "Sauvegarde : $f"
  else
    echo "ÉCHEC de la sauvegarde $(date -u)" >&2
  fi
  find /backups -name 'jupiter-*.dump.gpg' -mtime +"${BACKUP_RETENTION_DAYS}" -delete
  sleep 86400
done
