# État d'avancement — version 0.1.0 (30/10/2026)

Légende : ✅ réalisé et testé · 🟡 partiel · ⬜ non commencé

## Lots (docs/10)

| Lot | État | Détail |
|---|---|---|
| L0 Socle | 🟡 | ✅ monorepo, CI, Argon2id, TOTP obligatoire par rôle, verrouillage 5 échecs, session 30 min glissante (cookie httpOnly, SameSite strict, anti-CSRF), RLS PostgreSQL + test d'isolation, audit chaîné SHA-256 vérifiable, chiffrement AES-256-GCM par locataire (salaires, pièces), rôles et périmètre société, i18n (français ; structure en/pt/es). ⬜ enrôlement des postes, SSO, KMS réel, journalisation Prometheus |
| L1 Comptabilité | ✅ | Plan SYSCOHADA 6 chiffres + sous-comptes, journaux, saisie grille + modèles, contrôles bloquants, validation, contre-passation, numérotation continue, lettrage auto/manuel, balance âgée, devises (cours tracés, réévaluation, écarts). ⬜ import Excel/relevés, rapprochement bancaire assisté, immobilisations |
| L2 États financiers | 🟡 | ✅ bilan, compte de résultat, TFT bouclé, N/N-1, contrôles, SIG/ratios, clôture + à-nouveaux détaillés par tiers, livres (journal, grand-livre, balance 6 colonnes), export CSV. ⬜ notes annexes, états SMT, DSF, livre d'inventaire, validation expert-comptable des mappages |
| L3 Licences et paiements | 🟡 | ✅ éditions/modules, garde `@RequiresModule`, quotas, lecture seule J+15, suspension J+60, paiement simulé + webhook HMAC idempotent, console JUPSER (clients, abonnements, MRR, validation des règles). ⬜ prestataires réels (CinetPay…), factures JUPSER, jetons Ed25519 hors ligne |
| L4 JUPSER IA v1 | 🟡 | ✅ guide (API Claude ou hors ligne), pièce → écriture `BROUILLON_IA`, acceptation humaine journalisée, crédits IA. ⬜ OCR de PDF/photos, base de connaissance AUDCIF, contrôles IA |
| L5 Fiscalité + paie RDC | 🟡 | ✅ règles RDC 2026 versionnées (`A_VALIDER`), TVA + liquidation, IS/minimum, calendrier, paie (IRPP IS-IRPP, CNSS, INPP, ONEM, USD→CDF), écriture de paie à quatre yeux. ⬜ validation fiscaliste, bulletins PDF, déclarations sociales |
| L7b Documents | 🟡 | ✅ factures avec QR + écriture automatique, avoir, vérification publique (annulation signalée), logo de l'abonné. ⬜ autres documents, messagerie, réunions, tâches, GED, courrier |
| L6, L7, L7c, L8, L9 | ⬜ | Analyse financière avancée, production, stocks, CRM, budget, présence biométrique, recrutement, 16 autres packs pays, espace Cabinets, consolidation |

## Pile imposée — écarts assumés

- Pièces justificatives stockées chiffrées dans PostgreSQL (MinIO/S3 à brancher).
- Pas encore de Redis/BullMQ (aucune tâche de fond nécessaire à ce stade).
- Console JUPSER intégrée à `apps/web` (`/console`, réservée au personnel JUPSER) plutôt qu'une application séparée.
- `apps/desktop` (Tauri) non commencé.

## Points à faire valider (TODO)

- `TODO(fiscaliste)` : tous les paramètres de `data/paie_rdc_2026.json` (grille INPP, déductibilité CNSS, ordre réduction/plafond/minimum, SMIG), échéance TVA.
- `TODO(expert-comptable)` : rattachements du bilan et du TFT, comptes INPP/ONEM, durée du premier exercice. L'Acte uniforme et le guide d'application n'étaient pas dans l'archive reçue (seul le plan de comptes extrait) : à joindre pour la relecture page par page.
