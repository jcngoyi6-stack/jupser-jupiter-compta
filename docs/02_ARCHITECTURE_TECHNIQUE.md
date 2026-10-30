# 02 — Architecture technique

## 1. Vue d'ensemble
```
 Navigateur / PWA / Tauri ──HTTPS──▶ Passerelle (WAF, limitation de débit)
                                           │
                                     apps/api (NestJS)
         ┌───────────┬───────────┬─────────┼──────────┬────────────┬───────────┐
      ledger     statements   tax-engine  payroll    fx          ai         licensing
         └───────────┴───────────┴─────────┼──────────┴────────────┴───────────┘
                     PostgreSQL 16 (RLS) · Redis/BullMQ · S3 (pièces chiffrées)
                                           │
   Adaptateurs : PaymentProvider · FxRateProvider · OcrProvider · LlmProvider · SmsProvider
                 · MailProvider · BiometricProvider (FingerTec) · EInvoiceProvider (par pays)
```

## 2. Multi-locataire
- Un **locataire** = un client abonné (entreprise ou cabinet) ; il contient une ou plusieurs **sociétés** (dossiers), chacune avec son pays, sa devise de tenue, ses exercices.
- Isolation : colonne `tenant_id` sur toutes les tables + RLS PostgreSQL (`SET app.tenant_id` par requête). Option « base dédiée » pour l'édition Entreprise.
- Hébergement : région la plus proche des clients (Afrique du Sud ou Europe au démarrage) ; option d'hébergement national si exigé (RDC, Côte d'Ivoire, Sénégal…) — vérifier les règles locales de localisation des données.

## 3. Hors ligne et faible débit
- PWA : saisie et consultation hors ligne sur les données récentes ; file locale chiffrée (IndexedDB) ; synchronisation par opérations idempotentes (UUID client), conflits résolus côté serveur (une écriture validée ne peut pas être modifiée hors ligne).
- Écrans ≤ 300 Ko de JS initial, images compressées, pagination côté serveur.

## 4. Intégrations (ports et adaptateurs)
| Port | Adaptateurs prévus | Mock V0 |
|---|---|---|
| `PaymentProvider` | Agrégateur multi-pays (CinetPay annonce RDC, CI, SN, CM, BF, ML, TG, BJ, GN), Flutterwave, PayDunya ; cartes Visa/Mastercard ; virement | Oui |
| `FxRateProvider` | BCC (RDC), BCEAO, BEAC, BCRG, BCC Comores ; secours : fournisseur commercial | Oui |
| `OcrProvider` | Modèle multimodal (via `LlmProvider`) + OCR classique de secours | Oui |
| `LlmProvider` | API Claude (Anthropic) côté serveur | Oui |
| `BiometricProvider` | FingerTec (import des pointages) | Oui |
| `EInvoiceProvider` | Factures normalisées / dispositifs de sécurisation des factures exigés par certains pays (ex. Bénin, Côte d'Ivoire, RDC) — à étudier pays par pays | Oui |

Le choix final des prestataires de paiement se fait après comparaison des frais, des délais de reversement et des pays couverts.

## 5. Modules applicatifs
Chaque module NestJS expose : contrôleurs REST, services, événements de domaine (`EntryPosted`, `PayrollClosed`, `InvoiceIssued`, `PeriodClosed`), et des **outils IA** déclarés (docs/07).

## 6. Observabilité
Journaux JSON avec identifiant de corrélation, métriques Prometheus, tableaux Grafana, alertes (erreurs, latence, échecs de paiement, files bloquées, échecs du journal d'audit), sondes `/health` et `/ready`.

## 7. Environnements
`dev` (données fictives), `recette` (jeux de test par pays), `production`. Déploiement continu par conteneurs (Docker, Kubernetes ou équivalent), migrations automatiques réversibles, sauvegardes avant chaque migration.
