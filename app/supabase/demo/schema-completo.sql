-- Estrutura completa do banco StockFlex (todas as migrações, em ordem). Gerado em 17/10/2026.
-- Uso: projeto Supabase NOVO e vazio > SQL Editor > colar tudo > Run.

-- ===== 20260329161425_b01a58f0-408d-45e3-8efe-f5ddd8a077b8.sql =====
-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'operador', 'financeiro', 'cliente');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  cliente_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create session_logs table
CREATE TABLE public.session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('login', 'logout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- User roles RLS policies
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Session logs RLS policies
CREATE POLICY "Users can view own logs"
  ON public.session_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs"
  ON public.session_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs"
  ON public.session_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 20260329170629_5713d760-e0ea-42f4-a384-cceb79ba916c.sql =====

-- Enums
CREATE TYPE public.expense_category AS ENUM ('alquiler','salarios','servicios','mantenimiento','combustible','seguros','impuestos','insumos','otros');
CREATE TYPE public.expense_status AS ENUM ('pendente','pago','vencido');
CREATE TYPE public.extra_cost_category AS ENUM ('movimentacao_extra','embalagem','pallet_extra','frete','seguro_adicional','mao_de_obra','outros');
CREATE TYPE public.contract_status AS ENUM ('rascunho','ativo','suspenso','vencido','encerrado');
CREATE TYPE public.pallet_status AS ENUM ('aguardando_entrada','armazenado','reservado_saida','em_transferencia','expedido');
CREATE TYPE public.movement_type AS ENUM ('entrada','saida','transferencia','ajuste','avaria','bloqueio');
CREATE TYPE public.movement_status AS ENUM ('solicitada','aprovada','executada','cancelada');
CREATE TYPE public.cell_status AS ENUM ('free','occupied','blocked','reserved');
CREATE TYPE public.doc_type AS ENUM ('CI','RG','Passaporte');
CREATE TYPE public.invoice_status AS ENUM ('pago','pendente','vencido');
CREATE TYPE public.alert_type AS ENUM ('capacidad','contrato','vencimiento','operacion');
CREATE TYPE public.request_type AS ENUM ('coleta','acesso','ingreso');
CREATE TYPE public.request_status AS ENUM ('pendente','separado','executado','cancelado');
CREATE TYPE public.cost_origin AS ENUM ('operador','admin');
CREATE TYPE public.cost_approval AS ENUM ('pendente','aprovado');

-- CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  razao_social text NOT NULL,
  nome_fantasia text NOT NULL DEFAULT '',
  ruc_cnpj text NOT NULL DEFAULT '',
  contato text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  categoria_mercadoria text NOT NULL DEFAULT '',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- CONTRACTS
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  numero text NOT NULL,
  data_inicio date NOT NULL,
  data_termino date NOT NULL,
  status contract_status NOT NULL DEFAULT 'rascunho',
  posicoes_contratadas int NOT NULL DEFAULT 0,
  posicoes_ocupadas int NOT NULL DEFAULT 0,
  preco_por_posicao numeric NOT NULL DEFAULT 0,
  moeda text NOT NULL DEFAULT 'USD',
  movimentacoes_inclusas int NOT NULL DEFAULT 0,
  preco_mov_extra numeric NOT NULL DEFAULT 0,
  percentual_seguro numeric NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- PALLETS
CREATE TABLE public.pallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  sku text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  lote text,
  quantidade int,
  peso numeric NOT NULL DEFAULT 0,
  valor_declarado numeric NOT NULL DEFAULT 0,
  status pallet_status NOT NULL DEFAULT 'aguardando_entrada',
  localizacao text NOT NULL DEFAULT '',
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  ultima_movimentacao timestamptz NOT NULL DEFAULT now(),
  largo numeric,
  ancho numeric,
  alto numeric,
  seguro boolean NOT NULL DEFAULT false,
  pallet_duplo boolean DEFAULT false,
  localizacao2 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pallets ENABLE ROW LEVEL SECURITY;

-- MOVEMENTS
CREATE TABLE public.movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo movement_type NOT NULL,
  data_hora timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  pallet_id uuid NOT NULL REFERENCES public.pallets(id) ON DELETE CASCADE,
  origem_local text NOT NULL DEFAULT '',
  destino_local text NOT NULL DEFAULT '',
  motivo text NOT NULL DEFAULT '',
  status movement_status NOT NULL DEFAULT 'solicitada',
  peso_inicial numeric NOT NULL DEFAULT 0,
  peso_final numeric NOT NULL DEFAULT 0,
  comprovante_assinado text,
  comprovante_data timestamptz,
  custo_extra_categoria extra_cost_category,
  custo_extra_descricao text,
  interna boolean DEFAULT false,
  novo_valor_declarado numeric,
  autorizado_id text,
  operador_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

-- AUTHORIZED CONTACTS
CREATE TABLE public.authorized_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cargo text NOT NULL DEFAULT '',
  documento text NOT NULL DEFAULT '',
  tipo_documento doc_type NOT NULL DEFAULT 'CI',
  telefone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  foto_documento text,
  observacoes text,
  foto_documento_url text,
  foto_autorizado_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.authorized_contacts ENABLE ROW LEVEL SECURITY;

-- INVOICES
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  data_vencimento date NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'pendente',
  comprovante text,
  comprovante_data timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- EXTRA COSTS
CREATE TABLE public.extra_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  categoria extra_cost_category NOT NULL,
  descricao text NOT NULL DEFAULT '',
  quantidade int NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  moeda text NOT NULL DEFAULT 'USD',
  data_criacao timestamptz NOT NULL DEFAULT now(),
  observacoes text,
  origem cost_origin NOT NULL DEFAULT 'operador',
  status_aprovacao cost_approval NOT NULL DEFAULT 'pendente',
  movimentacao_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.extra_costs ENABLE ROW LEVEL SECURITY;

-- WAREHOUSE POSITIONS
CREATE TABLE public.warehouse_positions (
  id text PRIMARY KEY,
  rua text NOT NULL,
  bloco int NOT NULL,
  nivel int NOT NULL,
  posicao int NOT NULL,
  status cell_status NOT NULL DEFAULT 'free',
  pallet_id uuid REFERENCES public.pallets(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  capacidade_kg numeric NOT NULL DEFAULT 1000
);
ALTER TABLE public.warehouse_positions ENABLE ROW LEVEL SECURITY;

-- SYSTEM ALERTS
CREATE TABLE public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo alert_type NOT NULL,
  mensaje text NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  cliente_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  contrato_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  resuelto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- CLIENT REQUESTS
CREATE TABLE public.client_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pallet_ids uuid[] NOT NULL DEFAULT '{}',
  tipo request_type NOT NULL,
  horario_estimado text NOT NULL DEFAULT '',
  data_estimada date NOT NULL DEFAULT CURRENT_DATE,
  margem_tempo int NOT NULL DEFAULT 60,
  quantidade int,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  status request_status NOT NULL DEFAULT 'pendente',
  operador_id text,
  movimento_ids uuid[] DEFAULT '{}',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

-- EXPENSES
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL,
  categoria expense_category NOT NULL,
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  moeda text NOT NULL DEFAULT 'USD',
  valor_usd numeric NOT NULL DEFAULT 0,
  cambio_dia numeric,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  data_vencimento date NOT NULL,
  status expense_status NOT NULL DEFAULT 'pendente',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS helper functions
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'operador'))
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_financeiro(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'financeiro'))
$$;

CREATE OR REPLACE FUNCTION public.get_user_client_id(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT cliente_id FROM public.profiles WHERE id = _user_id
$$;

-- RLS POLICIES
CREATE POLICY "Staff full access clients" ON public.clients FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financeiro read clients" ON public.clients FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Cliente read own" ON public.clients FOR SELECT TO authenticated USING (id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access contracts" ON public.contracts FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financeiro read contracts" ON public.contracts FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Cliente read own contracts" ON public.contracts FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access pallets" ON public.pallets FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financeiro read pallets" ON public.pallets FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Cliente read own pallets" ON public.pallets FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access movements" ON public.movements FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financeiro read movements" ON public.movements FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Cliente read own movements" ON public.movements FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access contacts" ON public.authorized_contacts FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Cliente read own contacts" ON public.authorized_contacts FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff and financeiro full access invoices" ON public.invoices FOR ALL TO authenticated USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Operador read invoices" ON public.invoices FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Cliente read own invoices" ON public.invoices FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access extra_costs" ON public.extra_costs FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financeiro read extra_costs" ON public.extra_costs FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Cliente read own extra_costs" ON public.extra_costs FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access positions" ON public.warehouse_positions FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financeiro read positions" ON public.warehouse_positions FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Cliente read own positions" ON public.warehouse_positions FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access alerts" ON public.system_alerts FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financeiro read alerts" ON public.system_alerts FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Cliente read own alerts" ON public.system_alerts FOR SELECT TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Staff full access requests" ON public.client_requests FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Cliente manage own requests" ON public.client_requests FOR ALL TO authenticated USING (cliente_id::text = get_user_client_id(auth.uid())) WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Admin financeiro full access expenses" ON public.expenses FOR ALL TO authenticated USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));

-- Seed warehouse positions
INSERT INTO public.warehouse_positions (id, rua, bloco, nivel, posicao, status, capacidade_kg)
SELECT
  rua || '-' || LPAD(bloco::text, 2, '0') || '-' || nivel || '-' || pos,
  rua, bloco, nivel, pos,
  CASE WHEN rua = 'A' THEN 'free'::cell_status ELSE 'blocked'::cell_status END,
  1000
FROM
  (SELECT unnest(ARRAY['A','B','C','D','E','F','G']) AS rua) r,
  generate_series(1, 14) AS bloco,
  generate_series(1, 5) AS nivel,
  generate_series(1, 2) AS pos
WHERE bloco <= CASE WHEN rua IN ('F','G') THEN 12 ELSE 14 END;

-- ===== 20260329182429_9d72de03-eb78-4a3a-88cc-3c732e51eb71.sql =====

-- =========================================
-- 1. Fix warehouse_positions FKs to SET NULL
-- =========================================
ALTER TABLE public.warehouse_positions 
  DROP CONSTRAINT IF EXISTS warehouse_positions_pallet_id_fkey,
  DROP CONSTRAINT IF EXISTS warehouse_positions_cliente_id_fkey;

ALTER TABLE public.warehouse_positions
  ADD CONSTRAINT warehouse_positions_pallet_id_fkey 
    FOREIGN KEY (pallet_id) REFERENCES public.pallets(id) ON DELETE SET NULL,
  ADD CONSTRAINT warehouse_positions_cliente_id_fkey 
    FOREIGN KEY (cliente_id) REFERENCES public.clients(id) ON DELETE SET NULL;

-- =========================================
-- 2. Create indexes on frequently queried columns
-- =========================================

-- contracts
CREATE INDEX IF NOT EXISTS idx_contracts_cliente_id ON public.contracts(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);

-- pallets
CREATE INDEX IF NOT EXISTS idx_pallets_cliente_id ON public.pallets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pallets_contrato_id ON public.pallets(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pallets_status ON public.pallets(status);

-- movements
CREATE INDEX IF NOT EXISTS idx_movements_cliente_id ON public.movements(cliente_id);
CREATE INDEX IF NOT EXISTS idx_movements_contrato_id ON public.movements(contrato_id);
CREATE INDEX IF NOT EXISTS idx_movements_pallet_id ON public.movements(pallet_id);
CREATE INDEX IF NOT EXISTS idx_movements_status ON public.movements(status);
CREATE INDEX IF NOT EXISTS idx_movements_data_hora ON public.movements(data_hora DESC);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_cliente_id ON public.invoices(cliente_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contrato_id ON public.invoices(contrato_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_competencia ON public.invoices(competencia);

-- extra_costs
CREATE INDEX IF NOT EXISTS idx_extra_costs_cliente_id ON public.extra_costs(cliente_id);
CREATE INDEX IF NOT EXISTS idx_extra_costs_contrato_id ON public.extra_costs(contrato_id);
CREATE INDEX IF NOT EXISTS idx_extra_costs_competencia ON public.extra_costs(competencia);

-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_competencia ON public.expenses(competencia);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);

-- warehouse_positions
CREATE INDEX IF NOT EXISTS idx_warehouse_positions_status ON public.warehouse_positions(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_positions_cliente_id ON public.warehouse_positions(cliente_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_positions_pallet_id ON public.warehouse_positions(pallet_id);

-- authorized_contacts
CREATE INDEX IF NOT EXISTS idx_authorized_contacts_cliente_id ON public.authorized_contacts(cliente_id);

-- system_alerts
CREATE INDEX IF NOT EXISTS idx_system_alerts_resuelto ON public.system_alerts(resuelto);

-- session_logs
CREATE INDEX IF NOT EXISTS idx_session_logs_user_id ON public.session_logs(user_id);

-- client_requests
CREATE INDEX IF NOT EXISTS idx_client_requests_cliente_id ON public.client_requests(cliente_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_status ON public.client_requests(status);

-- ===== 20260329182534_023921c0-7d6b-40c5-b6a5-3fdcc86868d6.sql =====

-- =========================================
-- 3. Atomic database functions for composite operations
-- =========================================

-- Function: Register pallet entry (create pallet + occupy position + create movement)
CREATE OR REPLACE FUNCTION public.register_pallet_entry(
  p_cliente_id uuid,
  p_contrato_id uuid,
  p_sku text,
  p_descricao text,
  p_lote text DEFAULT NULL,
  p_quantidade integer DEFAULT NULL,
  p_peso numeric DEFAULT 0,
  p_valor_declarado numeric DEFAULT 0,
  p_localizacao text DEFAULT '',
  p_localizacao2 text DEFAULT NULL,
  p_largo numeric DEFAULT NULL,
  p_ancho numeric DEFAULT NULL,
  p_alto numeric DEFAULT NULL,
  p_seguro boolean DEFAULT false,
  p_pallet_duplo boolean DEFAULT false,
  p_position_id text DEFAULT NULL,
  p_position2_id text DEFAULT NULL,
  p_operador text DEFAULT '',
  p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pallet_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Insert pallet
  INSERT INTO pallets (
    cliente_id, contrato_id, sku, descricao, lote, quantidade,
    peso, valor_declarado, status, localizacao, localizacao2,
    data_entrada, ultima_movimentacao, largo, ancho, alto,
    seguro, pallet_duplo
  ) VALUES (
    p_cliente_id, p_contrato_id, p_sku, p_descricao, p_lote, p_quantidade,
    p_peso, p_valor_declarado, 'armazenado', p_localizacao, p_localizacao2,
    CURRENT_DATE, v_now, p_largo, p_ancho, p_alto,
    p_seguro, p_pallet_duplo
  ) RETURNING id INTO v_pallet_id;

  -- Occupy position(s)
  IF p_position_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = v_pallet_id, cliente_id = p_cliente_id
    WHERE id = p_position_id AND status = 'free';
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Position % is not free', p_position_id;
    END IF;
  END IF;

  IF p_position2_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = v_pallet_id, cliente_id = p_cliente_id
    WHERE id = p_position2_id AND status = 'free';
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Position % is not free', p_position2_id;
    END IF;
  END IF;

  -- Create entry movement
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final
  ) VALUES (
    'entrada', v_now, p_operador, p_operador_id, p_cliente_id, p_contrato_id,
    v_pallet_id, 'Exterior', p_localizacao, 'Ingreso inicial', 'executada',
    p_peso, p_peso
  );

  -- Update contract occupied count
  UPDATE contracts
  SET posicoes_ocupadas = posicoes_ocupadas + CASE WHEN p_pallet_duplo THEN 2 ELSE 1 END
  WHERE id = p_contrato_id;

  RETURN jsonb_build_object('pallet_id', v_pallet_id);
END;
$$;

-- Function: Execute pallet exit (update pallet + free position + create movement)
CREATE OR REPLACE FUNCTION public.execute_pallet_exit(
  p_pallet_id uuid,
  p_motivo text DEFAULT '',
  p_autorizado_id text DEFAULT NULL,
  p_operador text DEFAULT '',
  p_operador_id text DEFAULT NULL,
  p_peso_final numeric DEFAULT 0,
  p_destino text DEFAULT 'Exterior'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_positions_freed integer := 0;
BEGIN
  -- Lock and fetch pallet
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet not found: %', p_pallet_id;
  END IF;

  -- Update pallet status
  UPDATE pallets
  SET status = 'expedido', localizacao = '', localizacao2 = NULL, ultima_movimentacao = v_now
  WHERE id = p_pallet_id;

  -- Free positions
  UPDATE warehouse_positions
  SET status = 'free', pallet_id = NULL, cliente_id = NULL
  WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_positions_freed = ROW_COUNT;

  -- Create exit movement
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, autorizado_id
  ) VALUES (
    'saida', v_now, p_operador, p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_pallet.localizacao, p_destino, p_motivo, 'executada',
    v_pallet.peso, p_peso_final, p_autorizado_id
  );

  -- Update contract occupied count
  UPDATE contracts
  SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_positions_freed)
  WHERE id = v_pallet.contrato_id;

  RETURN jsonb_build_object('success', true, 'positions_freed', v_positions_freed);
END;
$$;

-- Function: Transfer pallet between positions atomically
CREATE OR REPLACE FUNCTION public.transfer_pallet(
  p_pallet_id uuid,
  p_new_position_id text,
  p_new_position2_id text DEFAULT NULL,
  p_motivo text DEFAULT '',
  p_operador text DEFAULT '',
  p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_old_loc text;
  v_new_loc text;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet not found: %', p_pallet_id;
  END IF;

  v_old_loc := v_pallet.localizacao;

  -- Free old positions
  UPDATE warehouse_positions
  SET status = 'free', pallet_id = NULL, cliente_id = NULL
  WHERE pallet_id = p_pallet_id;

  -- Occupy new position
  UPDATE warehouse_positions
  SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = v_pallet.cliente_id
  WHERE id = p_new_position_id AND status = 'free';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target position % is not free', p_new_position_id;
  END IF;

  v_new_loc := p_new_position_id;

  IF p_new_position2_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = v_pallet.cliente_id
    WHERE id = p_new_position2_id AND status = 'free';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target position % is not free', p_new_position2_id;
    END IF;
  END IF;

  -- Update pallet location
  UPDATE pallets
  SET localizacao = p_new_position_id,
      localizacao2 = p_new_position2_id,
      ultima_movimentacao = v_now
  WHERE id = p_pallet_id;

  -- Create transfer movement
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, interna
  ) VALUES (
    'transferencia', v_now, p_operador, p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_old_loc, v_new_loc, p_motivo, 'executada',
    v_pallet.peso, v_pallet.peso, true
  );

  RETURN jsonb_build_object('success', true, 'new_location', v_new_loc);
END;
$$;

-- ===== 20260329183621_d77ef616-5a50-4eae-8240-1a7e4d53dac3.sql =====

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('documents', 'documents', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('photos', 'photos', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for 'documents' bucket (comprovantes + fotos de documentos)
CREATE POLICY "Staff can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND public.is_staff(auth.uid())
);

CREATE POLICY "Staff can read all documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND (
    public.is_staff(auth.uid()) OR
    public.is_admin_or_financeiro(auth.uid())
  )
);

CREATE POLICY "Staff can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND public.is_staff(auth.uid())
);

CREATE POLICY "Cliente can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
);

-- RLS policies for 'photos' bucket (fotos de autorizados)
CREATE POLICY "Staff can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' AND public.is_staff(auth.uid())
);

CREATE POLICY "Staff can read all photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos' AND (
    public.is_staff(auth.uid()) OR
    public.is_admin_or_financeiro(auth.uid())
  )
);

CREATE POLICY "Staff can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' AND public.is_staff(auth.uid())
);

CREATE POLICY "Cliente can read own photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
);

CREATE POLICY "Staff can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND public.is_staff(auth.uid())
);

CREATE POLICY "Staff can update photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'photos' AND public.is_staff(auth.uid())
);

-- ===== 20260329185344_aa89ea62-f1e9-427f-9905-9ce7a9d2d7c9.sql =====

-- Drop existing storage policies if they exist and recreate
DROP POLICY IF EXISTS "Staff can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete photos" ON storage.objects;

-- Storage RLS policies for documents bucket
CREATE POLICY "Staff can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can read documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND (
  public.is_staff(auth.uid()) OR public.is_admin_or_financeiro(auth.uid()) OR
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
));

CREATE POLICY "Staff can delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can upload photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can read photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'photos' AND (
  public.is_staff(auth.uid()) OR public.is_admin_or_financeiro(auth.uid()) OR
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
));

CREATE POLICY "Staff can delete photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos' AND public.is_staff(auth.uid()));

-- ===== 20260329203854_a7f51640-8e3e-44b2-a991-817c873d51df.sql =====

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

-- ===== 20260329203914_a74371c4-a654-47fa-a1be-0e145b88664d.sql =====

-- Dashboard stats RPC
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'occupied_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'occupied'),
    'free_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'free'),
    'blocked_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'blocked'),
    'reserved_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'reserved'),
    'total_positions', (SELECT count(*) FROM warehouse_positions),
    'stored_pallets', (SELECT count(*) FROM pallets WHERE status = 'armazenado'),
    'total_pallets', (SELECT count(*) FROM pallets),
    'active_contracts', (SELECT count(*) FROM contracts WHERE status = 'ativo'),
    'expiring_contracts_30d', (SELECT count(*) FROM contracts WHERE status = 'ativo' AND data_termino > CURRENT_DATE AND data_termino <= CURRENT_DATE + interval '30 days'),
    'pending_requests', (SELECT count(*) FROM client_requests WHERE status = 'pendente'),
    'pending_movements', (SELECT count(*) FROM movements WHERE status = 'solicitada')
  ) INTO result;
  RETURN result;
END;
$$;

-- Dashboard occupancy by client RPC
CREATE OR REPLACE FUNCTION public.dashboard_occupancy_by_client()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_data), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'client_id', cl.id,
      'client_name', cl.nome_fantasia,
      'contratadas', coalesce(ct.total_contratadas, 0),
      'ocupadas', coalesce(wp.total_ocupadas, 0),
      'programadas', coalesce(cr.total_programadas, 0),
      'excedente', GREATEST(0, coalesce(wp.total_ocupadas, 0) + coalesce(cr.total_programadas, 0) - coalesce(ct.total_contratadas, 0))
    ) as row_data
    FROM clients cl
    LEFT JOIN (
      SELECT cliente_id, sum(posicoes_contratadas) as total_contratadas
      FROM contracts WHERE status = 'ativo'
      GROUP BY cliente_id
    ) ct ON ct.cliente_id = cl.id
    LEFT JOIN (
      SELECT cliente_id, count(*) as total_ocupadas
      FROM warehouse_positions WHERE status = 'occupied' AND cliente_id IS NOT NULL
      GROUP BY cliente_id
    ) wp ON wp.cliente_id = cl.id
    LEFT JOIN (
      SELECT cliente_id, coalesce(sum(quantidade), 0) as total_programadas
      FROM client_requests WHERE tipo = 'ingreso' AND status = 'pendente'
      GROUP BY cliente_id
    ) cr ON cr.cliente_id = cl.id
    WHERE coalesce(ct.total_contratadas, 0) > 0 OR coalesce(wp.total_ocupadas, 0) > 0
    ORDER BY coalesce(ct.total_contratadas, 0) DESC
  ) sub;
  RETURN result;
