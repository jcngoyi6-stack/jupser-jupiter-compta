# Jupiter Compta — Manuel de présentation

*ERP de gestion intégrée et de comptabilité SYSCOHADA révisé, édité par JUPSER — version 0.6.0 (octobre 2026)*

---

## Sommaire

1. Pourquoi Jupiter Compta
2. À qui s'adresse le logiciel
3. Les principes qui gouvernent le produit
4. Vue d'ensemble : un seul système, une interface par métier
5. Le cœur comptable SYSCOHADA révisé
6. Les opérations spécifiques du guide d'application
7. États financiers, clôture et consolidation
8. Fiscalité, facture normalisée et paie dans 17 pays
9. La gestion de l'entreprise (ERP)
10. Pilotage : analyse financière, budget, trésorerie, comptabilité analytique
11. L'espace des cabinets d'expertise comptable
12. Jupiter IA : l'assistant qui propose, l'humain qui valide
13. Sécurité, conformité et confiance
14. Architecture technique et modes de déploiement
15. Offre commerciale et accompagnement
16. Glossaire

---

## 1. Pourquoi Jupiter Compta

Dans les 17 États membres de l'OHADA, les entreprises tiennent leur comptabilité selon l'**Acte uniforme relatif au droit comptable et à l'information financière (AUDCIF)** et le **SYSCOHADA révisé**, entré en vigueur en 2018 pour les comptes personnels et en 2019 pour les comptes consolidés. Pourtant, une grande partie des outils utilisés sur le terrain :

- ont été conçus pour d'autres référentiels (PCG français, IFRS) puis « adaptés » au SYSCOHADA ;
- séparent la comptabilité de la gestion (ventes, stocks, paie), ce qui oblige à ressaisir et crée des écarts ;
- ignorent les obligations locales : facture normalisée de la DGI en RDC, monnaie de tenue en francs congolais (CDF), déclarations sociales, DSF, états du système minimal de trésorerie (SMT) ;
- ne savent pas traiter les opérations spécifiques que décrit le guide d'application du SYSCOHADA : location-acquisition, emprunts obligataires, fusions, réévaluation, subventions d'investissement, consolidation.

Jupiter Compta part du texte. Le plan de comptes, les états financiers, les notes annexes et les écritures types ont été construits à partir de l'AUDCIF et des **142 applications du guide d'application**, reprises en tests automatisés. Le logiciel couvre aussi toute la gestion de l'entreprise : une vente saisie par le commercial met à jour le stock, la créance client, la TVA, la trésorerie et la comptabilité, sans ressaisie.

**En une phrase** : Jupiter Compta est l'ERP africain qui parle SYSCOHADA nativement, de la facture au bilan consolidé.

## 2. À qui s'adresse le logiciel

| Public | Ce qu'il y trouve |
|---|---|
| **Très petites entreprises** (système minimal de trésorerie) | Recettes et dépenses, factures et reçus avec QR code, états SMT officiels, sans connaissances comptables poussées |
| **PME** | Comptabilité générale complète, tiers, trésorerie, fiscalité, paie, stocks, documents commerciaux, tableaux de bord |
| **Grandes entreprises et groupes** | ERP complet multi-sociétés, production, achats avec circuits de validation, budget, comptabilité analytique, consolidation et comptes combinés, API, authentification unique (SSO) |
| **Cabinets d'expertise comptable** | Portefeuille de dossiers, missions, temps et honoraires, états financiers depuis une balance, audit selon les normes ISA, évaluation d'entreprise, manuels de procédures |
| **Organisations, projets, ONG** | Comptabilité, budget avec blocage ou alerte, évaluation de projets d'investissement |

Directions concernées : direction générale, financière et comptable, commerciale, achats et logistique, production, ressources humaines, secrétariat et courrier, caisse, audit interne et commissariat aux comptes, et chaque employé dans son espace personnel.

## 3. Les principes qui gouvernent le produit

