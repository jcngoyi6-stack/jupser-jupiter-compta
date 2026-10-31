# Jupiter Compta — Livrets de formation des utilisateurs

*Version 0.6.0 — supports de formation pour les entreprises, les cabinets et les formateurs agréés JUPSER*

Toutes les données des exercices sont **fictives**. Les exercices se font sur la société de démonstration ou sur une société d'essai créée pour la formation, jamais sur un dossier réel.

---

## Guide du formateur

### Parcours par profil

| Profil | Livrets | Durée conseillée |
|---|---|---|
| Tout utilisateur | 1 | ½ journée |
| Comptable | 1, 2, 3 | 3 jours |
| Chef comptable / directeur financier | 1, 2, 3, 6 | 4 jours |
| Commercial, caissier, magasinier | 1, 4 | 1 journée |
| Paie / RH | 1, 5 | 1 journée |
| Direction générale | 1, 6 (tableaux de bord, budget) | ½ journée |
| Cabinet d'expertise | 1, 2, 3, 6, 7 | 5 jours |
| Administrateur | 1, 8 | ½ journée |

### Organisation d'une session
- Une société d'essai par stagiaire (créée par l'administrateur, monnaie et pays du client).
- Alternance : démonstration (20 %), manipulation guidée (50 %), exercice autonome (30 %).
- Chaque livret se termine par un quiz ; un score de 80 % valide le livret.
- Attestation de formation JUPSER délivrée après validation des livrets du parcours.

### Matériel
Un poste par stagiaire, un téléphone avec une application d'authentification, le vidéoprojecteur, ce livret et le manuel d'utilisation.

---

## Livret 1 — Prise en main (tous les utilisateurs)

**Objectifs** : se connecter en sécurité, se repérer, comprendre la logique « une seule saisie ».

### 1.1 Notions clés
- Un **locataire** (votre organisation) contient une ou plusieurs **sociétés** ; chaque société a son plan de comptes, ses exercices et ses utilisateurs.
- Votre **rôle** détermine ce que vous voyez ; vos **modules** dépendent de l'abonnement.
- Une écriture **brouillon** se modifie ; une écriture **validée** ne se modifie plus : on la contre-passe.

### 1.2 Manipulations guidées
1. Se connecter et configurer la double authentification.
2. Changer de société et de langue.
3. Parcourir le tableau de bord ; ouvrir trois menus différents.
4. Laisser la session inactive : constater la déconnexion après 30 minutes (démonstration du formateur).

### 1.3 Quiz
1. Pourquoi ne peut-on pas modifier une écriture validée ?
2. Un collègue vous demande votre mot de passe pour « gagner du temps » : que répondez-vous ?
3. Un menu qu'utilise un collègue n'apparaît pas chez vous : pourquoi ?

**Corrigé** : 1) pour garantir la piste d'audit et la fiabilité des comptes ; on passe une contre-passation. 2) refus : chaque action est tracée au nom de l'utilisateur, et le partage est interdit. 3) son rôle ou ses modules diffèrent ; seul l'administrateur peut modifier les droits.

---

## Livret 2 — La comptabilité SYSCOHADA révisé avec Jupiter Compta

**Objectifs** : saisir, contrôler et produire les états d'une PME sur un mois puis un exercice.

### 2.1 Rappels SYSCOHADA
- Plan à six chiffres : classes 1 à 5 (bilan), 6 et 7 (activités ordinaires), 8 (hors activités ordinaires et impôt), 90-91 (engagements hors bilan), 92-99 (analytique).
- Principes de l'AUDCIF : prudence, permanence des méthodes, coût historique, spécialisation des exercices, prééminence de la réalité sur l'apparence, importance significative.
- Approche par composants pour les immobilisations ; TFT obligatoire ; notes annexes.

### 2.2 Exercice fil rouge — « Boulangerie Lumière SARL » (fictive)
Monnaie : CDF. Opérations de janvier :

| Date | Opération |
|---|---|
| 02/01 | Apport en numéraire des associés : 10 000 000, versé en banque |
| 05/01 | Achat de farine à crédit : 2 000 000 HT, TVA 16 % (taux à confirmer dans le pack RDC) |
| 10/01 | Ventes au comptant : 3 500 000 HT, TVA 16 % |
| 15/01 | Achat d'un four : 6 000 000 HT payé par banque ; durée 10 ans |
| 31/01 | Salaires bruts : 1 200 000 ; retenues 150 000 ; charges patronales 180 000 |
| 31/01 | Relevé bancaire : frais bancaires 25 000 non comptabilisés |