END;
$$;

-- Dashboard financial summary RPC
CREATE OR REPLACE FUNCTION public.dashboard_financial_summary(p_date_from text DEFAULT NULL, p_date_to text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  v_min_date date;
  v_max_date date;
BEGIN
  IF p_date_from IS NOT NULL THEN
    v_min_date := p_date_from::date;
  ELSE
    SELECT min(data_inicio) INTO v_min_date FROM contracts;
  END IF;
  IF p_date_to IS NOT NULL THEN
    v_max_date := p_date_to::date;
  ELSE
    SELECT max(data_termino) INTO v_max_date FROM contracts;
  END IF;

  IF v_min_date IS NULL OR v_max_date IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY month_key), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'month', m.month_key,
      'ingresos', coalesce(inv.total, 0) + CASE WHEN coalesce(inv.total, 0) = 0 THEN coalesce(ctr.estimated, 0) ELSE 0 END,
      'gastos', coalesce(exp.total, 0),
      'resultado', (coalesce(inv.total, 0) + CASE WHEN coalesce(inv.total, 0) = 0 THEN coalesce(ctr.estimated, 0) ELSE 0 END) - coalesce(exp.total, 0)
    ) as row_data,
    m.month_key
    FROM (
      SELECT to_char(generate_series(
        date_trunc('month', v_min_date),
        date_trunc('month', v_max_date),
        interval '1 month'
      ), 'YYYY-MM') as month_key
    ) m
    LEFT JOIN (
      SELECT competencia, sum(valor) as total
      FROM invoices GROUP BY competencia
    ) inv ON inv.competencia = m.month_key
    LEFT JOIN (
      SELECT competencia, sum(valor_usd) as total
      FROM expenses GROUP BY competencia
    ) exp ON exp.competencia = m.month_key
    LEFT JOIN (
      SELECT to_char(ms.month_start, 'YYYY-MM') as month_key, sum(c.posicoes_contratadas * c.preco_por_posicao) as estimated
      FROM contracts c
      CROSS JOIN LATERAL (
        SELECT generate_series(
          date_trunc('month', c.data_inicio),
          date_trunc('month', c.data_termino),
          interval '1 month'
        ) as month_start
      ) ms
      WHERE c.status = 'ativo'
      GROUP BY to_char(ms.month_start, 'YYYY-MM')
    ) ctr ON ctr.month_key = m.month_key
  ) sub;
  RETURN result;
END;
$$;

-- ===== 20260329203925_fe1a220b-3f91-4848-8835-ce625baf69c4.sql =====

-- Monthly close data RPC
CREATE OR REPLACE FUNCTION public.monthly_close_data(p_month text, p_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  v_month_start date;
  v_month_end date;
BEGIN
  v_month_start := (p_month || '-01')::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  SELECT coalesce(jsonb_agg(row_data), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'contrato', c.numero,
      'contrato_id', c.id,
      'cliente', cl.nome_fantasia,
      'cliente_id', c.cliente_id,
      'posicoes_contratadas', c.posicoes_contratadas,
      'posicoes_ocupadas', c.posicoes_ocupadas,
      'saldo_ocioso', c.posicoes_contratadas - c.posicoes_ocupadas,
      'mov_inclusas', LEAST(coalesce(mov.total_mov, 0), c.movimentacoes_inclusas),
      'mov_extras', GREATEST(0, coalesce(mov.total_mov, 0) - c.movimentacoes_inclusas),
      'valor_posicoes', c.posicoes_contratadas * c.preco_por_posicao,
      'valor_mov_extras', GREATEST(0, coalesce(mov.total_mov, 0) - c.movimentacoes_inclusas) * c.preco_mov_extra,
      'seguro', coalesce(seg.total_valor_declarado, 0) * (c.percentual_seguro / 100),
      'valor_custos_extras', coalesce(ec.total_extra, 0),
      'total', (c.posicoes_contratadas * c.preco_por_posicao)
             + (GREATEST(0, coalesce(mov.total_mov, 0) - c.movimentacoes_inclusas) * c.preco_mov_extra)
             + (coalesce(seg.total_valor_declarado, 0) * (c.percentual_seguro / 100))
             + coalesce(ec.total_extra, 0),
      'moeda', c.moeda
    ) as row_data
    FROM contracts c
    JOIN clients cl ON cl.id = c.cliente_id
    LEFT JOIN (
      SELECT contrato_id, count(*) as total_mov
      FROM movements
      WHERE status = 'executada'
        AND data_hora >= v_month_start::timestamptz
        AND data_hora < (v_month_end + interval '1 day')::timestamptz
      GROUP BY contrato_id
    ) mov ON mov.contrato_id = c.id
    LEFT JOIN (
      SELECT contrato_id, sum(valor_declarado) as total_valor_declarado
      FROM pallets
      WHERE seguro = true AND status = 'armazenado'
      GROUP BY contrato_id
    ) seg ON seg.contrato_id = c.id
    LEFT JOIN (
      SELECT contrato_id, sum(valor_total) as total_extra
      FROM extra_costs
      WHERE competencia = p_month
      GROUP BY contrato_id
    ) ec ON ec.contrato_id = c.id
    WHERE c.status = 'ativo'
      AND c.data_inicio <= v_month_end
      AND c.data_termino >= v_month_start
      AND (p_client_id IS NULL OR c.cliente_id = p_client_id)
    ORDER BY cl.nome_fantasia, c.numero
  ) sub;
  RETURN result;
END;
$$;

-- ===== 20260329203934_0895ac8c-8a1a-4a56-8a74-58e7648be42f.sql =====

ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.movements;

-- ===== 20260329205947_cd0405b1-f9dd-4cf2-9c4f-8a11edd0eec3.sql =====

-- =============================================
-- 1. REGISTER_PALLET_ENTRY: role check + validações
-- =============================================
CREATE OR REPLACE FUNCTION public.register_pallet_entry(
  p_cliente_id uuid, p_contrato_id uuid, p_sku text, p_descricao text,
  p_lote text DEFAULT NULL, p_quantidade integer DEFAULT NULL,
  p_peso numeric DEFAULT 0, p_valor_declarado numeric DEFAULT 0,
  p_localizacao text DEFAULT '', p_localizacao2 text DEFAULT NULL,
  p_largo numeric DEFAULT NULL, p_ancho numeric DEFAULT NULL, p_alto numeric DEFAULT NULL,
  p_seguro boolean DEFAULT false, p_pallet_duplo boolean DEFAULT false,
  p_position_id text DEFAULT NULL, p_position2_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet_id uuid;
  v_now timestamptz := now();
  v_contract contracts%ROWTYPE;
BEGIN
  -- ROLE CHECK: only staff can register pallets
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada: apenas operadores e administradores podem registrar pallets';
  END IF;

  -- VALIDATION: SKU cannot be empty
  IF p_sku IS NULL OR trim(p_sku) = '' THEN
    RAISE EXCEPTION 'SKU é obrigatório e não pode ser vazio';
  END IF;

  -- VALIDATION: peso must be > 0
  IF p_peso IS NULL OR p_peso <= 0 THEN
    RAISE EXCEPTION 'Peso deve ser maior que zero';
  END IF;

  -- VALIDATION: contract must exist and be active
  SELECT * INTO v_contract FROM contracts WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', p_contrato_id;
  END IF;
  IF v_contract.status <> 'ativo' THEN
    RAISE EXCEPTION 'Contrato % não está ativo (status: %)', v_contract.numero, v_contract.status;
  END IF;

  -- VALIDATION: contract belongs to the client
  IF v_contract.cliente_id <> p_cliente_id THEN
    RAISE EXCEPTION 'Contrato % não pertence ao cliente informado', v_contract.numero;
  END IF;

  -- VALIDATION: position capacity (weight)
  IF p_position_id IS NOT NULL THEN
    DECLARE v_cap numeric;
    BEGIN
      SELECT capacidade_kg INTO v_cap FROM warehouse_positions WHERE id = p_position_id;
      IF FOUND AND p_peso > v_cap THEN
        RAISE EXCEPTION 'Peso (%) excede a capacidade da posição (% kg)', p_peso, v_cap;
      END IF;
    END;
  END IF;

  -- Insert pallet
  INSERT INTO pallets (
    cliente_id, contrato_id, sku, descricao, lote, quantidade,
    peso, valor_declarado, status, localizacao, localizacao2,
    data_entrada, ultima_movimentacao, largo, ancho, alto,
    seguro, pallet_duplo
  ) VALUES (
    p_cliente_id, p_contrato_id, trim(p_sku), p_descricao, p_lote, p_quantidade,
    p_peso, p_valor_declarado, 'armazenado', p_localizacao, p_localizacao2,
    CURRENT_DATE, v_now, p_largo, p_ancho, p_alto,
    p_seguro, p_pallet_duplo
  ) RETURNING id INTO v_pallet_id;

  -- Occupy position(s)
  IF p_position_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = v_pallet_id, cliente_id = p_cliente_id
    WHERE id = p_position_id AND status = 'free';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Posição % não está livre', p_position_id;
    END IF;
  END IF;

  IF p_position2_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = v_pallet_id, cliente_id = p_cliente_id
    WHERE id = p_position2_id AND status = 'free';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Posição % não está livre', p_position2_id;
    END IF;
  END IF;

  -- Create entry movement
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final
  ) VALUES (
    'entrada', v_now, p_operador, p_operador_id, p_cliente_id, p_contrato_id,
    v_pallet_id, 'Exterior', p_localizacao, 'Ingreso inicial', 'executada',
    p_peso, p_peso
  );

  -- Update contract occupied count
  UPDATE contracts
  SET posicoes_ocupadas = posicoes_ocupadas + CASE WHEN p_pallet_duplo THEN 2 ELSE 1 END
  WHERE id = p_contrato_id;

  RETURN jsonb_build_object('pallet_id', v_pallet_id);
END;
$$;

-- =============================================
-- 2. EXECUTE_PALLET_EXIT: role check + validações
-- =============================================
CREATE OR REPLACE FUNCTION public.execute_pallet_exit(
  p_pallet_id uuid, p_motivo text DEFAULT '', p_autorizado_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL,
  p_peso_final numeric DEFAULT 0, p_destino text DEFAULT 'Exterior'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_positions_freed integer := 0;
BEGIN
  -- ROLE CHECK
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada: apenas operadores e administradores podem registrar saídas';
  END IF;

  -- Lock and fetch pallet
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet não encontrado: %', p_pallet_id;
  END IF;

  -- VALIDATION: pallet must be in a valid state for exit
  IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
    RAISE EXCEPTION 'Pallet não pode ser expedido (status atual: %)', v_pallet.status;
  END IF;

  -- VALIDATION: peso_final must be >= 0
  IF p_peso_final < 0 THEN
    RAISE EXCEPTION 'Peso final não pode ser negativo';
  END IF;

  -- VALIDATION: motivo required
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo da saída é obrigatório';
  END IF;

  -- Update pallet status
  UPDATE pallets
  SET status = 'expedido', localizacao = '', localizacao2 = NULL, ultima_movimentacao = v_now
  WHERE id = p_pallet_id;

  -- Free positions
  UPDATE warehouse_positions
  SET status = 'free', pallet_id = NULL, cliente_id = NULL
  WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_positions_freed = ROW_COUNT;

  -- Create exit movement
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, autorizado_id
  ) VALUES (
    'saida', v_now, p_operador, p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_pallet.localizacao, p_destino, p_motivo, 'executada',
    v_pallet.peso, p_peso_final, p_autorizado_id
  );

  -- Update contract occupied count
  UPDATE contracts
  SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_positions_freed)
  WHERE id = v_pallet.contrato_id;

  RETURN jsonb_build_object('success', true, 'positions_freed', v_positions_freed);
END;
$$;

-- =============================================
-- 3. TRANSFER_PALLET: role check + validações
-- =============================================
CREATE OR REPLACE FUNCTION public.transfer_pallet(
  p_pallet_id uuid, p_new_position_id text, p_new_position2_id text DEFAULT NULL,
  p_motivo text DEFAULT '', p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_old_loc text;
  v_new_loc text;
  v_now timestamptz := now();
  v_cap numeric;
BEGIN
  -- ROLE CHECK
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada: apenas operadores e administradores podem transferir pallets';
  END IF;

  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet não encontrado: %', p_pallet_id;
  END IF;

  -- VALIDATION: pallet must be stored
  IF v_pallet.status <> 'armazenado' THEN
    RAISE EXCEPTION 'Pallet não pode ser transferido (status atual: %)', v_pallet.status;
  END IF;

  -- VALIDATION: destination cannot be same as origin
  IF p_new_position_id = v_pallet.localizacao THEN
    RAISE EXCEPTION 'Posição de destino é a mesma da origem';
  END IF;

  -- VALIDATION: weight vs capacity
  SELECT capacidade_kg INTO v_cap FROM warehouse_positions WHERE id = p_new_position_id;
  IF FOUND AND v_pallet.peso > v_cap THEN
    RAISE EXCEPTION 'Peso do pallet (%) excede a capacidade da posição destino (% kg)', v_pallet.peso, v_cap;
  END IF;

  v_old_loc := v_pallet.localizacao;

  -- Free old positions
  UPDATE warehouse_positions
  SET status = 'free', pallet_id = NULL, cliente_id = NULL
  WHERE pallet_id = p_pallet_id;

  -- Occupy new position
  UPDATE warehouse_positions
  SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = v_pallet.cliente_id
  WHERE id = p_new_position_id AND status = 'free';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posição destino % não está livre', p_new_position_id;
  END IF;

  v_new_loc := p_new_position_id;

  IF p_new_position2_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = v_pallet.cliente_id
    WHERE id = p_new_position2_id AND status = 'free';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Posição destino % não está livre', p_new_position2_id;
    END IF;
  END IF;

  -- Update pallet location
  UPDATE pallets
  SET localizacao = p_new_position_id,
      localizacao2 = p_new_position2_id,
      ultima_movimentacao = v_now
  WHERE id = p_pallet_id;

  -- Create transfer movement
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, interna
  ) VALUES (
    'transferencia', v_now, p_operador, p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_old_loc, v_new_loc, p_motivo, 'executada',
    v_pallet.peso, v_pallet.peso, true
  );

  RETURN jsonb_build_object('success', true, 'new_location', v_new_loc);
END;
$$;

-- =============================================
-- 4. DELETE_PALLET_SAFE: libera posições antes de deletar
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_pallet_safe(p_pallet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_positions_freed integer := 0;
BEGIN
  -- ROLE CHECK
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada: apenas operadores e administradores podem deletar pallets';
  END IF;

  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet não encontrado: %', p_pallet_id;
  END IF;

  -- VALIDATION: cannot delete a pallet that is in transit
  IF v_pallet.status = 'em_transferencia' THEN
    RAISE EXCEPTION 'Não é possível deletar pallet em transferência';
  END IF;

  -- Free all positions associated with this pallet
  UPDATE warehouse_positions
  SET status = 'free', pallet_id = NULL, cliente_id = NULL
  WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_positions_freed = ROW_COUNT;

  -- Update contract occupied count
  IF v_positions_freed > 0 THEN
    UPDATE contracts
    SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_positions_freed)
    WHERE id = v_pallet.contrato_id;
  END IF;

  -- Delete movements associated (CASCADE will handle, but explicit for clarity)
  -- CASCADE on FK will delete movements automatically

  -- Delete the pallet
  DELETE FROM pallets WHERE id = p_pallet_id;

  RETURN jsonb_build_object('success', true, 'positions_freed', v_positions_freed);
END;
$$;

-- ===== 20260329210135_59bdb7b7-cbc7-4599-95c2-4d2f4ce7d608.sql =====

-- Audit triggers for invoices and expenses
CREATE TRIGGER trg_audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- ===== 20260330000856_a8802d20-b29b-4819-9082-f176a7e06468.sql =====
CREATE OR REPLACE FUNCTION public.register_pallet_entry(
  p_cliente_id uuid, p_contrato_id uuid, p_sku text, p_descricao text,
  p_lote text DEFAULT NULL, p_quantidade integer DEFAULT NULL,
  p_peso numeric DEFAULT 0, p_valor_declarado numeric DEFAULT 0,
  p_localizacao text DEFAULT '', p_localizacao2 text DEFAULT NULL,
  p_largo numeric DEFAULT NULL, p_ancho numeric DEFAULT NULL, p_alto numeric DEFAULT NULL,
  p_seguro boolean DEFAULT false, p_pallet_duplo boolean DEFAULT false,
  p_position_id text DEFAULT NULL, p_position2_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pallet_id uuid;
  v_now timestamptz := now();
  v_contract contracts%ROWTYPE;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada: apenas operadores e administradores podem registrar pallets';
  END IF;
  IF p_sku IS NULL OR trim(p_sku) = '' THEN
    RAISE EXCEPTION 'SKU é obrigatório e não pode ser vazio';
  END IF;
  IF p_peso IS NULL OR p_peso <= 0 THEN
    RAISE EXCEPTION 'Peso deve ser maior que zero';
  END IF;
  SELECT * INTO v_contract FROM contracts WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', p_contrato_id;
  END IF;
  IF v_contract.status <> 'ativo' THEN
    RAISE EXCEPTION 'Contrato não está ativo (status: %)', v_contract.status;
  END IF;
  IF v_contract.cliente_id <> p_cliente_id THEN
    RAISE EXCEPTION 'Contrato não pertence ao cliente informado';
  END IF;

  INSERT INTO pallets (
    cliente_id, contrato_id, sku, descricao, lote, quantidade,
    peso, valor_declarado, status, localizacao, localizacao2,
    data_entrada, ultima_movimentacao, largo, ancho, alto,
    seguro, pallet_duplo
  ) VALUES (
    p_cliente_id, p_contrato_id, trim(p_sku), p_descricao, p_lote, p_quantidade,
    p_peso, p_valor_declarado, 'armazenado', p_localizacao, p_localizacao2,
    CURRENT_DATE, v_now, p_largo, p_ancho, p_alto,
    p_seguro, p_pallet_duplo
  ) RETURNING id INTO v_pallet_id;

  IF p_position_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = v_pallet_id, cliente_id = p_cliente_id
    WHERE id = p_position_id AND status = 'free';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Posição % não está livre', p_position_id;
    END IF;
  END IF;
  IF p_position2_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = v_pallet_id, cliente_id = p_cliente_id
    WHERE id = p_position2_id AND status = 'free';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Posição % não está livre', p_position2_id;
    END IF;
  END IF;

  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final
  ) VALUES (
    'entrada', v_now, p_operador, p_operador_id, p_cliente_id, p_contrato_id,
    v_pallet_id, 'Exterior', p_localizacao, 'Ingreso inicial', 'executada',
    p_peso, p_peso
  );

  UPDATE contracts
  SET posicoes_ocupadas = posicoes_ocupadas + CASE WHEN p_pallet_duplo THEN 2 ELSE 1 END
  WHERE id = p_contrato_id;

  RETURN jsonb_build_object('pallet_id', v_pallet_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_pallet(
  p_pallet_id uuid, p_new_position_id text, p_new_position2_id text DEFAULT NULL,
  p_motivo text DEFAULT '', p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_old_loc text;
  v_new_loc text;
  v_now timestamptz := now();
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada: apenas operadores e administradores podem transferir pallets';
  END IF;
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet não encontrado: %', p_pallet_id;
  END IF;
  IF v_pallet.status <> 'armazenado' THEN
    RAISE EXCEPTION 'Pallet não pode ser transferido (status atual: %)', v_pallet.status;
  END IF;
  IF p_new_position_id = v_pallet.localizacao THEN
    RAISE EXCEPTION 'Posição de destino é a mesma da origem';
  END IF;

  v_old_loc := v_pallet.localizacao;
  UPDATE warehouse_positions
  SET status = 'free', pallet_id = NULL, cliente_id = NULL
  WHERE pallet_id = p_pallet_id;

  UPDATE warehouse_positions
  SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = v_pallet.cliente_id
  WHERE id = p_new_position_id AND status = 'free';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posição destino % não está livre', p_new_position_id;
  END IF;
  v_new_loc := p_new_position_id;

  IF p_new_position2_id IS NOT NULL THEN
    UPDATE warehouse_positions
    SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = v_pallet.cliente_id
    WHERE id = p_new_position2_id AND status = 'free';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Posição destino % não está livre', p_new_position2_id;
    END IF;
  END IF;

  UPDATE pallets
  SET localizacao = p_new_position_id,
      localizacao2 = p_new_position2_id,
      ultima_movimentacao = v_now
  WHERE id = p_pallet_id;

  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, interna
  ) VALUES (
    'transferencia', v_now, p_operador, p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_old_loc, v_new_loc, p_motivo, 'executada',
    v_pallet.peso, v_pallet.peso, true
  );

  RETURN jsonb_build_object('success', true, 'new_location', v_new_loc);
END;
$function$;

-- ===== 20260330131619_705ae190-9852-4b53-9bd3-59793af77463.sql =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.pallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.extra_costs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.authorized_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_alerts;

-- ===== 20261016120000_operacao_segura.sql =====
-- =====================================================================
-- StockFlex — operação segura (16/10/2026)
-- 1) Data local de Assunção nas funções do banco
-- 2) Código de pallet gerado no banco (sem duplicidade)
-- 3) Entrada, confirmação e cancelamento de movimentos em uma única transação
-- 4) Travas de perfil nas funções de painel e fechamento
-- 5) Cliente só cria/cancela as próprias solicitações
-- 6) Recalcula as posições ocupadas por contrato
-- =====================================================================

-- ---------- 1) Data local ----------
CREATE OR REPLACE FUNCTION public.sf_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$ SELECT (now() AT TIME ZONE 'America/Asuncion')::date $$;

-- ---------- 2) Código do pallet ----------
CREATE OR REPLACE FUNCTION public.next_pallet_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max integer;
BEGIN
  -- Trava por transação: duas entradas simultâneas não recebem o mesmo número
  PERFORM pg_advisory_xact_lock(hashtext('stockflex_pallet_code'));
  SELECT COALESCE(MAX(substring(sku FROM '^PL-(\d+)$')::integer), 0)
    INTO v_max
    FROM pallets
   WHERE sku ~ '^PL-\d+$';
  RETURN 'PL-' || lpad((v_max + 1)::text, 6, '0');
END;
$$;