1. **Conformité d'abord.** Tout ce qui touche à la comptabilité suit l'AUDCIF et le guide d'application. Les taux et barèmes fiscaux et sociaux ne sont jamais codés en dur : ils vivent dans des **packs pays versionnés**, validés par des fiscalistes avant publication.
2. **L'humain valide.** Les écritures générées (automatismes, opérations spécifiques, intelligence artificielle) sont proposées **en brouillon**. Seul un utilisateur habilité les valide, et chaque validation est tracée.
3. **Une seule saisie.** Chaque événement économique est saisi une fois, à la source, puis se propage dans tous les modules concernés.
4. **Chacun son interface.** Les menus, écrans et données dépendent du rôle, du périmètre et des modules souscrits. Le filtrage se fait côté serveur, jamais seulement à l'écran.
5. **Traçabilité totale.** Une piste d'audit chaînée par empreintes SHA-256 rend toute modification détectable.
6. **Souveraineté des données.** Chaque client dispose d'un espace isolé au niveau de la base de données (sécurité au niveau des lignes), avec un chiffrement par client.

## 4. Vue d'ensemble : un seul système, une interface par métier

| Métier | Flux saisi à la source | Effet automatique |
|---|---|---|
| Commercial | Devis → commande → livraison → facture (QR, facture normalisée) | Sortie de stock, vente, TVA collectée, créance client |
| Achats | Demande → bon de commande (quatre yeux) → réception → facture | Entrée en stock, achat, TVA déductible, dette fournisseur |
| Production | Nomenclatures → ordres de fabrication | Consommations, coût de revient, stock de produits finis |
| RH / Paie | Présences → congés → paie | Bulletins, écriture de paie, déclarations sociales |
| Caisse | Encaissements, décaissements, arrêté de caisse | Écritures de trésorerie |
| **Comptabilité** (grand-livre unique) | Contrôle et validation | États financiers, notes annexes, DSF, fiscalité, analytique (classe 9), budget, trésorerie, consolidation |
| Direction générale | Consultation et validations | Tableaux de bord de tous les services |

Les modules s'achètent séparément ou en éditions ; un module non souscrit n'apparaît pas. Le logiciel fonctionne en ligne (navigateur), en application de bureau et sur site pour les clients qui exigent un hébergement chez eux.

## 5. Le cœur comptable SYSCOHADA révisé

### 5.1 Plan de comptes
- **1 354 comptes à six chiffres** alignés sur l'AUDCIF, classes 1 à 8, plus les comptes **d'engagements hors bilan** des classes 90 et 91 et le plan analytique des classes 92 à 99 (validé par JUPSER).
- Comptes de regroupement non imputables, comptes imputables par défaut, possibilité de créer des sous-comptes propres au dossier.
- Import d'un plan existant ; contrôle qu'aucune écriture n'utilise un compte de regroupement.

### 5.2 Saisie et contrôles
- Saisie par journal (achats, ventes, banque, caisse, opérations diverses), pièces jointes, lettrage, tiers.
- Contrôles bloquants : équilibre débit/crédit, exercice ouvert, période non verrouillée, compte imputable, tiers obligatoire sur les comptes collectifs.
- Écritures en brouillon, validation par un profil habilité, contre-passation automatique des régularisations.
- Multi-devises : cours historiques, écarts de conversion à la clôture, gains et pertes de change commerciaux (656/756) ou financiers (676/776), provisions pour risque de change.

### 5.3 Imports et rapprochements
- Imports de balances (4, 6 ou 8 colonnes), de journaux, de plans de comptes, de relevés bancaires.
- Rapprochement bancaire assisté : propositions de correspondances, état de rapprochement.

### 5.4 Immobilisations
- Fiches par **composants** (approche par composants obligatoire en SYSCOHADA révisé) : linéaire, dégressif, unités d'œuvre.
- Amortissements dérogatoires (écart entre plan comptable et plan fiscal) en comptes 851/151/861.
- Tests de dépréciation, renouvellement d'un composant, cessions totales ou partielles, comptes miroirs 28/29.

### 5.5 Régularisations et provisions
- Charges et produits constatés d'avance, charges à payer, produits à recevoir avec contre-passation automatique.
- Provisions et dépréciations ; affectation du résultat (réserves, dividendes, report à nouveau) selon la décision de l'assemblée.

