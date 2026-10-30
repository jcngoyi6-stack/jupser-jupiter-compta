# Jupiter Compta (ERP) — Dossier de conception pour Claude Code et les développeurs JUPSER

**Logiciel** : Jupiter Compta · **Éditeur** : JUPITER SERVICES SARLU (JUPSER), Kinshasa/Gombe
**Référentiel** : SYSCOHADA révisé (Acte uniforme relatif au droit comptable et à l'information financière, en vigueur depuis le 1er janvier 2018) · **Marché** : 17 États parties à l'OHADA
**Modèle économique** : SaaS par abonnement (licence par utilisateur et par module), paiement en ligne (carte + mobile money)
**Version du dossier** : 2.0 — 29 octobre 2026 (ERP, JUPSER IA, comptes à 6 chiffres, IS-IRPP, espace Cabinets, tarifs v2)

## Comment utiliser ce dossier
1. Copier le dossier à la racine d'un nouveau dépôt Git.
2. Ouvrir Claude Code dans ce dépôt : il lit automatiquement `CLAUDE.md` (règles non négociables).
3. Lui demander : « Lis README.md et docs/10, puis réalise le lot L0 ». Avancer lot par lot (docs/10), en faisant valider chaque lot.
4. Les développeurs humains suivent le même ordre ; les critères d'acceptation sont dans docs/10.

## Sommaire
| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | Règles pour Claude Code : pile, structure, invariants comptables, sécurité, interdits |
| `docs/01_VISION_PERIMETRE.md` | Identité, cibles, modules, différenciation, éditions |
| `docs/02_ARCHITECTURE_TECHNIQUE.md` | Architecture SaaS multi-locataire, hors ligne, intégrations, IA |
| `docs/03_MODELE_DONNEES.md` | Schéma de données (comptabilité, paie, stocks, CRM, fiscalité, licences) |
| `docs/04_COMPTABILITE_SYSCOHADA.md` | Moteur comptable : plan, journaux, saisie, clôture, états financiers, SMT, DSF |
| `docs/05_MODULES_GESTION.md` | GRH & paie, production, marketing, analyse financière, devises |
| `docs/06_FISCALITE_SOCIAL_17_PAYS.md` | Moteur fiscal et social paramétrable, calendrier, simulateur, état de la recherche par pays |
| `docs/07_IA_COPILOTE.md` | JUPSER IA : guide, analyste, agent ; garde-fous |
| `docs/08_SECURITE.md` | Sécurité des données et des utilisateurs (niveau JUPSER EBNL) |
| `docs/09_LICENCES_ABONNEMENTS_PAIEMENTS.md` | Offre, moteur de licences, paiements, console JUPSER (clients et abonnements) |
| `docs/10_ROADMAP_RECETTE.md` | Lots, planning, critères d'acceptation, tests |
| `docs/11_VIDEO_STORYBOARD.md` | Script de la vidéo de 60 s |
| `docs/12_PRINCIPES_COMPTABLES_AUDCIF.md` | Principes comptables et dispositions de l'AUDCIF traduits en contrôles testables |
| `docs/13_ERP_DOCUMENTS_OPERATIONS.md` | Documents avec QR, logo de l'abonné, messagerie, réunions, tâches, e-mail IA, budget, trésorerie, stocks, présence, recrutement, GED, courrier |
| `docs/14_DEMARRAGE_ENTREPRISES.md` | Démarrage (sociétés nouvelles, existantes, clients de cabinet) et plan comptable adaptable |
| `docs/15_CABINETS_EXPERTISE.md` | Espace Cabinets : balances Excel, audit, diagnostic, restructuration, évaluation, lettres de mission, manuel de procédures |
| `docs/16_EVALUATION_PROJETS_INVESTISSEMENT.md` | Évaluation de projets d'investissement (VAN, TRI, risque, Monte-Carlo), d'après le projet JUPSER EvalProjets |
| `docs/17_INTERFACES_DIRECTIONS_ROLES.md` | Une interface par utilisateur et par direction, sur un seul système |
| `brand/` | Logos JUPSER et Jupiter Compta, icône du logiciel (PNG 16 à 1024 px, ICO) |
| `data/plan_comptes_syscohada_revise_6chiffres.csv` | 1 312 comptes (classes 1 à 8) extraits de l'Acte uniforme fourni, numérotés sur 6 chiffres, avec indicateur « imputable » |
| `data/mapping_compte_resultat.csv` | Références TA…XI du compte de résultat et comptes associés |
| `data/pays_ohada_referentiel.json` | Pré-remplissage fiscal et social des 17 pays (**à valider**) |
| `data/paie_rdc_2026.json` | Paramètres de paie RDC 2026 (**à valider**) |
| `data/tarifs_modules.json` | Grille tarifaire proposée (**à valider par la direction**) |

## Avertissement
Les taux fiscaux et sociaux changent à chaque loi de finances. Les fichiers `data/` sont des **données de départ** : le logiciel ne doit jamais coder un taux en dur, et un pack pays n'est utilisé pour un calcul « officiel » qu'après validation par un fiscaliste désigné par JUPSER (docs/06).