-- Posição contígua (posição 1 ↔ 2 no mesmo vão), usada por pallet duplo
CREATE OR REPLACE FUNCTION public.sf_contiguous_position(p_position_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT o.id
    FROM warehouse_positions p
    JOIN warehouse_positions o
      ON o.rua = p.rua AND o.bloco = p.bloco AND o.nivel = p.nivel
     AND o.posicao = CASE WHEN p.posicao = 1 THEN 2 ELSE 1 END
   WHERE p.id = p_position_id
$$;

-- Ocupa uma posição para um pallet; falha se não estiver livre
CREATE OR REPLACE FUNCTION public.sf_occupy_position(p_position_id text, p_pallet_id uuid, p_cliente_id uuid, p_peso numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pos warehouse_positions%ROWTYPE;
BEGIN
  SELECT * INTO v_pos FROM warehouse_positions WHERE id = p_position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La posición % no existe', p_position_id;
  END IF;
  IF v_pos.status <> 'free' THEN
    RAISE EXCEPTION 'La posición % no está libre (estado: %)', p_position_id, v_pos.status;
  END IF;
  IF p_peso IS NOT NULL AND p_peso > v_pos.capacidade_kg THEN
    RAISE EXCEPTION 'El peso (% kg) supera la capacidad de la posición % (% kg)', p_peso, p_position_id, v_pos.capacidade_kg;
  END IF;
  UPDATE warehouse_positions
     SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = p_cliente_id
   WHERE id = p_position_id;
END;
$$;

-- ---------- 3a) Entrada de pallet novo ----------
-- Mesma assinatura da versão anterior. Mudanças:
--  * SKU vazio → código gerado pelo banco (PL-000001...)
--  * localização sempre igual à posição ocupada
--  * contador do contrato soma só as posições realmente ocupadas
--  * data de entrada no fuso de Assunção
--  * devolve o id do movimento e o SKU, para o comprovante
CREATE OR REPLACE FUNCTION public.register_pallet_entry(
  p_cliente_id uuid, p_contrato_id uuid, p_sku text, p_descricao text,
  p_lote text DEFAULT NULL, p_quantidade integer DEFAULT NULL,
  p_peso numeric DEFAULT 0, p_valor_declarado numeric DEFAULT 0,
  p_localizacao text DEFAULT '', p_localizacao2 text DEFAULT NULL,
  p_largo numeric DEFAULT NULL, p_ancho numeric DEFAULT NULL, p_alto numeric DEFAULT NULL,
  p_seguro boolean DEFAULT false, p_pallet_duplo boolean DEFAULT false,
  p_position_id text DEFAULT NULL, p_position2_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet_id uuid;
  v_movement_id uuid;
  v_now timestamptz := now();
  v_contract contracts%ROWTYPE;
  v_sku text;
  v_pos1 text;
  v_pos2 text;
  v_count integer := 0;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden registrar pallets';
  END IF;
  IF p_peso IS NULL OR p_peso <= 0 THEN
    RAISE EXCEPTION 'El peso debe ser mayor que cero';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado';
  END IF;
  IF v_contract.status <> 'ativo' THEN
    RAISE EXCEPTION 'El contrato % no está activo (estado: %)', v_contract.numero, v_contract.status;
  END IF;
  IF v_contract.cliente_id <> p_cliente_id THEN
    RAISE EXCEPTION 'El contrato % no pertenece al cliente informado', v_contract.numero;
  END IF;

  v_sku := NULLIF(trim(COALESCE(p_sku, '')), '');
  IF v_sku IS NULL THEN
    v_sku := next_pallet_code();
  ELSIF EXISTS (SELECT 1 FROM pallets WHERE sku = v_sku AND status <> 'expedido') THEN
    RAISE EXCEPTION 'Ya existe un pallet activo con el código %', v_sku;
  END IF;

  v_pos1 := NULLIF(COALESCE(p_position_id, NULLIF(p_localizacao, '')), '');
  v_pos2 := NULLIF(COALESCE(p_position2_id, p_localizacao2), '');
  IF p_pallet_duplo AND v_pos1 IS NOT NULL AND v_pos2 IS NULL THEN
    v_pos2 := sf_contiguous_position(v_pos1);
    IF v_pos2 IS NULL THEN
      RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', v_pos1;
    END IF;
  END IF;

  INSERT INTO pallets (
    cliente_id, contrato_id, sku, descricao, lote, quantidade,
    peso, valor_declarado, status, localizacao, localizacao2,
    data_entrada, ultima_movimentacao, largo, ancho, alto,
    seguro, pallet_duplo
  ) VALUES (
    p_cliente_id, p_contrato_id, v_sku, COALESCE(p_descricao, ''), p_lote, p_quantidade,
    p_peso, COALESCE(p_valor_declarado, 0),
    CASE WHEN v_pos1 IS NULL THEN 'aguardando_entrada'::pallet_status ELSE 'armazenado'::pallet_status END,
    COALESCE(v_pos1, ''), v_pos2,
    sf_today(), v_now, p_largo, p_ancho, p_alto,
    COALESCE(p_seguro, false), COALESCE(p_pallet_duplo, false)
  ) RETURNING id INTO v_pallet_id;

  IF v_pos1 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos1, v_pallet_id, p_cliente_id, p_peso);
    v_count := 1;
  END IF;
  IF v_pos2 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos2, v_pallet_id, p_cliente_id, NULL);
    v_count := v_count + 1;
  END IF;

  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final
  ) VALUES (
    'entrada', v_now, COALESCE(p_operador, ''), p_operador_id, p_cliente_id, p_contrato_id,
    v_pallet_id, 'Exterior', COALESCE(v_pos1, ''), 'Ingreso inicial',
    CASE WHEN v_pos1 IS NULL THEN 'solicitada'::movement_status ELSE 'executada'::movement_status END,
    p_peso, p_peso
  ) RETURNING id INTO v_movement_id;

  IF v_count > 0 THEN
    UPDATE contracts SET posicoes_ocupadas = posicoes_ocupadas + v_count WHERE id = p_contrato_id;
  END IF;

  RETURN jsonb_build_object('pallet_id', v_pallet_id, 'movement_id', v_movement_id, 'sku', v_sku,
                            'localizacao', v_pos1, 'localizacao2', v_pos2);
END;
$$;

-- ---------- 3b) Confirmar movimento solicitado (tudo ou nada) ----------
CREATE OR REPLACE FUNCTION public.confirm_movement(
  p_movement_id uuid,
  p_destino text DEFAULT NULL,
  p_peso_final numeric DEFAULT NULL,
  p_operador text DEFAULT NULL,
  p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov movements%ROWTYPE;
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_dest text;
  v_dest2 text;
  v_freed integer := 0;
  v_count integer := 0;
  v_pos warehouse_positions%ROWTYPE;
  v_peso numeric;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden confirmar movimientos';
  END IF;

  SELECT * INTO v_mov FROM movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;
  IF v_mov.status NOT IN ('solicitada', 'aprovada') THEN
    RAISE EXCEPTION 'El movimiento ya está %', v_mov.status;
  END IF;

  SELECT * INTO v_pallet FROM pallets WHERE id = v_mov.pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet del movimiento no encontrado';
  END IF;

  v_dest := NULLIF(COALESCE(p_destino, v_mov.destino_local), '');
  v_peso := COALESCE(NULLIF(p_peso_final, 0), NULLIF(v_mov.peso_final, 0), v_pallet.peso);

  CASE v_mov.tipo
    WHEN 'entrada' THEN
      IF v_pallet.status <> 'aguardando_entrada' THEN
        RAISE EXCEPTION 'El pallet % no está esperando ingreso (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      IF v_dest IS NULL THEN
        RAISE EXCEPTION 'Indique la posición de destino';
      END IF;
      PERFORM sf_occupy_position(v_dest, v_pallet.id, v_pallet.cliente_id, v_peso);
      v_count := 1;
      IF v_pallet.pallet_duplo THEN
        v_dest2 := sf_contiguous_position(v_dest);
        IF v_dest2 IS NULL THEN
          RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', v_dest;
        END IF;
        PERFORM sf_occupy_position(v_dest2, v_pallet.id, v_pallet.cliente_id, NULL);
        v_count := 2;
      END IF;
      UPDATE pallets
         SET status = 'armazenado', localizacao = v_dest, localizacao2 = v_dest2,
             peso = v_peso, ultima_movimentacao = v_now
       WHERE id = v_pallet.id;
      UPDATE contracts SET posicoes_ocupadas = posicoes_ocupadas + v_count WHERE id = v_pallet.contrato_id;

    WHEN 'saida' THEN
      IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
        RAISE EXCEPTION 'El pallet % no puede salir (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
       WHERE pallet_id = v_pallet.id;
      GET DIAGNOSTICS v_freed = ROW_COUNT;
      UPDATE pallets
         SET status = 'expedido', localizacao = '', localizacao2 = NULL, ultima_movimentacao = v_now
       WHERE id = v_pallet.id;
      UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed)
       WHERE id = v_pallet.contrato_id;
      v_dest := COALESCE(v_dest, 'Exterior');

    WHEN 'transferencia' THEN
      IF v_pallet.status <> 'armazenado' THEN
        RAISE EXCEPTION 'El pallet % no puede transferirse (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      IF v_dest IS NULL THEN
        RAISE EXCEPTION 'Indique la posición de destino';
      END IF;
      IF v_dest = v_pallet.localizacao THEN
        RAISE EXCEPTION 'La posición de destino es la misma que la de origen';
      END IF;
      UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
       WHERE pallet_id = v_pallet.id;
      GET DIAGNOSTICS v_freed = ROW_COUNT;
      PERFORM sf_occupy_position(v_dest, v_pallet.id, v_pallet.cliente_id, v_peso);
      v_count := 1;
      IF v_pallet.pallet_duplo THEN
        v_dest2 := sf_contiguous_position(v_dest);
        IF v_dest2 IS NULL THEN
          RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', v_dest;
        END IF;
        PERFORM sf_occupy_position(v_dest2, v_pallet.id, v_pallet.cliente_id, NULL);
        v_count := 2;
      END IF;
      UPDATE pallets
         SET localizacao = v_dest, localizacao2 = v_dest2, peso = v_peso, ultima_movimentacao = v_now
       WHERE id = v_pallet.id;
      IF v_count <> v_freed THEN
        UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed + v_count)
         WHERE id = v_pallet.contrato_id;
      END IF;

    WHEN 'ajuste' THEN
      UPDATE pallets
         SET peso = v_peso,
             valor_declarado = COALESCE(NULLIF(v_mov.novo_valor_declarado, 0), valor_declarado),
             ultima_movimentacao = v_now
       WHERE id = v_pallet.id;

    WHEN 'avaria' THEN
      UPDATE pallets SET ultima_movimentacao = v_now WHERE id = v_pallet.id;

    WHEN 'bloqueio' THEN
      -- Bloqueia uma posição livre ou libera uma posição bloqueada
      SELECT * INTO v_pos FROM warehouse_positions
       WHERE id = COALESCE(v_dest, NULLIF(v_mov.origem_local, '')) FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Posición a bloquear/liberar no encontrada';
      END IF;
      IF v_pos.status = 'free' THEN
        UPDATE warehouse_positions SET status = 'blocked' WHERE id = v_pos.id;
      ELSIF v_pos.status = 'blocked' THEN
        UPDATE warehouse_positions SET status = 'free' WHERE id = v_pos.id;
      ELSE
        RAISE EXCEPTION 'La posición % está ocupada; no se puede bloquear', v_pos.id;
      END IF;
      v_dest := v_pos.id;
  END CASE;

  UPDATE movements
     SET status = 'executada',
         data_hora = v_now,
         destino_local = COALESCE(v_dest, destino_local),
         peso_final = v_peso,
         operador = COALESCE(NULLIF(p_operador, ''), operador),
         operador_id = COALESCE(p_operador_id, operador_id)
   WHERE id = v_mov.id;

  -- Solicitações do cliente: fecha quando todos os movimentos vinculados estiverem executados
  UPDATE client_requests r
     SET status = 'executado'
   WHERE v_mov.id = ANY(r.movimento_ids)
     AND r.status IN ('pendente', 'separado')
     AND NOT EXISTS (
       SELECT 1 FROM movements m
        WHERE m.id = ANY(r.movimento_ids) AND m.status <> 'executada'
     );

  RETURN jsonb_build_object('success', true, 'movement_id', v_mov.id, 'pallet_id', v_pallet.id,
                            'destino', v_dest, 'destino2', v_dest2);
END;
$$;

-- ---------- 3c) Cancelar movimento solicitado ----------
CREATE OR REPLACE FUNCTION public.cancel_movement(p_movement_id uuid, p_motivo text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov movements%ROWTYPE;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  SELECT * INTO v_mov FROM movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;
  IF v_mov.status NOT IN ('solicitada', 'aprovada') THEN
    RAISE EXCEPTION 'Solo se pueden cancelar movimientos pendientes (estado: %)', v_mov.status;
  END IF;
  UPDATE movements
     SET status = 'cancelada',
         motivo = CASE WHEN COALESCE(trim(p_motivo), '') = '' THEN motivo
                       ELSE trim(both ' ' FROM motivo || ' | Cancelado: ' || trim(p_motivo)) END
   WHERE id = p_movement_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Saída e transferência diretas: mesmas regras, agora com data local e id do movimento
CREATE OR REPLACE FUNCTION public.execute_pallet_exit(
  p_pallet_id uuid, p_motivo text DEFAULT '', p_autorizado_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL,
  p_peso_final numeric DEFAULT 0, p_destino text DEFAULT 'Exterior'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_freed integer := 0;
  v_movement_id uuid;
  v_origem text;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden registrar salidas';
  END IF;
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet no encontrado';
  END IF;
  IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
    RAISE EXCEPTION 'El pallet % no puede salir (estado: %)', v_pallet.sku, v_pallet.status;
  END IF;
  IF p_peso_final < 0 THEN
    RAISE EXCEPTION 'El peso final no puede ser negativo';
  END IF;
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de la salida es obligatorio';
  END IF;
  IF p_autorizado_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM authorized_contacts
     WHERE id::text = p_autorizado_id AND cliente_id = v_pallet.cliente_id AND ativo
  ) THEN
    RAISE EXCEPTION 'El autorizado no pertenece a este cliente o está inactivo';
  END IF;

  v_origem := concat_ws(' / ', NULLIF(v_pallet.localizacao, ''), v_pallet.localizacao2);
  UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
   WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_freed = ROW_COUNT;
  UPDATE pallets
     SET status = 'expedido', localizacao = '', localizacao2 = NULL, ultima_movimentacao = v_now
   WHERE id = p_pallet_id;
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, autorizado_id
  ) VALUES (
    'saida', v_now, COALESCE(p_operador, ''), p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_origem, COALESCE(NULLIF(p_destino, ''), 'Exterior'), trim(p_motivo), 'executada',
    v_pallet.peso, COALESCE(NULLIF(p_peso_final, 0), v_pallet.peso), p_autorizado_id
  ) RETURNING id INTO v_movement_id;
  UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed)
   WHERE id = v_pallet.contrato_id;
  RETURN jsonb_build_object('success', true, 'positions_freed', v_freed, 'movement_id', v_movement_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_pallet(
  p_pallet_id uuid, p_new_position_id text, p_new_position2_id text DEFAULT NULL,
  p_motivo text DEFAULT '', p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_old text;
  v_pos2 text;
  v_freed integer := 0;
  v_count integer := 1;
  v_movement_id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden transferir pallets';
  END IF;
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet no encontrado';
  END IF;
  IF v_pallet.status <> 'armazenado' THEN
    RAISE EXCEPTION 'El pallet % no puede transferirse (estado: %)', v_pallet.sku, v_pallet.status;
  END IF;
  IF p_new_position_id IS NULL OR p_new_position_id = '' THEN
    RAISE EXCEPTION 'Indique la posición de destino';
  END IF;
  IF p_new_position_id = v_pallet.localizacao THEN
    RAISE EXCEPTION 'La posición de destino es la misma que la de origen';
  END IF;

  v_old := concat_ws(' / ', NULLIF(v_pallet.localizacao, ''), v_pallet.localizacao2);
  v_pos2 := NULLIF(p_new_position2_id, '');
  IF v_pallet.pallet_duplo AND v_pos2 IS NULL THEN
    v_pos2 := sf_contiguous_position(p_new_position_id);
    IF v_pos2 IS NULL THEN
      RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', p_new_position_id;
    END IF;
  END IF;

  UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
   WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_freed = ROW_COUNT;
  PERFORM sf_occupy_position(p_new_position_id, p_pallet_id, v_pallet.cliente_id, v_pallet.peso);
  IF v_pos2 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos2, p_pallet_id, v_pallet.cliente_id, NULL);
    v_count := 2;
  END IF;
  UPDATE pallets
     SET localizacao = p_new_position_id, localizacao2 = v_pos2, ultima_movimentacao = v_now
   WHERE id = p_pallet_id;
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, interna
  ) VALUES (
    'transferencia', v_now, COALESCE(p_operador, ''), p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_old, concat_ws(' / ', p_new_position_id, v_pos2), COALESCE(p_motivo, ''), 'executada',
    v_pallet.peso, v_pallet.peso, true
  ) RETURNING id INTO v_movement_id;
  IF v_count <> v_freed THEN
    UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed + v_count)
     WHERE id = v_pallet.contrato_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'new_location', p_new_position_id,
                            'new_location2', v_pos2, 'movement_id', v_movement_id);
END;
$$;

-- ---------- 5) Solicitações do cliente ----------
DROP POLICY IF EXISTS "Cliente manage own requests" ON public.client_requests;
DROP POLICY IF EXISTS "Cliente read own requests" ON public.client_requests;
DROP POLICY IF EXISTS "Cliente create own requests" ON public.client_requests;
DROP POLICY IF EXISTS "Cliente cancel own requests" ON public.client_requests;

CREATE POLICY "Cliente read own requests" ON public.client_requests
  FOR SELECT TO authenticated
  USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Cliente create own requests" ON public.client_requests
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND status = 'pendente');

CREATE POLICY "Cliente cancel own requests" ON public.client_requests
  FOR UPDATE TO authenticated
  USING (cliente_id::text = get_user_client_id(auth.uid()) AND status = 'pendente')
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND status IN ('pendente', 'cancelado'));

-- ---------- 6) Recalcula posições ocupadas por contrato ----------
UPDATE contracts c
   SET posicoes_ocupadas = COALESCE(x.n, 0)
  FROM (
    SELECT ct.id, (
      SELECT count(*) FROM warehouse_positions wp
        JOIN pallets p ON p.id = wp.pallet_id
       WHERE p.contrato_id = ct.id AND wp.status = 'occupied'
    ) AS n
    FROM contracts ct
  ) x
 WHERE x.id = c.id AND c.posicoes_ocupadas IS DISTINCT FROM COALESCE(x.n, 0);

-- Movimentos: índice para a busca por pallet + status (fila de pendentes)
CREATE INDEX IF NOT EXISTS idx_movements_pallet_status ON public.movements (pallet_id, status);
CREATE INDEX IF NOT EXISTS idx_pallets_sku ON public.pallets (sku);

-- ---------- 4) Travas de perfil no painel e no fechamento ----------
CREATE OR REPLACE FUNCTION public.dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  SELECT jsonb_build_object(
    'occupied_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'occupied'),
    'free_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'free'),
    'blocked_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'blocked'),
    'reserved_count', (SELECT count(*) FROM warehouse_positions WHERE status = 'reserved'),
    'total_positions', (SELECT count(*) FROM warehouse_positions),
    'stored_pallets', (SELECT count(*) FROM pallets WHERE status = 'armazenado'),
    'total_pallets', (SELECT count(*) FROM pallets),
    'active_contracts', (SELECT count(*) FROM contracts WHERE status = 'ativo'),
    'expiring_contracts_30d', (SELECT count(*) FROM contracts WHERE status = 'ativo' AND data_termino > CURRENT_DATE AND data_termino <= CURRENT_DATE + interval '30 days'),
    'pending_requests', (SELECT count(*) FROM client_requests WHERE status = 'pendente'),
    'pending_movements', (SELECT count(*) FROM movements WHERE status = 'solicitada')
  ) INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_occupancy_by_client()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  SELECT coalesce(jsonb_agg(row_data), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'client_id', cl.id,
      'client_name', cl.nome_fantasia,
      'contratadas', coalesce(ct.total_contratadas, 0),
      'ocupadas', coalesce(wp.total_ocupadas, 0),
      'programadas', coalesce(cr.total_programadas, 0),
      'excedente', GREATEST(0, coalesce(wp.total_ocupadas, 0) + coalesce(cr.total_programadas, 0) - coalesce(ct.total_contratadas, 0))
    ) as row_data
    FROM clients cl
    LEFT JOIN (
      SELECT cliente_id, sum(posicoes_contratadas) as total_contratadas
      FROM contracts WHERE status = 'ativo'
      GROUP BY cliente_id
    ) ct ON ct.cliente_id = cl.id
    LEFT JOIN (
      SELECT cliente_id, count(*) as total_ocupadas
      FROM warehouse_positions WHERE status = 'occupied' AND cliente_id IS NOT NULL
      GROUP BY cliente_id
    ) wp ON wp.cliente_id = cl.id
    LEFT JOIN (
      SELECT cliente_id, coalesce(sum(quantidade), 0) as total_programadas
      FROM client_requests WHERE tipo = 'ingreso' AND status = 'pendente'
      GROUP BY cliente_id
    ) cr ON cr.cliente_id = cl.id
    WHERE coalesce(ct.total_contratadas, 0) > 0 OR coalesce(wp.total_ocupadas, 0) > 0
    ORDER BY coalesce(ct.total_contratadas, 0) DESC
  ) sub;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_financial_summary(p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_min_date date;
  v_max_date date;
BEGIN
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  IF p_date_from IS NOT NULL THEN
    v_min_date := p_date_from::date;
  ELSE
    SELECT min(data_inicio) INTO v_min_date FROM contracts;
  END IF;
  IF p_date_to IS NOT NULL THEN
    v_max_date := p_date_to::date;
  ELSE
    SELECT max(data_termino) INTO v_max_date FROM contracts;
  END IF;

  IF v_min_date IS NULL OR v_max_date IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY month_key), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'month', m.month_key,
      'ingresos', coalesce(inv.total, 0) + CASE WHEN coalesce(inv.total, 0) = 0 THEN coalesce(ctr.estimated, 0) ELSE 0 END,
      'gastos', coalesce(exp.total, 0),
      'resultado', (coalesce(inv.total, 0) + CASE WHEN coalesce(inv.total, 0) = 0 THEN coalesce(ctr.estimated, 0) ELSE 0 END) - coalesce(exp.total, 0)
    ) as row_data,
    m.month_key
    FROM (
      SELECT to_char(generate_series(
        date_trunc('month', v_min_date),
        date_trunc('month', v_max_date),
        interval '1 month'
      ), 'YYYY-MM') as month_key
    ) m
    LEFT JOIN (
      SELECT competencia, sum(valor) as total
      FROM invoices GROUP BY competencia
    ) inv ON inv.competencia = m.month_key
    LEFT JOIN (
      SELECT competencia, sum(valor_usd) as total
      FROM expenses GROUP BY competencia
    ) exp ON exp.competencia = m.month_key
    LEFT JOIN (
      SELECT to_char(ms.month_start, 'YYYY-MM') as month_key, sum(c.posicoes_contratadas * c.preco_por_posicao) as estimated
      FROM contracts c
      CROSS JOIN LATERAL (
        SELECT generate_series(
          date_trunc('month', c.data_inicio),
          date_trunc('month', c.data_termino),
          interval '1 month'
        ) as month_start
      ) ms
      WHERE c.status = 'ativo'
      GROUP BY to_char(ms.month_start, 'YYYY-MM')
    ) ctr ON ctr.month_key = m.month_key
  ) sub;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.monthly_close_data(p_month text, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_month_start date;
  v_month_end date;
BEGIN
  -- Equipe interna vê todos; cliente só enxerga o próprio fechamento
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    IF get_user_client_id(auth.uid()) IS NULL THEN
      RAISE EXCEPTION 'Permiso denegado';
    END IF;
    p_client_id := get_user_client_id(auth.uid())::uuid;
  END IF;
  v_month_start := (p_month || '-01')::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  SELECT coalesce(jsonb_agg(row_data), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'contrato', c.numero,
      'contrato_id', c.id,
      'cliente', cl.nome_fantasia,
      'cliente_id', c.cliente_id,
      'posicoes_contratadas', c.posicoes_contratadas,
      'posicoes_ocupadas', c.posicoes_ocupadas,
      'saldo_ocioso', c.posicoes_contratadas - c.posicoes_ocupadas,
      'mov_inclusas', LEAST(coalesce(mov.total_mov, 0), c.movimentacoes_inclusas),
      'mov_extras', GREATEST(0, coalesce(mov.total_mov, 0) - c.movimentacoes_inclusas),
      'valor_posicoes', c.posicoes_contratadas * c.preco_por_posicao,
      'valor_mov_extras', GREATEST(0, coalesce(mov.total_mov, 0) - c.movimentacoes_inclusas) * c.preco_mov_extra,
      'seguro', coalesce(seg.total_valor_declarado, 0) * (c.percentual_seguro / 100),
      'valor_custos_extras', coalesce(ec.total_extra, 0),
      'total', (c.posicoes_contratadas * c.preco_por_posicao)
             + (GREATEST(0, coalesce(mov.total_mov, 0) - c.movimentacoes_inclusas) * c.preco_mov_extra)
             + (coalesce(seg.total_valor_declarado, 0) * (c.percentual_seguro / 100))
             + coalesce(ec.total_extra, 0),
      'moeda', c.moeda
    ) as row_data
    FROM contracts c
    JOIN clients cl ON cl.id = c.cliente_id
    LEFT JOIN (
      SELECT contrato_id, count(*) as total_mov
      FROM movements
      WHERE status = 'executada'
        AND data_hora >= v_month_start::timestamptz
        AND data_hora < (v_month_end + interval '1 day')::timestamptz
      GROUP BY contrato_id
    ) mov ON mov.contrato_id = c.id
    LEFT JOIN (
      SELECT contrato_id, sum(valor_declarado) as total_valor_declarado
      FROM pallets
      WHERE seguro = true AND status = 'armazenado'
      GROUP BY contrato_id
    ) seg ON seg.contrato_id = c.id
    LEFT JOIN (
      SELECT contrato_id, sum(valor_total) as total_extra
      FROM extra_costs
      WHERE competencia = p_month
      GROUP BY contrato_id
    ) ec ON ec.contrato_id = c.id
    WHERE c.status = 'ativo'
      AND c.data_inicio <= v_month_end
      AND c.data_termino >= v_month_start
      AND (p_client_id IS NULL OR c.cliente_id = p_client_id)
    ORDER BY cl.nome_fantasia, c.numero
  ) sub;
  RETURN result;
