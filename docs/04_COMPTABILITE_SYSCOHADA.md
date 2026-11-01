# 04 — Moteur comptable SYSCOHADA révisé

Références : Acte uniforme relatif au droit comptable et à l'information financière (AUDCIF) et Guide d'application du SYSCOHADA révisé (fournis par JUPSER). Les numéros de comptes cités ci-dessous ont été vérifiés dans `data/plan_comptes_syscohada_revise_6chiffres.csv`.

## 1. Choix du système à l'ouverture d'un dossier
- **Système normal** par défaut (art. 11 AUDCIF).
- **Système minimal de trésorerie (SMT)** proposé si le chiffre d'affaires HT annuel est inférieur à (art. 13) : 60 millions FCFA (négoce), 40 millions (artisanat et assimilés), 30 millions (services) — ou l'équivalent dans la monnaie du pays. Le logiciel convertit les seuils au cours de la banque centrale (CDF, GNF, KMF) et affiche le calcul.
- L'assistant pose les questions (activité, CA prévisionnel, option), explique la conséquence et enregistre la décision (traçée).

## 2. Plan de comptes
- Chargement du plan officiel (classes 1 à 8 ; classe 9 facultative pour l'analytique et les engagements).
- Création de sous-comptes uniquement sous un compte existant ; contrôle de cohérence (classe, sens normal, lettrage).
- Comptes de référence : 401 fournisseurs, 411 clients, 422 personnel, 431 sécurité sociale, 4431 TVA facturée, 4452 TVA récupérable, 4441 TVA due, 4449 crédit de TVA, 4472 impôts sur salaires, 441 impôt sur les bénéfices, 478/479 écarts de conversion, 521 banques, 552 monnaie électronique (téléphone portable : mobile money), 571 caisse, 891 impôts sur les bénéfices, 895 impôt minimum forfaitaire.

## 3. Journaux et saisie
- Journaux types : achats, ventes, banque (un par compte), caisse, mobile money (un par opérateur), opérations diverses, paie, à-nouveaux, IA (brouillons).
- Modes de saisie : grille classique, **saisie guidée** (questions en langage clair → écriture), **modèles d'écritures** (loyer, facture d'électricité, achat avec TVA, salaire…), **import** (Excel/CSV, relevés bancaires, relevés mobile money), **pièce scannée** (OCR + IA, docs/07).
- Contrôles bloquants : équilibre, période ouverte, compte actif, tiers obligatoire sur comptes collectifs, code TVA cohérent, pièce justificative pour les montants au-delà d'un seuil paramétrable.
- Indicateur d'équilibre en temps réel (Σ D – Σ C) visible pendant la saisie.

## 4. Traitements
- Lettrage automatique (montant, référence, date) et manuel ; relances clients.
- Rapprochement bancaire et mobile money assisté (correspondances proposées, score de confiance).
- Immobilisations : approche par composants, amortissement linéaire, dégressif, unités d'œuvre ; cessions (81/82) ; dépréciations.
- Stocks : inventaire intermittent ou permanent, variations (603x / 73x).
- Opérations en devises : conversion au cours du jour de l'opération ; à la clôture, réévaluation des créances et dettes au cours de clôture, écarts en 478/479 et provision pour risque de change selon les règles de l'AUDCIF ; écarts réalisés en 676 (pertes de change) / 776 (gains de change).
- Régularisations : charges et produits constatés d'avance (476/477), charges à payer, produits à recevoir, provisions.

