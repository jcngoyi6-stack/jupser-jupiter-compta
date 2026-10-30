#!/usr/bin/env bash
# Essai local de Jupiter Compta (macOS, Linux) : nécessite Docker Desktop ou Docker Engine.
set -e
cd "$(dirname "$0")"
docker info >/dev/null 2>&1 || { echo "Docker n'est pas démarré : installez et lancez Docker Desktop."; exit 1; }
echo "Premier lancement : 5 à 15 minutes (construction de l'application)…"
docker compose up -d --build
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/health)" = 200 ]; do sleep 5; done
URL=http://localhost:3000
(command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true
echo "Jupiter Compta est ouvert sur $URL"
echo "Comptes de démonstration (mot de passe Jupiter-Demo-2026) : comptable@demo.cd, chef@demo.cd, dg@demo.cd, admin@demo.cd"
echo "Pour arrêter : docker compose down"