END;
$function$;

-- ---------- Execução das funções: só usuários logados ----------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'register_pallet_entry(uuid,uuid,text,text,text,integer,numeric,numeric,text,text,numeric,numeric,numeric,boolean,boolean,text,text,text,text)',
    'confirm_movement(uuid,text,numeric,text,text)',
    'cancel_movement(uuid,text)',
    'execute_pallet_exit(uuid,text,text,text,text,numeric,text)',
    'transfer_pallet(uuid,text,text,text,text,text)',
    'delete_pallet_safe(uuid)',
    'next_pallet_code()',
    'sf_occupy_position(text,uuid,uuid,numeric)',
    'dashboard_stats()',
    'dashboard_occupancy_by_client()',
    'dashboard_financial_summary(text,text)',
    'monthly_close_data(text,uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
-- Funções internas não devem ser chamadas diretamente pelo app
REVOKE EXECUTE ON FUNCTION public.sf_occupy_position(text,uuid,uuid,numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_pallet_code() FROM authenticated;

-- ===== 20261016140000_marketing_contacts.sql =====
-- =====================================================================
-- StockFlex — base de contatos de marketing (16/10/2026)
-- O site grava contatos SÓ depois que a pessoa preenche os dados básicos,
-- por uma única função (capture_lead). Visitantes anônimos não leem nada.
-- Cada contato tem pontuação (0–100) pelo interesse demonstrado no site.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 200 AND email LIKE '%@%'),
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 120),
  company text NOT NULL DEFAULT '' CHECK (char_length(company) <= 160),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  tax_id text NOT NULL DEFAULT '' CHECK (char_length(tax_id) <= 40),
  lang text CHECK (lang IN ('es', 'pt')),
  consent_marketing boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  first_source text NOT NULL DEFAULT '' CHECK (char_length(first_source) <= 300),
  last_source text NOT NULL DEFAULT '' CHECK (char_length(last_source) <= 300),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo', 'contatado', 'negociacao', 'cliente', 'perdido', 'descartado')),
  interests text[] NOT NULL DEFAULT '{}',
  lead_count integer NOT NULL DEFAULT 0,
  max_positions integer NOT NULL DEFAULT 0,
  last_kind text,
  last_proposal_number text,
  last_total_monthly numeric,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('contact', 'quote', 'simulation', 'proposal', 'structures')),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 4000),
  pallet_quantity text NOT NULL DEFAULT '' CHECK (char_length(pallet_quantity) <= 40),
  proposal_number text CHECK (char_length(proposal_number) <= 40),
  details jsonb CHECK (details IS NULL OR pg_column_size(details) <= 20000),
  engagement jsonb CHECK (engagement IS NULL OR pg_column_size(engagement) <= 20000),
  score integer NOT NULL DEFAULT 0,
  visitor_id text CHECK (char_length(visitor_id) <= 64),
  page text CHECK (char_length(page) <= 300),
  lang text CHECK (lang IN ('es', 'pt'))
);

-- Anotações e histórico de atendimento (ligação, WhatsApp, e-mail, troca de status)
CREATE TABLE IF NOT EXISTS public.marketing_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('nota', 'ligacao', 'whatsapp', 'email', 'visita', 'status')),
  text text NOT NULL DEFAULT '' CHECK (char_length(text) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_mk_contacts_score ON public.marketing_contacts (score DESC);
CREATE INDEX IF NOT EXISTS idx_mk_contacts_last_seen ON public.marketing_contacts (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_mk_contacts_status ON public.marketing_contacts (status);
CREATE INDEX IF NOT EXISTS idx_mk_leads_contact ON public.marketing_leads (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mk_activities_contact ON public.marketing_activities (contact_id, created_at DESC);

-- ---------- Pontuação ----------
-- Regras simples e explicáveis; ajuste os pesos aqui.
CREATE OR REPLACE FUNCTION public.lead_score(p_kind text, p_details jsonb, p_eng jsonb, p_consent boolean)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  s integer := 0;
  v_pos integer := 0;
  v_months integer := 0;
  v_visits integer := 0;
  v_secs integer := 0;
  v_sections jsonb := COALESCE(p_eng -> 'sections', '[]'::jsonb);
BEGIN
  s := s + CASE p_kind
    WHEN 'proposal' THEN 30
    WHEN 'structures' THEN 30
    WHEN 'quote' THEN 25
    WHEN 'contact' THEN 15
    WHEN 'simulation' THEN 10
    ELSE 0 END;

  BEGIN v_pos := COALESCE((p_details ->> 'totalPositions')::integer, 0); EXCEPTION WHEN others THEN v_pos := 0; END;
  BEGIN v_months := COALESCE((p_details ->> 'months')::integer, 0); EXCEPTION WHEN others THEN v_months := 0; END;
  BEGIN v_visits := COALESCE((p_eng ->> 'visits')::integer, 0); EXCEPTION WHEN others THEN v_visits := 0; END;
  BEGIN v_secs := COALESCE((p_eng ->> 'activeSeconds')::integer, 0); EXCEPTION WHEN others THEN v_secs := 0; END;

  -- Tamanho do negócio
  s := s + CASE WHEN v_pos >= 100 THEN 25 WHEN v_pos >= 30 THEN 15 WHEN v_pos >= 10 THEN 8 WHEN v_pos > 0 THEN 3 ELSE 0 END;
  s := s + CASE WHEN v_months >= 12 THEN 10 WHEN v_months >= 6 THEN 5 ELSE 0 END;

  -- Quanto se moveu no site
  s := s + CASE WHEN v_visits >= 3 THEN 10 WHEN v_visits = 2 THEN 5 ELSE 0 END;
  s := s + CASE WHEN v_secs >= 300 THEN 10 WHEN v_secs >= 120 THEN 5 ELSE 0 END;
  IF v_sections ? 'simulador' THEN s := s + 5; END IF;
  IF v_sections ? 'faq' THEN s := s + 3; END IF;
  IF v_sections ? 'estructuras' THEN s := s + 5; END IF;
  IF COALESCE((p_eng ->> 'whatsappClicks')::integer, 0) > 0 THEN s := s + 10; END IF;
  IF COALESCE((p_eng ->> 'simulatorEdits')::integer, 0) >= 5 THEN s := s + 5; END IF;
  IF p_consent THEN s := s + 5; END IF;

  RETURN LEAST(100, GREATEST(0, s));
EXCEPTION WHEN others THEN
  RETURN LEAST(100, GREATEST(0, s));
END;
$$;

-- ---------- Captura (única porta de entrada para o site) ----------
CREATE OR REPLACE FUNCTION public.capture_lead(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p ->> 'email', '')));
  v_name text := left(trim(COALESCE(p ->> 'name', '')), 120);
  v_company text := left(trim(COALESCE(p ->> 'company', '')), 160);
  v_phone text := left(trim(COALESCE(p ->> 'phone', '')), 40);
  v_tax text := left(trim(COALESCE(p ->> 'taxId', '')), 40);
  v_kind text := COALESCE(p ->> 'kind', 'contact');
  v_lang text := CASE WHEN p ->> 'lang' = 'pt' THEN 'pt' ELSE 'es' END;
  v_consent boolean := COALESCE((p ->> 'consent')::boolean, false);
  v_details jsonb := CASE WHEN jsonb_typeof(p -> 'details') = 'object' THEN p -> 'details' ELSE NULL END;
  v_eng jsonb := CASE WHEN jsonb_typeof(p -> 'engagement') = 'object' THEN p -> 'engagement' ELSE NULL END;
  v_visitor text := left(COALESCE(p ->> 'visitorId', ''), 64);
  v_source text := left(COALESCE(v_eng ->> 'source', ''), 300);
  v_score integer;
  v_contact public.marketing_contacts%ROWTYPE;
  v_existing boolean;
  v_lead_id uuid;
  v_pos integer;
  v_interest text;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 200 THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Nome obrigatório';
  END IF;
  IF v_kind NOT IN ('contact', 'quote', 'simulation', 'proposal', 'structures') THEN
    RAISE EXCEPTION 'Tipo de contato inválido';
  END IF;
  IF pg_column_size(p) > 40000 THEN
    RAISE EXCEPTION 'Dados grandes demais';
  END IF;

  v_score := lead_score(v_kind, v_details, v_eng, v_consent);
  BEGIN v_pos := COALESCE((v_details ->> 'totalPositions')::integer, 0); EXCEPTION WHEN others THEN v_pos := 0; END;
  v_interest := CASE v_kind WHEN 'structures' THEN 'estruturas' WHEN 'contact' THEN NULL ELSE 'posicoes' END;

  SELECT EXISTS (SELECT 1 FROM marketing_contacts WHERE email = v_email) INTO v_existing;

  INSERT INTO marketing_contacts AS c (
    email, name, company, phone, tax_id, lang, consent_marketing, consent_at,
    first_source, last_source, score, interests, lead_count, max_positions,
    last_kind, last_proposal_number, last_total_monthly, first_seen_at, last_seen_at
  ) VALUES (
    v_email, v_name, v_company, v_phone, v_tax, v_lang, v_consent, CASE WHEN v_consent THEN now() END,
    v_source, v_source, v_score, CASE WHEN v_interest IS NULL THEN '{}' ELSE ARRAY[v_interest] END, 1, v_pos,
    v_kind, p ->> 'proposalNumber', NULLIF(v_details ->> 'totalMonthly', '')::numeric,
    COALESCE(NULLIF(v_eng ->> 'firstVisit', '')::timestamptz, now()), now()
  )
  ON CONFLICT (email) DO UPDATE SET
    name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE c.name END,
    company = CASE WHEN EXCLUDED.company <> '' THEN EXCLUDED.company ELSE c.company END,
    phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE c.phone END,
    tax_id = CASE WHEN EXCLUDED.tax_id <> '' THEN EXCLUDED.tax_id ELSE c.tax_id END,
    lang = EXCLUDED.lang,
    consent_marketing = c.consent_marketing OR EXCLUDED.consent_marketing,
    consent_at = COALESCE(c.consent_at, EXCLUDED.consent_at),
    last_source = CASE WHEN EXCLUDED.last_source <> '' THEN EXCLUDED.last_source ELSE c.last_source END,
    -- Volta ao site e repete o interesse: soma 5 pontos por nova interação
    score = LEAST(100, GREATEST(c.score, EXCLUDED.score) + 5),
    interests = (SELECT ARRAY(SELECT DISTINCT unnest(c.interests || EXCLUDED.interests))),
    lead_count = c.lead_count + 1,
    max_positions = GREATEST(c.max_positions, EXCLUDED.max_positions),
    last_kind = EXCLUDED.last_kind,
    last_proposal_number = COALESCE(EXCLUDED.last_proposal_number, c.last_proposal_number),
    last_total_monthly = COALESCE(EXCLUDED.last_total_monthly, c.last_total_monthly),
    last_seen_at = now(),
    updated_at = now()
  RETURNING * INTO v_contact;

  -- Simulação salva automaticamente: atualiza a da última meia hora em vez de criar outra
  IF v_kind = 'simulation' THEN
    UPDATE marketing_leads
       SET details = v_details, engagement = v_eng, score = v_score, updated_at = now()
     WHERE id = (SELECT id FROM marketing_leads
                  WHERE contact_id = v_contact.id AND kind = 'simulation'
                    AND updated_at > now() - interval '30 minutes'
                  ORDER BY updated_at DESC LIMIT 1)
     RETURNING id INTO v_lead_id;
    IF v_lead_id IS NOT NULL THEN
      -- Não conta como nova interação
      UPDATE marketing_contacts SET lead_count = lead_count - 1,
             score = LEAST(100, GREATEST(score - 5, v_score))
       WHERE id = v_contact.id AND v_existing;
      RETURN jsonb_build_object('ok', true, 'updated', true);
    END IF;
  END IF;

  INSERT INTO marketing_leads (contact_id, kind, message, pallet_quantity, proposal_number, details, engagement, score, visitor_id, page, lang)
  VALUES (v_contact.id, v_kind, left(COALESCE(p ->> 'message', ''), 4000), left(COALESCE(p ->> 'palletQuantity', ''), 40),
          left(p ->> 'proposalNumber', 40), v_details, v_eng, v_score, NULLIF(v_visitor, ''), left(p ->> 'page', 300), v_lang);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------- Acesso ----------
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestao le contatos" ON public.marketing_contacts;
DROP POLICY IF EXISTS "Gestao edita contatos" ON public.marketing_contacts;
DROP POLICY IF EXISTS "Admin apaga contatos" ON public.marketing_contacts;
DROP POLICY IF EXISTS "Gestao le leads" ON public.marketing_leads;
DROP POLICY IF EXISTS "Gestao le atividades" ON public.marketing_activities;
DROP POLICY IF EXISTS "Gestao registra atividades" ON public.marketing_activities;

-- Administradores e financeiro gerenciam a base; operadores e clientes não veem
CREATE POLICY "Gestao le contatos" ON public.marketing_contacts FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Gestao edita contatos" ON public.marketing_contacts FOR UPDATE TO authenticated USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Admin apaga contatos" ON public.marketing_contacts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Gestao le leads" ON public.marketing_leads FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Gestao le atividades" ON public.marketing_activities FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
CREATE POLICY "Gestao registra atividades" ON public.marketing_activities FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_financeiro(auth.uid()) AND user_id = auth.uid());

