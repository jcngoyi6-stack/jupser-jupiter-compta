# Essayer Jupiter Compta sur votre ordinateur

Tout tourne sur votre machine (base de données, serveur, interface) ; rien n'est envoyé sur Internet. Les données sont **fictives**.

## 1. Prérequis (une seule fois)

Installer **Docker Desktop** (Windows 10/11, macOS) : https://www.docker.com/products/docker-desktop/ — puis le démarrer.
Sous Linux : Docker Engine avec le module `docker compose`.

## 1 bis. Télécharger

Version à jour : https://github.com/jcngoyi6-stack/jupser-jupiter-compta/archive/refs/heads/jupiter-compta-v0.6.0.zip
(connecté à GitHub avec un compte ayant accès au dépôt), puis décompressez l'archive.

## 2. Lancer

- **Windows** : décompressez l'archive, puis double-cliquez sur `ESSAYER-JUPITER-COMPTA.bat`.
- **macOS / Linux** : dans un terminal, depuis le dossier décompressé :

```bash
./essayer-jupiter-compta.sh
```

Le premier lancement construit l'application (5 à 15 minutes selon la connexion). Les suivants prennent quelques secondes.
Le navigateur s'ouvre ensuite sur **http://localhost:3000**.

## 3. Se connecter

Mot de passe de tous les comptes de démonstration : `Jupiter-Demo-2026`.

| Compte | Rôle |
|---|---|
| `comptable@demo.cd` | Comptable |
| `chef@demo.cd` | Chef comptable (valide les périodes analytiques) |
| `dg@demo.cd` | Direction |
| `admin@demo.cd` | Administrateur |
| `console@jupser.cd` | Console JUPSER |

À la première connexion des rôles comptables, la **double authentification** est demandée : scannez le QR code avec Google Authenticator ou Microsoft Authenticator, puis saisissez le code à 6 chiffres.

## 4. Voir la comptabilité analytique

1. En haut de l'écran, choisissez la société **Boulangerie de démonstration**.
2. Menu **Gestion → Comptabilité analytique**.
3. Période : du 1er au 28 février de l'année en cours → **Collecter les données de la période** → **Calculer les coûts et les résultats**.
4. Parcourez : Synthèse, Charges incorporables, Tableau de répartition, Coûts, Concordance, Journal classe 9.
5. Enregistrez la période (compte comptable), puis validez-la avec le compte chef comptable (règle des quatre yeux) : les ordres de fabrication suivants utiliseront le coût de l'unité d'œuvre de l'atelier.
6. Onglets **Paramétrage** (centres, clés, unités d'œuvre) et **Coûts partiels, ABC et contrôle de gestion** (seuil de rentabilité, imputation rationnelle, coût marginal, ABC, écarts, prévisions, Wilson).
7. Dans **Saisie**, une ligne de charge (classe 6) propose le code analytique du centre.

## 5. Arrêter ou repartir de zéro

```bash
docker compose down
```

```bash
docker compose down -v
```

La seconde commande efface aussi la base d'essai : au prochain lancement, les données de démonstration sont recréées.
