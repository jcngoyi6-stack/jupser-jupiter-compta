# 09 — Licences, abonnements, paiements et console JUPSER

## 1. Offre (version 2 — validée dans son principe par JUPSER, montants à confirmer)
Le prix augmente avec **deux critères** : le **nombre d'utilisateurs** et les **modules choisis**. Les cabinets ont une grille séparée, plus élevée, qui augmente avec le nombre de **collaborateurs** et de **dossiers clients**. Détail chiffré : `data/tarifs_modules.json`.

### Entreprises et organisations (prix par utilisateur actif et par mois)
| Édition | Prix | Contenu |
|---|---|---|
| TPE / SMT | 25 USD (2 utilisateurs maximum) | Système minimal de trésorerie, factures et reçus avec QR, états SMT |
| Essentiel | 60 USD | Comptabilité générale complète, tiers, trésorerie, documents commerciaux avec QR, messagerie interne, tâches et rappels, JUPSER IA « Guide » |
| Pro | 95 USD | Essentiel + fiscalité et simulateur, analyse financière, budget, stocks, JUPSER IA « Analyste » |
| Entreprise (ERP complet) | 140 USD | Tous les modules, JUPSER IA « Agent », multi-sociétés, consolidation, API, SSO |

Modules ajoutés à une édition (USD par utilisateur et par mois) : fiscalité 20 · GRH, paie et recrutement 25 · présence biométrique 10 · analyse financière 15 · budget 10 · stocks 15 · production 20 · marketing et CRM 15 · archivage électronique (GED) assisté par l'IA 15 · gestion du courrier 10 · JUPSER IA « Agent » 25. Au-delà de 50 utilisateurs : sur devis.

### Cabinets d'expertise comptable et fiscale (forfait mensuel)
| Palier | Prix | Inclus | Supplément | Contenu |
|---|---|---|---|---|
| Cabinet Essentiel | 450 USD | 3 collaborateurs, 25 dossiers | 60 USD / collaborateur, 8 USD / dossier | Multi-dossiers, import de balances, états financiers, DSF en masse, portail client, lettre de mission |
| Cabinet Pro | 950 USD | 8 collaborateurs, 75 dossiers | 70 USD / collaborateur, 7 USD / dossier | + audit, analyse et diagnostic, gestion des missions, temps et honoraires |
| Cabinet Premium | 1 900 USD | 20 collaborateurs, 200 dossiers | 80 USD / collaborateur, 6 USD / dossier | + évaluation, restructuration, manuels de procédures, rapports à la marque du cabinet, JUPSER IA « Agent » |
| Réseau | Sur devis | — | — | Grands cabinets et réseaux multi-pays |

Paiement annuel : 2 mois offerts. Essai gratuit de 30 jours. Options : mise en service, reprise d'historique, formation, assistance prioritaire, terminaux biométriques, hébergement dédié.

## 2. Moteur de licences (`packages/licensing`)
- Tables `plan`, `module`, `plan_module`, `subscription` (tenant, modules actifs, nombre d'utilisateurs, sociétés, crédits IA, période, statut).
- Contrôle serveur : garde `@RequiresModule()`, quotas vérifiés à la création (utilisateurs, sociétés, salariés, crédits IA).
- Cycle : essai 30 j → actif → impayé (rappels J-7, J0, J+3, J+7) → **lecture seule** à J+15 (consultation et exports possibles) → suspendu à J+60 → archivé (données conservées selon la durée légale, restituables).
- Changement de formule au prorata ; ajout d'utilisateurs immédiat ; retrait en fin de période.
- Édition sur site / hors ligne : jeton de licence signé Ed25519 (tenant, modules, limites, expiration, empreinte de l'installation) ; tolérance hors connexion de 30 jours.

## 3. Paiement en ligne
- Moyens : mobile money (M-Pesa, Orange Money, Airtel Money, MTN MoMo, Moov, Wave…), cartes Visa/Mastercard, virement (avec rapprochement manuel dans la console).
- Prestataires via `PaymentProvider` : un agrégateur multi-pays (CinetPay annonce la RDC, la Côte d'Ivoire, le Sénégal, le Cameroun, le Burkina Faso, le Mali, le Togo, le Bénin et la Guinée), complété par un second prestataire pour les pays non couverts ; choix après appel d'offres (frais, délais de reversement, devises).
- Renouvellement automatique par carte ; pour le mobile money, demande de paiement envoyée avant échéance (lien + notification).
- Facture électronique numérotée émise par JUPSER, avec mentions légales de JUPSER et taxes applicables (traitement de la TVA sur services numériques à vérifier pays par pays).

## 4. Console JUPSER (`apps/console`)
| Écran | Contenu |
|---|---|
| Tableau de bord | Revenu mensuel récurrent (MRR), nouveaux clients, résiliations, impayés, essais en cours, revenus par pays et par module, consommation IA |
| Clients | Fiche client (sociétés, pays, contacts, plan, historique), notes, tâches commerciales |
| Abonnements | Création, modification, suspension, réactivation, prolongation d'essai, remises et codes promotionnels |
| Paiements et factures | Transactions par prestataire, rapprochement, relances, remboursements, export comptable (Jupiter Compta est utilisé pour la comptabilité de JUPSER elle-même) |
| Licences et postes | Jetons émis, postes enrôlés, révocations |
| Référentiels pays | Packs fiscaux et sociaux : saisie, relecture, validation, publication, historique des versions |
| Partenaires | Revendeurs et cabinets partenaires, commissions |
| Support | Tickets, accès d'assistance temporaire autorisé par le client, base de connaissance |
| Sécurité | Comptes JUPSER (double authentification obligatoire), journal d'audit de la console |
