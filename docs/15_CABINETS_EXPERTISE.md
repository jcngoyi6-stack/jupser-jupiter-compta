# 15 — Espace Cabinets d'expertise comptable et fiscale

Objectif : faire de Jupiter Compta l'outil de production complet d'un cabinet, de la lettre de mission au rapport final.

## 1. Gestion du cabinet
- **Portefeuille de dossiers** : fiche client, mission(s), échéances, responsable, statut de production, alertes.
- **Missions** : tenue, révision, établissement des comptes, audit/commissariat aux comptes, conseil fiscal, paie externalisée, évaluation, restructuration.
- **Temps et honoraires** : saisie des temps par mission, budget d'heures, facturation des honoraires (avec QR), recouvrement, rentabilité par dossier et par collaborateur.
- **Planning** des équipes et des échéances fiscales de tous les clients (vue consolidée « toutes les DSF de mars »).
- **Portail client** : dépôt des pièces, questions/réponses, validation des documents, téléchargement des états et rapports.
- **Revue qualité** : circuit préparateur → réviseur → associé signataire, points de revue, verrouillage.
- **Marque du cabinet** : logo et charte du cabinet sur tous les livrables (palier Premium).

## 2. Import Excel et production des états depuis une balance (amélioré)
1. Import de la balance (Excel/CSV), à 4, 6 ou 8 colonnes, ou du grand-livre.
2. **Reconnaissance automatique** des colonnes et du format par JUPSER IA.
3. Contrôles : équilibre des soldes et des mouvements, comptes inconnus, sens anormal, cohérence N/N-1.
4. **Correspondance** des comptes du client vers le plan SYSCOHADA à 6 chiffres, proposée par l'IA et mémorisée par client (réutilisée l'année suivante).
5. Écritures d'inventaire et de régularisation proposées (amortissements, provisions, cut-off, impôt) et ajustements du cabinet (journal d'OD de révision).
6. Production : bilan, compte de résultat, TFT, notes annexes (textes proposés par l'IA, validés par l'expert), DSF du pays, tableau de passage du résultat comptable au résultat fiscal.
7. Comparaison avec N-1 et analyse des variations significatives, commentée.

## 3. Audit et révision
- Acceptation et maintien de la mission (questionnaire d'indépendance, évaluation du risque client).
- **Planification** : connaissance de l'entité, seuil de signification calculé, évaluation des risques par cycle.
- **Programmes de travail** par cycle (trésorerie, ventes-clients, achats-fournisseurs, stocks, immobilisations, personnel, fiscalité, capitaux propres), inspirés des normes internationales d'audit (ISA) adoptées dans l'espace OHADA par les ordres professionnels — à faire valider par un expert-comptable membre de l'ordre.
- **Procédures automatisées** : analyses analytiques, sondages statistiques, circularisation (lettres de confirmation générées et suivies), tests de détail sur les écritures, analyse des écritures inhabituelles et loi de Benford, contrôle des séquences, rapprochements.
- **Feuilles de travail** électroniques, référencées, avec preuves attachées et signatures de revue.
- Synthèse : anomalies relevées, écritures d'ajustement proposées, points ouverts.
- **Rapports générés** (projets à valider par l'expert) : rapport d'audit ou de commissariat aux comptes, rapport sur le contrôle interne, lettre de recommandations à la direction, rapport de révision, lettre d'affirmation de la direction.

## 4. Diagnostic, analyse et restructuration
- **Analyse des états financiers** (méthodologie du projet JUPSER AFS) : SIG, CAF, bilan fonctionnel et financier, ratios, TFT, score, comparaisons sectorielles.
- **Diagnostic global** : financier, commercial, organisationnel, fiscal et social (questionnaires + données), matrice forces/faiblesses, risques.
- **Restructuration** : scénarios (réduction des coûts, cession d'actifs, réaménagement de dettes, augmentation de capital, fusion), prévisions sur 3 à 5 ans, plan de trésorerie, tableau de financement, rapport de restructuration.
- **Évaluation de l'entreprise et du patrimoine** : actif net comptable corrigé, valeur de rendement, flux de trésorerie actualisés, multiples de comparables, valeur des immobilisations (réévaluation), synthèse et fourchette de valeur, rapport d'évaluation.

## 5. Documentation de mission générée
Lettre de mission (selon le type de mission, honoraires, responsabilités), lettre d'acceptation, demande de pièces, questionnaires, lettres de confirmation, lettre d'affirmation, notes de synthèse, rapports, dossier permanent et dossier annuel organisés automatiquement.

## 6. Manuel de procédures comptables sur mesure (génération automatique)
**Entrées** : secteur d'activité (commerce, industrie, services, BTP, mines, agriculture, ONG…), taille et système (normal/SMT), organigramme importé ou dessiné, effectif du service comptable, modules utilisés, pays et réglementation fiscale et sociale, plan de comptes du client, risques identifiés lors du diagnostic.

**Algorithme** :
1. Choisir le **squelette** du manuel selon le secteur (bibliothèque de modèles validés par JUPSER et ses experts).
2. Retenir les **cycles** pertinents (achats, ventes, trésorerie, stocks, immobilisations, paie, fiscalité, clôture, archivage) selon l'activité.
3. Pour chaque cycle, générer les **procédures** (acteurs, étapes, documents, contrôles, délais) en affectant chaque tâche à un **poste de l'organigramme** et en vérifiant la **séparation des tâches** (pas de cumul initiation/validation/paiement/enregistrement ; si l'effectif est trop réduit, proposer des contrôles compensatoires).
4. Insérer les **règles comptables** applicables : principes et dispositions de l'AUDCIF (docs/12), schémas d'écritures SYSCOHADA avec les comptes du client, méthodes retenues (amortissement, stocks).
5. Insérer les **obligations fiscales et sociales** du pays (calendrier, déclarations) depuis les packs validés.
6. Produire les **annexes** : plan de comptes du client, modèles de documents, matrice des délégations de signature, calendrier de clôture, fiches de contrôle.
7. Rédaction par JUPSER IA, puis **revue et validation** par l'expert-comptable ; versionnage et mises à jour automatiques quand la réglementation ou l'organigramme change.

**Sortie** : manuel Word/PDF à la charte du cabinet ou du client, avec table des matières, logigrammes et fiches de procédure.

## 7. Évaluation de projets d'investissement
Module complet décrit dans docs/16 (VAN, TRI, délais, sensibilité, Monte-Carlo, rapport à la charte du cabinet).

## 8. Production fiscale en masse
Préparation des déclarations (TVA, IS, retenues, DSF) de tous les clients, tableau de suivi des dépôts, alertes d'échéance par client.
