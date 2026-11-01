#!/bin/sh
# Génère le fichier .env de production (secrets aléatoires). À exécuter une seule fois sur le serveur ;
# conservez une copie du .env et de BACKUP_PASSPHRASE dans un coffre (sans eux, les sauvegardes sont illisibles).
set -eu
[ -f .env ] && { echo ".env existe déjà : rien n'est modifié."; exit 1; }
rnd() { openssl rand -base64 "$1" | tr -d '\n/+=' | cut -c1-"$2"; }
cat > .env <<ENV
APP_DOMAIN=${APP_DOMAIN:-app.jupser.cd}
ACME_EMAIL=${ACME_EMAIL:-admin@jupser.cd}
IMAGE=ghcr.io/jcngoyi6-stack/jupiter-compta
TAG=latest
POSTGRES_SUPERUSER_PASSWORD=$(rnd 48 40)
DB_OWNER_PASSWORD=$(rnd 48 40)
DB_APP_PASSWORD=$(rnd 48 40)
JWT_SECRET=$(rnd 96 80)
MASTER_KEY=$(openssl rand -base64 32)
PAYMENT_WEBHOOK_SECRET=$(rnd 48 40)
BACKUP_PASSPHRASE=$(rnd 48 40)
BACKUP_RETENTION_DAYS=30
BOOTSTRAP_STAFF_EMAIL=${BOOTSTRAP_STAFF_EMAIL:-console@jupser.cd}
BOOTSTRAP_STAFF_NAME=Console JUPSER
# À renseigner selon les contrats et services souscrits :
ANTHROPIC_API_KEY=
CINETPAY_API_KEY=
CINETPAY_SITE_ID=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_WEBHOOK_HASH=
MAIL_API_URL=
MAIL_API_TOKEN=
SMS_API_URL=
SMS_API_TOKEN=
WHATSAPP_API_URL=
WHATSAPP_API_TOKEN=
RDC_EMCF_URL=
RDC_EMCF_TOKEN=
FX_BCC_URL=
LICENSE_PRIVATE_KEY=
LICENSE_PUBLIC_KEY=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
ENV
chmod 600 .env
echo ".env créé (droits 600). Vérifiez APP_DOMAIN et ACME_EMAIL, puis : docker compose up -d"
