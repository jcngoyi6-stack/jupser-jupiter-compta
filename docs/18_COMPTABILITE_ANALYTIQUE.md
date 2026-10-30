# 18 — Comptabilité analytique de gestion (CAGE)

Sources : Acte uniforme relatif au droit comptable et à l'information financière (AUDCIF) et SYSCOHADA révisé (classe 9, comptes 92 à 99 ; guide d'application, subdivision « par fonction » des comptes de gestion) ; cours et exercices corrigés de comptabilité analytique de gestion déposés par JUPSER.

L'AUDCIF définit la CAGE comme « un système d'analyse et de traitement autonome de données permettant de calculer des coûts et des résultats analytiques ». Elle n'est ni normalisée ni obligatoire : le module propose un paramétrage par défaut que chaque entité adapte, et toutes les subdivisions de la classe 9 sont « à valider par l'expert-comptable ».

## 1. Interconnexion avec le reste de l'ERP

| Source | Ce que la CAGE en tire |
|---|---|
| Saisie et écritures (grand-livre) | Charges et produits de la période ; **code analytique** par ligne (affectation directe à un centre) ; résultat comptable pour la concordance ; capitaux propres (rémunération supplétive) |
| Stocks (inventaire permanent) | Stocks initiaux, entrées (coût d'achat), consommations, sorties |
| Production (nomenclatures, gammes, ordres de fabrication) | Consommations de matières par produit, main-d'œuvre directe, heures par poste (unités d'œuvre des ateliers) |
| Ventes (factures et avoirs) | Quantités vendues et chiffre d'affaires par produit ; unités d'œuvre « 100 F de CA » |
| Budget | Budget annuel par centre (axe analytique des lignes budgétaires), ramené à la durée de la période |
| **Retour vers la production** | Après validation d'une période, les ordres de fabrication valorisent les frais d'atelier au **coût de l'unité d'œuvre** du centre portant le code du poste de gamme, au lieu du taux forfaitaire |

## 2. Calcul (paquet `@jupiter/cost-accounting`)

1. **Charges incorporables** = charges de la comptabilité générale − charges non incorporables (HAO 81/83/85, participation 87, impôt sur le résultat 89, comptes choisis) + charges supplétives (capitaux propres, travail de l'exploitant) ± différences sur charges calculées.
2. **Centres d'analyse** : répartition primaire (codes analytiques puis clés par préfixe de compte), répartition secondaire en cascade ou **prestations réciproques** résolues par système d'équations, unités d'œuvre et taux de frais, **imputation rationnelle** (part fixe, activité normale → coût de sous-activité ou boni).
3. **Enchaînement des coûts** : coût d'achat → stocks de matières (CMUP de période, CMUP après chaque entrée, PEPS ; DEPS refusé) → coût de production (en-cours, sous-produits, déchets) → stocks de produits → coût de revient → résultat analytique par produit ; différences d'inventaire.
4. **Concordance** (identité exacte) : R(CG) = R(CAGE) + supplétives − non incorporables + produits non incorporés + différences sur charges calculées − coût de sous-activité − charges non imputées + écart de variation des stocks (CG − CAGE).
5. **Journal en classe 9** : 921 stocks réfléchis, 926/927 charges et produits réfléchis, 93xx centres, 940 charges directes à imputer, 941 à 944 coûts, 951 à 955 stocks, 971 à 978 différences, 981 résultats par produit. Chaque pièce est équilibrée.
6. **Coûts partiels** : seuil de rentabilité (point mort, marge et indice de sécurité, levier opérationnel), multi-produits, coûts spécifiques, coût marginal (optimums technique et économique).
7. **Méthode ABC** : ressources → activités → inducteurs → coûts des produits.
8. **Contrôle de gestion** : fiches de coût standard, écarts sur matières et main-d'œuvre (quantité / prix), sur charges indirectes (budget / activité / rendement), sur chiffre d'affaires (prix / composition / volume) et sur marge ; écarts automatiques des ordres de fabrication réels contre les prix standards du paramétrage.
9. **Budgets** : tendance par moindres carrés, coefficients saisonniers, budget de production, quantité économique de Wilson et point de commande.

## 3. Circuit et contrôles

Collecte → vérification et correction des données (unités d'œuvre manuelles) → calcul → enregistrement en brouillon → **validation par une autre personne** (chef comptable ou expert, quatre yeux) → export Excel (incorporation, tableau de répartition, résultats, concordance, journal classe 9). Une période validée ne peut plus être supprimée ; chaque étape est tracée dans la piste d'audit.

## 4. Tests

- Exemples des ouvrages : charges incorporables AFOM & Fils (4 034 500), prestations réciproques (Entretien 723 000, Force motrice 1 092 000), seuil Lynne-Marlène (80 000 000, point mort au 240e jour), imputation rationnelle du restaurant (coût de sous-activité 7 200, boni 4 500).
- Le corrigé imprimé des prestations réciproques donne 902 250 pour l'atelier A : l'addition exacte est **903 050** (218 000 + 67 500 + 180 750 + 436 800 ; contrôle : 903 050 + 1 176 000 + 3 514 950 = 5 594 000).
- Tests d'API de bout en bout : collecte depuis le grand-livre, les stocks, la production et les ventes ; concordance ; journal équilibré ; validation à quatre yeux ; frais d'atelier au coût de l'UO.

## 5. Démonstration

La société fictive « Boulangerie de démonstration » (seed) contient un mois complet : achats de farine et de sucre, trois ordres de fabrication (pains et gâteaux), ventes, salaires, charges indirectes (dont certaines portent un code analytique), budget par centre et paramétrage analytique. Période à calculer : février de l'année en cours.
