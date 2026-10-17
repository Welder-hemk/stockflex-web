
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