REVOKE ALL ON public.marketing_contacts, public.marketing_leads, public.marketing_activities FROM anon;
REVOKE EXECUTE ON FUNCTION public.capture_lead(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_lead(jsonb) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lead_score(text, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_score(text, jsonb, jsonb, boolean) TO authenticated;

-- ===== 20261017090000_multi_deposito.sql =====
-- =====================================================================
-- StockFlex — vários depósitos (17/10/2026)
-- * Cadastro de depósitos (cada um com sua planta)
-- * Cada posição pertence a um depósito; o id passa a ser "<DEPÓSITO>:<código>"
--   (ex.: CDE1:A-01-1-1) e o código curto (A-01-1-1) fica em `code`
-- * Gerador de ruas/blocos/níveis por depósito e remoção de posições livres
-- * Funções de operação respeitam o depósito (posição contígua só no mesmo depósito)
-- Segura para rodar com dados: atualiza as referências de pallets e movimentos.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Logados leem depositos" ON public.warehouses;
DROP POLICY IF EXISTS "Admin gerencia depositos" ON public.warehouses;
CREATE POLICY "Logados leem depositos" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gerencia depositos" ON public.warehouses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Depósito atual (primeiro barracão)
INSERT INTO public.warehouses (code, name, city)
VALUES ('CDE1', 'Depósito Ciudad del Este', 'Ciudad del Este')
ON CONFLICT (code) DO NOTHING;

-- ---------- Posições ----------
ALTER TABLE public.warehouse_positions ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_positions ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.warehouse_positions ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'selectivo'
  CHECK (tipo IN ('selectivo', 'drive-in', 'piso'));

DO $$
DECLARE
  v_wh uuid;
BEGIN
  SELECT id INTO v_wh FROM warehouses WHERE code = 'CDE1';
  -- Só posições ainda no formato antigo (sem prefixo)
  IF EXISTS (SELECT 1 FROM warehouse_positions WHERE warehouse_id IS NULL) THEN
    -- Referências em texto: pallets e movimentos passam a usar o id novo
    UPDATE pallets SET localizacao = 'CDE1:' || localizacao
     WHERE localizacao <> '' AND position(':' in localizacao) = 0
       AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = pallets.localizacao);
    UPDATE pallets SET localizacao2 = 'CDE1:' || localizacao2
     WHERE localizacao2 IS NOT NULL AND localizacao2 <> '' AND position(':' in localizacao2) = 0
       AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = pallets.localizacao2);
    UPDATE movements SET origem_local = 'CDE1:' || origem_local
     WHERE position(':' in origem_local) = 0 AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = movements.origem_local);
    UPDATE movements SET destino_local = 'CDE1:' || destino_local
     WHERE position(':' in destino_local) = 0 AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = movements.destino_local);

    UPDATE warehouse_positions
       SET code = id, id = 'CDE1:' || id, warehouse_id = v_wh
     WHERE warehouse_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.warehouse_positions ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE public.warehouse_positions ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_wh_code ON public.warehouse_positions (warehouse_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_wh_slot ON public.warehouse_positions (warehouse_id, rua, bloco, nivel, posicao);
CREATE INDEX IF NOT EXISTS idx_positions_wh_status ON public.warehouse_positions (warehouse_id, status);

-- ---------- Posição contígua: só no mesmo depósito ----------
CREATE OR REPLACE FUNCTION public.sf_contiguous_position(p_position_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT o.id
    FROM warehouse_positions p
    JOIN warehouse_positions o
      ON o.warehouse_id = p.warehouse_id
     AND o.rua = p.rua AND o.bloco = p.bloco AND o.nivel = p.nivel
     AND o.posicao = CASE WHEN p.posicao = 1 THEN 2 ELSE 1 END
   WHERE p.id = p_position_id
$$;

-- ---------- Gerador de planta ----------
-- Cria as posições de uma rua: blocos × níveis × posições por nível.
-- Níveis 1..p_levels; p_capacity_kg vale para todos (ajustável depois por posição).
CREATE OR REPLACE FUNCTION public.generate_positions(
  p_warehouse_id uuid,
  p_rua text,
  p_blocks integer,
  p_levels integer,
  p_slots integer DEFAULT 2,
  p_tipo text DEFAULT 'selectivo',
  p_capacity_kg numeric DEFAULT 1000,
  p_block_start integer DEFAULT 1,
  p_status cell_status DEFAULT 'free'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wh warehouses%ROWTYPE;
  v_rua text := upper(trim(p_rua));
  v_created integer := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permiso denegado: solo administradores configuran depósitos';
  END IF;
  SELECT * INTO v_wh FROM warehouses WHERE id = p_warehouse_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Depósito no encontrado'; END IF;
  IF v_rua !~ '^[A-Z]{1,2}$' THEN RAISE EXCEPTION 'La calle debe ser 1 o 2 letras (ej.: A, B, AA)'; END IF;
  IF p_blocks NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'Bloques: entre 1 y 99'; END IF;
  IF p_block_start NOT BETWEEN 1 AND 99 OR p_block_start + p_blocks - 1 > 99 THEN RAISE EXCEPTION 'Numeración de bloques fuera de rango (1 a 99)'; END IF;
  IF p_levels NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION 'Niveles: entre 1 y 9'; END IF;
  IF p_slots NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION 'Posiciones por nivel: entre 1 y 9'; END IF;
  IF p_tipo NOT IN ('selectivo', 'drive-in', 'piso') THEN RAISE EXCEPTION 'Tipo de estructura inválido'; END IF;
  IF p_capacity_kg IS NULL OR p_capacity_kg <= 0 THEN RAISE EXCEPTION 'Capacidad debe ser mayor que cero'; END IF;

  INSERT INTO warehouse_positions (id, code, warehouse_id, rua, bloco, nivel, posicao, status, capacidade_kg, tipo)
  SELECT v_wh.code || ':' || c, c, v_wh.id, v_rua, b, n, s, p_status, p_capacity_kg, p_tipo
    FROM generate_series(p_block_start, p_block_start + p_blocks - 1) b,
         generate_series(1, p_levels) n,
         generate_series(1, p_slots) s,
         LATERAL (SELECT v_rua || '-' || lpad(b::text, 2, '0') || '-' || n || '-' || s AS c) x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object('created', v_created, 'requested', p_blocks * p_levels * p_slots);
END;
$$;

-- Remove posições LIVRES ou BLOQUEADAS de uma rua (ex.: corrigir uma planta). Ocupadas nunca.
CREATE OR REPLACE FUNCTION public.remove_positions(p_warehouse_id uuid, p_rua text, p_block_from integer DEFAULT NULL, p_block_to integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_occupied integer;
  v_removed integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permiso denegado: solo administradores configuran depósitos';
  END IF;
  SELECT count(*) INTO v_occupied FROM warehouse_positions
   WHERE warehouse_id = p_warehouse_id AND rua = upper(trim(p_rua))
     AND (p_block_from IS NULL OR bloco >= p_block_from) AND (p_block_to IS NULL OR bloco <= p_block_to)
     AND (status IN ('occupied', 'reserved') OR pallet_id IS NOT NULL);
  IF v_occupied > 0 THEN
    RAISE EXCEPTION 'Hay % posiciones ocupadas o reservadas en ese tramo; libérelas antes de eliminar', v_occupied;
  END IF;
  DELETE FROM warehouse_positions
   WHERE warehouse_id = p_warehouse_id AND rua = upper(trim(p_rua))
     AND (p_block_from IS NULL OR bloco >= p_block_from) AND (p_block_to IS NULL OR bloco <= p_block_to);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN jsonb_build_object('removed', v_removed);
END;
$$;

-- Bloquear / liberar várias posições livres de uma vez (sem pallet)
CREATE OR REPLACE FUNCTION public.set_positions_blocked(p_ids text[], p_blocked boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changed integer;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  UPDATE warehouse_positions
     SET status = CASE WHEN p_blocked THEN 'blocked'::cell_status ELSE 'free'::cell_status END
   WHERE id = ANY(p_ids) AND pallet_id IS NULL
     AND status = CASE WHEN p_blocked THEN 'free'::cell_status ELSE 'blocked'::cell_status END;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('changed', v_changed);
END;
$$;

-- Ocupação por depósito (painel)
CREATE OR REPLACE FUNCTION public.warehouse_occupancy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid()) THEN
    COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.code), '[]'::jsonb) ELSE '[]'::jsonb END
  FROM (
    SELECT w.id, w.code, w.name, w.active,
           count(p.*) AS total,
           count(p.*) FILTER (WHERE p.status = 'occupied') AS occupied,
           count(p.*) FILTER (WHERE p.status = 'free') AS free,
           count(p.*) FILTER (WHERE p.status = 'blocked') AS blocked,
           count(p.*) FILTER (WHERE p.status = 'reserved') AS reserved
      FROM warehouses w LEFT JOIN warehouse_positions p ON p.warehouse_id = w.id
     GROUP BY w.id
  ) x
$$;

REVOKE EXECUTE ON FUNCTION public.generate_positions(uuid, text, integer, integer, integer, text, numeric, integer, cell_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_positions(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_positions_blocked(text[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.warehouse_occupancy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_positions(uuid, text, integer, integer, integer, text, numeric, integer, cell_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_positions(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_positions_blocked(text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_occupancy() TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouses;
EXCEPTION WHEN others THEN NULL; END $$;

-- ===== 20261017100000_seguranca.sql =====
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

-- ===== 20261017110000_operacao_v2.sql =====
-- =====================================================================
-- StockFlex — operação v2 (17/10/2026)
-- * Ingresso recusa contrato vencido e cliente inativo
-- * Cancelar movimento fecha a solicitação do cliente quando nada mais pende
-- * Saída cancela pendentes do pallet e fecha a solicitação de retirada
-- * Solicitações do cliente processadas pela equipe numa só transação
-- * Base de prospectos: dados anônimos não sobrescrevem um contato existente
-- =====================================================================

CREATE OR REPLACE FUNCTION public.register_pallet_entry(
  p_cliente_id uuid, p_contrato_id uuid, p_sku text, p_descricao text,
  p_lote text DEFAULT NULL, p_quantidade integer DEFAULT NULL,
  p_peso numeric DEFAULT 0, p_valor_declarado numeric DEFAULT 0,
  p_localizacao text DEFAULT '', p_localizacao2 text DEFAULT NULL,
  p_largo numeric DEFAULT NULL, p_ancho numeric DEFAULT NULL, p_alto numeric DEFAULT NULL,
  p_seguro boolean DEFAULT false, p_pallet_duplo boolean DEFAULT false,
  p_position_id text DEFAULT NULL, p_position2_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet_id uuid;
  v_movement_id uuid;
  v_now timestamptz := now();
  v_contract contracts%ROWTYPE;
  v_sku text;
  v_pos1 text;
  v_pos2 text;
  v_count integer := 0;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden registrar pallets';
  END IF;
  IF p_peso IS NULL OR p_peso <= 0 THEN
    RAISE EXCEPTION 'El peso debe ser mayor que cero';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado';
  END IF;
  IF v_contract.status <> 'ativo' THEN
    RAISE EXCEPTION 'El contrato % no está activo (estado: %)', v_contract.numero, v_contract.status;
  END IF;
  IF v_contract.data_termino < sf_today() THEN
    RAISE EXCEPTION 'El contrato % venció el %', v_contract.numero, to_char(v_contract.data_termino, 'DD/MM/YYYY');
  END IF;
  IF NOT (SELECT ativo FROM clients WHERE id = p_cliente_id) THEN
    RAISE EXCEPTION 'El cliente está inactivo';
  END IF;
  IF v_contract.cliente_id <> p_cliente_id THEN
    RAISE EXCEPTION 'El contrato % no pertenece al cliente informado', v_contract.numero;
  END IF;

  v_sku := NULLIF(trim(COALESCE(p_sku, '')), '');
  IF v_sku IS NULL THEN
    v_sku := next_pallet_code();
  ELSIF EXISTS (SELECT 1 FROM pallets WHERE sku = v_sku AND status <> 'expedido') THEN
    RAISE EXCEPTION 'Ya existe un pallet activo con el código %', v_sku;
  END IF;

  v_pos1 := NULLIF(COALESCE(p_position_id, NULLIF(p_localizacao, '')), '');
  v_pos2 := NULLIF(COALESCE(p_position2_id, p_localizacao2), '');
  IF p_pallet_duplo AND v_pos1 IS NOT NULL AND v_pos2 IS NULL THEN
    v_pos2 := sf_contiguous_position(v_pos1);
    IF v_pos2 IS NULL THEN
      RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', v_pos1;
    END IF;
  END IF;

  INSERT INTO pallets (
    cliente_id, contrato_id, sku, descricao, lote, quantidade,
    peso, valor_declarado, status, localizacao, localizacao2,
    data_entrada, ultima_movimentacao, largo, ancho, alto,
    seguro, pallet_duplo
  ) VALUES (
    p_cliente_id, p_contrato_id, v_sku, COALESCE(p_descricao, ''), p_lote, p_quantidade,
    p_peso, COALESCE(p_valor_declarado, 0),
    CASE WHEN v_pos1 IS NULL THEN 'aguardando_entrada'::pallet_status ELSE 'armazenado'::pallet_status END,
    COALESCE(v_pos1, ''), v_pos2,
    sf_today(), v_now, p_largo, p_ancho, p_alto,
    COALESCE(p_seguro, false), COALESCE(p_pallet_duplo, false)
  ) RETURNING id INTO v_pallet_id;

  IF v_pos1 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos1, v_pallet_id, p_cliente_id, p_peso);
    v_count := 1;
  END IF;
  IF v_pos2 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos2, v_pallet_id, p_cliente_id, NULL);
    v_count := v_count + 1;
  END IF;

  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final
  ) VALUES (
    'entrada', v_now, COALESCE(p_operador, ''), p_operador_id, p_cliente_id, p_contrato_id,
    v_pallet_id, 'Exterior', COALESCE(v_pos1, ''), 'Ingreso inicial',
    CASE WHEN v_pos1 IS NULL THEN 'solicitada'::movement_status ELSE 'executada'::movement_status END,
    p_peso, p_peso
  ) RETURNING id INTO v_movement_id;

  IF v_count > 0 THEN
    UPDATE contracts SET posicoes_ocupadas = posicoes_ocupadas + v_count WHERE id = p_contrato_id;
  END IF;

  RETURN jsonb_build_object('pallet_id', v_pallet_id, 'movement_id', v_movement_id, 'sku', v_sku,
                            'localizacao', v_pos1, 'localizacao2', v_pos2);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_movement(p_movement_id uuid, p_motivo text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov movements%ROWTYPE;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  SELECT * INTO v_mov FROM movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;
  IF v_mov.status NOT IN ('solicitada', 'aprovada') THEN
    RAISE EXCEPTION 'Solo se pueden cancelar movimientos pendientes (estado: %)', v_mov.status;
  END IF;
  UPDATE movements
     SET status = 'cancelada',
         motivo = CASE WHEN COALESCE(trim(p_motivo), '') = '' THEN motivo
                       ELSE trim(both ' ' FROM motivo || ' | Cancelado: ' || trim(p_motivo)) END
   WHERE id = p_movement_id;
  -- Solicitação do cliente ligada a este movimento: fecha se não sobrar nada pendente
  UPDATE client_requests r
     SET status = CASE WHEN EXISTS (SELECT 1 FROM movements m WHERE m.id = ANY(r.movimento_ids) AND m.status = 'executada')
                       THEN 'executado'::request_status ELSE 'cancelado'::request_status END
   WHERE p_movement_id = ANY(r.movimento_ids) AND r.status IN ('pendente', 'separado')
     AND NOT EXISTS (SELECT 1 FROM movements m WHERE m.id = ANY(r.movimento_ids) AND m.status IN ('solicitada', 'aprovada'));
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_pallet_exit(
  p_pallet_id uuid, p_motivo text DEFAULT '', p_autorizado_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL,
  p_peso_final numeric DEFAULT 0, p_destino text DEFAULT 'Exterior'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_freed integer := 0;
  v_movement_id uuid;
  v_origem text;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden registrar salidas';
  END IF;
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet no encontrado';
  END IF;
  IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
    RAISE EXCEPTION 'El pallet % no puede salir (estado: %)', v_pallet.sku, v_pallet.status;
  END IF;
  IF p_peso_final < 0 THEN
    RAISE EXCEPTION 'El peso final no puede ser negativo';
  END IF;
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de la salida es obligatorio';
  END IF;
  IF p_autorizado_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM authorized_contacts
     WHERE id::text = p_autorizado_id AND cliente_id = v_pallet.cliente_id AND ativo
  ) THEN
    RAISE EXCEPTION 'El autorizado no pertenece a este cliente o está inactivo';
  END IF;

  v_origem := concat_ws(' / ', NULLIF(v_pallet.localizacao, ''), v_pallet.localizacao2);
  UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
   WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_freed = ROW_COUNT;
  UPDATE pallets
     SET status = 'expedido', localizacao = '', localizacao2 = NULL, ultima_movimentacao = v_now
   WHERE id = p_pallet_id;
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, autorizado_id
  ) VALUES (
    'saida', v_now, COALESCE(p_operador, ''), p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_origem, COALESCE(NULLIF(p_destino, ''), 'Exterior'), trim(p_motivo), 'executada',
    v_pallet.peso, COALESCE(NULLIF(p_peso_final, 0), v_pallet.peso), p_autorizado_id
  ) RETURNING id INTO v_movement_id;
  UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed)
   WHERE id = v_pallet.contrato_id;
  -- Movimentos pendentes deste pallet perdem sentido: saída pendente vira a executada, os demais são cancelados
  UPDATE client_requests r SET movimento_ids = array_append(COALESCE(r.movimento_ids, '{}'), v_movement_id)
   WHERE r.status IN ('pendente', 'separado') AND p_pallet_id = ANY(r.pallet_ids) AND r.tipo = 'coleta'
     AND NOT (v_movement_id = ANY(COALESCE(r.movimento_ids, '{}')));
  UPDATE movements SET status = 'cancelada', motivo = trim(both ' ' FROM motivo || ' | Cancelado: pallet ya salió')
   WHERE pallet_id = p_pallet_id AND status IN ('solicitada', 'aprovada') AND id <> v_movement_id;
  UPDATE client_requests r SET status = 'executado'
   WHERE r.status IN ('pendente', 'separado') AND p_pallet_id = ANY(r.pallet_ids) AND r.tipo = 'coleta'
     AND NOT EXISTS (
       SELECT 1 FROM unnest(r.pallet_ids) pid JOIN pallets p ON p.id = pid WHERE p.status <> 'expedido'
     );
  RETURN jsonb_build_object('success', true, 'positions_freed', v_freed, 'movement_id', v_movement_id);
END;
$$;

-- ---------- Processar solicitação do cliente ----------
-- coleta (retirada): cria um movimento de saída pendente por pallet e reserva os pallets
-- ingreso (envio de mercadoria): marca como separado (a entrada é registrada na operação)
-- acesso (visita): marca como executado
CREATE OR REPLACE FUNCTION public.process_client_request(p_request_id uuid, p_action text, p_motivo text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req client_requests%ROWTYPE;
  v_ids uuid[] := '{}';
  v_pallet pallets%ROWTYPE;
  v_mid uuid;
  v_user_name text;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  SELECT * INTO v_req FROM client_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  SELECT nome INTO v_user_name FROM profiles WHERE id = auth.uid();

  IF p_action = 'cancelar' THEN
    IF v_req.status NOT IN ('pendente', 'separado') THEN
      RAISE EXCEPTION 'La solicitud ya está %', v_req.status;
    END IF;
    UPDATE movements SET status = 'cancelada', motivo = trim(both ' ' FROM motivo || ' | Solicitud cancelada: ' || COALESCE(p_motivo, ''))
     WHERE id = ANY(COALESCE(v_req.movimento_ids, '{}')) AND status IN ('solicitada', 'aprovada');
    UPDATE pallets SET status = 'armazenado'
     WHERE id = ANY(v_req.pallet_ids) AND status = 'reservado_saida';
    UPDATE client_requests SET status = 'cancelado', operador_id = auth.uid()::text,
           observacoes = trim(both ' ' FROM COALESCE(observacoes, '') || ' | Cancelada: ' || COALESCE(p_motivo, ''))
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'cancelado');
  END IF;

  IF p_action <> 'procesar' THEN
    RAISE EXCEPTION 'Acción inválida';
  END IF;
  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'La solicitud ya está %', v_req.status;
  END IF;

  IF v_req.tipo = 'coleta' THEN
    IF cardinality(v_req.pallet_ids) = 0 THEN RAISE EXCEPTION 'La solicitud no tiene pallets'; END IF;
    FOR v_pallet IN SELECT * FROM pallets WHERE id = ANY(v_req.pallet_ids) FOR UPDATE LOOP
      IF v_pallet.cliente_id <> v_req.cliente_id THEN
        RAISE EXCEPTION 'El pallet % no pertenece al cliente', v_pallet.sku;
      END IF;
      IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
        RAISE EXCEPTION 'El pallet % no está en depósito (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      INSERT INTO movements (tipo, operador, operador_id, cliente_id, contrato_id, pallet_id, origem_local, destino_local, motivo, status, peso_inicial, peso_final)
      VALUES ('saida', COALESCE(v_user_name, ''), auth.uid()::text, v_pallet.cliente_id, v_pallet.contrato_id, v_pallet.id,
              concat_ws(' / ', NULLIF(v_pallet.localizacao, ''), v_pallet.localizacao2), 'Exterior', 'Retiro solicitado por el cliente', 'solicitada',
              v_pallet.peso, v_pallet.peso)
      RETURNING id INTO v_mid;
      v_ids := array_append(v_ids, v_mid);
      UPDATE pallets SET status = 'reservado_saida' WHERE id = v_pallet.id;
    END LOOP;
    UPDATE client_requests SET status = 'separado', operador_id = auth.uid()::text,
           movimento_ids = COALESCE(movimento_ids, '{}') || v_ids
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'separado', 'movement_ids', to_jsonb(v_ids));
  ELSIF v_req.tipo = 'ingreso' THEN
    UPDATE client_requests SET status = 'separado', operador_id = auth.uid()::text WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'separado');
  ELSE
    UPDATE client_requests SET status = 'executado', operador_id = auth.uid()::text WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'executado');
  END IF;
END;
$$;

-- Ingreso agendado pelo cliente: fecha quando a equipe confirma a chegada
CREATE OR REPLACE FUNCTION public.close_client_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  UPDATE client_requests SET status = 'executado', operador_id = auth.uid()::text
   WHERE id = p_request_id AND status IN ('pendente', 'separado');
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada o ya cerrada'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_client_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_client_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_client_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_client_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_lead(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p ->> 'email', '')));
  v_name text := left(trim(COALESCE(p ->> 'name', '')), 120);
  v_company text := left(trim(COALESCE(p ->> 'company', '')), 160);
  v_phone text := left(trim(COALESCE(p ->> 'phone', '')), 40);
  v_tax text := left(trim(COALESCE(p ->> 'taxId', '')), 40);
  v_kind text := COALESCE(p ->> 'kind', 'contact');
  v_lang text := CASE WHEN p ->> 'lang' = 'pt' THEN 'pt' ELSE 'es' END;
  v_consent boolean := COALESCE((p ->> 'consent')::boolean, false);
  v_details jsonb := CASE WHEN jsonb_typeof(p -> 'details') = 'object' THEN p -> 'details' ELSE NULL END;
  v_eng jsonb := CASE WHEN jsonb_typeof(p -> 'engagement') = 'object' THEN p -> 'engagement' ELSE NULL END;
  v_visitor text := left(COALESCE(p ->> 'visitorId', ''), 64);
  v_source text := left(COALESCE(v_eng ->> 'source', ''), 300);
  v_score integer;
  v_contact public.marketing_contacts%ROWTYPE;
  v_existing boolean;
  v_lead_id uuid;
  v_pos integer;
  v_interest text;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 200 THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Nome obrigatório';
  END IF;
  IF v_kind NOT IN ('contact', 'quote', 'simulation', 'proposal', 'structures') THEN
    RAISE EXCEPTION 'Tipo de contato inválido';
  END IF;
  IF pg_column_size(p) > 40000 THEN
    RAISE EXCEPTION 'Dados grandes demais';
  END IF;

  v_score := lead_score(v_kind, v_details, v_eng, v_consent);
  BEGIN v_pos := COALESCE((v_details ->> 'totalPositions')::integer, 0); EXCEPTION WHEN others THEN v_pos := 0; END;
  v_interest := CASE v_kind WHEN 'structures' THEN 'estruturas' WHEN 'contact' THEN NULL ELSE 'posicoes' END;

  SELECT EXISTS (SELECT 1 FROM marketing_contacts WHERE email = v_email) INTO v_existing;

  INSERT INTO marketing_contacts AS c (
    email, name, company, phone, tax_id, lang, consent_marketing, consent_at,
    first_source, last_source, score, interests, lead_count, max_positions,
    last_kind, last_proposal_number, last_total_monthly, first_seen_at, last_seen_at
  ) VALUES (
    v_email, v_name, v_company, v_phone, v_tax, v_lang, v_consent, CASE WHEN v_consent THEN now() END,
    v_source, v_source, v_score, CASE WHEN v_interest IS NULL THEN '{}' ELSE ARRAY[v_interest] END, 1, v_pos,
    v_kind, p ->> 'proposalNumber', NULLIF(v_details ->> 'totalMonthly', '')::numeric,
    COALESCE(NULLIF(v_eng ->> 'firstVisit', '')::timestamptz, now()), now()
  )
  ON CONFLICT (email) DO UPDATE SET
    -- Dados vindos do site só preenchem o que está vazio (não sobrescrevem o cadastro)
    name = CASE WHEN c.name = '' THEN EXCLUDED.name ELSE c.name END,
    company = CASE WHEN c.company = '' THEN EXCLUDED.company ELSE c.company END,
    phone = CASE WHEN c.phone = '' THEN EXCLUDED.phone ELSE c.phone END,
    tax_id = CASE WHEN c.tax_id = '' THEN EXCLUDED.tax_id ELSE c.tax_id END,
    lang = EXCLUDED.lang,
    consent_marketing = c.consent_marketing OR EXCLUDED.consent_marketing,
    consent_at = COALESCE(c.consent_at, EXCLUDED.consent_at),
    last_source = CASE WHEN EXCLUDED.last_source <> '' THEN EXCLUDED.last_source ELSE c.last_source END,
    -- Volta ao site e repete o interesse: soma 5 pontos por nova interação
    -- Volta ao site: +5 no máximo uma vez a cada 6 horas
    score = LEAST(100, GREATEST(c.score, EXCLUDED.score) + CASE WHEN c.last_seen_at < now() - interval '6 hours' THEN 5 ELSE 0 END),
    interests = (SELECT ARRAY(SELECT DISTINCT unnest(c.interests || EXCLUDED.interests))),
    lead_count = c.lead_count + 1,
    max_positions = GREATEST(c.max_positions, EXCLUDED.max_positions),
    last_kind = EXCLUDED.last_kind,
    last_proposal_number = COALESCE(EXCLUDED.last_proposal_number, c.last_proposal_number),
    last_total_monthly = COALESCE(EXCLUDED.last_total_monthly, c.last_total_monthly),
    last_seen_at = now(),
    updated_at = now()
  RETURNING * INTO v_contact;

  -- Simulação salva automaticamente: atualiza a da última meia hora em vez de criar outra
  IF v_kind = 'simulation' THEN
    UPDATE marketing_leads
       SET details = v_details, engagement = v_eng, score = v_score, updated_at = now()
     WHERE id = (SELECT id FROM marketing_leads
                  WHERE contact_id = v_contact.id AND kind = 'simulation'
                    AND updated_at > now() - interval '30 minutes'
                  ORDER BY updated_at DESC LIMIT 1)
     RETURNING id INTO v_lead_id;
    IF v_lead_id IS NOT NULL THEN
      -- Não conta como nova interação
      UPDATE marketing_contacts SET lead_count = lead_count - 1,
             score = LEAST(100, GREATEST(score - 5, v_score))
       WHERE id = v_contact.id AND v_existing;
      RETURN jsonb_build_object('ok', true, 'updated', true);
    END IF;
  END IF;

  INSERT INTO marketing_leads (contact_id, kind, message, pallet_quantity, proposal_number, details, engagement, score, visitor_id, page, lang)
  VALUES (v_contact.id, v_kind, left(COALESCE(p ->> 'message', ''), 4000), left(COALESCE(p ->> 'palletQuantity', ''), 40),
          left(p ->> 'proposalNumber', 40), v_details, v_eng, v_score, NULLIF(v_visitor, ''), left(p ->> 'page', 300), v_lang);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ===== 20261017120000_facturacion.sql =====
-- =====================================================================
-- Facturación v2 — StockFlex
-- Regras aprovadas (17/10/2026):
--  * Almacenamiento: posiciones CONTRATADAS × precio, cobrado POR ADELANTADO
--    (la factura del mes M trae el almacenamiento de M).
--  * Extras del mes anterior (M-1) en la misma factura: posiciones excedentes
--    (pico diario − contratadas), movimientos extra, seguro, sobremedida y
--    servicios extra aprobados.
--  * Primer y último mes proporcionales a los días de contrato.
--  * 1 movimiento incluido por posición/mes, no acumulable; entrada y salida
--    consumen el del mes; los adicionales se cobran a preco_mov_extra.
--  * Precios con IVA incluido (IVA 10% contenido = total / 11).
--  * La factura electrónica (SIFEN) la emite otro sistema: aquí queda la
--    pre-factura con número interno y se registra el número/CDC fiscal.
--  * Una factura emitida no se edita: se corrige con nota de crédito.
-- =====================================================================

-- ---------- Configuración en el contrato ----------
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS cobrar_sobremedida boolean NOT NULL DEFAULT false;
ALTER TABLE public.extra_costs ADD COLUMN IF NOT EXISTS invoice_id uuid;

-- ---------- Tablas ----------
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE,                                   -- FAC-2026-00001 / NC-2026-00001 (al emitir)
  kind text NOT NULL DEFAULT 'factura' CHECK (kind IN ('factura','nota_credito')),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  contrato_id uuid REFERENCES public.contracts(id) ON DELETE RESTRICT,
  periodo text NOT NULL CHECK (periodo ~ '^\d{4}-\d{2}$'),   -- mes del almacenamiento
  periodo_uso text,                                     -- mes de los extras (M-1)
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','emitida','anulada')),
  fecha_emision date,
  fecha_vencimiento date,
  moneda text NOT NULL DEFAULT 'USD',
  total numeric(14,2) NOT NULL DEFAULT 0,
  factura_origen_id uuid REFERENCES public.billing_invoices(id) ON DELETE RESTRICT,
  motivo text NOT NULL DEFAULT '',
  notas text NOT NULL DEFAULT '',
  fiscal_numero text NOT NULL DEFAULT '',               -- 001-001-0000123 (SIFEN)
  fiscal_cdc text NOT NULL DEFAULT '',
  legado boolean NOT NULL DEFAULT false,
  calculado_at timestamptz,
  emitida_at timestamptz,
  emitida_por uuid,
  anulada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_invoices_cliente_idx ON public.billing_invoices (cliente_id, periodo);
-- Una sola factura vigente por contrato y mes
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_unique_periodo
  ON public.billing_invoices (contrato_id, periodo)
  WHERE kind = 'factura' AND status <> 'anulada' AND NOT legado;

CREATE TABLE IF NOT EXISTS public.billing_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 0,
  categoria text NOT NULL CHECK (categoria IN ('almacenamiento','recargo','excedente','movimientos','seguro','sobremedida','servicios','ajuste','credito','legado')),
  descripcion text NOT NULL,
  detalle text NOT NULL DEFAULT '',          -- "10 posiciones × US$ 8,00 · 17/31 días"
  periodo text,
  cantidad numeric(14,4) NOT NULL DEFAULT 1,
  unidad text NOT NULL DEFAULT '',
  precio numeric(14,4) NOT NULL DEFAULT 0,
  importe numeric(14,2) NOT NULL,
  base jsonb NOT NULL DEFAULT '{}'::jsonb,   -- datos para el detalle (por pallet, días, etc.)
  manual boolean NOT NULL DEFAULT false,
  extra_cost_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_lines_invoice_idx ON public.billing_invoice_lines (invoice_id, orden);

CREATE TABLE IF NOT EXISTS public.billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recibo text NOT NULL,                      -- REC-2026-00001 (agrupa la imputación)
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.billing_invoices(id) ON DELETE RESTRICT,   -- null = pago a cuenta
  fecha date NOT NULL,
  importe numeric(14,2) NOT NULL CHECK (importe > 0),
  metodo text NOT NULL DEFAULT 'transferencia' CHECK (metodo IN ('transferencia','efectivo','cheque','tarjeta','deposito','otro')),
  referencia text NOT NULL DEFAULT '',
  comprobante text,                          -- ruta en storage "documents"
  notas text NOT NULL DEFAULT '',
  anulado boolean NOT NULL DEFAULT false,
  anulado_motivo text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_payments_cliente_idx ON public.billing_payments (cliente_id, fecha);
CREATE INDEX IF NOT EXISTS billing_payments_invoice_idx ON public.billing_payments (invoice_id);

CREATE SEQUENCE IF NOT EXISTS public.billing_fac_seq;
CREATE SEQUENCE IF NOT EXISTS public.billing_nc_seq;
CREATE SEQUENCE IF NOT EXISTS public.billing_rec_seq;

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestion lee facturas" ON public.billing_invoices;
CREATE POLICY "Gestion lee facturas" ON public.billing_invoices FOR SELECT TO authenticated
  USING (is_admin_or_financeiro(auth.uid()));
DROP POLICY IF EXISTS "Cliente lee sus facturas" ON public.billing_invoices;
CREATE POLICY "Cliente lee sus facturas" ON public.billing_invoices FOR SELECT TO authenticated
  USING (status <> 'borrador' AND cliente_id::text = get_user_client_id(auth.uid()));
DROP POLICY IF EXISTS "Gestion edita notas" ON public.billing_invoices;
CREATE POLICY "Gestion edita notas" ON public.billing_invoices FOR UPDATE TO authenticated
  USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));

DROP POLICY IF EXISTS "Lee lineas de facturas visibles" ON public.billing_invoice_lines;
CREATE POLICY "Lee lineas de facturas visibles" ON public.billing_invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.billing_invoices i WHERE i.id = invoice_id
                 AND (is_admin_or_financeiro(auth.uid())
                      OR (i.status <> 'borrador' AND i.cliente_id::text = get_user_client_id(auth.uid())))));

