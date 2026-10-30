# 03 — Modèle de données (principales tables)

Toutes les tables portent `id (uuid)`, `tenant_id`, `created_at`, `created_by`, `updated_at`. Montants en `numeric(20,4)`.

## Organisation
- `tenant` (raison sociale, type : ENTREPRISE/CABINET, statut d'abonnement)
- `company` (tenant, dénomination, forme juridique, RCCM, NIF/IDNAT, n° CNSS, pays, devise_tenue, système : NORMAL/SMT, secteur, régime fiscal, logo)
- `fiscal_year` (company, début, fin, statut : OUVERT/CLÔTURÉ), `period` (mois, statut, verrou)
- `user`, `membership` (user, tenant, rôles, périmètre sociétés), `device` (postes enrôlés)

## Comptabilité
- `account` (company, numéro, intitulé, classe, parent, nature, sens normal, lettrable, analytique, actif)
- `journal` (code, type : ACHATS/VENTES/BANQUE/CAISSE/MOBILE_MONEY/OD/PAIE/AN, compte de contrepartie)
- `entry` (journal, période, numéro, date, libellé, pièce, statut : BROUILLON/BROUILLON_IA/VALIDÉ/CONTREPASSÉ, origine : MANUEL/IA/PAIE/STOCK/VENTE/IMPORT, hash_audit)
- `entry_line` (entry, compte, tiers, débit, crédit, devise, montant_devise, cours, source_cours, date_cours, axe analytique, code TVA, lettrage)
- `third_party` (CLIENT/FOURNISSEUR/SALARIÉ/AUTRE, NIF, pays, conditions de paiement, compte collectif)
- `bank_account`, `bank_statement_line`, `reconciliation`
- `fixed_asset` (catégorie, date d'acquisition et de mise en service, valeur, composants, mode d'amortissement, durée, valeur résiduelle), `depreciation_line`
- `attachment` (pièce chiffrée, empreinte SHA-256, résultat OCR)

## États financiers
- `statement_template` (pays/système/version), `statement_line` (référence AD…BZ, CA…DZ, TA…XI, FA…ZH, formule), `statement_run` (exercice, date, valeurs figées, signataires)
- `note_template`, `note_run` (notes annexes générées, texte IA validé)

## Fiscalité
- `tax_rule` (pays, impôt, paramètre, valeur JSON, date_effet, date_fin, statut A_VALIDER/VALIDE, référence légale, validé_par, validé_le)
- `tax_code` (TVA : taux, comptes 443x/445x), `tax_return` (période, type, montants, statut, fichier généré), `tax_calendar_event` (échéance, rappel, statut)
- `tax_simulation` (hypothèses, résultats)

## Paie et GRH
- `employee`, `contract`, `position`, `pay_element` (gains/retenues, imposable, cotisable), `attendance` (pointages FingerTec), `leave`
- `payroll_run` (période, statut), `payslip`, `payslip_line`, `social_return` (CNSS/CNPS/IPRES…, INPP, ONEM…)

## Production et stocks
- `item` (article, unité, méthode CMUP/FIFO, comptes 31-37/60x/70x), `warehouse`, `stock_move`
- `bom` (nomenclature), `routing` (gamme), `work_order` (ordre de fabrication), `cost_sheet` (coût de revient)

## Marketing et ventes
- `lead`, `opportunity`, `campaign`, `campaign_message`, `quote`, `sales_invoice`, `loyalty_account`

## Devises
- `currency`, `fx_rate` (devise, contre-devise, cours, date, source, type : OFFICIEL/MARCHÉ/MANUEL)

## IA
- `ai_conversation`, `ai_action` (outil, paramètres, résultat, statut PROPOSÉ/ACCEPTÉ/REJETÉ, utilisateur validateur), `ai_usage` (crédits consommés)

## Licences et facturation (base « console »)
- `plan`, `module`, `plan_module`, `subscription` (tenant, plan, modules, utilisateurs, période, statut), `license_token`, `invoice`, `payment`, `payment_provider_event`, `coupon`, `reseller` (partenaires/cabinets revendeurs)

## Audit
- `audit_log` (horodatage, acteur, action, objet, avant/après chiffrés, hash_précédent, hash) — en ajout seul.