## 5. Clôture assistée
Liste de contrôle générée et suivie (responsable, statut) : rapprochements, inventaire, amortissements, provisions, cut-off, écarts de conversion, TVA, impôt sur le résultat (IS ou minimum), affectation du résultat N-1, contrôles de cohérence (comptes à solde anormal, comptes d'attente non soldés, balance âgée). L'IA propose les écritures d'inventaire, l'utilisateur valide. Clôture → verrouillage → génération des à-nouveaux.

## 6. États financiers
| Système | États produits |
|---|---|
| Normal | Bilan (références AD…BZ à l'actif, CA…DZ au passif), compte de résultat (TA…XI, voir `data/mapping_compte_resultat.csv`), tableau des flux de trésorerie, notes annexes |
| SMT | Bilan SMT, compte de résultat SMT, notes annexes SMT, à partir du journal de trésorerie |

- Moteur de rendu déclaratif : chaque ligne = liste de comptes (avec règle de solde : débiteur/créditeur/net) ou formule sur d'autres lignes.
- Colonnes N et N-1, brut/amortissements/net à l'actif.
- Contrôles automatiques : total actif = total passif ; résultat du bilan = XI ; variation de trésorerie du TFT = trésorerie de clôture – trésorerie d'ouverture.
- **Notes annexes** : tableaux chiffrés générés automatiquement ; textes (méthodes, événements postérieurs, engagements) pré-rédigés par l'IA puis validés.
- **DSF / liasse fiscale** : gabarit par pays (même socle SYSCOHADA, annexes fiscales nationales) ; export PDF + Excel + format de télédéclaration lorsqu'il existe.
- Les tableaux officiels (libellés exacts, ordre des lignes, numérotation des notes) sont à reprendre de l'AUDCIF fourni — page par page — lors du lot L2, avec un test de rendu par état.

## 7. Analytique (classe 9, optionnelle)
Axes libres (activité, site, projet, produit), clés de répartition, coût de revient (lien avec la production), budgets et écarts.

## 8. Consolidation (Entreprise, V2)
Périmètre, méthodes (intégration globale, mise en équivalence), éliminations intragroupe, conversion des filiales en devises, conformément aux dispositions de l'AUDCIF sur les comptes consolidés et combinés.

## 9. Livres et restitutions (complément v2)
- **Livre-journal** (centralisation mensuelle des journaux auxiliaires), **grand-livre** (général et auxiliaires clients/fournisseurs/personnel, avec lettrage), **balance** (générale, auxiliaire, âgée ; à 4, 6 ou 8 colonnes), **livre d'inventaire**, puis **états financiers dans leur ensemble** (bilan, compte de résultat, TFT, notes annexes).
- Navigation : de chaque ligne des états → balance → grand-livre → écriture → pièce numérisée.
- **Notes annexes** : pour chaque note, Jupiter IA propose les tableaux chiffrés et le texte explicatif (méthodes, variations, engagements, événements postérieurs) ; le comptable ou l'expert valide ou modifie ; la version validée est figée et signée électroniquement.

## 10. Travaux de fin d'exercice automatisés (propositions à valider)
| Travail | Automatisation |
|---|---|
| Inventaire des stocks | Valorisation CMUP/FIFO, écarts d'inventaire, variations de stocks (603x, 73x), dépréciations |
| Immobilisations | Amortissements par composants (linéaire, dégressif, unités d'œuvre), dérogatoires, cessions, dépréciations, tests d'indices de perte de valeur |
| Rapprochement bancaire et mobile money | Correspondances automatiques, état de rapprochement, écritures de régularisation |
| Réévaluation des devises | Créances et dettes au cours de clôture, écarts 478/479, provision pour perte de change |
| Réévaluation des immobilisations | Module dédié (écart de réévaluation), selon les conditions de l'AUDCIF |
| Régularisations | Charges à payer, produits à recevoir, charges et produits constatés d'avance (476/477) |
| Provisions | Créances douteuses (balance âgée), litiges, congés payés, risques |
| Redressements | Corrections d'erreurs (exercice en cours / antérieures), reclassements (soldes anormaux, clients créditeurs) |
| Impôt | Résultat fiscal, IS ou minimum, impôt différé si consolidation |
| Clôture | Affectation du résultat, verrouillage, à-nouveaux automatiques |

Toutes ces écritures sont créées au statut « proposition », regroupées dans un dossier de clôture, et validées par un utilisateur habilité.
