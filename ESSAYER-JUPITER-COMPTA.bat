@echo off
chcp 65001 >nul
title Jupiter Compta - essai local
echo.
echo  Jupiter Compta - essai sur cet ordinateur
echo  (premier lancement : 5 a 15 minutes, le temps de construire l'application)
echo.
docker info >nul 2>&1
if errorlevel 1 (
  echo  Docker Desktop n'est pas demarre. Installez-le depuis https://www.docker.com/products/docker-desktop/
  echo  puis lancez-le et relancez ce fichier.
  pause
  exit /b 1
)
docker compose up -d --build
if errorlevel 1 (
  echo  Le lancement a echoue : voir les messages ci-dessus.
  pause
  exit /b 1
)
echo  Demarrage de l'application...
:attente
timeout /t 5 >nul
curl -s -o nul -w "%%{http_code}" http://localhost:4000/api/health | findstr 200 >nul || goto attente
start "" http://localhost:3000
echo.
echo  Jupiter Compta est ouvert sur http://localhost:3000
echo  Comptes de demonstration (mot de passe Jupiter-Demo-2026) : comptable@demo.cd, chef@demo.cd, dg@demo.cd, admin@demo.cd
echo  Pour arreter : docker compose down
echo.
pause
