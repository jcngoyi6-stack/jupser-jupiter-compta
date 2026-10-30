# 19 — Relecture des modules à la lumière du guide d'application du SYSCOHADA révisé

Méthode : pour chaque application du guide correspondant à une fonction du logiciel, les chiffres du guide ont été recalculés par les moteurs de Jupiter Compta, puis transformés en tests automatisés (fichiers `guide.test.ts` des paquets et de l'API). Les écarts constatés ont été corrigés.

## 1. Résultats par module

| Module | Applications du guide | Constat | Suite donnée |
|---|---|---|---|
| Immobilisations — dégressif | 13 | Le mode « dégressif » appliquait un coefficient fiscal et basculait en linéaire ; le guide retient le dégressif **à taux décroissant (SOFTY)** sur la base amortissable (coût − valeur résiduelle) | **Corrigé** : SOFTY, avec prorata réparti sur deux exercices ; l'ancien mode est conservé sous le nom « dégressif à coefficient » |
| Immobilisations — unités d'œuvre, prorata | 14, 17 | Conformes (100 000 / 166 667… ; 15 pour un véhicule acquis le 1er juillet) | Tests ajoutés |
| Amortissements dérogatoires | 18 | Absents | **Ajoutés** : plan fiscal par composant, écritures 851/151 et 151/861 dans l'écriture des dotations |
| Approche par composants, renouvellement | 33 | Sortie d'un seul composant impossible | **Ajouté** : sortie d'un composant (VNC en 812) et ajout du composant de remplacement |
| Décomptabilisation | 15 | Conforme (4852/822, dotation complémentaire, 812). Le guide imprime 6812 pour un bien corporel : le bon compte est 6813, utilisé par le logiciel | Test ajouté |
| Comptes 28 et 29 | 13 à 18, 44 | Le compte d'amortissement dérivé (ex. 284510) **n'existait pas dans le plan** : l'écriture de dotation risquait d'être refusée | **Corrigé** : compte officiel 28XY00 / 29XY00, ou compte miroir créé par l'entité s'il existe dans son plan |
| Dépréciation des immobilisations | 44 | Absente | **Ajoutée** : test de valeur à la clôture, 6913/6914 ↔ 29, plan révisé sur la durée résiduelle, reprise plafonnée à la VNC historique. Coquille relevée dans le guide : VNC N+3 imprimée 5 000 000 au lieu de 4 500 000 |
| Valorisation des stocks (CMUP) | 101 | Dérive d'arrondi : le CMUP arrondi au centime × quantité donnait 17 F de moins que le guide sur 4 041 kg | **Corrigé** : sortie au prorata de la valeur du stock (écart < 1 F) |
| Coût de production des stocks | 52 | Après validation d'une période analytique, les frais d'atelier incluaient la part d'**administration générale**, exclue du coût de production | **Corrigé** : coût de l'unité d'œuvre « stockable » hors administration générale, imputation rationnelle comprise |
| Dépréciation des stocks | 53, 54 | Absente | **Ajoutée** : valeur nette de réalisation (contrat ferme prioritaire), coût de remplacement des matières, ajustement 6593/39x ou reprise 7593 |
| TVA | 7 | La liquidation soldait tout par 443100 et 445200 ; les sous-comptes (4432, 4433, 4434, 4451, 4453…) restaient soldés à tort | **Corrigé** : chaque sous-compte est soldé ; TVA due 4441 ou crédit 4449 |
| Paie | 10 | Conforme (soldes finaux identiques ; le guide passe d'abord le brut en 422) | — |
| Devises | 84, 86, 87 | Écarts réalisés en 676/776 et provision 6971/194 pour **toutes** les opérations | **Corrigé** : opérations commerciales 656/756 et provision 6591/**4991** ; financières 676/776 et 6971/194. Le guide écrit 4911, qui est « Créances litigieuses » dans le plan révisé ; le plan prévaut |
| Régularisations | 21 à 24 | Absentes | **Ajoutées** : charges et produits constatés d'avance (476/477), charges à payer et produits à recevoir avec TVA (4455/4435), contre-passation automatique au premier jour de l'exercice suivant |
| Provisions pour risques | 71 à 75 | Absentes | **Ajoutées** : ajustement des 19x au montant requis (691/791, 697/797, 854/864) |
| Résultat et affectation | 65 | Le résultat de N-1 restait en 131/139 à l'ouverture ; affectation absente | **Corrigé** : reprise en 1301/1309 (« en instance d'affectation ») ; écriture d'affectation (réserves 111/112/1181, dividendes 465, report à nouveau 121/1291) |
| États financiers | 127 | Balance du guide (162 comptes) reprise intégralement : **tous les totaux et postes identiques au franc près** (total bilan 1 054 424 478, résultat net 215 389 710, trésorerie 123 097 127) | Test de non-régression permanent. Le guide supprime les rubriques inutilisées et décale les lettres des capitaux propres (CF « Report à nouveau ») ; le logiciel conserve les références du modèle de l'Acte uniforme (CH) |
| Consolidation | 132, 133, 134 | L'écart d'acquisition absorbait les réserves acquises depuis l'entrée dans le périmètre (−1 800 000 au lieu de réserves consolidées de +1 800 000) ; quote-part de mise en équivalence passée en 776 ; intégration proportionnelle absente | **Corrigé** : capitaux propres à la date d'acquisition, réserves consolidées, intérêts minoritaires, intégration proportionnelle, ligne « quote-part dans les résultats des entités mises en équivalence » ; chiffres du guide retrouvés (part du groupe 132 475 000) |
| Comptabilité analytique | — | Plan de la classe 9 à 6 chiffres | **Validé par JUPSER le 30/10/2026** |

## 2. Applications désormais couvertes (version 0.5.0)

Les applications qui se saisissaient en écritures manuelles sont servies par le paquet `special-ops` et l'écran
**Opérations spécifiques** (écritures proposées en brouillon) : location (37, 38), réserve de propriété (39, 40),
immeubles (41 à 43), titres (48 à 51), créances (55 à 57), capital (58 à 64), subventions (66 à 70), emprunts
obligataires (78 à 80), retraites (81 à 83), change (88 à 91), contrats pluri-exercices et abonnement (92 à 94),
concessions, GIE, intérim (95 à 98), réévaluation (99, 100), engagements et tiers (102 à 105), opérations en commun et
établissements (106 à 112), pluri-monétaire et agriculture (113 à 115), fusions (116 à 120), liquidation (122),
première application (123 à 126), consolidation avancée (128 à 130, 135 à 138). Détail : [docs/20](20_OPERATIONS_SPECIFIQUES.md).

Restent : entité ad hoc (131), variations de pourcentage d'intérêt (141), comptes combinés (142).

## 3. Points à trancher par l'expert-comptable

- Convention de prorata : le logiciel compte les jours (30/360) à partir de la date de mise en service ; le guide (application 33) retient une annuité pleine pour un bien acquis le 2 janvier.
- Saisie des dépréciations (article 46) sur les composants non linéaires : le test de valeur est aujourd'hui limité aux composants amortis en linéaire.
