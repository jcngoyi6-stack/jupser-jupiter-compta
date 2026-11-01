-- Édition souscrite par un paiement (passage de l'essai au payant, changement d'édition)
ALTER TABLE "payment" ADD COLUMN "edition" TEXT;
