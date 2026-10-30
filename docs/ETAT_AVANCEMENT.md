# État d'avancement — version 0.4.0 (30/10/2026)

Relecture complète des modules à la lumière du guide d'application du SYSCOHADA révisé : voir [docs/19](19_RELECTURE_GUIDE_APPLICATION.md).

Légende : ✅ développé et couvert par des tests automatisés · 🟡 développé, validation métier ou contrat externe en attente · ⬜ non commencé

La recette de chaque lot (docs/10) exige des validations humaines (fiscaliste, expert-comptable, DGI, jeux de données réels) : « développé » ne signifie pas « recetté ».

## Lots (docs/10)

| Lot | État | Détail |
|---|---|---|
| L0 Socle | ✅ | Monorepo, Argon2id, TOTP obligatoire par rôle, verrouillage, session 30 min glissante, anti-CSRF, RLS + test d'isolation, audit chaîné SHA-256, chiffrement AES-256-GCM par locataire, **postes enrôlés** (clé Ed25519 du navigateur, requêtes signées, approbation, révocation), **SSO OIDC** (PKCE, id_token vérifié, domaines autorisés), i18n **fr/en/pt/es** (menus). ⬜ KMS/HSM réel, Prometheus |
| L1 Comptabilité | ✅ | Plan SYSCOHADA 6 chiffres aligné sur l'AUDCIF (1 354 comptes), saisie, contrôles, lettrage, devises, **imports** (balance 4/6/8 colonnes, journal, plan), **rapprochement bancaire** assisté, **immobilisations** par composants (linéaire, dégressif, unités d'œuvre, cessions) |
| L2 États financiers | 🟡 | Bilan, compte de résultat, TFT alignés sur les tableaux de correspondance de l'AUDCIF, **notes annexes 1 à 36**, **SMT** (modèle officiel), **DSF** (Excel), livre d'inventaire. À confronter par un expert-comptable avec le guide d'application |
| L3 Licences et paiements | 🟡 | Éditions, modules, quotas, lecture seule J+15, suspension J+60, **CinetPay et Flutterwave** (statut toujours revérifié auprès du prestataire, montant contrôlé), **licences hors ligne Ed25519** (console JUPSER, vérification en ligne, révocation, tolérance 30 jours). Contrats prestataires à signer ; factures JUPSER à brancher sur le module de facturation |
| L4 JUPSER IA v1 | 🟡 | Guide, pièce → écriture `BROUILLON_IA`, **OCR des photos et PDF par vision Claude** (JSON contrôlé, fournisseur reconnu, incohérences signalées), rédaction de courriers. Critère « ≥ 85 % des champs corrects sur 200 pièces » à mesurer sur des pièces réelles |
| L5 Fiscalité + paie RDC | 🟡 | Règles RDC versionnées `A_VALIDER`, TVA, IS, paie, **facture normalisée DGI** (DEF/e-MCF : client HTTP + simulateur), déclarations sociales (CSV), bulletins. Spécification e-MCF et barèmes à valider (DGI, fiscaliste) |
| L6 Analyse financière | ✅ | SIG, ratios, TFT, **prévision de trésorerie** 13 semaines / mensuelle, **budget** (alerte ou blocage) |
| CAGE (docs/18) | 🟡 | **Comptabilité analytique de gestion** interconnectée : collecte automatique (grand-livre avec codes analytiques, stocks, production, ventes, budgets), centres et prestations réciproques, coûts complets, imputation rationnelle, concordance exacte, journal classe 9, coûts partiels, ABC, standards et écarts, budgets ; frais d'atelier des ordres de fabrication au coût de l'UO. Plan analytique de la classe 9 à 6 chiffres validé par JUPSER le 30/10/2026 |
| L7 Production et marketing | ✅ | Nomenclatures, ordres de fabrication, coût de revient, stocks CMUP/PEPS en inventaire permanent, achats (quatre yeux), CRM, campagnes avec consentement et désinscription |
| L7b Documents, collaboration, GED, courrier | ✅ | Devis, proformas, bons de commande et de livraison avec QR, messagerie interne, réunions (PV → tâches), GED (classement, rétention), registre du courrier |
| L7c Budget, trésorerie, stocks, présence, recrutement | 🟡 | Import des pointages (Fingertec), congés, recrutement (critères non discriminatoires), espace salarié. Majoration des heures supplémentaires et durée légale `A_VALIDER` par pays |
| L8 Packs pays | 🟡 | 16 autres pays : règles générées depuis le référentiel, toutes `A_VALIDER`, paie générique (`PACK_PAYS_INCOMPLET` tant qu'un barème manque) |
| L9 IA Agent, Cabinet, consolidation | 🟡 | **Espace Cabinet** : portefeuille, missions, temps et honoraires, circuit préparateur → réviseur → associé, dossier d'audit (seuil, risques, programmes ISA, feuilles de travail, anomalies, Benford, écritures inhabituelles, sondage MUS, revue analytique), états depuis une balance avec correspondance mémorisée, documents Word (lettre de mission, confirmations…), **manuel de procédures** (séparation des tâches), **évaluation d'entreprise**, **restructuration** ; **évaluation de projets** (VAN, TRI, TRIM, délais, IP, sensibilité, scénarios, Monte-Carlo, rapport Word) ; **consolidation** (IG, MEE). ⬜ agents IA multi-étapes, liasses en masse |

## Applications

| Application | État |
|---|---|
| `apps/api` | ✅ 70 tests d'acceptation sur PostgreSQL |
| `apps/web` | ✅ compilation `next build` sans erreur |
| `apps/desktop` (Tauri 2) | 🟡 projet complet, **non compilé ici** (WebKitGTK absent de l'environnement) ; voir `apps/desktop/README.md` |
| Console JUPSER | ✅ intégrée à `apps/web` (`/console`, réservée au personnel JUPSER) |

## Écarts assumés par rapport à la pile cible

- Redis/BullMQ non utilisé : aucune tâche de fond longue à ce stade (les traitements sont synchrones et courts).
- Console JUPSER intégrée à l'application web plutôt qu'une application séparée (même contrôle `@JupserStaff`).
- Pièces chiffrées en base par défaut ; S3/MinIO activé par `S3_ENDPOINT`.

## Points à faire valider

- `TODO(fiscaliste)` : tous les taux et barèmes des 17 packs (`A_VALIDER`), majoration des heures supplémentaires, durée légale du travail.
- `TODO(DGI)` : spécification de l'API e-MCF (chemins, champs, groupes de taxation) pour la facture normalisée RDC.
- `TODO(expert-comptable)` : rattachements bilan/TFT, notes annexes, programmes d'audit et seuils (référentiel ISA), modèles de manuel de procédures.
- `TODO(JUPSER)` : contrats CinetPay/Flutterwave (points d'accès définitifs), flux de cours de la BCC, clés de licence de production, adresse de production de l'application de bureau.
- Le guide d'application du SYSCOHADA (437 pages) a servi à la relecture de tous les modules (docs/19) ; les applications non couvertes y sont listées.
