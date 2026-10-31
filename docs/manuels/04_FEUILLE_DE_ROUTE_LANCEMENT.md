# Jupiter Compta — Ce qui reste pour lancer en ligne et commercialiser

*État au 31/10/2026, version 0.6.0. Légende : 🔴 bloquant pour l'ouverture commerciale · 🟠 nécessaire avant d'élargir · 🟢 amélioration*

## 1. Validations métier (responsable : JUPSER et ses experts)

| Priorité | Élément | Qui | Pourquoi |
|---|---|---|---|
| 🔴 | Barèmes fiscaux et sociaux de la RDC (TVA, IBP/IS, IPR, CNSS, INPP, ONEM) : passage du statut « à valider » à « validé » | Fiscaliste RDC | Sans eux, la paie et les déclarations ne peuvent pas être garanties |
| 🔴 | Spécification officielle de l'API e-MCF / DEF de la DGI (facture normalisée) et homologation | DGI, JUPSER | La facture normalisée est obligatoire en RDC ; le logiciel fonctionne aujourd'hui avec un simulateur |
| 🔴 | Relecture par l'expert-comptable des rattachements bilan / compte de résultat / TFT, des notes annexes et de la DSF | Expert-comptable ONEC | Les états sont alignés sur les tables de l'AUDCIF ; il faut une attestation de conformité avant la vente |
| 🟠 | Packs des 16 autres pays de l'OHADA (taux, barèmes, calendriers) | Fiscalistes locaux ou partenaires | Commercialisation hors RDC |
| 🟠 | Convention de prorata des amortissements (jours ou mois) et dépréciation des composants non linéaires | Expert-comptable | Points listés en docs/19 §3 |
| 🟠 | Programmes d'audit ISA, seuils, modèles de manuel de procédures (espace cabinets) | Expert-comptable | Offre cabinets |
| 🟢 | Recette sur des données réelles anonymisées de 3 à 5 entreprises pilotes (un mois puis un exercice) | JUPSER, clients pilotes | Mesurer la justesse en conditions réelles |

## 2. Technique et hébergement (responsable : équipe technique JUPSER ou prestataire)

