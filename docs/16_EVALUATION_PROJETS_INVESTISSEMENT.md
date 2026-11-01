# 16 — Module « Évaluation des projets d'investissement » (espace Cabinet et édition ERP)

Repris du projet JUPSER EvalProjets, fondé sur l'ouvrage « Ingénierie des projets d'investissement » (A. Corhay & A. Mapapa Mbangala). Le module réutilise les données comptables du client (ou une saisie libre) et produit un rapport d'évaluation à la charte du cabinet.

## 1. Parcours
1. **Fiche du projet** : promoteur, secteur, localisation, durée de vie, devise, hypothèses macro (inflation, change).
2. **Investissements** : programme par année (terrains, constructions, équipements, frais d'établissement), renouvellements, valeur résiduelle ; amortissements calculés selon les règles SYSCOHADA.
3. **Exploitation** : volumes et prix de vente, coûts variables et fixes, charges de personnel (barèmes du pack pays), montée en charge.
4. **BFR** : délais clients, stocks, fournisseurs → variation annuelle du BFR.
5. **Financement** : fonds propres, emprunts (tableau d'amortissement), subventions, crédit-bail.
6. **Fiscalité** : IS du pays (pack validé), avantages du Code des investissements (exonérations, durée), minimum d'imposition.

## 2. Résultats calculés
- Comptes de résultat prévisionnels, CAF, flux nets de trésorerie, plan de financement, bilans prévisionnels.
- Critères : **VAN**, **TRI** (et TRI modifié), **délai de récupération** simple et actualisé, **indice de profitabilité**, annuité équivalente ; coût du capital (CMPC) paramétrable.
- Rentabilité **économique** (avant financement) et **financière** (pour l'actionnaire) ; seuil de rentabilité et point mort.
- **Analyse de risque** : sensibilité (prix, volumes, coûts, investissement, taux), scénarios pessimiste/réaliste/optimiste, simulation de Monte-Carlo (distributions sur les variables clés, probabilité de VAN négative).
- Option **analyse économique / sociale** (projets publics ou bailleurs) : valeur ajoutée créée, emplois, devises, effets sur les finances publiques.
- Comparaison de plusieurs projets ou variantes.

## 3. Sorties
Rapport d'évaluation (Word/PDF, logo du cabinet), tableaux annexes Excel, synthèse pour le comité de crédit ou le conseil d'administration ; commentaires rédigés par Jupiter IA, validés par l'expert.

## 4. Tests d'acceptation
Les exemples chiffrés de l'ouvrage servent de jeux de test : VAN, TRI et délais identiques à ceux du livre (à fournir par JUPSER).
