# CLAUDE.md — Règles du projet Jupiter Compta (ERP SYSCOHADA révisé, assistant Jupiter IA)

## Pile imposée
- **Monorepo** pnpm + Turborepo. TypeScript strict partout.
- `apps/api` : NestJS (REST + OpenAPI), PostgreSQL 16, Prisma, Redis (files BullMQ), MinIO/S3 (pièces).
- `apps/web` : Next.js (App Router), React, Tailwind, TanStack Query ; PWA (hors ligne partiel).
- `apps/desktop` : Tauri (option sur site / connexion intermittente) partageant le front.
- `apps/console` : console JUPSER (clients, abonnements, licences, référentiels pays).
- `packages/ledger` (moteur comptable pur), `packages/statements` (états financiers), `packages/tax-engine` (fiscal & social), `packages/payroll`, `packages/fx` (devises), `packages/ai` (copilote), `packages/licensing`.
- Les packages métier sont **purs** (sans accès réseau ni base), testés à 90 % minimum.

## Invariants comptables (jamais violés)
1. Toute écriture validée est équilibrée : Σ débit = Σ crédit **dans la devise de tenue** (arrondi au centime géré par ligne d'écart explicite, jamais silencieux).
2. Une écriture validée est **immuable** : correction uniquement par contre-passation ou écriture rectificative ; numérotation continue par journal et par exercice, sans trou.
3. Une période clôturée est verrouillée ; la réouverture exige un rôle habilité, un motif et laisse une trace d'audit.
4. Les numéros de comptes sont sur **6 chiffres** (compte officiel complété à droite par des zéros : 571 → 571000). Les comptes utilisés appartiennent au plan SYSCOHADA révisé (`data/plan_comptes_syscohada_revise_6chiffres.csv`) ou à une subdivision de celui-ci (préfixe obligatoire).
5. Les montants sont stockés en **entiers de la plus petite unité** (ou `numeric(20,4)`), jamais en flottant.
6. Toute écriture en devise conserve : devise, montant devise, cours, source et date du cours.
7. Aucune écriture proposée par l'IA n'est validée sans action humaine (statut `BROUILLON_IA`).

## Principes comptables
- Le tableau de docs/12 est normatif : chaque ligne doit avoir son test automatisé. Aucune fonction (y compris import et Jupiter IA) ne contourne ces contrôles.
- Livres obligatoires (journal, grand-livre, balance, livre d'inventaire) et états financiers toujours régénérables et traçables jusqu'à la pièce.

## Fiscal et social
- RDC : terminologie **IS-IRPP** (loi n°23/053, en vigueur depuis le 01/01/2026) ; ne plus employer IPR/IBP sauf pour l'historique.
- Aucun taux, barème, seuil ou échéance codé en dur : tout vient de `tax_rule` versionné (pays, date d'effet, statut `A_VALIDER`/`VALIDE`, référence légale).
- Un calcul fondé sur une règle `A_VALIDER` affiche le bandeau « Estimation — règle non validée ».

## Sécurité (voir docs/08)
- Isolation des locataires par `tenant_id` + Row Level Security PostgreSQL ; tests d'isolation obligatoires en CI.
- Argon2id, double authentification, sessions courtes, journal d'audit chaîné SHA-256.
- Chiffrement applicatif des données sensibles (salaires, pièces, coordonnées bancaires) par clé de locataire (AES-256-GCM, enveloppée par KMS).
- Les clés d'API (IA, paiement, cours de change) restent côté serveur.

## Licences
- Toute route métier est protégée par `@RequiresModule('PAIE')` etc. ; les limites (utilisateurs, sociétés, crédits IA) sont vérifiées côté serveur.
- En impayé, passage en **lecture seule** (consultation et export toujours permis).

## Langue et formats
- Interface en français par défaut (anglais, portugais pour la Guinée-Bissau, espagnol pour la Guinée équatoriale prévus) ; i18n dès le départ.
- Séparateur de milliers espace, virgule décimale ; dates JJ/MM/AAAA ; fuseaux horaires par pays.

## Méthode de travail
- Un lot à la fois (docs/10). Écrire les tests d'acceptation du lot avant le code métier.
- Ne jamais inventer une règle comptable ou fiscale : si une règle manque, créer une `TODO(fiscaliste)` et une règle `A_VALIDER`.
- Commits conventionnels ; migrations Prisma revues ; aucune donnée réelle de client dans le dépôt.
