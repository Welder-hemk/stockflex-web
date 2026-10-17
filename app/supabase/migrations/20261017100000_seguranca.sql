-- =====================================================================
-- StockFlex — correções de segurança e integridade (auditoria 17/10/2026)
-- =====================================================================

-- ---------- 1) Usuário inativo perde acesso; papel exige perfil ativo ----------
CREATE OR REPLACE FUNCTION public.user_is_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT ativo FROM profiles WHERE id = _user_id), false)
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT user_is_active(_user_id) AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT user_is_active(_user_id) AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('admin', 'operador'))
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_financeiro(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT user_is_active(_user_id) AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('admin', 'financeiro'))
$$;

CREATE OR REPLACE FUNCTION public.get_user_client_id(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT cliente_id FROM profiles p
   WHERE p.id = _user_id AND p.ativo
     AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = _user_id AND r.role = 'cliente')
$$;

-- ---------- 2) Usuário não pode trocar o próprio cliente, estado ou e-mail ----------
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Chamadas do servidor (service role, sem usuário) e administradores podem tudo
  IF auth.uid() IS NULL OR has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.ativo IS DISTINCT FROM OLD.ativo
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Permiso denegado: solo un administrador puede cambiar cliente, estado o correo';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ---------- 3) Solicitações do cliente só com pallets dele ----------
CREATE OR REPLACE FUNCTION public.validate_client_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.pallet_ids IS NOT NULL AND cardinality(NEW.pallet_ids) > 0 AND EXISTS (
    SELECT 1 FROM unnest(NEW.pallet_ids) pid
     WHERE NOT EXISTS (SELECT 1 FROM pallets p WHERE p.id = pid AND p.cliente_id = NEW.cliente_id)
  ) THEN
    RAISE EXCEPTION 'La solicitud incluye pallets que no pertenecen al cliente';
  END IF;
  -- Cliente não pode pedir de novo um pallet que já está numa solicitação pendente
  IF TG_OP = 'INSERT' AND NEW.tipo = 'coleta' AND EXISTS (
    SELECT 1 FROM client_requests r
     WHERE r.cliente_id = NEW.cliente_id AND r.status IN ('pendente', 'separado') AND r.pallet_ids && NEW.pallet_ids
  ) THEN
    RAISE EXCEPTION 'Uno o más pallets ya están en una solicitud pendiente';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_client_request ON public.client_requests;
CREATE TRIGGER trg_validate_client_request BEFORE INSERT OR UPDATE OF pallet_ids, cliente_id ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_client_request();

-- ---------- 4) Permissões por papel ----------
-- Clientes e contratos: administração e financeiro editam; operador só lê
DROP POLICY IF EXISTS "Staff full access clients" ON public.clients;
DROP POLICY IF EXISTS "Financeiro read clients" ON public.clients;
DROP POLICY IF EXISTS "Equipe le clientes" ON public.clients;
DROP POLICY IF EXISTS "Gestao edita clientes" ON public.clients;
CREATE POLICY "Equipe le clientes" ON public.clients FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Gestao edita clientes" ON public.clients FOR ALL TO authenticated
  USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));

DROP POLICY IF EXISTS "Staff full access contracts" ON public.contracts;
DROP POLICY IF EXISTS "Financeiro read contracts" ON public.contracts;
DROP POLICY IF EXISTS "Equipe le contratos" ON public.contracts;
DROP POLICY IF EXISTS "Gestao edita contratos" ON public.contracts;
CREATE POLICY "Equipe le contratos" ON public.contracts FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Gestao edita contratos" ON public.contracts FOR ALL TO authenticated
  USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));

-- Custos extras: operador registra (sem valor, pendente); financeiro/admin valorizam e aprovam
DROP POLICY IF EXISTS "Staff full access extra_costs" ON public.extra_costs;
DROP POLICY IF EXISTS "Financeiro read extra_costs" ON public.extra_costs;
DROP POLICY IF EXISTS "Equipe le custos extras" ON public.extra_costs;
DROP POLICY IF EXISTS "Operador registra custo extra" ON public.extra_costs;
DROP POLICY IF EXISTS "Gestao gerencia custos extras" ON public.extra_costs;
CREATE POLICY "Equipe le custos extras" ON public.extra_costs FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Operador registra custo extra" ON public.extra_costs FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()) AND status_aprovacao = 'pendente' AND valor_total = 0);
CREATE POLICY "Gestao gerencia custos extras" ON public.extra_costs FOR ALL TO authenticated
  USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));

-- Faturas antigas: operador deixa de ver
DROP POLICY IF EXISTS "Operador read invoices" ON public.invoices;

-- Mapa: alterações só pelas funções do banco; administrador pode editar direto
DROP POLICY IF EXISTS "Staff full access positions" ON public.warehouse_positions;
DROP POLICY IF EXISTS "Financeiro read positions" ON public.warehouse_positions;
DROP POLICY IF EXISTS "Equipe le posicoes" ON public.warehouse_positions;
DROP POLICY IF EXISTS "Admin edita posicoes" ON public.warehouse_positions;
CREATE POLICY "Equipe le posicoes" ON public.warehouse_positions FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Admin edita posicoes" ON public.warehouse_positions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Financeiro pode anexar comprovantes
DROP POLICY IF EXISTS "Financeiro can upload documents" ON storage.objects;
CREATE POLICY "Financeiro can upload documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND is_admin_or_financeiro(auth.uid()));