**Travail** : 1) saisir les écritures ; 2) rapprocher la banque ; 3) éditer la balance ; 4) passer la dotation de janvier du four ; 5) éditer le compte de résultat provisoire.

**Corrigé (extraits)** :
- 02/01 : 521100 D 10 000 000 / 101300 C 10 000 000 (après les écritures de souscription et d'appel décrites au livret 3, chapitre capital).
- 05/01 : 601100 D 2 000 000 ; 445200 D 320 000 / 401100 C 2 320 000.
- 10/01 : 521100 D 4 060 000 / 701100 C 3 500 000 ; 443100 C 560 000.
- 15/01 : 241100 D 6 000 000 ; 445100 D 960 000 / 521100 C 6 960 000.
- Dotation janvier : 6 000 000 / 10 × 17/360 en jours, selon la convention de prorata paramétrée. **Point de vigilance** : discutez avec les stagiaires de la convention (jours ou mois) retenue par le cabinet.
- Frais bancaires : 631800 D 25 000 / 521100 C 25 000.

> Les numéros de comptes de TVA doivent être vérifiés dans le plan du dossier ; le formateur montre comment les retrouver dans **Plan comptable**.

### 2.3 Manipulations
1. Utiliser **Équilibrer** et constater le refus d'une écriture déséquilibrée.
2. Essayer d'imputer 521000 : constater le message « compte non imputable ».
3. Valider (profil chef comptable) puis contre-passer une écriture.
4. Importer une balance d'ouverture au format 6 colonnes et générer les à-nouveaux.
5. Joindre une pièce et la retrouver depuis le grand-livre.

### 2.4 Clôture
Sur la société de démonstration : passer une charge constatée d'avance (assurance payée le 01/07 pour un an : 1 200 000 ; part de l'exercice suivant 600 000 en 476000), constater la contre-passation automatique, dérouler la liste de contrôle, clôturer, puis affecter le résultat.

### 2.5 Quiz
1. Quel journal pour un achat à crédit ? 2. Quelle différence entre 656 et 676 ? 3. Que devient le résultat à l'ouverture de l'exercice suivant ? 4. Pourquoi le tiers est-il obligatoire sur 411 ?

**Corrigé** : 1) achats ; 2) 656 : pertes de change sur créances et dettes commerciales ; 676 : pertes de change financières ; 3) il est repris en « résultat en instance d'affectation » (130100 ou 130900) jusqu'à la décision d'affectation ; 4) pour suivre chaque client, lettrer et établir la balance âgée.

---

## Livret 3 — Opérations spécifiques du guide d'application

**Objectifs** : utiliser les assistants pour les opérations complexes et savoir contrôler leurs écritures.

### 3.1 Méthode
Choisir → ajuster → **Calculer et prévisualiser** → contrôler → **Créer les écritures en brouillon** → faire valider. Les chiffres ci-dessous sont ceux du guide d'application ; ils sont pré-remplis dans l'écran.

### 3.2 Cas pratiques (avec corrigés)

**Cas 1 — Location-acquisition chez le preneur (application 37).** Bien 450 000, 7 redevances annuelles de 80 650, option d'achat 51 600, frais directs 50 000, durée d'utilité 10 ans, contrat mobilier.
*Questions* : taux implicite ? Première ligne du tableau ? Écritures de la première redevance ?
*Corrigé* : taux 8 % ; intérêts 36 000, remboursement du capital 44 650, dette restante 405 350. Mise en place : 241100 D 500 000 / 173000 C 450 000, 481200 C 50 000. Redevance : 623300 D / 401100 C 80 650, puis éclatement 173000 D 44 650, 672300 D 36 000 / 623300 C 80 650.

**Cas 2 — Cession de titres de placement (application 51).** Lots : 1 000 à 12 000, 500 à 12 500, 1 200 à 11 000, 300 à 10 000 ; cession à crédit de 2 500 titres pour 29 000 000.
*Corrigé* : premier entré-premier sorti : valeur d'entrée 29 250 000, perte 250 000 (677100) ; coût moyen pondéré : 28 708 333, gain 291 667 (777000). Faire constater l'effet du choix de méthode sur le résultat et rappeler la permanence des méthodes.

