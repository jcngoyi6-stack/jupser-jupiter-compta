# 06 — Fiscalité et social assistés par l'IA (17 pays OHADA)

## 1. Principe : un moteur, des packs pays
Le droit fiscal et social **n'est pas harmonisé** par l'OHADA (seule la comptabilité l'est). Jupiter Compta sépare donc :
- un **moteur** générique (`packages/tax-engine`) : barèmes progressifs, taux proportionnels, plafonds, abattements, quotients familiaux, minimums, centimes additionnels, arrondis, prorata ;
- des **packs pays** versionnés (`tax_rule`), chacun avec date d'effet, texte de référence, statut et validateur.

### Cycle de vie d'une règle
`BROUILLON` (saisie JUPSER) → `A_VALIDER` (relecture fiscaliste) → `VALIDE` (publication à tous les clients du pays) → `ABROGÉ` (date de fin). Toute loi de finances déclenche une revue du pack (tâche planifiée chaque janvier et à chaque publication au Journal officiel). Les clients sont notifiés des changements, avec le détail des règles modifiées.

### Responsabilité
Le logiciel calcule et rappelle ; le contribuable reste responsable de ses déclarations. Cette mention figure dans les conditions d'utilisation et sur chaque simulation.

## 2. Fonctions
| Fonction | Détail |
|---|---|
| TVA | Codes TVA par pays, TVA collectée/déductible depuis les écritures, prorata, crédit de TVA, déclaration pré-remplie, contrôle de cohérence CA déclaré / CA comptable |
| Impôt sur le résultat | Passage du résultat comptable au résultat fiscal (réintégrations, déductions), IS au taux du pays, minimum d'imposition, acomptes, report déficitaire selon le pays |
| Retenues à la source | Impôt sur salaires, prestataires, loyers, dividendes, non-résidents (taux paramétrés) |
| Taxes sur salaires | Taxes et contributions patronales par pays |
| Calendrier fiscal | Échéances calculées par pays et par régime (mensuel, trimestriel, annuel), jours fériés locaux ; rappels J-10, J-3, J-1 (application, e-mail, SMS/WhatsApp) ; statut « payé » relié à l'écriture de paiement |
| Simulateur | IS, TVA, paie (brut → net et net → brut), coût employeur, impact d'une embauche, d'un investissement ou d'une hausse de prix ; scénarios comparés côte à côte |
| Assistant IA | Explique un calcul ligne par ligne, cite la règle utilisée (référence légale de `tax_rule`), détecte les oublis (TVA non déclarée, retenue non reversée) |
| Pénalités | Estimation des pénalités de retard selon les règles paramétrées du pays (à valider) |

## 3. RDC — point d'attention 2026
D'après le ministère des Finances et plusieurs sources professionnelles, la loi n°23/053 du 30 novembre 2023 instituant l'**impôt sur les sociétés (IS)** et l'**impôt sur le revenu des personnes physiques (IRPP)** est entrée en vigueur le 1er janvier 2026 et remplace les impôts cédulaires (dont l'IPR et l'IBP). Conséquences pour le logiciel :
- le logiciel emploie exclusivement la terminologie **IS-IRPP** : « IS » pour les sociétés, « IRPP retenu à la source » sur les rémunérations ; le terme IPR n'apparaît plus que dans l'historique des paies antérieures à 2026 ;
- barème retenu par défaut (à confirmer sur le texte) : tranches annuelles 0–1 944 000 FC à 3 %, 1 944 001–21 600 000 FC à 15 %, 21 600 001–43 200 000 FC à 30 %, au-delà 40 % ; minimum 2 000 FC par mois ; plafond 30 % du revenu imposable ;
- IS à 30 % du bénéfice, minimum de 1 % du chiffre d'affaires (à confirmer) ; TVA 16 % ;
- CNSS 5 % salarié / 13 % employeur ; ONEM 0,2 % ; INPP : deux grilles circulent (3/2/1 % et 3,5/3/2 %, avec 4 % pour le public) — **à trancher** sur le texte en vigueur ;
- points de divergence à faire trancher : déductibilité de la CNSS salariale dans l'assiette, maintien de l'IERE pour les expatriés, plafonds des indemnités de logement et de transport.
Détails dans `data/paie_rdc_2026.json`.

## 4. État de la recherche pour les 17 pays
Les valeurs de `data/pays_ohada_referentiel.json` servent de **pré-remplissage** : niveau de confiance indiqué pour chaque pays (haute / moyenne / faible). Aucune n'est au statut `VALIDE`.

| Pays | Devise | Impôt sur salaires | Organismes sociaux principaux | Confiance |
|---|---|---|---|---|
| RDC | CDF / USD | IRPP retenu à la source (IS-IRPP) | CNSS, INPP, ONEM | Moyenne-haute |
| Côte d'Ivoire | XOF | ITS (+ CMU) | CNPS ; FDFP | Moyenne |
| Sénégal | XOF | IR + TRIMF | IPRES, CSS ; CFCE | Moyenne |
| Cameroun | XAF | IRPP + CAC | CNPS ; CFC, FNE, RAV, TDL | Moyenne |
| Gabon | XAF | IRPP (+ TCS) | CNSS, CNAMGS | Moyenne |
| Bénin | XOF | ITS | CNSS ; VPS | Moyenne |
| Burkina Faso | XOF | IUTS | CNSS ; TPA | Moyenne |
| Mali | XOF | ITS | INPS, AMO ; contribution forfaitaire, TFP, TL | Moyenne |
| Niger | XOF | IUTS | CNSS | Moyenne |
| Togo | XOF | IRPP-TS | CNSS, AMU | Moyenne |
| Tchad | XAF | IRPP | CNPS | Moyenne |
| Guinée | GNF | RTS | CNSS ; VF, TA | Moyenne |
| Congo | XAF | IRPP + TUS | CNSS | Faible |
| Centrafrique | XAF | IRPP | CNSS | Faible |
| Guinée équatoriale | XAF | IRPF | INSESO | Faible |
| Guinée-Bissau | XOF | Impôt professionnel | INSS | Faible |
| Comores | KMF | IR salaires | CNPS | Faible |

### Méthode de validation recommandée
1. Acquérir pour chaque pays le Code général des impôts et la loi de finances de l'année, ainsi que les textes des caisses sociales.
2. Faire relire chaque pack par un fiscaliste ou cabinet partenaire local (le réseau des cabinets clients de l'édition Cabinet peut servir de relais).
3. Écrire 10 cas de paie et 5 cas d'IS/TVA par pays, calculés à la main par le fiscaliste : ce sont les tests d'acceptation du pack.
4. Lancement commercial pays par pays : **RDC d'abord**, puis Côte d'Ivoire, Sénégal, Cameroun, Gabon, puis les autres.

## 5. Structure d'une règle (exemple)
```json
{ "pays": "CD", "impot": "IRPP_SALAIRES", "parametre": "bareme_annuel",
  "valeur": [{"de":0,"a":1944000,"taux":0.03},{"de":1944000,"a":21600000,"taux":0.15},
             {"de":21600000,"a":43200000,"taux":0.30},{"de":43200000,"a":null,"taux":0.40}],
  "date_effet": "2026-01-01", "statut": "A_VALIDER",
  "reference": "Loi n°23/053 du 30/11/2023 — article à préciser" }
```
