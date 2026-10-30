# 17 — Une interface par utilisateur et par direction, un seul système

## 1. Principe
Toutes les directions travaillent sur la **même base de données** : une vente saisie par le commercial met à jour le stock, la créance client, la TVA, la trésorerie prévisionnelle et la comptabilité, sans ressaisie. Mais **chaque utilisateur ne voit que son interface** : son menu, son tableau de bord, ses tâches et les données de son périmètre.

## 2. Espaces par direction
| Direction / département | Espace |
|---|---|
| Direction générale | Tableau de bord consolidé (ventes, marge, trésorerie, budget, RH, alertes), validations, réunions, rapports de tous les services |
| Direction financière et comptable | Saisie, journaux, grand-livre, balance, clôture, états financiers, notes annexes, fiscalité, budget, trésorerie |
| Commerciale et marketing | CRM, devis, commandes, factures, campagnes, objectifs, relances |
| Achats et logistique | Demandes et bons de commande, réceptions, fournisseurs, stocks, inventaires |
| Production | Ordres de fabrication, consommations, coûts, qualité |
| Ressources humaines | Personnel, présences, congés, recrutement, évaluation, paie, contrats |
| Secrétariat / courrier | Registre du courrier, GED, convocations, procès-verbaux |
| Caisse | Encaissements, décaissements, bons de caisse, quittances, arrêté de caisse |
| Audit interne / commissaire aux comptes | Lecture seule, piste d'audit, extractions |
| Employé (libre-service) | Bulletins de paie, demandes de congé, pointages, messagerie, tâches |

## 3. Règles techniques
- Menus, écrans et widgets générés à partir des **permissions** (rôle × périmètre × modules souscrits) : un module non souscrit ou non autorisé n'apparaît pas.
- Tableau de bord personnalisable par l'utilisateur à l'intérieur de ses droits.
- Données filtrées côté serveur (jamais seulement masquées côté écran).
- Délégations temporaires (intérim, congé) tracées.
- Circuits de validation transverses (bon de commande → direction → finance) visibles dans l'espace de chaque intervenant.
