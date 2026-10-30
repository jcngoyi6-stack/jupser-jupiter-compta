# 05 — Modules de gestion

## 1. GRH et paie
**GRH** : dossier du salarié (identité, pièces, diplômes, contrat CDD/CDI, catégorie, échelon, affectation), organigramme, recrutement, formation, évaluations, discipline, fin de contrat (préavis, indemnités, certificat).
**Présence** : import des pointages FingerTec (arrivées/départs), retards, heures supplémentaires, absences ; validation par le responsable.
**Congés** : acquisition, demandes, validations, solde.
**Paie** :
- Éléments paramétrables : base, primes, heures supplémentaires, indemnités (logement, transport, allocation de vie chère), avantages en nature, avances, prêts.
- Chaque élément porte ses attributs : imposable, cotisable (par organisme), plafonné.
- Calcul par pays via `packages/payroll` + `tax_rule` : impôt sur salaires (RDC : IRPP retenu à la source, régime IS-IRPP ; CI : ITS ; SN : IR + TRIMF ; BF/NE : IUTS ; CM : IRPP + CAC…), cotisations salariales et patronales (CNSS, CNPS, IPRES/CSS, INPS/AMO, CNAMGS…), taxes employeur (INPP, ONEM, VPS, TPA, CFCE, FNE, CFC, FDFP…).
- Paie en devise (USD en RDC) : conversion au cours officiel du jour de paie pour l'assiette fiscale en monnaie locale.
- Sorties : bulletins (PDF signé numériquement), livre de paie, journal de paie → écritures automatiques (661/664 ↔ 422/431/4472…), ordres de virement et paiements mobile money, déclarations mensuelles et annuelles (fichiers aux formats des organismes lorsqu'ils existent).
- Contrôles : SMIG du pays, plafonds, salariés sans contrat actif, variations anormales (alerte IA).

## 2. Production
Articles (matières, semi-finis, produits finis), unités et conversions, nomenclatures multi-niveaux, gammes (postes de charge, temps), ordres de fabrication (lancement, consommations, déclarations de production, rebuts), calcul du coût de production (matières + main-d'œuvre + charges indirectes via clés), stocks (CMUP ou FIFO), inventaires tournants, valorisation et écritures (32x/36x/603x/73x), planification simple (besoins nets), traçabilité par lot.

## 3. Marketing et ventes
CRM (prospects, opportunités, étapes), devis → commande → facture → encaissement (y compris mobile money), catalogue et listes de prix multi-devises, campagnes SMS / WhatsApp / e-mail avec consentement et désinscription, segmentation (récence, fréquence, montant), programme de fidélité, tableau de bord commercial, prévisions de ventes (IA), génération de textes promotionnels (IA, validés par l'utilisateur).

## 4. Analyse financière
Fondée sur la méthodologie d'analyse des états financiers en SYSCOHADA révisé (en cohérence avec le projet JUPSER AFS) :
- Soldes significatifs de gestion à partir du compte de résultat (marge commerciale, valeur ajoutée, EBE, résultat d'exploitation, RAO, résultat HAO, résultat net) et capacité d'autofinancement.
- Bilan fonctionnel et financier : FRNG, BFR (exploitation / hors exploitation), trésorerie nette.
- Ratios : structure, liquidité, solvabilité, rotation (stocks, clients, fournisseurs), rentabilité (ROE, ROA, marges), endettement, couverture des frais financiers.
- Tableau des flux de trésorerie commenté ; prévision de trésorerie à 13 semaines.
- Analyse en tendance (N à N-4) et score de santé financière ; commentaires rédigés par l'IA, avec renvoi aux chiffres sources.
- Import d'états financiers externes (Excel/balance) pour les cabinets.

## 5. Devises et cours en ligne
- Devise de tenue par société (ex. CDF ou USD selon l'option légale retenue en RDC ; XOF ; XAF ; GNF ; KMF).
- Récupération quotidienne des cours via `FxRateProvider` : BCC (RDC), BCEAO et BEAC (parité fixe 1 EUR = 655,957 XOF/XAF, cours publiés pour les autres devises), BCRG (Guinée), Banque centrale des Comores (1 EUR = 491,96775 KMF). Source de secours commerciale ; saisie manuelle tracée en dernier recours.
- Chaque cours conserve sa source, son horodatage et son type (officiel, marché, manuel).
- Convertisseur intégré ; réévaluation de clôture automatique ; rapports en devise de présentation (ex. états en CDF avec contre-valeur USD).
