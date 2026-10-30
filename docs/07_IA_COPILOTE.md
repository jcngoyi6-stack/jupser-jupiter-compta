# 07 — JUPSER IA

## 1. Trois niveaux
| Niveau | Rôle | Édition |
|---|---|---|
| **Guide** | Explique, oriente, aide à la saisie : « Comment enregistrer un achat avec TVA ? », « Quel compte pour un abonnement internet ? » ; réponses avec renvoi à l'AUDCIF ou au guide d'application | Toutes |
| **Analyste** | Lit les données du dossier (droits de l'utilisateur) : analyse financière commentée, détection d'anomalies, prévisions, explication d'un écart, préparation de la clôture | Pro et plus |
| **Agent** | Exécute des tâches complexes en plusieurs étapes, en produisant des **brouillons** à valider : traitement d'un lot de factures, rapprochement complet d'un mois, écritures d'inventaire, réévaluation des devises, notes annexes, liasse DSF, paie du mois avec contrôles | Entreprise ou option IA avancée |

## 2. Cas d'usage prioritaires
1. **Pièce → écriture** : photo ou PDF d'une facture → extraction (fournisseur, NIF, date, HT, TVA, TTC, devise) → écriture proposée (601/605…/4452/401), avec score de confiance et surlignage des zones lues.
2. **Relevés bancaires et mobile money** → rapprochement et lettrage proposés.
3. **Contrôles de cohérence** : doublons, écritures hors période, comptes à solde anormal (caisse créditrice…), ruptures de séquence, TVA incohérente, montants inhabituels (statistique sur l'historique), analyse de la distribution des premiers chiffres (loi de Benford) pour l'audit.
4. **Clôture assistée** : liste de contrôle remplie automatiquement, propositions d'écritures d'inventaire.
5. **Fiscalité** : calcul expliqué, échéances, simulation conversationnelle (« Si j'embauche 3 personnes à 800 USD, quel coût annuel ? »).
6. **Analyse financière** : diagnostic rédigé (structure, rentabilité, trésorerie), points d'alerte, recommandations.
7. **Questions en langage naturel** sur les données (« Quels clients me doivent plus de 90 jours ? »).
8. **Notes annexes** : rédaction des parties textuelles à partir des données et des méthodes déclarées.

## 3. Architecture
- `packages/ai` appelle l'API Claude via `LlmProvider`, **côté serveur uniquement**.
- L'IA n'accède aux données que par des **outils** déclarés (lecture de balance, grand livre, tiers, règles fiscales ; création de brouillons). Chaque outil applique les droits et le périmètre de l'utilisateur qui pose la question. Aucun accès SQL libre.
- Base de connaissance (recherche sémantique) : AUDCIF, guide d'application, packs fiscaux validés, documentation produit. Chaque réponse cite ses sources.
- Toute action d'écriture produit un objet `ai_action` au statut `PROPOSÉ` ; seul un humain habilité l'accepte ; l'acceptation est journalisée.

## 4. Garde-fous
- Pas de validation automatique d'écritures, de déclarations ni de paie.
- Réponse « je ne sais pas » plutôt qu'une règle inventée ; renvoi au fiscaliste ou à l'expert-comptable.
- Données des clients non utilisées pour entraîner des modèles ; contrat avec le fournisseur d'IA à vérifier sur ce point ; minimisation des données envoyées (pas d'identité de salarié quand ce n'est pas nécessaire).
- Quotas de crédits IA par plan, tableau de consommation dans la console JUPSER.
- Journal des échanges conservé pour l'audit, consultable par l'administrateur du client.
- Évaluations automatiques : jeu de 200 pièces et 100 questions de référence ; taux d'écritures acceptées sans modification suivi par version.
