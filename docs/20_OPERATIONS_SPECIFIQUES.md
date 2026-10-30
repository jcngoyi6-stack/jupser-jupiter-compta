# 20 — Opérations spécifiques du guide d'application (version 0.5.0)

Paquet `packages/special-ops`, API `companies/:companyId/special-ops`, écran **Comptabilité › Opérations spécifiques**.

Chaque opération calcule les écritures types du guide d'application du SYSCOHADA révisé sur les comptes à 6 chiffres
du plan du logiciel, avec leurs échéanciers et valeurs intermédiaires. Les écritures sont **proposées en brouillon**
(journal OD, origine `OPERATION_SPECIFIQUE`) : rien n'est validé sans un comptable. Les écritures « chez l'autre partie »
(absorbée, associé non gérant, succursale, franchiseur) sont restituées pour information, à saisir dans le dossier concerné.

Les exemples du guide sont repris en tests automatisés (153 tests, couverture 99 %) et pré-remplis dans l'écran.

## Couverture

| Chapitre | Applications | Fonctions |
|---|---|---|
| Contrats de location | 37, 38 | `lesseeLease` (taux implicite, tableau de la dette, levée ou non de l'option), `lessorLease` |
| Réserve de propriété | 39, 40 | `retentionBuyer`, `retentionSeller` (engagements 9083/9183, 9043/9143 ; défaillance, reprise) |
| Immobilisations particulières | 41 à 43 | `investmentProperty`, `buildingOnLeasedLand`, `landOwnerAtLeaseExpiry`, `lifeAnnuity` |
| Titres | 48 à 51 | `acquireSecurities`, `subscribeUnpaidSecurities` (4813 / 4726), `disposeFinancialAsset`, `placementImpairment`, `disposePlacementSecurities` (PEPS, coût moyen pondéré) |
| Créances | 55 à 57 | `debtWaiver`, `factoring`, `reverseFactoring`, `securitisation` |
| Capitaux propres | 58 à 64 | `incorporation`, `fractionedCapital`, `capitalIncreaseCash`, `capitalIncreaseReserves`, `capitalReductionLosses`, `capitalReductionRepayment`, `capitalAmortisation` ; affectation (65) dans le module de clôture |
| Subventions | 66 à 70 | `allocateGrant`, `grantAward`, `grantReleaseSchedule` (reprise 799 au rythme de l'amortissement, 10 ans pour un bien non amortissable), `grantRelease`, `grantOnDisposal`, `operatingGrant`, `equilibriumGrant`, `stateAdvance`, `subsidisedAssetImpairment` |
| Emprunts obligataires | 78 à 80 | `bondLoan` (amortissements constants, in fine), `convertibleBond` |
| Retraites | 81 à 83 | `projectedObligation` (unités de crédit projetées), `pensionYearEnd` (coût des services, coût financier, écarts actuariels), `insuredPensionPremium`, `retirementPayment` |
| Change | 88 à 91 | `fxPosition` (position globale, couverture symétrique, 4788), `fixedRateHedgedPurchase`, `forwardSaleHedge` (report/déport, dénouement, 756) |
| Contrats pluri-exercices, abonnement | 92 à 94 | `contractAtClosing` (avancement / achèvement, perte à terminaison 193), `contractCompletion`, `subscriptionCharges` (4746 / 4747) |
| Concessions, GIE, personnel extérieur | 95 à 98 | `publicPrivatePartnership`, `gieResultShare`, `gieContribution`, `externalStaffTransfer` |
| Réévaluation | 99, 100 | `legalRevaluation` (1061 ou 154), `revaluedDepreciation` (reprise 861), `freeRevaluation` (méthodes 1 et 2) |
| Engagements, événements postérieurs, tiers | 102 à 105 | `guaranteeCommitment`, `classifyPostClosingEvent`, `commissionAgent`, `mandatary` |
| Opérations en commun, établissements, franchise | 106 à 112 | `jointVentureResult`, `jointVentureAssetShare`, `branchTransfer`, `branchEndowment`, `branchIntegration`, `franchise` |
| Pluri-monétaire, agriculture | 113 à 115 | `foreignAccountAdjustment`, `agriculturalOps` |
| Fusions | 116 à 120 | `mergerShareValues` (participations réciproques), `merger` (prime, boni, actions propres, écritures de l'absorbée), `partialContribution` |
| Période comparative, liquidation | 121, 122 | règles de l'information comparative (docs/04) ; `liquidation` (1384 direct ou 837 / 847, partage) |
| Première application | 123 à 126 | `establishmentCostsTransition`, `bondPremiumTransition`, `componentReallocation`, `pensionTransition`, `longTermContractTransition` |
| Consolidation avancée | 128 à 130, 135 à 138 | `groupPercentages` (contrôle, intérêts, circulaires, méthodes), `votingRights`, `acquisitionDifferences` (écarts d'évaluation et d'acquisition, badwill, MEE), `translateStatements` |

Restent hors de l'assistant : l'entité ad hoc (131, jugement), les retraitements et éliminations (139, 140) servis par la
consolidation existante, les variations de pourcentage d'intérêt (141) et les comptes combinés (142).

## Conventions

- Montants en unités mineures (bigint) ; dans l'API, chaînes de chiffres. Les exemples du catalogue sont convertis dans
  la devise du dossier (centimes pour le CDF).
- Taux en décimal. Les taux de TVA et d'impôt sont **toujours des paramètres** (packs fiscaux par pays) : aucun taux
  n'est codé en dur.
- Comptes : ceux du plan à 6 chiffres. Avant toute création, l'API vérifie que chaque compte existe dans le plan du
  dossier (`COMPTES_ABSENTS` sinon). Les comptes de l'ancien plan à solder lors de la première application (201X, 206,
  352X) doivent exister dans le plan de reprise.
- Ajout au plan : comptes d'engagements hors bilan des classes 90 et 91 à 6 chiffres (issus de l'AUDCIF).

## Points à valider par l'expert-comptable

- Sociétés en participation : sous-comptes 7521 / 7525 et 6521 / 6525 retenus pour la quote-part du gérant et des associés.
- Cession à crédit de titres immobilisés : le compte 4856 cité par le guide n'existe pas dans le plan de l'AUDCIF ;
  le compte de créance est laissé au choix (banque par défaut).
- Titres immobilisés « actions » : le guide cite 2746, qui est « Actions ou parts propres » dans l'AUDCIF ; le logiciel
  retient 2748 « Autres titres immobilisés ».

## Errata du guide relevés

| Application | Constat | Traitement |
|---|---|---|
| 78 | Coupon calculé sur 10 000 alors que le nominal est de 5 000 | Tableaux du guide reproduits avec un coupon de 500 ; le moteur calcule le coupon sur le nominal |
| 110-111 | Le compte de résultat de la succursale (7,4 M) exclut les comptes de liaison 186/187 que le texte dit d'inclure ; l'écriture de clôture ne solde pas le 184 | Les deux résultats sont fournis ; l'intégration élimine 184, 186 et 187 |
| 118 | Écriture de l'absorbée : matériel 30 M et titres 15 M au lieu de 40 M et 5 M au bilan | Bilan retenu ; résultat de fusion identique (39 M) |
| 130 | 21,397 % tronqué en 21,39 % | Arrondi au millième |