## 6. Les opérations spécifiques du guide d'application

C'est l'un des points forts de Jupiter Compta. Le guide d'application du SYSCOHADA comporte 142 applications chiffrées ; le logiciel en restitue les écritures types, les échéanciers et les calculs intermédiaires, sur le plan de comptes à six chiffres. L'écran **Comptabilité › Opérations spécifiques** propose **67 assistants**, chacun pré-rempli avec l'exemple du guide :

| Domaine | Exemples d'assistants |
|---|---|
| Contrats de location | Location-acquisition chez le preneur (taux implicite, tableau de la dette, levée ou non de l'option) et chez le bailleur |
| Réserve de propriété | Achats et ventes avec clause, engagements hors bilan, défaillance du client |
| Immobilisations particulières | Immeubles de placement, constructions sur sol d'autrui, acquisition en viager |
| Titres | Acquisitions selon la catégorie, titres non libérés, cessions par premier entré-premier sorti ou coût moyen pondéré, dépréciations |
| Créances | Abandons de créances, affacturage classique et inversé, titrisation |
| Capitaux propres | Constitution, libération fractionnée, augmentations et réductions de capital, amortissement du capital |
| Subventions | Subventions d'investissement reprises au rythme de l'amortissement, d'exploitation, d'équilibre, avances de l'État, biens subventionnés dépréciés |
| Emprunts obligataires | Amortissements constants, remboursement in fine, obligations convertibles |
| Retraites | Méthode des unités de crédit projetées, coût des services, coût financier, écarts actuariels, régimes couverts par une assurance |
| Change | Position globale de change, couvertures symétriques, ventes à terme |
| Contrats | Contrats pluri-exercices à l'avancement ou à l'achèvement, pertes à terminaison, abonnement des charges |
| Partenariats | Concessions de service public, GIE, sociétés en participation, succursales, franchise |
| Réévaluation | Légale (avec ou sans neutralité fiscale) et libre |
| Restructurations | Fusions (simple, renonciation, participations croisées), apport partiel d'actif, liquidation |
| Première application | Frais d'établissement, primes de remboursement, composants, engagements de retraite |
| Consolidation | Pourcentages de contrôle et d'intérêt, entités ad hoc, écarts d'acquisition, variation de pourcentage, comptes combinés |

Le fonctionnement est toujours le même : **choisir, ajuster, prévisualiser, générer en brouillon**. Avant toute génération, le logiciel vérifie que chaque compte utilisé existe dans le plan du dossier. Lorsqu'une opération concerne deux entités (fusion, succursale, franchise), les écritures de l'autre partie sont restituées pour être saisies dans son propre dossier. Les choix comptables retenus ont été **validés par un expert-comptable agréé ONEC**.

## 7. États financiers, clôture et consolidation

### 7.1 États financiers annuels
- **Système normal** : bilan, compte de résultat, tableau des flux de trésorerie (TFT) alignés sur les tableaux de correspondance de l'AUDCIF, **notes annexes 1 à 36**.
- **Système minimal de trésorerie (SMT)** selon le modèle officiel.
- **DSF** (déclaration statistique et fiscale) au format tableur.
- Livres obligatoires : journal, grand-livre, balance, livre d'inventaire.

### 7.2 Clôture
Assistant de clôture : contrôles préalables, régularisations, dotations, écritures de change, verrouillage des périodes, écritures de clôture, reprise des à-nouveaux (résultat en instance d'affectation) puis affectation.

### 7.3 Consolidation et comptes combinés
- **Périmètre** calculé depuis l'organigramme des détentions : pourcentages de contrôle et d'intérêt, chaînes de participation, participations circulaires, actions à vote double ou sans droit de vote, droits de vote potentiels, entités ad hoc.
- **Méthodes** : intégration globale, intégration proportionnelle, mise en équivalence ; le logiciel signale tout écart entre la méthode qu'il propose et celle paramétrée.
- Éliminations des comptes réciproques, conversion des filiales en devises, écarts d'évaluation et d'acquisition, intérêts minoritaires, réserves consolidées.
- **Comptes combinés** des entités de l'espace OHADA contrôlées par une entité extérieure, établis à partir des balances réelles de chaque dossier.

## 8. Fiscalité, facture normalisée et paie dans 17 pays

- **17 packs pays** (RDC et les 16 autres États de l'OHADA) : TVA, impôt sur les sociétés, retenues, cotisations sociales, barèmes de paie. Chaque règle est versionnée et porte le statut « à valider » tant qu'un fiscaliste ne l'a pas relue.
- **RDC** : monnaie de tenue en CDF, **facture normalisée** de la DGI (dispositif électronique fiscal, e-MCF) avec simulateur intégré en attendant la spécification définitive, déclarations sociales.
- **Paie** : bulletins, cumuls, déclarations, espace salarié pour consulter ses bulletins ; paie générique pour les pays dont le pack est incomplet (blocage explicite tant qu'un barème manque).
- **Simulateur fiscal** et calendrier des échéances.

## 9. La gestion de l'entreprise (ERP)

| Module | Fonctions |
|---|---|
| Ventes et documents | Devis, proformas, bons de commande, bons de livraison, factures et reçus avec QR code de vérification, avoirs, relances |
| Achats | Demandes d'achat, bons de commande avec validation à quatre yeux, réceptions, factures fournisseurs |
| Stocks | Articles, entrepôts, inventaire permanent, CMUP ou premier entré-premier sorti, inventaires, dépréciations |
| Production | Nomenclatures, ordres de fabrication, consommations, coût de revient, frais d'atelier au coût de l'unité d'œuvre |
| CRM et campagnes | Prospects, opportunités, campagnes avec consentement et désinscription |
| Ressources humaines | Dossiers du personnel, présences (import des pointeuses biométriques), congés, recrutement avec critères non discriminatoires, évaluation |
| Trésorerie | Comptes bancaires et caisses, prévision à 13 semaines et mensuelle, devises |
| Collaboration | Messagerie interne, tâches, réunions avec procès-verbaux transformés en tâches |
| Archives (GED) | Classement, recherche, durées de conservation |
| Courrier | Registre du courrier entrant et sortant, affectation, suivi |

## 10. Pilotage

- **Tableaux de bord** par direction : chiffre d'affaires, marge, trésorerie, budget, effectifs, alertes.
- **Analyse financière** : soldes intermédiaires de gestion, ratios, TFT, capacité d'autofinancement.
- **Budget** : élaboration, suivi des réalisations, alerte ou blocage en cas de dépassement.
- **Comptabilité analytique de gestion (CAGE)** : collecte automatique depuis le grand-livre, les stocks, la production et les ventes ; centres d'analyse et prestations réciproques ; coûts complets et imputation rationnelle des charges fixes ; concordance exacte avec la comptabilité générale ; journal en classe 9 ; coûts partiels et seuil de rentabilité ; méthode ABC ; coûts préétablis et analyse des écarts.
- **Évaluation de projets d'investissement** : VAN, TRI, TRI modifié, délai de récupération, indice de profitabilité, sensibilité, scénarios, simulation de Monte-Carlo, rapport Word.

## 11. L'espace des cabinets d'expertise comptable

- **Portefeuille** : dossiers clients, missions, échéances, temps passés et honoraires.
- **Circuit de revue** : préparateur → réviseur → associé, avec traçabilité des visas.
- **États financiers depuis une balance** importée, avec mémorisation de la correspondance des comptes d'un exercice à l'autre.
- **Dossier d'audit** : seuil de signification, évaluation des risques, programmes de travail selon les normes ISA, feuilles de travail, anomalies, loi de Benford, écritures inhabituelles, sondage en unités monétaires, revue analytique.
- **Documents** : lettre de mission, demandes de confirmation, rapports au format Word.
- **Manuel de procédures** avec contrôle de la séparation des tâches.
- **Évaluation d'entreprise et restructuration.**

## 12. Jupiter IA : l'assistant qui propose, l'humain qui valide

- **Guide** : répond aux questions sur le SYSCOHADA et sur l'utilisation du logiciel.
- **Lecture de pièces** : à partir d'une photo ou d'un PDF de facture, propose une écriture complète (fournisseur reconnu, montants, TVA, comptes), marquée « brouillon IA ».
- **Rédaction** : courriers, relances, synthèses.
- **Garde-fous** : l'IA ne valide jamais une écriture ; les incohérences sont signalées ; les crédits IA sont décomptés selon l'abonnement.

## 13. Sécurité, conformité et confiance

| Domaine | Mesures |
|---|---|
| Authentification | Mots de passe hachés (Argon2id), double authentification (TOTP) obligatoire pour les rôles sensibles, verrouillage après échecs, authentification unique (OIDC) pour les grands comptes |
| Sessions | Expiration après 30 minutes d'inactivité, protection contre la falsification de requêtes |
| Postes enrôlés | Chaque poste peut être enrôlé avec une clé propre au navigateur ; les requêtes sont signées, l'administrateur approuve ou révoque les postes |
| Isolation | Sécurité au niveau des lignes de la base : un client ne peut jamais lire les données d'un autre, ce qui est vérifié par des tests automatisés |
| Chiffrement | AES-256-GCM par client pour les pièces et données sensibles |
| Traçabilité | Piste d'audit chaînée (SHA-256) consultable par l'auditeur |
| Données personnelles | Consentement pour les campagnes, désinscription, restitution des données en fin de contrat |

## 14. Architecture technique et modes de déploiement

- **Serveur** : NestJS (TypeScript), base PostgreSQL 16, ORM Prisma ; calculs monétaires en entiers (unités mineures) pour éviter toute erreur d'arrondi.
- **Interface** : Next.js, responsive (ordinateur, tablette, téléphone), en français, anglais, portugais et espagnol.
- **Bureau** : application Tauri (Windows, macOS, Linux) pour un usage hors ligne avec licence signée.
- **Qualité** : moteurs métier couverts à plus de 90 % par des tests automatisés ; exemples du guide d'application rejoués à chaque version.
- **Déploiements** : nuage géré par JUPSER, hébergement dédié, ou installation sur site (Docker).

## 15. Offre commerciale et accompagnement

Le prix dépend du **nombre d'utilisateurs** et des **modules** choisis (montants indicatifs, à confirmer par JUPSER) :

| Édition | Prix indicatif | Pour qui |
|---|---|---|
| TPE / SMT | 25 USD par mois (2 utilisateurs maximum) | Très petites entreprises |
| Essentiel | 60 USD par utilisateur et par mois | Comptabilité générale complète |
| Pro | 95 USD par utilisateur et par mois | + fiscalité, analyse, budget, stocks |
| Entreprise | 140 USD par utilisateur et par mois | ERP complet, multi-sociétés, consolidation, API |
| Cabinets | à partir de 450 USD par mois | Selon collaborateurs et dossiers |

Essai gratuit de 30 jours, deux mois offerts en paiement annuel, paiement par mobile money, carte ou virement. Services : mise en service, reprise d'historique, **formation** (voir les livrets de formation), assistance prioritaire, hébergement dédié.

## 16. Glossaire

| Terme | Définition |
|---|---|
| AUDCIF | Acte uniforme relatif au droit comptable et à l'information financière |
| SYSCOHADA révisé | Système comptable de l'OHADA, en vigueur depuis 2018 |
| SMT | Système minimal de trésorerie, pour les très petites entités |
| DSF | Déclaration statistique et fiscale |
| CAGE | Comptabilité analytique de gestion |
| e-MCF / DEF | Module de contrôle de facturation électronique / dispositif électronique fiscal (facture normalisée en RDC) |
| Brouillon | Écriture enregistrée mais non validée ; modifiable, sans effet sur les états validés |
| Pack pays | Ensemble versionné des règles fiscales et sociales d'un État |
| Unités mineures | Plus petite subdivision d'une monnaie (le centime pour le CDF) ; base de tous les calculs |
