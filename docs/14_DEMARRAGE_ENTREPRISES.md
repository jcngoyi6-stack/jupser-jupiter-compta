# 14 — Démarrer sur Jupiter Compta

## 1. Assistant d'ouverture (toutes les sociétés)
1. Identité : dénomination, forme juridique, pays, RCCM, IDNAT/NIF, n° d'employeur, adresse, **logo**, cachet, signataires.
2. Activité et taille : secteur, chiffre d'affaires prévu → choix du système (normal ou SMT) avec explication.
3. Exercice : dates, devise de tenue imposée par le pays.
4. Plan comptable : plan SYSCOHADA du logiciel (numéros à 6 chiffres) **ou** plan adapté par la société (§ 3).
5. Utilisateurs, rôles, postes enrôlés, double authentification.
6. Modules souscrits → tâches de mise en route générées.

## 2. Trois situations de départ
| Situation | Parcours |
|---|---|
| **Société nouvellement créée** | Parcours « création » : Jupiter IA demande le capital, les apports (numéraire, nature), la libération, le compte bancaire de dépôt, les frais de constitution, le premier local, le premier matériel ; il génère les écritures de constitution (capital souscrit appelé/versé, apports, frais de constitution traités selon le SYSCOHADA révisé) et une liste de tâches : obtenir l'IDNAT/NIF, s'immatriculer à la sécurité sociale, ouvrir les journaux, créer les premiers articles et clients. Premier exercice d'une durée conforme à l'AUDCIF selon la date de création. |
| **Société existante, nouvelle sur le logiciel** | Import de la balance d'ouverture (ou du bilan de clôture), des tiers avec leurs soldes détaillés, des immobilisations, des stocks et du personnel ; contrôle d'équilibre et de cohérence ; possibilité de reprendre l'historique de l'exercice en cours. |
| **Client d'un cabinet** | Le cabinet crée le dossier, importe la balance et donne au client un accès limité (portail) pour déposer ses pièces. |

## 3. Plan comptable adaptable
- Par défaut : plan SYSCOHADA révisé du logiciel, numéros sur **6 chiffres** obtenus en complétant à droite par des zéros (571 → 571000 ; 5711 → 571100). Les comptes à 2 chiffres sont des rubriques non imputables (`data/plan_comptes_syscohada_revise_6chiffres.csv`).
- La société peut **adapter** le plan à sa réalité : créer des sous-comptes (ex. 571110 Caisse Goma, 521110 Rawbank USD), renommer leur libellé d'usage (le libellé officiel reste conservé pour les états), désactiver les comptes inutiles, rendre imputable un compte à 3 chiffres (571000) s'il n'est pas subdivisé.
- Garde-fous : tout compte créé reste rattaché à un compte officiel (même préfixe, même classe, même sens) afin que les états financiers restent conformes ; un compte mouvementé ne se supprime pas ; les modifications sont tracées.
- Import d'un plan existant (Excel) avec **table de correspondance** proposée par Jupiter IA vers le plan SYSCOHADA.
