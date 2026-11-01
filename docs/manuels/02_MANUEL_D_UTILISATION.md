# Jupiter Compta — Manuel d'utilisation

*Version 0.6.0 — à l'usage des utilisateurs des entreprises, des cabinets et de leurs formateurs*

Ce manuel décrit les tâches courantes, écran par écran. Les noms de menus sont ceux de l'application en français. Selon votre rôle et les modules souscrits par votre organisation, certains menus n'apparaissent pas : c'est normal.

---

## Partie A — Prise en main

### A.0 Créer un espace d'essai
Sur la page de connexion, cliquez sur **Essai gratuit de 30 jours** : nom de l'entreprise ou du cabinet, édition à essayer, nom, adresse électronique, mot de passe, acceptation des conditions. Vous devenez administrateur de votre espace ; connectez-vous, activez la double authentification, puis créez votre société (**Sociétés**).

### A.1 Se connecter
1. Ouvrez l'adresse communiquée par votre administrateur (en ligne) ou l'application de bureau.
2. Saisissez votre adresse électronique et votre mot de passe.
3. **Double authentification** : pour les rôles administrateur, chef comptable, comptable, paie et fiscalité, elle est obligatoire. À la première connexion, scannez le QR code avec une application d'authentification (Google Authenticator, Microsoft Authenticator…), puis saisissez le code à six chiffres. Aux connexions suivantes, saisissez le code affiché par l'application.
4. Après **30 minutes d'inactivité**, la session se ferme : reconnectez-vous.
5. Après plusieurs échecs, le compte est verrouillé temporairement : contactez votre administrateur.

> Si votre organisation a activé l'**enrôlement des postes**, la première connexion depuis un nouvel ordinateur doit être approuvée par l'administrateur (menu **Sécurité et postes**).

