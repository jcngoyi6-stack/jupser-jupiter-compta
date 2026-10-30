-- Désinscription publique d'une campagne (lien présent dans chaque message), sans contexte locataire.
CREATE OR REPLACE FUNCTION jc_unsubscribe(p_token text)
RETURNS TABLE(tenant_id uuid, contact_type text, contact_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT cm.tenant_id AS t, cm.contact_type AS ct, cm.contact_id AS ci INTO r FROM campaign_message cm WHERE cm.token = p_token;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE campaign_message SET status = 'DESINSCRIT' WHERE token = p_token;
  IF r.ct = 'TIERS' THEN UPDATE third_party SET unsubscribed = true WHERE id = r.ci;
  ELSE UPDATE lead SET unsubscribed = true WHERE id = r.ci; END IF;
  RETURN QUERY SELECT r.t, r.ct, r.ci;
END $$;
GRANT EXECUTE ON FUNCTION jc_unsubscribe(text) TO jupiter_app;
