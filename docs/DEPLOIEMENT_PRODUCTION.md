# Mise en production de Jupiter Compta

Kit : `deploy/production/` (image multi-étapes, `docker-compose.yml`, Caddy, sauvegardes, génération des secrets).
Publication de l'image : `.github/workflows/release.yml` (étiquette `v*` → `ghcr.io/jcngoyi6-stack/jupiter-compta`).

## 1. Serveur

| Élément | Minimum pour le lancement (≈ 50 sociétés actives) |
|---|---|
| Système | Ubuntu 24.04 LTS, accès SSH par clé uniquement, pare-feu ouvert sur 22, 80 et 443 |
| Ressources | 4 vCPU, 8 Go de mémoire, 100 Go SSD (base, pièces jointes, sauvegardes locales) |
| Logiciels | Docker Engine et `docker compose` ; mises à jour de sécurité automatiques (`unattended-upgrades`) |
| Localisation | Selon les exigences de protection des données du pays (RDC ou pays offrant une protection adéquate) |
| Nom de domaine | Enregistrement DNS `A` de `app.jupser.cd` (par exemple) vers l'adresse IP du serveur |

Au-delà : base PostgreSQL managée (réplication, sauvegarde continue) et plusieurs instances `api` / `web` derrière le proxy.

## 2. Première installation

```bash
git clone --branch jupiter-compta-v0.6.0 https://github.com/jcngoyi6-stack/jupser-jupiter-compta.git /opt/jupiter
```

```bash
cd /opt/jupiter/deploy/production && APP_DOMAIN=app.jupser.cd ACME_EMAIL=admin@jupser.cd BOOTSTRAP_STAFF_EMAIL=console@jupser.cd ./generate-secrets.sh
```

Conservez immédiatement une copie du fichier `.env` dans un coffre (gestionnaire de secrets) : sans `MASTER_KEY`, les
données chiffrées sont illisibles ; sans `BACKUP_PASSPHRASE`, les sauvegardes le sont aussi.

Renseignez dans `.env` les clés des services souscrits (CinetPay, Flutterwave, messagerie, SMS, e-MCF de la DGI, IA,
clés de licence, stockage objet). Puis :

```bash
docker compose pull && docker compose up -d
```

```bash
docker compose logs api | grep -A1 "Compte console créé"
```

Le mot de passe initial du compte console n'est affiché qu'une fois : connectez-vous sur `https://app.jupser.cd`,
activez la double authentification, changez le mot de passe. Les clients se créent ensuite depuis la **Console JUPSER**
(ou par l'inscription à l'essai gratuit).

Ce qui se passe au démarrage : migrations de la base, chargement des référentiels fiscaux et sociaux des 17 pays
(statut « à valider »), création du compte console ; aucune donnée de démonstration. Le simulateur de paiement est
désactivé en production (sauf `ALLOW_PAYMENT_SIMULATOR=true`, à réserver à la préproduction) ; la documentation de
l'API aussi (sauf `ENABLE_API_DOCS=true`).

## 3. Mises à jour

```bash
git tag v0.6.1 && git push origin v0.6.1
```

Le flux GitHub Actions publie l'image. Sur le serveur, après avoir fixé `TAG=v0.6.1` dans `.env` :

```bash
docker compose pull && docker compose up -d
```

Les migrations s'appliquent automatiquement. Toujours déployer d'abord en **préproduction** (même kit, autre domaine,
données anonymisées) et relire la sauvegarde de la veille avant une migration importante.

## 4. Sauvegardes et restauration

- Service `backup` : sauvegarde complète chiffrée (AES-256) toutes les 24 heures dans `deploy/production/backups`,
  rétention `BACKUP_RETENTION_DAYS` (30 jours par défaut).
- **Copie hors du serveur obligatoire** (stockage objet ou second site), par exemple avec `rclone` en tâche planifiée.
- **Test de restauration mensuel** sur une machine distincte :

```bash
gpg --batch --passphrase "$BACKUP_PASSPHRASE" -d jupiter-AAAAMMJJTHHMMSSZ.dump.gpg > jupiter.dump
```

```bash
docker compose exec -T db pg_restore -U postgres -d jupiter --clean --if-exists < jupiter.dump
```

Objectifs : perte de données maximale 24 heures (à réduire avec une base managée à sauvegarde continue), remise en
service en moins de 4 heures.

## 5. Supervision

- État : `https://app.jupser.cd/api/health` à surveiller toutes les minutes par un service externe (alerte SMS ou
  courriel) ; `docker compose ps` indique l'état des contrôles de santé.
- Journaux : `docker compose logs -f api` (rotation automatique 5 × 10 Mo par service) ; centralisation recommandée
  (Loki, Elastic ou équivalent) dès plusieurs serveurs.
- Certificats : renouvelés automatiquement par Caddy ; alerte si l'expiration approche.
- Indicateurs métier : tableau de bord de la Console JUPSER (abonnements, impayés, consommation IA).

## 6. Liste de contrôle de sécurité avant ouverture

- [ ] Test d'intrusion par un tiers et correction des points relevés.
- [ ] `.env` en droits 600, copie au coffre ; aucun secret de démonstration (le serveur refuse de démarrer sans les
      secrets en production).
- [ ] Clé maîtresse dans un KMS/HSM dès que possible (aujourd'hui : variable d'environnement).
- [ ] Accès SSH par clé, comptes nominatifs, journal des connexions.
- [ ] Double authentification activée pour tout le personnel JUPSER.
- [ ] Sauvegardes externalisées et restauration testée.
- [ ] Messagerie : domaine d'envoi authentifié (SPF, DKIM, DMARC).
- [ ] Mentions légales, conditions générales, politique de confidentialité publiées.
