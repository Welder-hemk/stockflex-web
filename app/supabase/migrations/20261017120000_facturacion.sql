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
