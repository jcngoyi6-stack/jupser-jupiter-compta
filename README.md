# Jupiter Compta — ERP de gestion d'entreprise (SYSCOHADA révisé)

**Éditeur : JUPITER SERVICES SARLU (JUPSER)**, Kinshasa/Gombe — *Précision. Conformité. Sérénité.*

Monorepo pnpm + Turborepo, TypeScript strict. Le dossier de conception d'origine est conservé dans `docs/` (lire d'abord `docs/00_README_DOSSIER.md` et `CLAUDE.md`). L'état d'avancement par lot est dans [`docs/ETAT_AVANCEMENT.md`](docs/ETAT_AVANCEMENT.md).

| Dossier | Contenu |
|---|---|
| `packages/ledger` | Moteur comptable pur : montants entiers, plan à 6 chiffres, contrôles bloquants, contre-passation, numérotation, balance, grand-livre, lettrage, clôture, à-nouveaux, audit chaîné SHA-256, Benford |
| `packages/statements` | Bilan (AD…BZ / CA…DZ), compte de résultat (TA…XI), TFT (ZA…ZH), SIG, ratios, continuité d'exploitation |
| `packages/fx` | Conversion sans flottant, choix du cours, réévaluation 478/479 + provision, écarts réalisés 676/776, seuil SMT converti |
| `packages/tax-engine` | Règles fiscales versionnées (`A_VALIDER`/`VALIDE`), TVA, IS/minimum, barèmes, calendrier, bandeau « Estimation » |
| `packages/payroll` | Paie RDC (IRPP IS-IRPP, CNSS, INPP, ONEM), paie en USD convertie au cours du jour, écriture de paie |
| `packages/licensing` | Tarifs, cycle d'abonnement (lecture seule à J+15), modules, quotas |
| `packages/ai` | JUPSER IA : prompt système, propositions `BROUILLON_IA`, minimisation des données, fournisseur hors ligne |
| `apps/api` | API NestJS + Prisma 7 + PostgreSQL 16 (RLS, triggers d'immuabilité), OpenAPI sur `/api/docs` |
| `apps/web` | Interface Next.js (App Router, Tailwind, TanStack Query, PWA), une interface par rôle, console JUPSER intégrée |

## Démarrage (développement)

Prérequis : Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
cd apps/api && bash scripts/db-setup.sh && set -a && . ./.env && set +a && npx prisma migrate deploy && cd ../..
```

```bash
pnpm build
```

```bash
cd apps/api && set -a && . ./.env && set +a && node dist/seed.js
```

```bash
cd apps/api && set -a && . ./.env && set +a && node dist/main.js
```

```bash
cd apps/web && npx next start -p 3000
```

Ouvrir http://localhost:3000. Comptes de démonstration **fictifs** (mot de passe `Jupiter-Demo-2026`) : `admin@demo.cd`, `chef@demo.cd`, `comptable@demo.cd`, `dg@demo.cd`, `console@jupser.cd` (console JUPSER). La double authentification (TOTP) est demandée à la première connexion des rôles sensibles : scannez le QR avec Google/Microsoft Authenticator.

JUPSER IA fonctionne hors ligne par défaut ; renseigner `ANTHROPIC_API_KEY` dans `apps/api/.env` active l'API Claude (côté serveur uniquement).

## Tests

```bash
pnpm turbo run test
```

- 92 tests unitaires des packages métier (couverture ≥ 90 % imposée).
- 30 tests d'acceptation API sur PostgreSQL réel (base `jupiter_test`) : isolation RLS entre locataires, immuabilité en base, numérotation sans trou, 2FA, verrouillage après 5 échecs, CSRF, périodes clôturées, à-nouveaux = bilan de clôture, QR et avoir, IA sans validation automatique, paie à quatre yeux, lecture seule à J+15, webhook signé.

## Avertissements

- Les taux fiscaux et sociaux (`data/`) sont **à valider** par un fiscaliste désigné par JUPSER : tout calcul affiche « Estimation — règle non validée » tant que la règle n'est pas validée dans la console.
- Le rattachement des comptes aux postes du bilan et du TFT est à confronter par un expert-comptable à l'AUDCIF, page par page (lot L2).
