
-- Audit log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  user_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_table_record ON public.audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read audit_log"
ON public.audit_log FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_record_id uuid;
BEGIN
  BEGIN
    v_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    INSERT INTO public.audit_log (table_name, record_id, action, user_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, v_record_id, 'DELETE', v_user_id, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    INSERT INTO public.audit_log (table_name, record_id, action, user_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, v_record_id, 'UPDATE', v_user_id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    INSERT INTO public.audit_log (table_name, record_id, action, user_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, v_record_id, 'INSERT', v_user_id, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers
CREATE TRIGGER trg_audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_pallets
  AFTER INSERT OR UPDATE OR DELETE ON public.pallets
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
