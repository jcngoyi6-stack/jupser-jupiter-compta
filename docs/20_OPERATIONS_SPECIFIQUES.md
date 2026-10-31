# 20 — Opérations spécifiques du guide d'application (version 0.6.0)

Paquet `packages/special-ops`, API `companies/:companyId/special-ops`, écran **Comptabilité › Opérations spécifiques**.

Chaque opération calcule les écritures types du guide d'application du SYSCOHADA révisé sur les comptes à 6 chiffres
du plan du logiciel, avec leurs échéanciers et valeurs intermédiaires. Les écritures sont **proposées en brouillon**
(journal OD, origine `OPERATION_SPECIFIQUE`) : rien n'est validé sans un comptable. Les écritures « chez l'autre partie »
(absorbée, associé non gérant, succursale, franchiseur) sont restituées pour information, à saisir dans le dossier concerné.

Les exemples du guide sont repris en tests automatisés (161 tests, couverture 99 %) et pré-remplis dans l'écran.

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
| Consolidation avancée | 128 à 131, 135 à 138, 141, 142 | `groupPercentages` (contrôle, intérêts, circulaires, méthodes), `votingRights`, `adHocControl` (entités ad hoc), `acquisitionDifferences` (écarts d'évaluation et d'acquisition, badwill, MEE), `translateStatements`, `ownershipChange` (variation du pourcentage d'intérêt, écart d'acquisition figé), `combinedAccounts` |

Les retraitements et éliminations (139, 140) sont servis par le module de consolidation. Celui-ci calcule aussi, depuis
l'organigramme des détentions, le **périmètre** (pourcentages, entités ad hoc, méthode proposée et écarts avec le
paramétrage : `POST /consolidation/groups/:id/perimeter`) et les **comptes combinés** à partir des balances réelles des
membres (`POST /consolidation/groups/:id/combined`). Toutes les applications du guide (1 à 142) sont désormais couvertes.

## Conventions

- Montants en unités mineures (bigint) ; dans l'API, chaînes de chiffres. Les exemples du catalogue sont convertis dans
  la devise du dossier (centimes pour le CDF).
- Taux en décimal. Les taux de TVA et d'impôt sont **toujours des paramètres** (packs fiscaux par pays) : aucun taux
  n'est codé en dur.
- Comptes : ceux du plan à 6 chiffres. Avant toute création, l'API vérifie que chaque compte existe dans le plan du
  dossier (`COMPTES_ABSENTS` sinon). Les comptes de l'ancien plan à solder lors de la première application (201X, 206,
  352X) doivent exister dans le plan de reprise.
- Ajout au plan : comptes d'engagements hors bilan des classes 90 et 91 à 6 chiffres (issus de l'AUDCIF).

## Choix comptables — validés

Les choix ci-dessous ont été **validés le 31/10/2026 par l'expert-comptable agréé ONEC de JUPSER**.

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
| 141 | Écart d'évaluation à la date du lot supplémentaire : (20 − 1,6) × (1 − 25 %) = 13,8 M, mais le guide retient 4,6 M | 13,8 M retenu ; le partage final du guide (titres 39,7 M, minoritaires 18 M, réserves 32,3 M) est retrouvé |

## Interconnexion des sociétés d'un même groupe

Les sociétés d'un même client (locataire) peuvent être reliées :

- **Opération intragroupe** (`POST companies/:id/special-ops/intercompany`, écran Opérations spécifiques) : refacturation
  de prestations, vente de marchandises, prêt, remboursement, intérêts, dividende, règlement. Une seule saisie crée en
  brouillon les écritures de la société émettrice et les écritures miroirs de la société réceptrice, avec une référence
  commune `IG-…` et un tiers « société du groupe » créé automatiquement dans chaque dossier (4112 / 4012).
- **Écritures de l'autre partie** d'une opération spécifique (société en participation, succursale, fusion, franchise…)
  passées directement en brouillon dans la société liée (`counterpartCompanyId`).
- **Factures intragroupe avec circuit d'acceptation** (écran **Intragroupe**) : les sociétés sont reliées une fois
  (`POST companies/:id/group-links`) ; toute facture émise (menu Factures) à un client « société du groupe » arrive dans
  la boîte de réception de la société destinataire, avec le coût de revient des articles vendus. La destinataire
  **accepte** (compte de charge, de stock ou d'immobilisation par ligne, entrée en stock éventuelle, écriture d'achat en
  brouillon au journal ACH référencée `IG-…`) ou **refuse** avec un motif ; l'émetteur annule alors par avoir, ce qui
  retire la facture de la boîte.
- **Consolidation** : les comptes groupe 4112, 4012, 2771 et 1811 s'ajoutent aux comptes de liaison éliminés ; les
  produits et charges réciproques sont éliminés. Pour les factures acceptées (achat validé chez l'acheteur), la
  **marge interne non réalisée** est retraitée automatiquement : (prix − coût de revient du vendeur) × quantité restant
  en stock chez l'acheteur à la clôture, ou totalité si le bien a été immobilisé ; elle minore le résultat du vendeur
  (et donc la part des minoritaires de ce vendeur) et la valeur du stock ou de l'immobilisation. L'impôt différé actif
  correspondant est calculé au taux d'IS du pack pays de la mère et présenté dans le détail des retraitements.
  Limites : seules les factures de l'exercice consolidé sont retraitées (les marges en stock d'ouverture relèvent des
  réserves) ; la quote-part d'amortissement de la marge sur immobilisations n'est pas encore réintégrée.
- Chaque société garde sa validation propre : les écritures miroirs restent des brouillons à valider dans chaque dossier.
