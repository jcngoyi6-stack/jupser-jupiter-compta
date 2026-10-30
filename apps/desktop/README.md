# Jupiter Compta — application de bureau (Tauri 2)

Fenêtre native Windows, macOS et Linux autour de l'application web : mêmes contrôles de sécurité
(session httpOnly, double authentification, postes enrôlés), aucune donnée comptable stockée localement.
La commande `installation_fingerprint` fournit l'empreinte utilisée par les licences hors ligne (docs/09).

## Avant la compilation
- Remplacer `https://app.jupiter-compta.example` (dans `tauri.conf.json` et `capabilities/default.json`) par l'adresse de production.
- Générer le jeu d'icônes complet : `pnpm tauri icon ../web/public/brand/icone_Jupiter_Compta_512.png`.
- Signer les binaires (certificat de signature de code Windows, notarisation Apple).

## Compiler
Prérequis : Rust stable et les dépendances système de Tauri (WebView2 sous Windows ; `libwebkit2gtk-4.1-dev`, `libssl-dev`, `librsvg2-dev` sous Linux).

```bash
pnpm install
pnpm --filter @jupiter/desktop tauri:build
```

État : projet posé et relu, **non compilé** dans l'environnement de développement (WebKitGTK absent).