DROP POLICY IF EXISTS "Gestion lee pagos" ON public.billing_payments;
CREATE POLICY "Gestion lee pagos" ON public.billing_payments FOR SELECT TO authenticated
  USING (is_admin_or_financeiro(auth.uid()));
DROP POLICY IF EXISTS "Cliente lee sus pagos" ON public.billing_payments;
CREATE POLICY "Cliente lee sus pagos" ON public.billing_payments FOR SELECT TO authenticated
  USING (NOT anulado AND cliente_id::text = get_user_client_id(auth.uid()));

-- Protege lo emitido: solo notas/datos fiscales cambian por UPDATE directo
CREATE OR REPLACE FUNCTION public.billing_protect_invoice()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF current_setting('sf.billing_rpc', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     OR NEW.periodo IS DISTINCT FROM OLD.periodo OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.fecha_emision IS DISTINCT FROM OLD.fecha_emision THEN
    RAISE EXCEPTION 'Use las acciones de facturación para cambiar estado o importes';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_billing_protect_invoice ON public.billing_invoices;
CREATE TRIGGER trg_billing_protect_invoice BEFORE UPDATE ON public.billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.billing_protect_invoice();

-- ---------- Ayudas ----------
CREATE OR REPLACE FUNCTION public.sf_money(x numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'US$ ' || translate(to_char(round(coalesce(x,0), 2), 'FM999,999,990.00'), ',.', '.,')
$$;

CREATE OR REPLACE FUNCTION public.sf_num(x numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN x = trunc(x) THEN trunc(x)::text
              ELSE translate(rtrim(rtrim(to_char(x, 'FM999,999,990.00'), '0'), '.'), ',.', '.,') END
$$;

CREATE OR REPLACE FUNCTION public.sf_month_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])
           [split_part(p,'-',2)::int] || ' ' || split_part(p,'-',1)
$$;

CREATE OR REPLACE FUNCTION public.sf_prev_period(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(to_date(p || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM')
$$;

-- Fecha de salida efectiva de cada pallet (última salida ejecutada, hora de Asunción)
CREATE OR REPLACE FUNCTION public.sf_pallet_exit_date(p_pallet_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT max((m.data_hora AT TIME ZONE 'America/Asuncion')::date)
  FROM movements m WHERE m.pallet_id = p_pallet_id AND m.tipo = 'saida' AND m.status = 'executada'
$$;

-- ---------- Cálculo (no escribe nada) ----------
-- Devuelve las líneas de la factura del contrato para el período (almacenamiento M + extras M-1)
CREATE OR REPLACE FUNCTION public.billing_compute(p_contrato_id uuid, p_periodo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  c record;
  m_start date := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  m_end date := (to_date(p_periodo || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  u_per text := sf_prev_period(p_periodo);
  u_start date := to_date(sf_prev_period(p_periodo) || '-01', 'YYYY-MM-DD');
  u_end date := (to_date(p_periodo || '-01', 'YYYY-MM-DD') - 1);
  dim int; dum int;
  a_from date; a_to date; days int;
  ua_from date; ua_to date;
  lines jsonb := '[]'::jsonb;
  ord int := 0;
  amt numeric; peak int; peak_day date; qty numeric; r record; det jsonb; tot_mov int; tot_inc int; tot_extra int;
  mov_price numeric; extras_detail jsonb;
BEGIN
  SELECT * INTO c FROM contracts WHERE id = p_contrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato no encontrado'; END IF;
  dim := (m_end - m_start + 1);
  dum := (u_end - u_start + 1);
  mov_price := coalesce(nullif(c.preco_mov_extra, 0), 4);

  -- 1) Almacenamiento del mes M (adelantado), proporcional a días de contrato
  a_from := greatest(m_start, c.data_inicio);
  a_to := least(m_end, coalesce(c.data_termino, m_end));
  IF c.status NOT IN ('rascunho','suspenso') AND a_to >= a_from AND c.posicoes_contratadas > 0 THEN
    days := a_to - a_from + 1;
    amt := round(c.posicoes_contratadas * c.preco_por_posicao * days / dim, 2);
    ord := ord + 1;
    lines := lines || jsonb_build_object(
      'orden', ord, 'categoria', 'almacenamiento', 'periodo', p_periodo,
      'descripcion', 'Almacenamiento ' || sf_month_name(p_periodo) || ' (adelantado)',
      'detalle', c.posicoes_contratadas || ' posiciones contratadas × ' || sf_money(c.preco_por_posicao)
                 || CASE WHEN days < dim THEN ' · proporcional ' || days || '/' || dim || ' días (' || to_char(a_from,'DD/MM') || '–' || to_char(a_to,'DD/MM') || ')' ELSE '' END,
      'cantidad', c.posicoes_contratadas, 'unidad', 'posición', 'precio', c.preco_por_posicao, 'importe', amt,
      'base', jsonb_build_object('dias', days, 'dias_mes', dim, 'desde', a_from, 'hasta', a_to));
    IF coalesce(c.recargo_por_posicao, 0) > 0 THEN
      amt := round(c.posicoes_contratadas * c.recargo_por_posicao * days / dim, 2);
      ord := ord + 1;
      lines := lines || jsonb_build_object(
        'orden', ord, 'categoria', 'recargo', 'periodo', p_periodo,
        'descripcion', coalesce(nullif(c.recargo_descricao, ''), 'Recargo por plazo/cantidad') || ' ' || sf_month_name(p_periodo),
        'detalle', c.posicoes_contratadas || ' posiciones × ' || sf_money(c.recargo_por_posicao)
                   || CASE WHEN days < dim THEN ' · proporcional ' || days || '/' || dim || ' días' ELSE '' END,
        'cantidad', c.posicoes_contratadas, 'unidad', 'posición', 'precio', c.recargo_por_posicao, 'importe', amt,
        'base', jsonb_build_object('dias', days, 'dias_mes', dim));
    END IF;
  END IF;

  -- 2) Extras del mes anterior (solo si el contrato estaba vigente ese mes)
  ua_from := greatest(u_start, c.data_inicio);
  ua_to := least(u_end, coalesce(c.data_termino, u_end));
  IF ua_to >= ua_from THEN

    -- Presencia diaria de los pallets del contrato en M-1
    IF to_regclass('pg_temp._sf_presence') IS NULL THEN
      CREATE TEMP TABLE _sf_presence (pallet_id uuid, sku text, d date, pos int, valor numeric, seguro boolean, vol numeric) ON COMMIT DROP;
    END IF;
    TRUNCATE _sf_presence;
    INSERT INTO _sf_presence
    SELECT p.id, p.sku, d::date, CASE WHEN p.pallet_duplo THEN 2 ELSE 1 END,
           coalesce(p.valor_declarado, 0), coalesce(p.seguro, false),
           coalesce(p.largo,0) * coalesce(p.ancho,0) * coalesce(p.alto,0) / 1000000.0
    FROM pallets p
    CROSS JOIN LATERAL (SELECT sf_pallet_exit_date(p.id) AS ex) e
    CROSS JOIN LATERAL generate_series(greatest(ua_from, p.data_entrada), least(ua_to, coalesce(e.ex, ua_to)), interval '1 day') d
    WHERE p.contrato_id = c.id AND p.status <> 'aguardando_entrada' AND p.data_entrada IS NOT NULL
      AND (p.status <> 'expedido' OR e.ex IS NOT NULL);

    -- 2a) Posiciones excedentes: pico diario − contratadas
    SELECT s.d, sum(s.pos) INTO peak_day, peak FROM _sf_presence s GROUP BY s.d ORDER BY sum(s.pos) DESC, s.d LIMIT 1;
    IF coalesce(peak, 0) > c.posicoes_contratadas THEN
      qty := peak - c.posicoes_contratadas;
      amt := round(qty * (c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0)), 2);
      ord := ord + 1;
      lines := lines || jsonb_build_object(
        'orden', ord, 'categoria', 'excedente', 'periodo', u_per,
        'descripcion', 'Posiciones excedentes ' || sf_month_name(u_per),
        'detalle', 'Pico de ' || peak || ' posiciones el ' || to_char(peak_day, 'DD/MM') || ' (contratadas ' || c.posicoes_contratadas || ') · '
                   || sf_num(qty) || ' × ' || sf_money(c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0)),
        'cantidad', qty, 'unidad', 'posición', 'precio', c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0), 'importe', amt,
        'base', jsonb_build_object('pico', peak, 'dia_pico', peak_day, 'contratadas', c.posicoes_contratadas));
    END IF;

    -- 2b) Movimientos: 1 incluido por posición del pallet en el mes; entrada/salida lo consumen
    tot_mov := 0; tot_inc := 0; tot_extra := 0; extras_detail := '[]'::jsonb;
    FOR r IN
      SELECT p.id, p.sku, CASE WHEN p.pallet_duplo THEN 2 ELSE 1 END AS inc,
             count(m.id) FILTER (WHERE m.tipo = 'entrada') AS ent,
             count(m.id) FILTER (WHERE m.tipo = 'saida') AS sal,
             count(m.id) FILTER (WHERE m.tipo = 'transferencia') AS tra,
             count(m.id) AS n
      FROM pallets p
      JOIN movements m ON m.pallet_id = p.id AND m.status = 'executada'
           AND m.tipo IN ('entrada','saida','transferencia') AND NOT coalesce(m.interna, false)
           AND (m.data_hora AT TIME ZONE 'America/Asuncion')::date BETWEEN ua_from AND ua_to
      WHERE p.contrato_id = c.id
      GROUP BY p.id, p.sku, p.pallet_duplo
    LOOP
      tot_mov := tot_mov + r.n;
      tot_inc := tot_inc + least(r.n, r.inc);
      IF r.n > r.inc THEN
        tot_extra := tot_extra + (r.n - r.inc);
        extras_detail := extras_detail || jsonb_build_object('sku', r.sku, 'entradas', r.ent, 'salidas', r.sal, 'transferencias', r.tra,
                                                             'incluidos', r.inc, 'extra', r.n - r.inc);
      END IF;
    END LOOP;
    IF tot_extra > 0 THEN
      ord := ord + 1;
      lines := lines || jsonb_build_object(
        'orden', ord, 'categoria', 'movimientos', 'periodo', u_per,
        'descripcion', 'Movimientos extra ' || sf_month_name(u_per),
        'detalle', tot_mov || ' movimientos realizados, ' || tot_inc || ' incluidos · ' || tot_extra || ' extra × ' || sf_money(mov_price),
        'cantidad', tot_extra, 'unidad', 'movimiento', 'precio', mov_price, 'importe', round(tot_extra * mov_price, 2),
        'base', jsonb_build_object('realizados', tot_mov, 'incluidos', tot_inc, 'extra', tot_extra, 'pallets', extras_detail));
    END IF;

    -- 2c) Seguro: valor declarado × % × días presentes / días del mes
    IF coalesce(c.percentual_seguro, 0) > 0 THEN
      SELECT round(sum(s.valor) / dum, 2), count(DISTINCT s.pallet_id) INTO amt, qty
      FROM _sf_presence s WHERE s.seguro AND s.valor > 0;
      IF coalesce(amt, 0) > 0 THEN
        ord := ord + 1;
        lines := lines || jsonb_build_object(
          'orden', ord, 'categoria', 'seguro', 'periodo', u_per,
          'descripcion', 'Seguro de mercadería ' || sf_month_name(u_per),
          'detalle', 'Valor declarado (promedio diario del mes) ' || sf_money(amt) || ' × ' || sf_num(c.percentual_seguro) || '% · ' || sf_num(qty) || ' pallets',
          'cantidad', 1, 'unidad', 'mes', 'precio', round(amt * c.percentual_seguro / 100, 2),
          'importe', round(amt * c.percentual_seguro / 100, 2),
          'base', jsonb_build_object('valor_promedio', amt, 'porcentaje', c.percentual_seguro, 'pallets', qty));
      END IF;
    END IF;

    -- 2d) Sobremedida (si el contrato lo prevé): precio × (vol/1,8 − 1) + US$ 1,00, proporcional a días
    IF c.cobrar_sobremedida THEN
      SELECT round(sum((c.preco_por_posicao * (s.vol / 1.8 - 1) + 1) / dum), 2), count(DISTINCT s.pallet_id)
        INTO amt, qty FROM _sf_presence s WHERE s.vol > 1.8001;
      IF coalesce(amt, 0) > 0 THEN
        ord := ord + 1;
        lines := lines || jsonb_build_object(
          'orden', ord, 'categoria', 'sobremedida', 'periodo', u_per,
          'descripcion', 'Adicional por pallets sobremedida ' || sf_month_name(u_per),
          'detalle', sf_num(qty) || ' pallets mayores a 1,8 m³ · proporcional al volumen + US$ 1,00/pallet',
          'cantidad', qty, 'unidad', 'pallet', 'precio', round(amt / greatest(qty,1), 2), 'importe', amt,
          'base', jsonb_build_object('pallets', qty));
      END IF;
    END IF;
  END IF;

  -- 3) Servicios extra aprobados de M-1 (o anteriores) aún no facturados
  FOR r IN
    SELECT e.* FROM extra_costs e
    WHERE e.contrato_id = c.id AND e.status_aprovacao = 'aprovado' AND e.valor_total > 0
      AND e.invoice_id IS NULL AND e.competencia <= u_per
    ORDER BY e.competencia, e.created_at
  LOOP
    ord := ord + 1;
    lines := lines || jsonb_build_object(
      'orden', ord, 'categoria', 'servicios', 'periodo', r.competencia,
      'descripcion', CASE r.categoria::text WHEN 'frete' THEN 'Flete' WHEN 'embalagem' THEN 'Embalaje'
        WHEN 'movimentacao_extra' THEN 'Movimiento extra' WHEN 'pallet_extra' THEN 'Pallet extra'
        WHEN 'seguro_adicional' THEN 'Seguro adicional' WHEN 'mao_de_obra' THEN 'Mano de obra' ELSE 'Servicio' END || CASE WHEN coalesce(r.descricao,'') <> '' THEN ' — ' || r.descricao ELSE '' END,
      'detalle', sf_num(r.quantidade) || ' × ' || sf_money(r.valor_unitario) || ' · ' || sf_month_name(r.competencia),
      'cantidad', r.quantidade, 'unidad', 'servicio', 'precio', r.valor_unitario, 'importe', round(r.valor_total, 2),
      'extra_cost_id', r.id, 'base', '{}'::jsonb);
  END LOOP;

  RETURN jsonb_build_object('contrato_id', c.id, 'cliente_id', c.cliente_id, 'periodo', p_periodo, 'periodo_uso', u_per,
                            'lines', lines,
                            'total', (SELECT coalesce(sum((l->>'importe')::numeric), 0) FROM jsonb_array_elements(lines) l));
END $$;

