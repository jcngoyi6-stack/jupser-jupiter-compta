-- Sécurité et invariants comptables au niveau de la base (défense en profondeur).

-- 1. Row Level Security : isolation des locataires (CLAUDE.md, docs/08).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company','fiscal_year','period','account','journal','journal_sequence','third_party',
    'entry','entry_line','attachment','fx_rate','employee','payroll_run','sales_document','ai_action','payment',
    'audit_log','tenant_key']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;

-- 2. Écriture validée immuable (invariant 2) ; seul le passage VALIDE → CONTREPASSE est permis.
CREATE OR REPLACE FUNCTION jc_entry_guard() RETURNS trigger AS $$
DECLARE d bigint; c bigint; n int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('VALIDE','CONTREPASSE') THEN
      RAISE EXCEPTION 'JC_IMMUABLE: une écriture validée ne peut pas être supprimée';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('VALIDE','CONTREPASSE') THEN
    IF NOT (NEW.status = 'CONTREPASSE' AND OLD.status = 'VALIDE')
       OR (to_jsonb(NEW) - 'status' - 'reversed_by_id') <> (to_jsonb(OLD) - 'status' - 'reversed_by_id') THEN
      RAISE EXCEPTION 'JC_IMMUABLE: une écriture validée ne peut pas être modifiée (contre-passation uniquement)';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'VALIDE' THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*) INTO d, c, n FROM entry_line WHERE entry_id = NEW.id;
    IF n < 2 OR d <> c THEN
      RAISE EXCEPTION 'JC_DESEQUILIBRE: écriture déséquilibrée (débit %, crédit %)', d, c;
    END IF;
    IF NEW.seq IS NULL OR NEW.hash IS NULL OR NEW.piece_ref IS NULL OR btrim(NEW.piece_ref) = '' THEN
      RAISE EXCEPTION 'JC_VALIDATION: numéro, empreinte et pièce obligatoires';
    END IF;
    IF EXISTS (SELECT 1 FROM period p WHERE p.fiscal_year_id = NEW.fiscal_year_id AND p.status = 'CLOTUREE'
               AND NEW.date BETWEEN p.start_date AND p.end_date) THEN
      RAISE EXCEPTION 'JC_PERIODE_CLOTUREE: période verrouillée';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jc_entry_guard ON entry;
CREATE TRIGGER jc_entry_guard BEFORE UPDATE OR DELETE ON entry FOR EACH ROW EXECUTE FUNCTION jc_entry_guard();

CREATE OR REPLACE FUNCTION jc_entry_insert_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('VALIDE','CONTREPASSE') THEN
    RAISE EXCEPTION 'JC_VALIDATION: une écriture est créée en brouillon puis validée';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS jc_entry_insert_guard ON entry;
CREATE TRIGGER jc_entry_insert_guard BEFORE INSERT ON entry FOR EACH ROW EXECUTE FUNCTION jc_entry_insert_guard();

-- Lignes d'une écriture validée : seul le lettrage peut évoluer.
CREATE OR REPLACE FUNCTION jc_line_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM entry WHERE id = COALESCE(OLD.entry_id, NEW.entry_id);
  IF st IN ('VALIDE','CONTREPASSE') THEN
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'letter') = (to_jsonb(OLD) - 'letter') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'JC_IMMUABLE: les lignes d''une écriture validée sont inaltérables';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS jc_line_guard ON entry_line;
CREATE TRIGGER jc_line_guard BEFORE INSERT OR UPDATE OR DELETE ON entry_line FOR EACH ROW EXECUTE FUNCTION jc_line_guard();

-- 3. Journal d'audit et pièces : ajout seul (conservation 10 ans).
CREATE OR REPLACE FUNCTION jc_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'JC_AJOUT_SEUL: % est en ajout seul', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS jc_audit_append_only ON audit_log;
CREATE TRIGGER jc_audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION jc_append_only();
DROP TRIGGER IF EXISTS jc_attachment_append_only ON attachment;
CREATE TRIGGER jc_attachment_append_only BEFORE DELETE ON attachment FOR EACH ROW EXECUTE FUNCTION jc_append_only();

-- 4. Vérification publique d'un document par QR (lecture minimale, sans contexte locataire).
--    Le propriétaire des tables (rôle de migration) dispose de BYPASSRLS ; la fonction ne renvoie que
--    les champs publics du document.
CREATE OR REPLACE FUNCTION jc_verify_document(p_hash text)
RETURNS TABLE(doc_type text, number text, doc_date text, total_gross bigint, currency text, status text, issuer text, issuer_tax_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT d.type, d.number, d.date, d.total_gross, d.currency, d.status, c.name, c.tax_id
  FROM sales_document d JOIN company c ON c.id = d.company_id
  WHERE d.hash = p_hash
$$;

-- 5. Droits du rôle applicatif (sans BYPASSRLS).
GRANT USAGE ON SCHEMA public TO jupiter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jupiter_app;
REVOKE UPDATE, DELETE ON audit_log FROM jupiter_app;
REVOKE DELETE ON attachment FROM jupiter_app;
GRANT EXECUTE ON FUNCTION jc_verify_document(text) TO jupiter_app;