-- ---------- 5) Nada de exclusão em cascata de histórico ----------
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col, c.confrelid::regclass AS ref
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confdeltype = 'c'
       AND c.conrelid::regclass::text IN ('contracts', 'pallets', 'movements', 'invoices', 'extra_costs', 'authorized_contacts', 'client_requests', 'system_alerts')
       AND c.confrelid::regclass::text IN ('clients', 'contracts', 'pallets')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE RESTRICT', r.tbl, r.conname, r.col, r.ref);
  END LOOP;
END $$;

-- Excluir pallet só se foi cadastrado por engano (sem movimentos além do ingresso)
CREATE OR REPLACE FUNCTION public.delete_pallet_safe(p_pallet_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_freed integer := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permiso denegado: solo administradores pueden eliminar pallets';
  END IF;
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pallet no encontrado'; END IF;
  IF EXISTS (SELECT 1 FROM movements WHERE pallet_id = p_pallet_id AND tipo <> 'entrada') THEN
    RAISE EXCEPTION 'El pallet % tiene movimientos; no se puede eliminar. Registre una salida o un ajuste.', v_pallet.sku;
  END IF;
  UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_freed = ROW_COUNT;
  IF v_freed > 0 THEN
    UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed) WHERE id = v_pallet.contrato_id;
  END IF;
  UPDATE extra_costs SET movimentacao_id = NULL WHERE movimentacao_id IN (SELECT id FROM movements WHERE pallet_id = p_pallet_id);
  DELETE FROM movements WHERE pallet_id = p_pallet_id;
  DELETE FROM pallets WHERE id = p_pallet_id;
  RETURN jsonb_build_object('success', true, 'positions_freed', v_freed);
END;
$$;

-- ---------- 6) Contrato: campos de cobrança e validações ----------
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS recargo_por_posicao numeric NOT NULL DEFAULT 0;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS recargo_descricao text NOT NULL DEFAULT '';
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS dia_vencimento integer NOT NULL DEFAULT 10;
ALTER TABLE public.contracts ALTER COLUMN preco_mov_extra SET DEFAULT 4;
ALTER TABLE public.contracts ALTER COLUMN percentual_seguro SET DEFAULT 0.03;

DO $$ BEGIN
  ALTER TABLE public.contracts ADD CONSTRAINT chk_contract_values CHECK (
    data_termino >= data_inicio
    AND posicoes_contratadas >= 0
    AND preco_por_posicao >= 0 AND recargo_por_posicao >= 0 AND preco_mov_extra >= 0
    AND percentual_seguro >= 0 AND percentual_seguro <= 5
    AND dia_vencimento BETWEEN 1 AND 28
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cliente de um contrato não muda depois de criado (pallets e cobranças ficariam inconsistentes)
CREATE OR REPLACE FUNCTION public.protect_contract_client()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'No se puede cambiar el cliente de un contrato. Cree un contrato nuevo.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_contract_client ON public.contracts;
CREATE TRIGGER trg_protect_contract_client BEFORE UPDATE OF cliente_id ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.protect_contract_client();

-- Números únicos (sem colisão depois de exclusões)
CREATE SEQUENCE IF NOT EXISTS public.client_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.contract_number_seq;
SELECT setval('public.client_code_seq', GREATEST(1, (SELECT COALESCE(max(substring(codigo FROM '(\d+)$')::int), 0) FROM clients)), (SELECT count(*) > 0 FROM clients));
SELECT setval('public.contract_number_seq', GREATEST(1, (SELECT COALESCE(max(substring(numero FROM '(\d+)$')::int), 0) FROM contracts)), (SELECT count(*) > 0 FROM contracts));

CREATE OR REPLACE FUNCTION public.assign_client_code()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.codigo IS NULL OR trim(NEW.codigo) = '' OR EXISTS (SELECT 1 FROM clients WHERE codigo = NEW.codigo AND id <> NEW.id) THEN
    NEW.codigo := 'CLI-' || lpad(nextval('client_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_client_code ON public.clients;
CREATE TRIGGER trg_assign_client_code BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.assign_client_code();

CREATE OR REPLACE FUNCTION public.assign_contract_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.numero IS NULL OR trim(NEW.numero) = '' OR EXISTS (SELECT 1 FROM contracts WHERE numero = NEW.numero AND id <> NEW.id) THEN
    NEW.numero := 'CT-' || to_char(sf_today(), 'YYYY') || '-' || lpad(nextval('contract_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_contract_number ON public.contracts;
CREATE TRIGGER trg_assign_contract_number BEFORE INSERT ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.assign_contract_number();

-- ---------- 7) Datas no fuso de Assunção nos painéis ----------
CREATE OR REPLACE FUNCTION public.expire_contracts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v integer;
BEGIN
  UPDATE contracts SET status = 'vencido' WHERE status = 'ativo' AND data_termino < sf_today();
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_contracts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_contracts() TO authenticated;
