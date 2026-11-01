-- Facture d'abonnement émise par JUPSER pour chaque paiement confirmé
ALTER TABLE "payment" ADD COLUMN "invoice" JSONB;
