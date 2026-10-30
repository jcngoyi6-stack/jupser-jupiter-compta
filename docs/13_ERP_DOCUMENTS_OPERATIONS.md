# 13 — Jupiter Compta, ERP intégré : documents, opérations et travail d'équipe

Jupiter Compta est un **ERP** : chaque opération de l'entreprise (vente, achat, paie, stock, production, trésorerie) est saisie une seule fois dans le module concerné et génère automatiquement l'écriture comptable correspondante, conforme au SYSCOHADA révisé.

## 1. Identité visuelle de chaque abonné
À l'enregistrement, l'entreprise ou le cabinet importe son **logo**, son cachet numérisé (facultatif), sa signature autorisée (facultative), ses mentions légales (RCCM, IDNAT/NIF, n° d'employeur, adresse, banques) et ses couleurs. Ces éléments sont appliqués automatiquement à tous ses documents.

## 2. Documents générés (PDF, impression et envoi), tous avec code QR
| Domaine | Documents |
|---|---|
| Ventes | Devis, facture proforma, bon de commande client, bon de livraison, facture, facture d'avoir, reçu, relevé de compte client, lettre de relance |
| Achats | Demande d'achat, bon de commande fournisseur, bon de réception |
| Stocks | Bon d'entrée, bon de sortie, bon de transfert, fiche de stock, état d'inventaire |
| Trésorerie | Bon de caisse (entrée/sortie), quittance, reçu de paiement, ordre de virement, état de rapprochement |
| RH | Offre d'emploi, grille d'évaluation des candidats, lettre d'offre, contrat d'engagement, avenant, attestation et certificat de travail, bulletin de paie, livre de paie, état des congés, rapport de présence |
| Comptabilité | Livre-journal, grand-livre, balance, livre d'inventaire, états financiers, notes annexes, DSF |
| Direction | Rapports par service (ventes, achats, stocks, RH, production, trésorerie, budget), tableaux de bord, convocations et procès-verbaux de réunion |

**Code QR** : contient un lien de vérification (domaine JUPSER) + l'empreinte SHA-256 du document. Toute personne qui le scanne voit si le document est authentique, son émetteur, sa date, son montant et s'il a été annulé (ex. facture remplacée par un avoir). Les dispositifs nationaux de facture normalisée/certifiée sont intégrés pays par pays lorsqu'ils existent (`EInvoiceProvider`).

**Numérotation** : séquences continues par type de document, par société et par exercice ; une facture validée ne se supprime pas, elle s'annule par avoir.

**Modèles** : éditeur de modèles (logo, couleurs, champs, mentions), formats A4, A5 et ticket 80 mm.

## 3. Communication et travail d'équipe
- **Messagerie interne** : conversations individuelles et de groupe, canaux par service, partage de pièces et liens vers un document du logiciel (« voir la facture FA-0123 »).
- **Réunions** : convocation (ordre du jour, participants, lieu ou lien visio), accusés de réception, procès-verbal assisté par l'IA, décisions converties en tâches.
- **Tâches, alertes et rappels** : tâches assignées, échéances, rappels (application, e-mail, SMS/WhatsApp) ; alertes automatiques (stock bas, facture échue, échéance fiscale, contrat expirant, absence non justifiée, dépassement budgétaire).
- **E-mail** : envoi direct depuis le logiciel (factures, relances, offres, convocations) ; brouillon rédigé par JUPSER IA, relu par l'utilisateur ; suivi d'ouverture.
- **Travail à distance** : accès sécurisé par navigateur et mobile, postes enrôlés, rôles et périmètres, validations à distance, historique.

## 4. Gestion budgétaire
Budget annuel par compte, centre de coût et projet ; versions (initial, révisé) ; engagements (bons de commande) ; contrôle budgétaire bloquant ou d'alerte ; suivi réalisé/prévu ; prévisions et révisions assistées par l'IA.

## 5. Gestion de la trésorerie
Comptes bancaires, caisses, portefeuilles mobile money ; import des relevés ; rapprochement automatique ; plan de trésorerie (13 semaines et 12 mois) ; prévisions issues des factures, de la paie et des échéances fiscales ; alertes de tension.

## 6. Stocks
Articles, dépôts, entrées/sorties/transferts, CMUP ou FIFO, inventaires, seuils de réapprovisionnement, lots et dates d'expiration, valorisation et écritures automatiques.

## 7. GRH reliée à la présence
- Terminaux biométriques (empreinte digitale, FingerTec et autres via `BiometricProvider`) ; pointage mobile géolocalisé en option pour le personnel itinérant.
- La présence alimente directement : paie (heures, retards, heures supplémentaires, absences), congés, discipline et évaluation.
- **Recrutement** : besoin, fiche de poste, offre publiée, candidatures, **critères d'évaluation pondérés définis par l'entreprise** (diplôme, expérience, test, entretien), notation par plusieurs évaluateurs, classement automatique, présélection proposée par l'IA (sans critère discriminatoire, justification affichée), lettre d'offre et contrat générés.

## 8. Archivage électronique (GED) assisté par l'IA
Numérisation et import de toutes les pièces ; classement automatique par l'IA (type, tiers, date, montant, exercice) ; recherche plein texte ; liaison à l'écriture ; plan de classement ; durées de conservation ; horodatage et empreinte pour la valeur probante ; droits d'accès.

## 9. Gestion du courrier
Registre du courrier arrivé et départ, numérotation, numérisation, affectation à un service, circuit de traitement, délais et relances, réponse rédigée avec l'IA sur le papier en-tête de l'entreprise, archivage dans la GED.

## 10. Import des pièces justificatives
Glisser-déposer, photo depuis le mobile, transfert par e-mail dédié à chaque société, import en masse ; lecture par JUPSER IA et proposition d'écriture.
