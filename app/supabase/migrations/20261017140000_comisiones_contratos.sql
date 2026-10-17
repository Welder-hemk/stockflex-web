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