### A.2 L'écran principal
- **Barre de gauche** : menus regroupés par domaine (Comptabilité, Gestion, Cabinet, Administration).
- **En haut** : choix de la **société** sur laquelle vous travaillez (si vous en gérez plusieurs) et de la langue.
- **Tableau de bord** : indicateurs de votre périmètre (trésorerie, chiffre d'affaires, échéances, alertes).

### A.3 Rôles et droits

| Rôle | Peut notamment |
|---|---|
| Administrateur | Créer les sociétés et les utilisateurs, attribuer les rôles, gérer la sécurité et l'abonnement |
| Direction | Consulter les tableaux de bord, budgets, états ; valider certains circuits |
| Chef comptable | Tout faire en comptabilité, **valider** les écritures, clôturer, consolider |
| Comptable | Saisir, importer, rapprocher, préparer la clôture ; écritures en brouillon |
| Caissier | Encaissements, décaissements, factures et reçus |
| Paie / RH | Salariés, présences, congés, paie, recrutement |
| Fiscalité | Règles fiscales, déclarations, liquidation de TVA |
| Commercial | Devis, commandes, factures, CRM |
| Auditeur | Lecture seule, piste d'audit, extractions |
| Expert externe | Accès comptable donné à un cabinet |
| Employé | Son espace salarié : bulletins, congés |

### A.4 Créer une société (administrateur)
Menu **Sociétés** : raison sociale, pays (le pack fiscal et social s'en déduit), monnaie de tenue (CDF en RDC, XOF, XAF…), système comptable (normal ou SMT), premier exercice. Le plan de comptes SYSCOHADA à six chiffres est installé automatiquement.

### A.5 Ajouter des utilisateurs (administrateur)
Menu **Utilisateurs** → saisir le nom, l'adresse électronique, le ou les rôles → **Ajouter**. L'utilisateur reçoit ses identifiants et configure sa double authentification à la première connexion. Respectez la **séparation des tâches** : la personne qui saisit ne doit pas être celle qui valide.

---

## Partie B — Comptabilité générale

### B.1 Le plan comptable
Menu **Plan comptable** : consultation, recherche, création de sous-comptes. Les comptes de regroupement (en gras, non imputables) ne reçoivent pas d'écritures : utilisez leurs sous-comptes (par exemple 521100 et non 521000).

### B.2 Les tiers
Menu **Tiers** : clients, fournisseurs, salariés, État, associés. Chaque tiers est rattaché à un compte collectif (411, 401…). Le tiers est obligatoire lorsque vous mouvementez un compte collectif.

### B.3 Saisir une écriture
Menu **Saisie** :
1. Choisissez le **journal** (achats, ventes, banque, caisse, opérations diverses), la **date**, la **référence de pièce** et le **libellé**.
2. Saisissez les lignes : compte, tiers si nécessaire, libellé, débit ou crédit. **+ Ligne** ajoute une ligne ; **Équilibrer** calcule le montant qui solde l'écriture.
3. Joignez la pièce justificative (photo ou PDF).
4. **Enregistrer en brouillon** (modifiable) ou valider directement si votre rôle le permet.

Les montants se saisissent en unités de la monnaie (francs) ; le logiciel les stocke en centimes pour éviter les arrondis.

Contrôles automatiques : écriture équilibrée, date dans un exercice ouvert et une période non verrouillée, comptes imputables.

### B.4 Consulter, valider, contre-passer
Menu **Écritures** : filtres par journal, période, statut, compte. Depuis une écriture :
- **Valider** (chef comptable) : l'écriture devient définitive ;
- **Supprimer** un brouillon ;
- **Contre-passer** une écriture validée : une écriture inverse est créée (on ne modifie jamais une écriture validée).

### B.5 Livres et états
- Menu **Livres** : journal, grand-livre, balance, balance âgée des tiers, livre d'inventaire ; export tableur et PDF.
- Menu **États financiers** : bilan (actif, passif), compte de résultat, tableau des flux de trésorerie, soldes significatifs de gestion, ratios, équilibre financier ; **Imprimer**.
- Menu **Notes annexes** : notes 1 à 36, chiffrées automatiquement, complétées par vos commentaires.
- Menu **États SMT** : pour les entités du système minimal de trésorerie.

### B.6 Immobilisations
Menu **Immobilisations** → **Nouvelle immobilisation** : code, libellé, compte (par exemple 241100), dates d'acquisition et de mise en service, puis les **composants** (**+ Composant**) avec leur coût, leur mode (linéaire, dégressif, unités d'œuvre) et leur durée. Un plan fiscal différent génère des amortissements dérogatoires.
En fin d'exercice : **Proposer les dotations de l'exercice** crée l'écriture de dotation en brouillon. Les tests de dépréciation, le renouvellement d'un composant et les cessions se font depuis la fiche.

### B.7 Rapprochement bancaire
Menu **Rapprochement** : importez le relevé de la banque ; le logiciel propose des correspondances entre les lignes du relevé et les écritures du compte 52. Acceptez les correspondances, traitez les suspens, éditez l'état de rapprochement.

### B.8 Imports
Menu **Imports** :
- **Balance d'ouverture** d'une société existante (formats 4, 6 ou 8 colonnes) → **Générer les à-nouveaux** ;
- **Journal d'écritures** d'un autre logiciel ;
- plan de comptes.
Le logiciel propose une correspondance des comptes et la mémorise.

### B.9 Opérations spécifiques
Menu **Opérations spécifiques** (sous Comptabilité) :
1. Recherchez l'opération par libellé, chapitre ou numéro d'application du guide (par exemple « 37 » pour la location-acquisition).
2. L'exemple du guide s'affiche, déjà converti dans la monnaie du dossier. Modifiez les paramètres : montants en centimes (chaînes de chiffres), taux en décimal (0,08 = 8 %), dates au format AAAA-MM-JJ, comptes à six chiffres.
3. **Calculer et prévisualiser** : vous voyez les valeurs calculées (taux implicite, écart d'acquisition, prime de fusion…), les écritures proposées, l'échéancier et, le cas échéant, les écritures de l'autre partie.
4. Si des comptes manquent dans le plan du dossier, ils sont signalés : créez-les dans **Plan comptable**.
5. **Créer les écritures en brouillon** : elles arrivent dans le journal OD ; contrôlez-les dans **Écritures**, puis faites-les valider.

Exemples : location-acquisition, cession de titres, constitution de société, subvention d'investissement, emprunt obligataire, engagements de retraite, position de change, contrat pluri-exercices, réévaluation, fusion, liquidation.

### B.9 bis Opérations entre sociétés du groupe
Menu **Opérations spécifiques** → **Opération intragroupe** : choisissez la société du groupe, la nature (refacturation de prestations, vente de marchandises, prêt, remboursement, intérêts, dividende, règlement), le montant, le taux de TVA du pack pays, la date. Les écritures sont créées en brouillon **dans les deux sociétés** avec la même référence `IG-…` ; chaque société les valide de son côté. En consolidation, les comptes groupe et les produits et charges réciproques sont éliminés automatiquement.
**Factures entre sociétés du groupe** — menu **Intragroupe** :
1. **Relier** une fois les deux sociétés : chacune devient client (4112) et fournisseur (4012) de l'autre.
2. La société qui vend émet sa facture normalement (menu **Factures**) au client « … (groupe) ».
3. La société destinataire la trouve dans **Factures reçues des sociétés du groupe** → **Traiter** : pour chaque ligne, compte de charge, de stock ou d'immobilisation, article et dépôt pour une entrée en stock → **Accepter** (écriture d'achat en brouillon au journal ACH, à valider) ou **Refuser** avec un motif.
4. En cas de refus, l'émetteur voit le motif dans **Factures émises** et annule par un avoir.
5. Une ligne acceptée en immobilisation (compte 2…) exige la durée d'utilité. Pour céder une immobilisation d'occasion, l'émetteur saisit sur la facture le « coût de revient (groupe) » (valeur nette comptable), qui n'est pas imprimé.
6. En consolidation, sont éliminés automatiquement : le chiffre d'affaires intragroupe, la marge restant en stock (ouverture contre les réserves, clôture contre le résultat), la marge sur immobilisations et l'excédent d'amortissement correspondant.

Pour une opération spécifique qui concerne deux sociétés (succursale, société en participation, fusion…), choisissez la société liée dans « Écritures de l'autre partie dans » avant de créer les brouillons.

### B.10 Clôture de l'exercice
Menu **Clôture** :
1. Parcourez la **liste de contrôle** : écritures en brouillon, comptes d'attente, rapprochements, stocks, immobilisations.
2. Passez les régularisations (charges et produits constatés d'avance, charges à payer, produits à recevoir) : la contre-passation est créée à la première date de l'exercice suivant.
3. Passez les provisions, les dotations et les écarts de conversion.
4. Contrôlez les états financiers et les notes annexes.
5. **Clôturer définitivement** : l'exercice est verrouillé ; les à-nouveaux sont repris et le résultat est porté en « résultat en instance d'affectation ».
6. Après l'assemblée générale, enregistrez l'**affectation du résultat** (réserves, dividendes, report à nouveau).

---

## Partie C — Gestion commerciale, stocks et production

### C.1 Factures et documents commerciaux
Menu **Factures** → **Nouvelle facture** : client, lignes (article, quantité, prix, taxe) → **Émettre la facture**. La facture porte un **QR code** de vérification ; en RDC, elle est transmise au dispositif de **facture normalisée** de la DGI. L'écriture de vente, la créance client, la TVA collectée et la sortie de stock sont générées automatiquement. Même logique pour les devis, proformas, bons de commande et bons de livraison.

### C.2 Achats
Menu **Achats** : demande d'achat → bon de commande (validé par une seconde personne) → réception (entrée en stock) → facture fournisseur.

### C.3 Stocks
Menu **Stocks** : articles, entrepôts, mouvements, inventaire permanent valorisé au CMUP ou en premier entré-premier sorti, inventaires physiques et écarts, dépréciations.

### C.4 Production
Menu **Production** : nomenclatures (composants et quantités), ordres de fabrication, consommations, produits finis ; coût de revient incluant les frais d'atelier au coût de l'unité d'œuvre de la comptabilité analytique.

### C.5 CRM et campagnes
Menu **CRM et campagnes** : prospects, opportunités, campagnes vers des contacts ayant donné leur consentement ; lien de désinscription automatique.

---

## Partie D — Trésorerie, fiscalité, paie et RH

### D.1 Trésorerie et devises
Menu **Trésorerie & devises** : soldes des banques et caisses, cours des devises, écarts de change. Menu **Plan de trésorerie** : prévision à 13 semaines et mensuelle, alimentée par les échéances clients et fournisseurs, la paie et les impôts.

### D.2 Fiscalité
Menu **Fiscalité** :
- **Déclaration de TVA** : calcul de la période → **Proposer l'écriture de liquidation** (brouillon) ;
- **Impôt sur le résultat (simulation)** ;
- **Prochaines échéances** ;
- **Règles fiscales et sociales** du pays, avec leur version et leur statut (« à valider » tant qu'un fiscaliste ne les a pas relues).

### D.3 Paie
Menu **Paie** : **Nouveau salarié** (contrat, salaire, éléments fixes) → saisie des variables du mois → **Calculer la paie** → contrôle du **livre de paie** → génération des bulletins, de l'écriture de paie et des déclarations sociales. Les salariés consultent leurs bulletins dans **Mon espace salarié**.

### D.4 Ressources humaines
Menu **Ressources humaines** : dossiers du personnel, import des pointages des pointeuses biométriques, congés (demande par l'employé, validation par le responsable), recrutement avec des critères non discriminatoires, évaluations.

---

## Partie E — Pilotage

### E.1 Budget
Menu **Budget** : saisie du budget par compte et par période, suivi des réalisations, alerte ou blocage d'une dépense qui dépasse le budget.

### E.2 Comptabilité analytique
Menu **Comptabilité analytique** :
1. **Paramétrage** : centres d'analyse (principaux et auxiliaires), unités d'œuvre, clés de répartition, prestations réciproques, produits.
2. **Calcul des coûts et résultats** : choisissez la période → **Collecter les données de la période** (grand-livre avec codes analytiques, stocks, production, ventes) → **Calculer les coûts et les résultats**. Le logiciel vérifie la **concordance** avec la comptabilité générale et produit le journal en classe 9.
3. **Tableau de bord** : coûts, marges, résultats par produit.
4. **Coûts partiels, ABC et contrôle de gestion** : seuil de rentabilité, imputation rationnelle, méthode ABC, coûts préétablis et écarts, prévisions.
Le chef comptable valide la période analytique.

### E.3 Consolidation
Menu **Consolidation** :
1. **Créer le groupe** : nom, sociétés membres, entité consolidante (mère), méthode, pourcentage d'intérêt, coût des titres, cours pour les filiales en devises.
2. **Pourcentages de contrôle et d'intérêt** : saisissez une ligne par détention (« Société détentrice ; Société détenue ; % du capital ; % des droits de vote »), cochez les critères des entités ad hoc éventuelles → **Calculer le périmètre**. Les lignes surlignées signalent une méthode ou un pourcentage paramétré différent de celui calculé.
3. Consultez le **bilan consolidé**, le résultat (part du groupe et des minoritaires), l'écart d'acquisition, les réserves consolidées.
4. **Comptes combinés** : pour des entités de l'espace OHADA contrôlées par une entité extérieure → **Établir les comptes combinés**.

### E.4 Projets d'investissement
Menu **Projets d'investissement** : flux prévisionnels, taux d'actualisation → VAN, TRI, délai de récupération, sensibilité, scénarios, Monte-Carlo, rapport Word.

---

## Partie F — JUPSER IA

Menu **JUPSER IA** :
- **Poser une question** sur le SYSCOHADA ou le logiciel → **Envoyer**.
- **Pièce → écriture** : déposez la photo ou le PDF d'une facture → **Proposer l'écriture**. La proposition apparaît dans **Propositions de JUPSER IA** : acceptez-la (elle devient un brouillon à valider), corrigez-la ou rejetez-la.
L'IA ne valide jamais rien ; vérifiez toujours le fournisseur, les montants, la TVA et les comptes.

---

## Partie G — Cabinets d'expertise comptable

- **Portefeuille et missions** : dossiers clients, missions, échéances, temps, honoraires, circuit préparateur → réviseur → associé.
- **États depuis une balance** : importez la balance du client, validez la correspondance des comptes (mémorisée), produisez les états financiers et la DSF.
- **Dossier d'audit** (depuis une mission) : seuil de signification, risques, programmes ISA, feuilles de travail, anomalies, tests (Benford, écritures inhabituelles, sondage), revue analytique.
- **Manuel de procédures** : modèles par cycle, contrôle de la séparation des tâches.
- **Évaluation et restructuration** : méthodes patrimoniales, de rendement, de flux, mixtes ; rapport.

---

## Partie H — Administration, sécurité et abonnement

- **Piste d'audit** : toutes les actions sensibles, chaînées et infalsifiables ; filtre par utilisateur, date, objet.
- **Sécurité et postes** : postes enrôlés (approbation, révocation), authentification unique (SSO), politique de mots de passe.
- **Abonnement** : édition, modules, nombre d'utilisateurs, factures JUPSER, paiement (mobile money, carte, virement). En cas d'impayé : rappels, puis **lecture seule** au 15e jour (consultation et exports restent possibles), suspension au 60e jour.
- **Collaboration, Archives (GED), Courrier** : messagerie, tâches, réunions et procès-verbaux ; classement des documents ; registre du courrier.

---

## Partie I — Questions fréquentes et messages d'erreur

| Message ou situation | Que faire |
|---|---|
| « Écriture déséquilibrée » | Total des débits ≠ total des crédits : corrigez ou utilisez **Équilibrer** |
| « Compte non imputable » | Vous utilisez un compte de regroupement : choisissez un sous-compte à six chiffres |
| « Exercice clos » ou « période verrouillée » | Saisissez dans un exercice ouvert ; demandez au chef comptable de rouvrir la période si c'est justifié |
| « Comptes absents du plan du dossier » (opérations spécifiques) | Créez les comptes listés dans **Plan comptable**, puis recommencez |
| « Pack pays incomplet » (paie) | Un barème manque pour ce pays : contactez JUPSER ; la paie est bloquée pour éviter des bulletins faux |
| Le menu attendu n'apparaît pas | Votre rôle ou votre abonnement ne le comprend pas : voyez avec l'administrateur |
| Session expirée | Reconnectez-vous ; aucune donnée validée n'est perdue |
| Code de double authentification refusé | Vérifiez l'heure de votre téléphone (synchronisation automatique) |

## Partie J — Bonnes pratiques

1. Une pièce, une écriture, une pièce jointe.
2. Ne jamais partager un compte utilisateur ; activer la double authentification.
3. Rapprocher la banque au moins une fois par mois.
4. Valider les brouillons chaque semaine ; ne pas laisser de comptes d'attente en fin de mois.
5. Exporter régulièrement les livres et conserver les archives selon la durée légale.
6. Faire relire par un expert-comptable les opérations complexes (opérations spécifiques, consolidation) avant validation.