| Priorité | Élément | Détail |
|---|---|---|
| 🔴 | Hébergement de production | Serveurs (ou nuage) avec PostgreSQL 16 managé, sauvegardes chiffrées quotidiennes, réplication, plan de reprise testé. Choisir la localisation des données selon les exigences légales (données hébergées en RDC ou dans un pays offrant un niveau de protection adéquat) |
| 🔴 | Nom de domaine et certificats | Par exemple `app.jupser.cd` (application), `www` (site commercial), `api` ; certificats TLS renouvelés automatiquement |
| 🔴 | Secrets de production | Clé maîtresse de chiffrement dans un coffre (KMS/HSM), clés JWT, clés de licence Ed25519 de production, secrets des prestataires de paiement ; aucun secret de démonstration en production |
| 🔴 | Messagerie transactionnelle | Fournisseur d'e-mails (domaine authentifié SPF/DKIM/DMARC) pour les invitations, réinitialisations, relances, factures |
| 🔴 | Supervision | Journaux centralisés, métriques et alertes (Prometheus/Grafana ou équivalent), page d'état du service |
| 🔴 | Tests d'intrusion et revue de sécurité | Audit par un tiers avant ouverture ; correction des points relevés |
| 🟠 | Pipeline de déploiement | CI existante (tests, compilation) à compléter : construction des images, déploiement continu en préproduction, promotion manuelle en production, migrations de base contrôlées |
| 🟠 | Application de bureau | Compiler et signer l'application Tauri (certificats de signature Windows et macOS), serveur de mises à jour |
| 🟠 | Stockage des pièces | Activer le stockage objet (S3/MinIO) pour les pièces jointes volumineuses |
| 🟠 | Performance | Tests de charge (nombre de dossiers et d'écritures cibles), index, tâches de fond si nécessaire |
| 🟢 | Flux des cours de la BCC | Récupération automatique des cours de change officiels |

## 3. Juridique et conformité (responsable : JUPSER et son conseil)

| Priorité | Élément |
|---|---|
| 🔴 | Conditions générales de vente et d'utilisation, contrat d'abonnement (SaaS), contrat de licence sur site |
| 🔴 | Politique de confidentialité et registre des traitements ; accord de traitement des données pour les clients ; déclaration à l'autorité de protection des données si requise |
| 🔴 | Mentions légales de JUPSER sur ses factures ; traitement de la TVA sur les services numériques, pays par pays |
| 🟠 | Engagements de niveau de service (disponibilité, délais de support, restitution des données en fin de contrat) |
| 🟠 | Dépôt de la marque « Jupiter Compta » (OAPI pour l'espace OHADA francophone, et en RDC) |
| 🟢 | Agrément ou référencement éventuel auprès de l'ordre (ONEC) et des administrations fiscales |

## 4. Paiements et facturation des abonnements

| Priorité | Élément |
|---|---|
| 🔴 | Signature des contrats CinetPay et Flutterwave (comptes marchands, points d'accès de production, clés) |
| 🔴 | Tests de bout en bout : mobile money (M-Pesa, Orange Money, Airtel Money), carte, virement ; rapprochement dans la console |
| 🔴 | Grille tarifaire définitive (les montants de docs/09 sont indicatifs) et codes promotionnels de lancement |
| 🟠 | Facturation JUPSER depuis le module de facturation (factures numérotées, facture normalisée pour les clients en RDC) |

## 5. Commercialisation (responsable : direction commerciale JUPSER)

| Priorité | Élément |
|---|---|
| 🔴 | Site commercial : présentation (à partir du manuel de présentation), tarifs, inscription à l'essai gratuit de 30 jours, contact |
| 🔴 | Offre de lancement : programme « clients pilotes » (remise contre retours d'expérience et témoignages) |
| 🟠 | Supports : plaquette, démonstration vidéo (storyboard en docs/11), cas clients, fiches par métier |
| 🟠 | Réseau de partenaires : cabinets d'expertise comptable revendeurs (commissions gérées dans la console), formateurs agréés |
| 🟠 | Formation : sessions selon les livrets (docs/manuels/03), attestations, e-learning |
| 🟠 | Support : centre d'aide (manuel d'utilisation en ligne), outil de tickets, horaires, numéro WhatsApp professionnel |
| 🟢 | Présence aux événements de la profession (ONEC, chambres de commerce), webinaires |

## 6. Calendrier indicatif

| Semaines | Jalons |
|---|---|
| 1-4 | Hébergement, domaine, secrets, messagerie, supervision ; contrats de paiement ; CGV et confidentialité |
| 3-8 | Validation des barèmes RDC ; relecture des états par l'expert-comptable ; test d'intrusion |
| 6-10 | Pilotes (3 à 5 entreprises, 1 cabinet) en préproduction ; corrections |
| 8-12 | Homologation e-MCF dès publication de la spécification DGI |
| 12 | **Ouverture commerciale en RDC** (essai gratuit, éditions Essentiel et Pro, offre cabinets) |
| 12-24 | Packs pays suivants (selon priorité commerciale : Côte d'Ivoire, Cameroun, Sénégal…) ; édition Entreprise auprès des groupes |

## 7. Ce qui est déjà prêt

- Cœur comptable SYSCOHADA révisé, états financiers, notes annexes, SMT, DSF ; 142 applications du guide d'application couvertes, choix comptables validés par un expert-comptable agréé ONEC.
- Modules ERP (ventes, achats, stocks, production, CRM, RH, paie, trésorerie, budget, analytique, consolidation, GED, courrier, collaboration), espace cabinets, évaluation de projets, JUPSER IA.
- Sécurité : double authentification, isolation des clients, chiffrement, piste d'audit, postes enrôlés, SSO.
- Licences, abonnements, console JUPSER ; essai local sur ordinateur (Docker).
- Manuels de présentation, d'utilisation et livrets de formation.