**Cas 3 — Subvention d'investissement (application 66).** Subvention de l'État de 260 000 000 pour un terrain (120 000 000) et un hangar (480 000 000, 15 ans, mis en service au 1er juillet N+1).
*Corrigé* : répartition 13/30 : terrain 52 000 000 (reprise 5 200 000 par an sur 10 ans), hangar 208 000 000 (reprise 6 933 333 en N+1 puis 13 866 667) ; reprise en 799000 ; à la cession, le solde non repris (173 333 333) est rapporté en totalité.

**Cas 4 — Emprunt obligataire in fine (application 79).** 5 000 obligations de 10 000 émises à 9 500, remboursables à 10 500 dans 5 ans, taux 6 %.
*Corrigé* : coupon annuel 3 000 000 (671100) ; prime totale 5 000 000 rattachée à raison de 1 000 000 par an (671400 / 166100) ; remboursement final 161100 D 47 500 000, 166100 D 5 000 000 / 521100 C 52 500 000.

**Cas 5 — Engagements de retraite (applications 81-82).** Valeur actuelle de l'obligation 14 718 en N, coût des services 15 579, taux d'actualisation 5,85 % passé à 6 % : valeur réelle 29 736.
*Corrigé* : coût financier 861 ; dotation 691100 D 15 579, 697100 D 861 / 196100 C 16 440 ; gain actuariel 1 422 (196100 / 797100).

**Cas 6 — Fusion-renonciation (application 117).** A (10 000 titres de nominal 10 000) détient 40 % de B (5 000 titres) acquis pour 10 000 000 ; actif net réel de B : 100 000 000 ; de A hors titres B : 260 000 000.
*Corrigé* : titre B 20 000, titre A 30 000 ; 2 000 titres A émis ; augmentation de capital 20 000 000, prime de fusion 40 000 000, boni 30 000 000, soit 70 000 000 en 105300 ; les écritures de B (résultat de fusion 48 000 000) apparaissent dans « écritures chez l'autre partie ».

**Cas 7 — Contrat déficitaire (application 93).** Prix 120 000 000, coût prévisionnel 125 000 000, coûts engagés 60 000 000.
*Corrigé* : avancement 48 % ; chiffre d'affaires 57 600 000 en factures à établir (418100) ; provision pour perte à terminaison 2 600 000 (691100 / 193000) ; perte de l'exercice 5 000 000.

**Cas 8 — Réévaluation légale (application 99).** Terrain 100 000 000 (valeur actuelle 150 000 000), bâtiment 300 000 000 amorti de 50 000 000 (valeur actuelle 375 000 000), titres 25 000 000 (valeur actuelle 28 000 000), indice 1,2.
*Corrigé* : écart total 73 000 000 en 106100 (ou 154000 en cas de neutralité fiscale) ; bâtiment : valeur brute +60 000 000, amortissements +10 000 000 ; dotation suivante 12 000 000 sur 25 ans.

### 3.3 Points de contrôle de l'expert-comptable
- Les comptes générés existent-ils dans le plan du dossier ? (sinon l'écran le signale)
- Les taux (TVA, impôt) viennent-ils du pack fiscal du pays ?
- Les écritures de l'autre partie ont-elles été passées dans son dossier ?
- L'échéancier est-il cohérent avec le contrat (dates, périodicité) ?

---

## Livret 4 — Ventes, achats, stocks et production

**Objectifs** : faire circuler un flux complet sans ressaisie et en mesurer l'effet en comptabilité.

### Exercice
1. Créer un client et un article (farine, prix 50 000 le sac).
2. Émettre un devis de 20 sacs, le transformer en commande, livrer, facturer.
3. Vérifier : sortie de stock, écriture de vente, TVA collectée, créance client, QR code sur la facture.
4. Créer une demande d'achat de 100 sacs, la faire valider par un second utilisateur, réceptionner, enregistrer la facture fournisseur.
5. Lancer un ordre de fabrication de 500 pains (nomenclature : 0,1 sac de farine par pain) et constater le coût de revient.
6. Faire un inventaire physique avec un écart de 2 sacs et passer l'écart.

### Quiz
1. Pourquoi un bon de commande doit-il être validé par une autre personne ? 2. Où voit-on la valeur du stock ? 3. Que fait le QR code ?

**Corrigé** : 1) séparation des tâches, prévention des fraudes ; 2) menu Stocks et comptes de la classe 3 ; 3) il permet à quiconque de vérifier l'authenticité de la facture.

---

## Livret 5 — Paie et ressources humaines

**Objectifs** : gérer le cycle mensuel de paie et les processus RH.

