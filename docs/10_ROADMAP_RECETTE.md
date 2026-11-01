# 10 — Lots, planning indicatif et critères d'acceptation

| Lot | Contenu | Durée indicative | Critères d'acceptation principaux |
|---|---|---|---|
| **L0 Socle** | Monorepo, CI, authentification + double authentification, multi-locataire RLS, audit chaîné, i18n, design system | 4 semaines | Test d'isolation entre deux locataires vert ; audit vérifiable ; connexion avec double authentification |
| **L1 Comptabilité** | Plan SYSCOHADA, journaux, saisie (grille, guidée, modèles), validation, contre-passation, lettrage, rapprochement, devises | 8 semaines | 100 % des écritures validées équilibrées ; impossibilité de modifier une écriture validée ; numérotation sans trou ; écart de change correct sur 10 cas |
| **L2 États financiers** | Bilan, compte de résultat, TFT, notes, SMT, clôture, à-nouveaux | 6 semaines | Sur 3 jeux de données de référence (tirés du guide d'application) : états identiques au centime ; contrôles actif = passif et TFT bouclés |
| **L3 Licences et paiements** | Plans, modules, console JUPSER, paiement mobile money et carte, factures | 5 semaines | Paiement test réussi par 2 moyens ; passage automatique en lecture seule à J+15 |
| **L4 Jupiter IA v1** | Guide, pièce → écriture, contrôles de cohérence | 6 semaines | ≥ 85 % des champs extraits corrects sur 200 pièces ; aucune écriture validée sans action humaine |
| **L5 Fiscalité RDC + paie RDC** | Pack RDC validé, TVA, IS, calendrier, simulateur, paie, déclarations | 6 semaines | 10 cas de paie et 5 cas fiscaux calculés par le fiscaliste reproduits au franc près |
| **L6 Analyse financière** | SIG, ratios, TFT commenté, prévision de trésorerie | 4 semaines | Résultats identiques au classeur de référence JUPSER AFS |
| **L7 Production et marketing** | Nomenclatures, ordres de fabrication, coûts, stocks ; CRM, campagnes, factures | 8 semaines | Coût de revient reproduit sur 3 cas ; campagnes avec désinscription |
| **L8 Packs pays** | CI, SN, CM, GA puis les autres (2 à 3 semaines par pays) | Continu | Mêmes critères que L5 par pays |
| **L7b Documents, collaboration, GED, courrier** | Documents avec QR et logo de l'abonné, messagerie, réunions, tâches, e-mail IA, GED, courrier | 8 semaines | QR vérifiable ; facture annulée signalée comme telle au scan |
| **L7c Budget, trésorerie, stocks, présence, recrutement** | Contrôle budgétaire, plan de trésorerie, stocks, terminaux biométriques, grilles d'évaluation | 8 semaines | Pointage → paie sans ressaisie |
| **L9 IA Agent, Cabinet, consolidation** | Agents multi-étapes, multi-dossiers, liasses en masse, consolidation | 12 semaines | Clôture d'un mois test en brouillons validée ; états produits depuis 5 balances Excel réelles ; manuel de procédures généré pour 3 secteurs et validé par un expert-comptable |

Lancement commercial possible après L0–L5 et L7b (environ 11 mois avec une équipe de 4 à 6 développeurs assistés par Claude Code, à affiner).

## Tests transverses
- Tests unitaires des packages métier ≥ 90 % ; tests d'intégration API ; tests de bout en bout des parcours clés (ouverture d'un dossier, saisie, clôture, paie, paiement d'abonnement).
- Tests de charge : 500 utilisateurs simultanés, balance de 1 million de lignes générée en moins de 5 s.
- Test d'intrusion externe avant ouverture commerciale.
- Revue comptable indépendante (expert-comptable) des états produits avant lancement.