-- Vencimiento: día del contrato en el mes M (si ya pasó al emitir, emisión + 5 días)
CREATE OR REPLACE FUNCTION public.billing_due_date(p_contrato_id uuid, p_periodo text, p_emision date)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT greatest(
    least(to_date(p_periodo || '-01', 'YYYY-MM-DD') + (coalesce((SELECT dia_vencimento FROM contracts WHERE id = p_contrato_id), 10) - 1),
          (to_date(p_periodo || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date),
    p_emision + 5)
$$;

-- ---------- Borradores ----------
CREATE OR REPLACE FUNCTION public.billing_generate_drafts(p_periodo text, p_contrato_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  c record; res jsonb; inv_id uuid; l jsonb;
  created int := 0; updated int := 0; skipped int := 0; empty int := 0;
  m_start date := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  m_end date := (to_date(p_periodo || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  u_start date := (to_date(p_periodo || '-01', 'YYYY-MM-DD') - interval '1 month')::date;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  IF p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Período inválido (use AAAA-MM)'; END IF;
  PERFORM set_config('sf.billing_rpc', 'on', true);

  FOR c IN
    SELECT * FROM contracts
    WHERE (p_contrato_id IS NULL OR id = p_contrato_id)
      AND status NOT IN ('rascunho')
      AND data_inicio <= m_end
      AND (data_termino IS NULL OR data_termino >= u_start)     -- vigente en M o en M-1
  LOOP
    SELECT id INTO inv_id FROM billing_invoices
      WHERE contrato_id = c.id AND periodo = p_periodo AND kind = 'factura' AND status <> 'anulada' AND NOT legado;
    IF inv_id IS NOT NULL AND (SELECT status FROM billing_invoices WHERE id = inv_id) = 'emitida' THEN
      skipped := skipped + 1; CONTINUE;
    END IF;
    res := billing_compute(c.id, p_periodo);
    IF jsonb_array_length(res->'lines') = 0 AND inv_id IS NULL THEN empty := empty + 1; CONTINUE; END IF;

    IF inv_id IS NULL THEN
      INSERT INTO billing_invoices (cliente_id, contrato_id, periodo, periodo_uso, status, calculado_at)
      VALUES (c.cliente_id, c.id, p_periodo, res->>'periodo_uso', 'borrador', now()) RETURNING id INTO inv_id;
      created := created + 1;
    ELSE
      DELETE FROM billing_invoice_lines WHERE invoice_id = inv_id AND NOT manual;
      UPDATE billing_invoices SET calculado_at = now(), periodo_uso = res->>'periodo_uso' WHERE id = inv_id;
      updated := updated + 1;
    END IF;

    FOR l IN SELECT * FROM jsonb_array_elements(res->'lines') LOOP
      INSERT INTO billing_invoice_lines (invoice_id, orden, categoria, descripcion, detalle, periodo, cantidad, unidad, precio, importe, base, extra_cost_id)
      VALUES (inv_id, (l->>'orden')::int, l->>'categoria', l->>'descripcion', coalesce(l->>'detalle',''), l->>'periodo',
              coalesce((l->>'cantidad')::numeric, 1), coalesce(l->>'unidad',''), coalesce((l->>'precio')::numeric, 0),
              (l->>'importe')::numeric, coalesce(l->'base', '{}'::jsonb), nullif(l->>'extra_cost_id','')::uuid);
    END LOOP;
    PERFORM billing_recalc_total(inv_id);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'creadas', created, 'actualizadas', updated, 'ya_emitidas', skipped, 'sin_cargos', empty);
END $$;

CREATE OR REPLACE FUNCTION public.billing_recalc_total(p_invoice_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t numeric;
BEGIN
  SELECT coalesce(sum(importe), 0) INTO t FROM billing_invoice_lines WHERE invoice_id = p_invoice_id;
  PERFORM set_config('sf.billing_rpc', 'on', true);
  UPDATE billing_invoices SET total = t WHERE id = p_invoice_id;
  RETURN t;
END $$;

-- Ajuste manual en borrador (descuento negativo o cargo), con motivo obligatorio
CREATE OR REPLACE FUNCTION public.billing_add_line(p_invoice_id uuid, p_descripcion text, p_importe numeric, p_motivo text, p_categoria text DEFAULT 'ajuste')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv record;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO inv FROM billing_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF inv.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se ajustan borradores. Para una factura emitida, use una nota de crédito.'; END IF;
  IF coalesce(trim(p_descripcion), '') = '' THEN RAISE EXCEPTION 'Indique la descripción del ajuste'; END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indique el motivo del ajuste'; END IF;
  IF p_importe IS NULL OR p_importe = 0 THEN RAISE EXCEPTION 'El importe no puede ser cero'; END IF;
  IF p_categoria NOT IN ('ajuste','servicios') THEN p_categoria := 'ajuste'; END IF;
  INSERT INTO billing_invoice_lines (invoice_id, orden, categoria, descripcion, detalle, periodo, cantidad, unidad, precio, importe, manual, base)
  VALUES (p_invoice_id, 100 + (SELECT count(*) FROM billing_invoice_lines WHERE invoice_id = p_invoice_id),
          p_categoria, trim(p_descripcion), 'Motivo: ' || trim(p_motivo), inv.periodo, 1, '', p_importe, round(p_importe, 2), true,
          jsonb_build_object('motivo', trim(p_motivo), 'por', auth.uid()));
  RETURN jsonb_build_object('success', true, 'total', billing_recalc_total(p_invoice_id));
END $$;

CREATE OR REPLACE FUNCTION public.billing_delete_line(p_line_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv_id uuid; st text;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT l.invoice_id, i.status INTO inv_id, st FROM billing_invoice_lines l JOIN billing_invoices i ON i.id = l.invoice_id WHERE l.id = p_line_id;
  IF inv_id IS NULL THEN RAISE EXCEPTION 'Línea no encontrada'; END IF;
  IF st <> 'borrador' THEN RAISE EXCEPTION 'Solo se modifican borradores'; END IF;
  DELETE FROM billing_invoice_lines WHERE id = p_line_id;
  RETURN jsonb_build_object('success', true, 'total', billing_recalc_total(inv_id));
END $$;

-- ---------- Emitir / anular ----------
CREATE OR REPLACE FUNCTION public.billing_issue(p_invoice_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv record; n int := 0; hoy date := sf_today(); numeros text[] := '{}';
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  PERFORM set_config('sf.billing_rpc', 'on', true);
  FOR inv IN SELECT * FROM billing_invoices WHERE id = ANY(p_invoice_ids) ORDER BY periodo, created_at FOR UPDATE LOOP
    IF inv.status <> 'borrador' THEN CONTINUE; END IF;
    IF inv.total <= 0 THEN
      RAISE EXCEPTION 'El borrador de % (%) tiene total %; revíselo antes de emitir',
        (SELECT coalesce(nullif(nome_fantasia,''), razao_social) FROM clients WHERE id = inv.cliente_id), sf_month_name(inv.periodo), sf_money(inv.total);
    END IF;
    UPDATE billing_invoices
      SET status = 'emitida', fecha_emision = hoy,
          fecha_vencimiento = billing_due_date(inv.contrato_id, inv.periodo, hoy),
          numero = 'FAC-' || to_char(hoy, 'YYYY') || '-' || lpad(nextval('billing_fac_seq')::text, 5, '0'),
          emitida_at = now(), emitida_por = auth.uid()
      WHERE id = inv.id RETURNING numero INTO inv.numero;
    UPDATE extra_costs SET invoice_id = inv.id
      WHERE id IN (SELECT extra_cost_id FROM billing_invoice_lines WHERE invoice_id = inv.id AND extra_cost_id IS NOT NULL);
    n := n + 1; numeros := numeros || inv.numero;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'emitidas', n, 'numeros', to_jsonb(numeros));
END $$;

CREATE OR REPLACE FUNCTION public.billing_set_fiscal(p_invoice_id uuid, p_numero text, p_cdc text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  IF (SELECT status FROM billing_invoices WHERE id = p_invoice_id) IS DISTINCT FROM 'emitida' THEN
    RAISE EXCEPTION 'Solo se registra el número fiscal en facturas emitidas';
  END IF;
  IF coalesce(trim(p_numero), '') <> '' AND trim(p_numero) !~ '^\d{3}-\d{3}-\d{7}$' THEN
    RAISE EXCEPTION 'Número de factura fiscal inválido (formato 001-001-0000123)';
  END IF;
  IF coalesce(trim(p_cdc), '') <> '' AND regexp_replace(p_cdc, '\s', '', 'g') !~ '^\d{44}$' THEN
    RAISE EXCEPTION 'El CDC debe tener 44 dígitos';
  END IF;
  UPDATE billing_invoices SET fiscal_numero = coalesce(trim(p_numero), ''), fiscal_cdc = regexp_replace(coalesce(p_cdc,''), '\s', '', 'g')
    WHERE id = p_invoice_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- Borrador → se elimina. Emitida sin pagos y sin número fiscal → se anula. Si no, nota de crédito.
CREATE OR REPLACE FUNCTION public.billing_cancel(p_invoice_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv record;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO inv FROM billing_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  PERFORM set_config('sf.billing_rpc', 'on', true);
  IF inv.status = 'borrador' THEN
    DELETE FROM billing_invoices WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true, 'accion', 'eliminado');
  END IF;
  IF inv.status = 'anulada' THEN RAISE EXCEPTION 'La factura ya está anulada'; END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indique el motivo de la anulación'; END IF;
  IF EXISTS (SELECT 1 FROM billing_payments WHERE invoice_id = p_invoice_id AND NOT anulado) THEN
    RAISE EXCEPTION 'La factura tiene pagos registrados. Anule los pagos o emita una nota de crédito.';
  END IF;
  IF inv.fiscal_numero <> '' THEN
    RAISE EXCEPTION 'La factura ya tiene número fiscal (%). Emita una nota de crédito.', inv.fiscal_numero;
  END IF;
  IF EXISTS (SELECT 1 FROM billing_invoices WHERE factura_origen_id = p_invoice_id AND status = 'emitida') THEN
    RAISE EXCEPTION 'La factura tiene notas de crédito emitidas';
  END IF;
  UPDATE billing_invoices SET status = 'anulada', anulada_at = now(), motivo = trim(p_motivo) WHERE id = p_invoice_id;
  UPDATE extra_costs SET invoice_id = NULL WHERE invoice_id = p_invoice_id;
  RETURN jsonb_build_object('success', true, 'accion', 'anulada');
END $$;

-- Nota de crédito sobre una factura emitida (importe positivo = cuánto se acredita)
CREATE OR REPLACE FUNCTION public.billing_credit_note(p_invoice_id uuid, p_importe numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv record; disp numeric; nc_id uuid; nc_num text; hoy date := sf_today();
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO inv FROM billing_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.kind <> 'factura' THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF inv.status <> 'emitida' THEN RAISE EXCEPTION 'Solo se emiten notas de crédito sobre facturas emitidas'; END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indique el motivo de la nota de crédito'; END IF;
  p_importe := round(coalesce(p_importe, 0), 2);
  IF p_importe <= 0 THEN RAISE EXCEPTION 'El importe de la nota de crédito debe ser mayor que cero'; END IF;
  SELECT inv.total + coalesce(sum(total), 0) INTO disp FROM billing_invoices
    WHERE factura_origen_id = p_invoice_id AND status = 'emitida';
  IF p_importe > disp THEN RAISE EXCEPTION 'La nota de crédito (%) supera el saldo facturable (%)', sf_money(p_importe), sf_money(disp); END IF;
  PERFORM set_config('sf.billing_rpc', 'on', true);
  nc_num := 'NC-' || to_char(hoy, 'YYYY') || '-' || lpad(nextval('billing_nc_seq')::text, 5, '0');
  INSERT INTO billing_invoices (numero, kind, cliente_id, contrato_id, periodo, status, fecha_emision, fecha_vencimiento,
                                factura_origen_id, motivo, emitida_at, emitida_por, total)
  VALUES (nc_num, 'nota_credito', inv.cliente_id, inv.contrato_id, inv.periodo, 'emitida', hoy, hoy,
          p_invoice_id, trim(p_motivo), now(), auth.uid(), -p_importe)
  RETURNING id INTO nc_id;
  INSERT INTO billing_invoice_lines (invoice_id, orden, categoria, descripcion, detalle, periodo, cantidad, precio, importe, manual)
  VALUES (nc_id, 1, 'credito', 'Nota de crédito sobre ' || inv.numero, 'Motivo: ' || trim(p_motivo), inv.periodo, 1, -p_importe, -p_importe, true);
  RETURN jsonb_build_object('success', true, 'id', nc_id, 'numero', nc_num);
END $$;

-- ---------- Saldos ----------
CREATE OR REPLACE VIEW public.billing_invoice_balances WITH (security_invoker = true) AS
SELECT i.id, i.numero, i.kind, i.cliente_id, i.contrato_id, i.periodo, i.status, i.fecha_emision, i.fecha_vencimiento, i.total,
       coalesce(nc.creditos, 0) AS creditos,
       coalesce(pg.pagado, 0) AS pagado,
       CASE WHEN i.kind = 'factura' AND i.status = 'emitida'
            THEN greatest(round(i.total + coalesce(nc.creditos, 0) - coalesce(pg.pagado, 0), 2), 0) ELSE 0 END AS saldo,
       CASE
         WHEN i.status = 'borrador' THEN 'borrador'
         WHEN i.status = 'anulada' THEN 'anulada'
         WHEN i.kind = 'nota_credito' THEN 'acreditada'
         WHEN round(i.total + coalesce(nc.creditos, 0) - coalesce(pg.pagado, 0), 2) <= 0 THEN 'pagada'
         WHEN i.fecha_vencimiento < sf_today() THEN 'vencida'
         WHEN coalesce(pg.pagado, 0) > 0 THEN 'parcial'
         ELSE 'pendiente'
       END AS estado_pago,
       CASE WHEN i.status = 'emitida' AND i.kind = 'factura' AND i.fecha_vencimiento < sf_today()
                 AND round(i.total + coalesce(nc.creditos, 0) - coalesce(pg.pagado, 0), 2) > 0
            THEN sf_today() - i.fecha_vencimiento ELSE 0 END AS dias_vencida
FROM billing_invoices i
LEFT JOIN LATERAL (SELECT sum(n.total) AS creditos FROM billing_invoices n WHERE n.factura_origen_id = i.id AND n.status = 'emitida') nc ON true
LEFT JOIN LATERAL (SELECT sum(p.importe) AS pagado FROM billing_payments p WHERE p.invoice_id = i.id AND NOT p.anulado) pg ON true;

-- ---------- Pagos ----------
-- Si no se indica factura, se imputa a las más antiguas con saldo; el resto queda "a cuenta".
CREATE OR REPLACE FUNCTION public.billing_register_payment(
  p_cliente_id uuid, p_fecha date, p_importe numeric, p_metodo text DEFAULT 'transferencia',
  p_referencia text DEFAULT '', p_invoice_id uuid DEFAULT NULL, p_comprobante text DEFAULT NULL, p_notas text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rec text; rest numeric; b record; part numeric; aplic jsonb := '[]'::jsonb;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'Seleccione el cliente'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'Indique la fecha del pago'; END IF;
  IF p_fecha > sf_today() THEN RAISE EXCEPTION 'La fecha del pago no puede ser futura'; END IF;
  rest := round(coalesce(p_importe, 0), 2);
  IF rest <= 0 THEN RAISE EXCEPTION 'El importe debe ser mayor que cero'; END IF;
  IF p_metodo NOT IN ('transferencia','efectivo','cheque','tarjeta','deposito','otro') THEN p_metodo := 'otro'; END IF;
  IF coalesce(trim(p_referencia), '') <> '' AND EXISTS (
       SELECT 1 FROM billing_payments WHERE cliente_id = p_cliente_id AND NOT anulado AND referencia = trim(p_referencia) AND fecha = p_fecha) THEN
    RAISE EXCEPTION 'Ya existe un pago de este cliente con la referencia % en esa fecha', trim(p_referencia);
  END IF;
  rec := 'REC-' || to_char(sf_today(), 'YYYY') || '-' || lpad(nextval('billing_rec_seq')::text, 5, '0');

  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO b FROM billing_invoice_balances WHERE id = p_invoice_id;
    IF NOT FOUND OR b.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'La factura no pertenece al cliente'; END IF;
    IF b.status <> 'emitida' OR b.kind <> 'factura' THEN RAISE EXCEPTION 'Solo se imputan pagos a facturas emitidas'; END IF;
    IF b.saldo <= 0 THEN RAISE EXCEPTION 'La factura % ya está pagada', b.numero; END IF;
    part := least(rest, b.saldo);
    INSERT INTO billing_payments (recibo, cliente_id, invoice_id, fecha, importe, metodo, referencia, comprobante, notas, created_by)
    VALUES (rec, p_cliente_id, p_invoice_id, p_fecha, part, p_metodo, coalesce(trim(p_referencia),''), p_comprobante, coalesce(p_notas,''), auth.uid());
    aplic := aplic || jsonb_build_object('numero', b.numero, 'importe', part);
    rest := rest - part;
  END IF;

  FOR b IN SELECT * FROM billing_invoice_balances
           WHERE cliente_id = p_cliente_id AND kind = 'factura' AND status = 'emitida' AND saldo > 0
             AND id IS DISTINCT FROM p_invoice_id
           ORDER BY fecha_vencimiento, fecha_emision, numero LOOP
    EXIT WHEN rest <= 0;
    part := least(rest, b.saldo);
    INSERT INTO billing_payments (recibo, cliente_id, invoice_id, fecha, importe, metodo, referencia, comprobante, notas, created_by)
    VALUES (rec, p_cliente_id, b.id, p_fecha, part, p_metodo, coalesce(trim(p_referencia),''), p_comprobante, coalesce(p_notas,''), auth.uid());
    aplic := aplic || jsonb_build_object('numero', b.numero, 'importe', part);
    rest := rest - part;
  END LOOP;

  IF rest > 0 THEN
    INSERT INTO billing_payments (recibo, cliente_id, invoice_id, fecha, importe, metodo, referencia, comprobante, notas, created_by)
    VALUES (rec, p_cliente_id, NULL, p_fecha, rest, p_metodo, coalesce(trim(p_referencia),''), p_comprobante, coalesce(p_notas,''), auth.uid());
    aplic := aplic || jsonb_build_object('numero', null, 'importe', rest);
  END IF;
  RETURN jsonb_build_object('success', true, 'recibo', rec, 'aplicado', aplic, 'a_cuenta', rest);
END $$;

-- Aplica saldo "a cuenta" del cliente a las facturas abiertas (después de emitir)
CREATE OR REPLACE FUNCTION public.billing_apply_credit(p_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; b record; part numeric; n int := 0;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  FOR p IN SELECT * FROM billing_payments WHERE cliente_id = p_cliente_id AND invoice_id IS NULL AND NOT anulado ORDER BY fecha, created_at FOR UPDATE LOOP
    FOR b IN SELECT * FROM billing_invoice_balances WHERE cliente_id = p_cliente_id AND kind = 'factura' AND status = 'emitida' AND saldo > 0
             ORDER BY fecha_vencimiento, numero LOOP
      EXIT WHEN p.importe <= 0;
      part := least(p.importe, b.saldo);
      INSERT INTO billing_payments (recibo, cliente_id, invoice_id, fecha, importe, metodo, referencia, comprobante, notas, created_by)
      VALUES (p.recibo, p.cliente_id, b.id, p.fecha, part, p.metodo, p.referencia, p.comprobante, p.notas, auth.uid());
      p.importe := p.importe - part; n := n + 1;
    END LOOP;
    IF p.importe <= 0 THEN DELETE FROM billing_payments WHERE id = p.id;
    ELSE UPDATE billing_payments SET importe = p.importe WHERE id = p.id; END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'imputaciones', n);
END $$;

CREATE OR REPLACE FUNCTION public.billing_void_payment(p_recibo text, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indique el motivo de la anulación del pago'; END IF;
  UPDATE billing_payments SET anulado = true, anulado_motivo = trim(p_motivo) WHERE recibo = p_recibo AND NOT anulado;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Recibo no encontrado o ya anulado'; END IF;
  RETURN jsonb_build_object('success', true, 'anulados', n);
END $$;

-- ---------- Estimación para el cliente ("factura en curso") ----------
-- Lo que se facturará el próximo mes: almacenamiento del mes que viene + extras del mes en curso hasta hoy
CREATE OR REPLACE FUNCTION public.billing_estimate(p_cliente_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid uuid := p_cliente_id; per text := to_char(sf_today() + interval '1 month', 'YYYY-MM'); c record; out jsonb := '[]'::jsonb;
BEGIN
  IF cid IS NULL OR NOT is_admin_or_financeiro(auth.uid()) THEN cid := nullif(get_user_client_id(auth.uid()), '')::uuid; END IF;
  IF cid IS NULL THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  FOR c IN SELECT id FROM contracts WHERE cliente_id = cid AND status = 'ativo' LOOP
    out := out || billing_compute(c.id, per);
  END LOOP;
  RETURN jsonb_build_object('periodo', per, 'hasta', sf_today(), 'contratos', out,
                            'total', (SELECT coalesce(sum((x->>'total')::numeric), 0) FROM jsonb_array_elements(out) x));
END $$;

-- ---------- Uso mensual (para el gráfico del cliente) ----------
CREATE OR REPLACE FUNCTION public.billing_usage(p_cliente_id uuid DEFAULT NULL, p_months int DEFAULT 12)
RETURNS TABLE (periodo text, contratadas int, pico int, promedio numeric, movimientos int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid uuid := p_cliente_id;
BEGIN
  IF cid IS NULL OR NOT is_admin_or_financeiro(auth.uid()) THEN cid := nullif(get_user_client_id(auth.uid()), '')::uuid; END IF;
  IF cid IS NULL THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  RETURN QUERY
  WITH months AS (
    SELECT to_char(g, 'YYYY-MM') AS per, g::date AS ms, least((g + interval '1 month - 1 day')::date, sf_today()) AS me
    FROM generate_series(date_trunc('month', sf_today()) - make_interval(months => greatest(p_months,1) - 1), date_trunc('month', sf_today()), interval '1 month') g
  ),
  pres AS (
    SELECT mo.per, d::date AS d, sum(CASE WHEN p.pallet_duplo THEN 2 ELSE 1 END)::int AS pos
    FROM months mo
    JOIN pallets p ON p.cliente_id = cid AND p.status <> 'aguardando_entrada' AND p.data_entrada IS NOT NULL
    CROSS JOIN LATERAL (SELECT sf_pallet_exit_date(p.id) AS ex) e
    CROSS JOIN LATERAL generate_series(greatest(mo.ms, p.data_entrada), least(mo.me, coalesce(e.ex, mo.me)), interval '1 day') d
    WHERE p.status <> 'expedido' OR e.ex IS NOT NULL
    GROUP BY mo.per, d::date
  )
  SELECT mo.per,
         coalesce((SELECT sum(posicoes_contratadas)::int FROM contracts k WHERE k.cliente_id = cid AND k.status NOT IN ('rascunho')
                   AND k.data_inicio <= mo.me AND (k.data_termino IS NULL OR k.data_termino >= mo.ms)), 0),
         coalesce((SELECT max(pos) FROM pres WHERE pres.per = mo.per), 0),
         coalesce((SELECT round(sum(pos)::numeric / (mo.me - mo.ms + 1), 1) FROM pres WHERE pres.per = mo.per), 0),
         (SELECT count(*)::int FROM movements m WHERE m.cliente_id = cid AND m.status = 'executada'
            AND m.tipo IN ('entrada','saida','transferencia') AND NOT coalesce(m.interna, false)
            AND (m.data_hora AT TIME ZONE 'America/Asuncion')::date BETWEEN mo.ms AND mo.me)
  FROM months mo ORDER BY mo.per;
END $$;

-- ---------- Migración de facturas del sistema anterior ----------
-- Meses anteriores al actual → factura emitida (legado) con una línea; las pagadas reciben su pago.
-- Las pendientes del mes actual en adelante se descartan: se generan con las nuevas reglas.
DO $$
DECLARE r record; nid uuid; num text; cur text := to_char(sf_today(), 'YYYY-MM');
BEGIN
  PERFORM set_config('sf.billing_rpc', 'on', true);
  FOR r IN SELECT * FROM invoices WHERE competencia < cur OR status = 'pago' ORDER BY competencia, created_at LOOP
    num := 'FAC-' || split_part(r.competencia, '-', 1) || '-' || lpad(nextval('billing_fac_seq')::text, 5, '0');
    INSERT INTO billing_invoices (numero, kind, cliente_id, contrato_id, periodo, status, fecha_emision, fecha_vencimiento, total, legado, notas, emitida_at)
    VALUES (num, 'factura', r.cliente_id, r.contrato_id, r.competencia, 'emitida',
            least(coalesce(r.created_at::date, r.data_vencimento), r.data_vencimento), r.data_vencimento, round(r.valor, 2), true,
            coalesce(r.observacoes, ''), coalesce(r.created_at, now()))
    RETURNING id INTO nid;
    INSERT INTO billing_invoice_lines (invoice_id, orden, categoria, descripcion, detalle, periodo, cantidad, precio, importe, manual)
    VALUES (nid, 1, 'legado', 'Almacenamiento ' || sf_month_name(r.competencia), 'Facturado en el sistema anterior', r.competencia, 1, r.valor, round(r.valor, 2), true);
    IF r.status = 'pago' AND r.valor > 0 THEN
      INSERT INTO billing_payments (recibo, cliente_id, invoice_id, fecha, importe, metodo, comprobante, notas)
      VALUES ('REC-' || split_part(r.competencia, '-', 1) || '-' || lpad(nextval('billing_rec_seq')::text, 5, '0'),
              r.cliente_id, nid, coalesce(r.comprobante_data::date, r.data_vencimento), round(r.valor, 2), 'otro', r.comprobante, 'Migrado del sistema anterior');
    END IF;
  END LOOP;
END $$;

-- El sistema anterior ya no crea cuotas
COMMENT ON TABLE public.invoices IS 'OBSOLETA desde 17/10/2026 — reemplazada por billing_invoices. Solo lectura histórica.';

GRANT SELECT ON public.billing_invoice_balances TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_generate_drafts(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_add_line(uuid, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_delete_line(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_issue(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_set_fiscal(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_credit_note(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_register_payment(uuid, date, numeric, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_apply_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_void_payment(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_estimate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_usage(uuid, int) TO authenticated;
-- billing_compute expone cálculos de cualquier contrato: solo gestión
REVOKE EXECUTE ON FUNCTION public.billing_compute(uuid, text) FROM authenticated, anon, public;

-- ===== 20261017130000_portal_cliente.sql =====
-- Portal del cliente: autorizados propuestos por el cliente y bloqueo de costos ya facturados

-- 1) El cliente propone autorizados (quedan inactivos hasta que StockFlex los apruebe)
ALTER TABLE public.authorized_contacts ADD COLUMN IF NOT EXISTS solicitado_por_cliente boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Cliente propone autorizados" ON public.authorized_contacts;
CREATE POLICY "Cliente propone autorizados" ON public.authorized_contacts FOR INSERT TO authenticated
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND ativo = false AND solicitado_por_cliente = true);

-- Documento del autorizado: el cliente sube a su carpeta documents/<cliente>/autorizados/
DROP POLICY IF EXISTS "Cliente sube documentos de autorizados" ON storage.objects;
CREATE POLICY "Cliente sube documentos de autorizados" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents'
              AND (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
              AND (storage.foldername(name))[2] = 'autorizados');

-- El cliente puede dar de baja (nunca dar de alta) a un autorizado suyo
CREATE OR REPLACE FUNCTION public.client_deactivate_contact(p_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid text := get_user_client_id(auth.uid()); n int;
BEGIN
  IF cid IS NULL AND NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  UPDATE authorized_contacts SET ativo = false,
         observacoes = trim(coalesce(observacoes, '') || ' [Baja solicitada por el cliente ' || to_char(sf_today(), 'DD/MM/YYYY') || ']')
   WHERE id = p_contact_id AND (cliente_id::text = cid OR is_staff(auth.uid()));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Autorizado no encontrado'; END IF;
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.client_deactivate_contact(uuid) TO authenticated;

-- 2) Un costo extra ya facturado no se edita ni se borra (se corrige con nota de crédito)
CREATE OR REPLACE FUNCTION public.protect_billed_extra_cost()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Este costo ya fue facturado; corrija con una nota de crédito'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.invoice_id IS NOT NULL AND current_setting('sf.billing_rpc', true) IS DISTINCT FROM 'on'
     AND (NEW.valor_total IS DISTINCT FROM OLD.valor_total OR NEW.valor_unitario IS DISTINCT FROM OLD.valor_unitario
          OR NEW.quantidade IS DISTINCT FROM OLD.quantidade OR NEW.status_aprovacao IS DISTINCT FROM OLD.status_aprovacao
          OR NEW.competencia IS DISTINCT FROM OLD.competencia OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id) THEN
    RAISE EXCEPTION 'Este costo ya fue facturado; corrija con una nota de crédito';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_billed_extra_cost ON public.extra_costs;
CREATE TRIGGER trg_protect_billed_extra_cost BEFORE UPDATE OR DELETE ON public.extra_costs
  FOR EACH ROW EXECUTE FUNCTION public.protect_billed_extra_cost();

-- 3) Dashboard: ingresos = facturado (facturas emitidas − notas de crédito) por período; meses futuros = estimado por contratos
CREATE OR REPLACE FUNCTION public.dashboard_financial_summary(p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb; v_min date; v_max date; cur text := to_char(sf_today(), 'YYYY-MM');
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  v_min := coalesce(p_date_from::date, (SELECT min(data_inicio) FROM contracts), sf_today());
  v_max := coalesce(p_date_to::date, greatest((SELECT max(data_termino) FROM contracts WHERE status = 'ativo'), sf_today()));
  IF v_max > v_min + interval '5 years' THEN v_max := (v_min + interval '5 years')::date; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'month', m.k,
           'ingresos', round(CASE WHEN m.k <= cur OR coalesce(f.total, 0) > 0 THEN coalesce(f.total, 0) ELSE coalesce(est.total, 0) END, 2),
           'cobrado', round(coalesce(pg.total, 0), 2),
           'gastos', round(coalesce(ex.total, 0), 2),
           'resultado', round(CASE WHEN m.k <= cur OR coalesce(f.total, 0) > 0 THEN coalesce(f.total, 0) ELSE coalesce(est.total, 0) END - coalesce(ex.total, 0), 2),
           'estimado', m.k > cur AND coalesce(f.total, 0) = 0
         ) ORDER BY m.k), '[]'::jsonb) INTO result
  FROM (SELECT to_char(g, 'YYYY-MM') AS k FROM generate_series(date_trunc('month', v_min), date_trunc('month', v_max), interval '1 month') g) m
  LEFT JOIN (SELECT periodo, sum(total) AS total FROM billing_invoices WHERE status = 'emitida' GROUP BY periodo) f ON f.periodo = m.k
  LEFT JOIN (SELECT to_char(fecha, 'YYYY-MM') AS k, sum(importe) AS total FROM billing_payments WHERE NOT anulado GROUP BY 1) pg ON pg.k = m.k
  LEFT JOIN (SELECT competencia, sum(coalesce(valor_usd, valor)) AS total FROM expenses GROUP BY competencia) ex ON ex.competencia = m.k
  LEFT JOIN (
    SELECT to_char(ms, 'YYYY-MM') AS k, sum(c.posicoes_contratadas * (c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0))) AS total
    FROM contracts c CROSS JOIN LATERAL generate_series(date_trunc('month', c.data_inicio), date_trunc('month', c.data_termino), interval '1 month') ms
    WHERE c.status = 'ativo' GROUP BY 1
  ) est ON est.k = m.k;
  RETURN result;
END $function$;

-- 4) Contrato firmado guardado de verdad (antes quedaba solo en la pantalla)
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS archivo_firmado text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS firmado_at timestamptz;

-- 5) Cerrar contrato: sin pallets en depósito; el término pasa a la fecha de cierre (la facturación prorratea)
CREATE OR REPLACE FUNCTION public.close_contract(p_contract_id uuid, p_fecha date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; n int; f date := coalesce(p_fecha, sf_today()); drafts int;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO c FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato no encontrado'; END IF;
  IF c.status = 'encerrado' THEN RAISE EXCEPTION 'El contrato ya está cerrado'; END IF;
  SELECT count(*) INTO n FROM pallets WHERE contrato_id = c.id AND status NOT IN ('expedido');
  IF n > 0 THEN RAISE EXCEPTION 'El contrato tiene % pallet(s) en depósito o pendientes. Regístrelos como salida antes de cerrar.', n; END IF;
  IF f < c.data_inicio THEN RAISE EXCEPTION 'La fecha de cierre es anterior al inicio del contrato'; END IF;
  UPDATE contracts SET status = 'encerrado', data_termino = least(coalesce(data_termino, f), f) WHERE id = c.id;
  -- Borradores de meses posteriores al cierre ya no corresponden
  PERFORM set_config('sf.billing_rpc', 'on', true);
  DELETE FROM billing_invoices WHERE contrato_id = c.id AND status = 'borrador' AND periodo > to_char(f, 'YYYY-MM') ;
  GET DIAGNOSTICS drafts = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'fecha', f, 'borradores_eliminados', drafts);
END $$;
GRANT EXECUTE ON FUNCTION public.close_contract(uuid, date) TO authenticated;

-- ===== 20261017140000_comisiones_contratos.sql =====
-- =====================================================================
-- 1) Comisiones de agentes (CAC) y 2) documento del contrato
-- =====================================================================

-- ---------- Comisiones ----------
-- Regla: 1 mes de alquiler por posición (posiciones contratadas × precio por posición, sin recargos)
-- en contratos de 12 meses o más; proporcional (meses/12) en contratos menores.
-- Solo el PRIMER contrato del cliente genera comisión; renovaciones no.
-- Se libera cuando la primera factura de ese contrato está pagada; al pagar se registra un gasto "CAC".

ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'cac';

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(trim(nombre)) >= 2),
  documento text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  cuenta_pago text NOT NULL DEFAULT '',     -- banco / cuenta / alias para pagar
  activo boolean NOT NULL DEFAULT true,
  notas text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestion agentes" ON public.agents;
CREATE POLICY "Gestion agentes" ON public.agents FOR ALL TO authenticated
  USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS agente_id uuid REFERENCES public.agents(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  contrato_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  posiciones integer NOT NULL,
  precio numeric(14,2) NOT NULL,
  meses integer NOT NULL,
  factor numeric(6,4) NOT NULL,
  importe numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'prevista' CHECK (status IN ('prevista','pagada','anulada')),
  fecha_pago date,
  metodo text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  expense_id uuid,
  motivo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Una comisión vigente por cliente (solo el primer contrato)
CREATE UNIQUE INDEX IF NOT EXISTS commissions_one_per_client ON public.commissions (cliente_id) WHERE status <> 'anulada';
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestion lee comisiones" ON public.commissions;
CREATE POLICY "Gestion lee comisiones" ON public.commissions FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));

CREATE OR REPLACE FUNCTION public.commission_calc(p_contrato_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'posiciones', c.posicoes_contratadas,
    'precio', c.preco_por_posicao,
    'meses', m.meses,
    'factor', round(least(m.meses, 12)::numeric / 12, 4),
    'importe', round(c.posicoes_contratadas * c.preco_por_posicao * least(m.meses, 12) / 12.0, 2))
  FROM contracts c
  CROSS JOIN LATERAL (SELECT greatest(1, round(((coalesce(c.data_termino, c.data_inicio + interval '12 months' - interval '1 day')::date - c.data_inicio + 1) / 30.4375))::int) AS meses) m
  WHERE c.id = p_contrato_id
$$;

-- Crea o actualiza (mientras no se pagó) la comisión del primer contrato del cliente
CREATE OR REPLACE FUNCTION public.commission_ensure(p_cliente_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ag uuid; first_ct uuid; cur record; has_cur boolean; calc jsonb;
BEGIN
  SELECT agente_id INTO ag FROM clients WHERE id = p_cliente_id;
  SELECT * INTO cur FROM commissions WHERE cliente_id = p_cliente_id AND status <> 'anulada';
  has_cur := FOUND;
  IF ag IS NULL THEN
    -- sin agente: una comisión prevista se anula; pagada queda como está
    IF has_cur AND cur.status = 'prevista' THEN
      UPDATE commissions SET status = 'anulada', motivo = 'Cliente sin agente asignado' WHERE id = cur.id;
    END IF;
    RETURN;
  END IF;
  SELECT id INTO first_ct FROM contracts
    WHERE cliente_id = p_cliente_id AND status NOT IN ('rascunho')
    ORDER BY data_inicio, created_at LIMIT 1;
  IF first_ct IS NULL THEN RETURN; END IF;
  calc := commission_calc(first_ct);
  IF NOT has_cur THEN
    INSERT INTO commissions (agente_id, cliente_id, contrato_id, posiciones, precio, meses, factor, importe)
    VALUES (ag, p_cliente_id, first_ct, (calc->>'posiciones')::int, (calc->>'precio')::numeric, (calc->>'meses')::int,
            (calc->>'factor')::numeric, (calc->>'importe')::numeric);
  ELSIF cur.status = 'prevista' THEN
    UPDATE commissions SET agente_id = ag, contrato_id = first_ct, posiciones = (calc->>'posiciones')::int, precio = (calc->>'precio')::numeric,
           meses = (calc->>'meses')::int, factor = (calc->>'factor')::numeric, importe = (calc->>'importe')::numeric
     WHERE id = cur.id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_commission_from_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM commission_ensure(NEW.cliente_id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_commission_contract ON public.contracts;
CREATE TRIGGER trg_commission_contract AFTER INSERT OR UPDATE OF posicoes_contratadas, preco_por_posicao, data_inicio, data_termino, status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trg_commission_from_contract();

CREATE OR REPLACE FUNCTION public.trg_commission_from_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.agente_id IS DISTINCT FROM OLD.agente_id THEN PERFORM commission_ensure(NEW.id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_commission_client ON public.clients;
CREATE TRIGGER trg_commission_client AFTER UPDATE OF agente_id ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_commission_from_client();

-- Vista con el estado de cobro: "liberada" = la primera factura del contrato ya está pagada
CREATE OR REPLACE VIEW public.commissions_view WITH (security_invoker = true) AS
SELECT k.*,
       a.nombre AS agente_nombre,
       cl.nome_fantasia AS cliente_nombre,
       ct.numero AS contrato_numero, ct.data_inicio, ct.data_termino,
       EXISTS (SELECT 1 FROM billing_invoice_balances b WHERE b.contrato_id = k.contrato_id AND b.kind = 'factura'
                 AND b.status = 'emitida' AND b.estado_pago = 'pagada') AS primera_factura_pagada,
       CASE WHEN k.status = 'prevista' AND EXISTS (SELECT 1 FROM billing_invoice_balances b WHERE b.contrato_id = k.contrato_id
                 AND b.kind = 'factura' AND b.status = 'emitida' AND b.estado_pago = 'pagada') THEN 'liberada' ELSE k.status END AS estado
FROM commissions k
JOIN agents a ON a.id = k.agente_id
JOIN clients cl ON cl.id = k.cliente_id
JOIN contracts ct ON ct.id = k.contrato_id;
GRANT SELECT ON public.commissions_view TO authenticated;

-- Pagar: registra el gasto CAC (competencia = mes del pago)
CREATE OR REPLACE FUNCTION public.commission_pay(p_id uuid, p_fecha date, p_metodo text, p_referencia text, p_forzar boolean DEFAULT false, p_motivo text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k record; v record; exp_id uuid;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO k FROM commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comisión no encontrada'; END IF;
  IF k.status <> 'prevista' THEN RAISE EXCEPTION 'La comisión ya está %', k.status; END IF;
  IF p_fecha IS NULL OR p_fecha > sf_today() THEN RAISE EXCEPTION 'Indique una fecha de pago válida (no futura)'; END IF;
  SELECT * INTO v FROM commissions_view WHERE id = p_id;
  IF v.estado <> 'liberada' AND NOT p_forzar THEN
    RAISE EXCEPTION 'La primera factura del contrato % todavía no está pagada', v.contrato_numero;
  END IF;
  IF v.estado <> 'liberada' AND coalesce(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Para pagar antes de que el cliente pague, indique el motivo';
  END IF;
  INSERT INTO expenses (competencia, categoria, descricao, valor, moeda, valor_usd, cambio_dia, data_criacao, data_vencimento, status, observacoes)
  VALUES (to_char(p_fecha, 'YYYY-MM'), 'cac', 'Comisión ' || v.agente_nombre || ' — ' || v.cliente_nombre || ' (' || v.contrato_numero || ')',
          k.importe, 'USD', k.importe, 1, p_fecha, p_fecha, 'pago',
          trim(coalesce(p_metodo, '') || ' ' || coalesce(p_referencia, '') || CASE WHEN coalesce(p_motivo,'') <> '' THEN ' · ' || p_motivo ELSE '' END))
  RETURNING id INTO exp_id;
  UPDATE commissions SET status = 'pagada', fecha_pago = p_fecha, metodo = coalesce(p_metodo, ''), referencia = coalesce(p_referencia, ''),
         expense_id = exp_id, motivo = coalesce(p_motivo, '') WHERE id = p_id;
  RETURN jsonb_build_object('success', true, 'expense_id', exp_id);
END $$;

CREATE OR REPLACE FUNCTION public.commission_cancel(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indique el motivo'; END IF;
  UPDATE commissions SET status = 'anulada', motivo = trim(p_motivo) WHERE id = p_id AND status = 'prevista';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se anulan comisiones previstas (las pagadas quedan en gastos)'; END IF;
  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.commission_pay(uuid, date, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_cancel(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.commission_ensure(uuid) FROM authenticated, anon, public;

-- ---------- Documento del contrato ----------
-- Datos de la empresa para el contrato (editables por el administrador)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos leen ajustes" ON public.app_settings;
CREATE POLICY "Todos leen ajustes" ON public.app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin edita ajustes" ON public.app_settings;
CREATE POLICY "Admin edita ajustes" ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
INSERT INTO public.app_settings (key, value) VALUES
  ('empresa_razon_social', '[RAZÓN SOCIAL DE STOCKFLEX]'),
  ('empresa_ruc', '[RUC]'),
  ('empresa_domicilio', '[DOMICILIO], Ciudad del Este, Paraguay'),
  ('empresa_representante', '[NOMBRE DEL REPRESENTANTE LEGAL]'),
  ('empresa_representante_ci', '[C.I.]'),
  ('empresa_email', 'contacto@stockflex.com.py'),
  ('empresa_telefono', '+595 983 110 207'),
  ('contrato_ciudad', 'Ciudad del Este'),
  ('contrato_jurisdiccion', 'los Juzgados y Tribunales de Ciudad del Este, Alto Paraná'),
  ('contrato_mora_pct', '1')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  cuerpo text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestion lee modelos" ON public.contract_templates;
CREATE POLICY "Gestion lee modelos" ON public.contract_templates FOR SELECT TO authenticated USING (is_admin_or_financeiro(auth.uid()));
DROP POLICY IF EXISTS "Admin edita modelos" ON public.contract_templates;
CREATE POLICY "Admin edita modelos" ON public.contract_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.contract_templates(id);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS clausulas_especiales text NOT NULL DEFAULT '';
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS doc_estado text NOT NULL DEFAULT 'borrador'
  CHECK (doc_estado IN ('borrador','para_firma','aceptado','firmado'));
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS doc_texto text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS doc_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS doc_emitido_at timestamptz;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS aceptado_at timestamptz;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS aceptado_nombre text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS aceptado_documento text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS aceptado_por uuid;

-- Emitir para firma: congela el texto (cada emisión nueva reinicia la aceptación)
CREATE OR REPLACE FUNCTION public.contract_issue_document(p_contract_id uuid, p_texto text, p_template_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO c FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato no encontrado'; END IF;
  IF c.doc_estado = 'firmado' THEN RAISE EXCEPTION 'El contrato ya está firmado. Para cambios, emita una adenda.'; END IF;
  IF length(coalesce(p_texto, '')) < 200 THEN RAISE EXCEPTION 'El texto del contrato está vacío o incompleto'; END IF;
  IF p_texto ~ '\{\{[^}]+\}\}' THEN RAISE EXCEPTION 'Quedan campos sin completar en el contrato: %', (regexp_match(p_texto, '\{\{[^}]+\}\}'))[1]; END IF;
  UPDATE contracts SET doc_texto = p_texto, doc_estado = 'para_firma', doc_version = doc_version + 1, doc_emitido_at = now(),
         template_id = coalesce(p_template_id, template_id),
         aceptado_at = NULL, aceptado_nombre = NULL, aceptado_documento = NULL, aceptado_por = NULL
   WHERE id = p_contract_id;
  RETURN jsonb_build_object('success', true, 'version', c.doc_version + 1);
END $$;

-- Aceptación electrónica por el cliente (nombre y documento de quien acepta, con fecha y usuario)
CREATE OR REPLACE FUNCTION public.contract_accept(p_contract_id uuid, p_nombre text, p_documento text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato no encontrado'; END IF;
  IF c.cliente_id::text IS DISTINCT FROM get_user_client_id(auth.uid()) AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  IF c.doc_estado <> 'para_firma' THEN RAISE EXCEPTION 'Este contrato no está disponible para aceptar'; END IF;
  IF length(trim(coalesce(p_nombre, ''))) < 5 THEN RAISE EXCEPTION 'Indique nombre y apellido de quien firma'; END IF;
  IF length(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g')) < 5 THEN RAISE EXCEPTION 'Indique el número de documento de quien firma'; END IF;
  UPDATE contracts SET doc_estado = 'aceptado', aceptado_at = now(), aceptado_nombre = trim(p_nombre),
         aceptado_documento = trim(p_documento), aceptado_por = auth.uid()
   WHERE id = p_contract_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- La gestión confirma que recibió la copia firmada
CREATE OR REPLACE FUNCTION public.contract_mark_signed(p_contract_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM contract_documents WHERE contrato_id = p_contract_id AND tipo = 'firmado') THEN
    RAISE EXCEPTION 'Adjunte primero la copia firmada del contrato';
  END IF;
  UPDATE contracts SET doc_estado = 'firmado', firmado_at = coalesce(firmado_at, now()) WHERE id = p_contract_id AND doc_estado IN ('para_firma','aceptado');
  IF NOT FOUND THEN RAISE EXCEPTION 'El contrato debe estar emitido para firma'; END IF;
  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.contract_issue_document(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_accept(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_mark_signed(uuid) TO authenticated;

-- Anexos del contrato: el cliente sube y ve; editar o borrar solo la gestión
CREATE TABLE IF NOT EXISTS public.contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  tipo text NOT NULL DEFAULT 'anexo' CHECK (tipo IN ('firmado','anexo','adenda','otro')),
  nombre text NOT NULL,
  path text NOT NULL,
  subido_por uuid DEFAULT auth.uid(),
  subido_por_cliente boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestion documentos contrato" ON public.contract_documents;
CREATE POLICY "Gestion documentos contrato" ON public.contract_documents FOR ALL TO authenticated
  USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));
DROP POLICY IF EXISTS "Cliente ve sus documentos" ON public.contract_documents;
CREATE POLICY "Cliente ve sus documentos" ON public.contract_documents FOR SELECT TO authenticated
  USING (cliente_id::text = get_user_client_id(auth.uid()));
DROP POLICY IF EXISTS "Cliente adjunta documentos" ON public.contract_documents;
CREATE POLICY "Cliente adjunta documentos" ON public.contract_documents FOR INSERT TO authenticated
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND subido_por_cliente = true AND tipo IN ('firmado','anexo')
              AND path LIKE (cliente_id::text || '/contratos/%')
              AND EXISTS (SELECT 1 FROM contracts c WHERE c.id = contrato_id AND c.cliente_id = contract_documents.cliente_id));

-- Storage: el cliente sube a documents/<cliente>/contratos/ (no puede borrar ni reemplazar)
DROP POLICY IF EXISTS "Cliente sube contratos" ON storage.objects;
CREATE POLICY "Cliente sube contratos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents'
              AND (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
              AND (storage.foldername(name))[2] = 'contratos');
DROP POLICY IF EXISTS "Finanzas gestiona documentos" ON storage.objects;
CREATE POLICY "Finanzas gestiona documentos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin_or_financeiro(auth.uid()));

-- Contratos firmados que ya estaban adjuntos pasan a la lista de documentos
INSERT INTO public.contract_documents (contrato_id, cliente_id, tipo, nombre, path, subido_por_cliente, created_at)
SELECT id, cliente_id, 'firmado', 'Contrato firmado', archivo_firmado, false, coalesce(firmado_at, now())
FROM public.contracts c
WHERE archivo_firmado IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.contract_documents d WHERE d.contrato_id = c.id AND d.path = c.archivo_firmado);

-- ===== 20261017150000_mapa_pasillos.sql =====
-- Planta: después de qué calles hay un pasillo (ej.: "A,C,E"), para dibujar la planta del depósito
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS pasillos text NOT NULL DEFAULT '';