### Exercice
1. Créer deux salariés (contrats, salaires de base fictifs).
2. Importer un fichier de pointage ; valider une demande de congé faite depuis l'espace salarié.
3. Saisir une prime et des heures supplémentaires ; **Calculer la paie** ; contrôler le livre de paie.
4. Générer les bulletins, l'écriture de paie et les déclarations sociales.
5. Se connecter avec le compte salarié et télécharger son bulletin.

### Points de vigilance
- Les taux de cotisation et les barèmes viennent du pack pays ; tant qu'ils portent le statut « à valider », faites-les confirmer par le fiscaliste.
- Le message « pack pays incomplet » bloque volontairement la paie.

---

## Livret 6 — Pilotage : budget, trésorerie, analytique, consolidation

### 6.1 Budget et trésorerie
Saisir un budget mensuel de charges ; enregistrer une dépense qui le dépasse et observer l'alerte ou le blocage ; lire le plan de trésorerie à 13 semaines.

### 6.2 Comptabilité analytique
Sur la société de démonstration : collecter février, calculer les coûts, vérifier la concordance, lire le tableau de bord ; puis, dans l'outil des coûts partiels, calculer le seuil de rentabilité pour un chiffre d'affaires de 120 000 000, des charges variables de 90 000 000 et des charges fixes de 20 000 000.
*Corrigé* : taux de marge sur coût variable 25 % ; seuil de rentabilité 80 000 000.

### 6.3 Consolidation
**Cas** (application 128) : H détient 90 % de A, B, C et 25 % de D (contrôle conjoint) ; A détient 60 % de E, B 30 % de F, C 55 % de G, D 70 % de I.
*Travail* : saisir les détentions dans **Pourcentages de contrôle et d'intérêt**.
*Corrigé* : intérêts E 54 %, F 27 %, G 49,5 %, I 17,5 % ; méthodes : A, B, C, E, G intégration globale ; D intégration proportionnelle ; F mise en équivalence ; I non consolidée (aucun contrôle).

**Cas** (application 131) : entité créée pour louer des équipements aux filiales ; les dirigeants de la mère détiennent la majorité en assemblée et ont garanti l'emprunt.
*Corrigé* : pouvoirs de décision + majorité des risques → entité ad hoc contrôlée, intégration globale.

**Cas** (application 142) : comptes combinés de B (90 %), C (60 %), D (70 %) détenues par une société hors OHADA.
*Corrigé* : capitaux propres des ayants droit 1 181, part des minoritaires 439, résultat net de l'ensemble combiné 120 (dont 24 pour les minoritaires).

---

## Livret 7 — Cabinets d'expertise comptable

1. Créer un dossier client, une mission et une lettre de mission.
2. Importer la balance du client, établir la correspondance des comptes, produire les états financiers et la DSF.
3. Ouvrir le dossier d'audit : calculer le seuil de signification, documenter les risques, dérouler un programme ISA, lancer les tests de Benford et des écritures inhabituelles, tirer un échantillon en unités monétaires.
4. Faire circuler la mission : préparateur → réviseur → associé.
5. Saisir les temps et éditer la note d'honoraires.
6. Produire un manuel de procédures et vérifier la séparation des tâches.

---

## Livret 8 — Administrateurs

1. Créer une société, choisir le pays et la monnaie ; vérifier l'installation du plan de comptes.
2. Créer des utilisateurs en respectant la séparation des tâches (saisie / validation / paiement).
3. Activer l'enrôlement des postes ; approuver puis révoquer un poste.
4. Configurer l'authentification unique (SSO) si l'organisation en dispose.
5. Consulter la piste d'audit et vérifier son intégrité.
6. Gérer l'abonnement : modules, utilisateurs, factures, moyens de paiement ; comprendre la lecture seule en cas d'impayé.

---

## Évaluation finale (parcours comptable)

Sur une société d'essai vierge, en 3 heures :
1. Importer une balance d'ouverture.
2. Saisir 20 opérations d'un mois (achats, ventes, banque, paie).
3. Rapprocher la banque.
4. Traiter une location-acquisition et une subvention d'investissement avec les assistants.
5. Passer les régularisations, clôturer, éditer bilan, compte de résultat, TFT et trois notes annexes.

Grille : exactitude des écritures (40 %), états financiers équilibrés et cohérents (30 %), contrôles et justifications (20 %), respect des bonnes pratiques (10 %). Validation à 80 %.
