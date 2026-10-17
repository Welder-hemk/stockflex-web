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
