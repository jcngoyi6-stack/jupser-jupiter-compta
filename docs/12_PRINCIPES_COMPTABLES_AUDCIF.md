# 12 — Respect strict des principes comptables et de l'AUDCIF

Exigence de JUPSER : **tous les principes comptables et toutes les dispositions de l'Acte uniforme relatif au droit comptable et à l'information financière (AUDCIF) sont respectés à la lettre**. Chaque principe est traduit en contrôle logiciel testable. Lors du lot L2, un expert-comptable relit ce tableau et y porte le numéro exact de l'article de l'AUDCIF (et la page du guide d'application) en face de chaque contrôle.

| Principe / obligation | Traduction dans Jupiter Compta | Test d'acceptation |
|---|---|---|
| Régularité, sincérité, transparence (dans le respect de la prudence) | Écritures justifiées, contrôlées, traçables ; journal d'audit inaltérable | Toute écriture validée a une pièce, un auteur, une date et une empreinte |
| Prudence | Provisions et dépréciations proposées à l'inventaire ; gains latents de change jamais en résultat (479), pertes latentes provisionnées | Réévaluation de clôture : écarts passif non portés en produits |
| Continuité d'exploitation | Indicateurs d'alerte (capitaux propres < moitié du capital, pertes répétées, trésorerie négative) signalés au comptable et dans la note annexe | Alerte émise sur jeu de test déficitaire |
| Coût historique | Entrées d'actifs au coût d'acquisition ou de production ; réévaluation uniquement dans un module dédié, tracée en écart de réévaluation | Aucune modification de valeur d'actif hors module de réévaluation |
| Permanence des méthodes | Méthodes (amortissement, stocks, provisions) figées par exercice ; tout changement exige justification et génère l'information pour les notes annexes | Changement refusé sans motif ; note générée |
| Spécialisation (indépendance) des exercices | Rattachement des charges et produits à l'exercice : charges à payer, produits à recevoir, charges et produits constatés d'avance (476/477) ; contrôle des dates de pièces | Facture de N+1 saisie en N : alerte |
| Intangibilité du bilan d'ouverture | Les à-nouveaux sont générés depuis le bilan de clôture verrouillé ; aucune saisie directe en journal d'à-nouveaux | Bilan d'ouverture N = bilan de clôture N-1 au centime |
| Non-compensation | Interdiction de compenser actif/passif et charges/produits hors cas juridiquement fondés ; soldes clients créditeurs reclassés au passif | Client créditeur présenté au passif dans les états |
| Importance significative | Seuils paramétrables pour les informations en notes annexes et pour l'audit | Seuil appliqué au dossier |
| Prééminence de la réalité sur l'apparence | Cas prévus par le SYSCOHADA (ex. biens en location-acquisition inscrits à l'actif) traités par assistant dédié | Contrat de crédit-bail : actif + dette constatés |
| Image fidèle | Contrôles de cohérence avant production des états ; dérogations documentées en notes | États bloqués tant qu'un contrôle bloquant échoue |
| Comparabilité | Colonnes N et N-1 ; retraitement de N-1 en cas de changement de présentation, signalé en note | N-1 retraité et mentionné |
| Exercice de 12 mois, année civile | Exercice civil par défaut ; premier exercice plus court ou plus long selon la date de création, dans les limites de l'AUDCIF | Assistant de création propose la bonne durée |
| Langue officielle et monnaie légale | Tenue dans la langue officielle de l'État et dans sa monnaie ayant cours légal ; autres devises en informations complémentaires | Devise de tenue imposée selon le pays |
| Enregistrement chronologique et pièce justificative | Numérotation continue par journal, date et référence de la pièce obligatoires, pièce numérisée attachée | Impossible de valider sans référence de pièce |
| Irréversibilité et inaltérabilité (comptabilité informatisée) | Écriture validée non modifiable ni supprimable ; corrections par contre-passation ; clôture des périodes ; procédure de clôture datée | Tentative de modification refusée et journalisée |
| Livres obligatoires | Livre-journal, grand-livre, balance générale, livre d'inventaire (bilan, compte de résultat, TFT, résumé de l'inventaire) produits, imprimables et archivés | Les 4 livres sont générés et cotés |
| Inventaire physique annuel | Module d'inventaire (stocks, immobilisations, caisse) avec écarts comptabilisés | Écart d'inventaire comptabilisé |
| Correction des erreurs | Erreurs de l'exercice : contre-passation ; erreurs significatives des exercices antérieurs : traitement prévu par l'AUDCIF, avec information en notes | Assistant « correction d'erreur antérieure » |
| Conservation | Livres et pièces conservés 10 ans, archivage électronique à valeur probante (empreinte, horodatage) | Purge impossible avant 10 ans |
| Seuils SMT | Éligibilité selon le CA HT (60 / 40 / 30 millions FCFA ou équivalent) | Seuils convertis et appliqués |

Règle de développement : aucune fonctionnalité ne peut contourner ces contrôles, y compris les actions de Jupiter IA et les imports.
