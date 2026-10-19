-- =====================================================================
-- Adendas de contrato (19/10/2026)
-- Reglas aprobadas:
--  * Más posiciones durante la vigencia = adenda al contrato original, que termina junto con él.
--  * El precio de la adenda vale solo para las posiciones adicionales.
--  * La comisión del agente es solo sobre el contrato original (las adendas no generan comisión).
--  * La adenda cuenta para la facturación desde su fecha de inicio, una vez emitida para firma.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.contract_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  fecha_inicio date NOT NULL,
  posiciones integer NOT NULL CHECK (posiciones > 0),
  precio numeric(12,2) NOT NULL CHECK (precio > 0),
  motivo text NOT NULL DEFAULT '',
  doc_estado text NOT NULL DEFAULT 'borrador' CHECK (doc_estado IN ('borrador','para_firma','aceptado','firmado','anulada')),
  doc_texto text,
  doc_emitido_at timestamptz,
  aceptado_at timestamptz,
  aceptado_nombre text,
  aceptado_documento text,
  aceptado_por uuid,
  anulada_motivo text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_amendments_contract ON public.contract_amendments (contrato_id);
ALTER TABLE public.contract_amendments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestion lee adendas" ON public.contract_amendments;
CREATE POLICY "Gestion lee adendas" ON public.contract_amendments FOR SELECT TO authenticated USING (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid()));
DROP POLICY IF EXISTS "Cliente ve sus adendas" ON public.contract_amendments;
CREATE POLICY "Cliente ve sus adendas" ON public.contract_amendments FOR SELECT TO authenticated
  USING (contract_amendments.doc_estado <> 'borrador' AND EXISTS (SELECT 1 FROM contracts k WHERE k.id = contract_amendments.contrato_id AND k.cliente_id::text = get_user_client_id(auth.uid())));
-- Escritura solo por las funciones de abajo
GRANT SELECT ON public.contract_amendments TO authenticated;

-- Posiciones adicionales vigentes de un contrato en una fecha
CREATE OR REPLACE FUNCTION public.sf_contract_extra(p_contract_id uuid, p_date date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(sum(posiciones), 0)::int FROM contract_amendments
  WHERE contrato_id = p_contract_id AND doc_estado IN ('para_firma','aceptado','firmado') AND fecha_inicio <= p_date;
$$;
GRANT EXECUTE ON FUNCTION public.sf_contract_extra(uuid, date) TO authenticated;

-- Crear adenda (borrador) — numeración CT-2026-001-A1, A2…
CREATE OR REPLACE FUNCTION public.amendment_create(p_contract_id uuid, p_fecha date, p_posiciones integer, p_precio numeric, p_motivo text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; n int; v_id uuid; v_num text;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO c FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato no encontrado'; END IF;
  IF c.status <> 'ativo' THEN RAISE EXCEPTION 'Solo contratos activos admiten adenda'; END IF;
  IF coalesce(p_posiciones, 0) <= 0 THEN RAISE EXCEPTION 'Indique cuántas posiciones adicionales'; END IF;
  IF coalesce(p_precio, 0) <= 0 THEN RAISE EXCEPTION 'Indique el precio por posición de la adenda'; END IF;
  IF p_fecha IS NULL OR p_fecha < c.data_inicio OR (c.data_termino IS NOT NULL AND p_fecha > c.data_termino) THEN
    RAISE EXCEPTION 'La fecha de inicio debe estar dentro de la vigencia del contrato';
  END IF;
  SELECT count(*) + 1 INTO n FROM contract_amendments WHERE contrato_id = c.id;
  v_num := c.numero || '-A' || n;
  INSERT INTO contract_amendments (contrato_id, numero, fecha_inicio, posiciones, precio, motivo)
  VALUES (c.id, v_num, p_fecha, p_posiciones, round(p_precio, 2), trim(coalesce(p_motivo, '')))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'numero', v_num);
END $$;

-- Editar mientras es borrador
CREATE OR REPLACE FUNCTION public.amendment_update(p_id uuid, p_fecha date, p_posiciones integer, p_precio numeric, p_motivo text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; c record;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  SELECT * INTO a FROM contract_amendments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Adenda no encontrada'; END IF;
  IF a.doc_estado <> 'borrador' THEN RAISE EXCEPTION 'La adenda ya fue emitida; para cambiarla, anúlela y cree otra'; END IF;
  SELECT * INTO c FROM contracts WHERE id = a.contrato_id;
  IF p_fecha < c.data_inicio OR (c.data_termino IS NOT NULL AND p_fecha > c.data_termino) THEN RAISE EXCEPTION 'Fecha fuera de la vigencia del contrato'; END IF;
  IF coalesce(p_posiciones,0) <= 0 OR coalesce(p_precio,0) <= 0 THEN RAISE EXCEPTION 'Posiciones y precio deben ser mayores que cero'; END IF;
  UPDATE contract_amendments SET fecha_inicio = p_fecha, posiciones = p_posiciones, precio = round(p_precio, 2), motivo = trim(coalesce(p_motivo,'')) WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- Emitir para firma: congela el texto y empieza a contar para la facturación
CREATE OR REPLACE FUNCTION public.amendment_issue(p_id uuid, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  SELECT * INTO a FROM contract_amendments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Adenda no encontrada'; END IF;
  IF a.doc_estado NOT IN ('borrador','para_firma') THEN RAISE EXCEPTION 'Esta adenda ya fue aceptada o anulada'; END IF;
  IF length(coalesce(p_texto, '')) < 100 THEN RAISE EXCEPTION 'El texto de la adenda está vacío o incompleto'; END IF;
  IF p_texto ~ '\{\{[^}]+\}\}' THEN RAISE EXCEPTION 'Quedan campos sin completar: %', (regexp_match(p_texto, '\{\{[^}]+\}\}'))[1]; END IF;
  UPDATE contract_amendments SET doc_texto = p_texto, doc_estado = 'para_firma', doc_emitido_at = now(),
         aceptado_at = NULL, aceptado_nombre = NULL, aceptado_documento = NULL, aceptado_por = NULL
   WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- Aceptación electrónica por el cliente
CREATE OR REPLACE FUNCTION public.amendment_accept(p_id uuid, p_nombre text, p_documento text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; c record;
BEGIN
  SELECT * INTO a FROM contract_amendments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Adenda no encontrada'; END IF;
  SELECT * INTO c FROM contracts WHERE id = a.contrato_id;
  IF c.cliente_id::text IS DISTINCT FROM get_user_client_id(auth.uid()) AND NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  IF a.doc_estado <> 'para_firma' THEN RAISE EXCEPTION 'Esta adenda no está disponible para aceptar'; END IF;
  IF length(trim(coalesce(p_nombre, ''))) < 5 THEN RAISE EXCEPTION 'Indique nombre y apellido de quien firma'; END IF;
  IF length(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g')) < 5 THEN RAISE EXCEPTION 'Indique el número de documento de quien firma'; END IF;
  UPDATE contract_amendments SET doc_estado = 'aceptado', aceptado_at = now(), aceptado_nombre = trim(p_nombre),
         aceptado_documento = trim(p_documento), aceptado_por = auth.uid() WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- La gestión valida la copia firmada (anexo tipo "adenda" subido después de emitirla)
CREATE OR REPLACE FUNCTION public.amendment_mark_signed(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  SELECT * INTO a FROM contract_amendments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Adenda no encontrada'; END IF;
  IF a.doc_estado NOT IN ('para_firma','aceptado') THEN RAISE EXCEPTION 'La adenda debe estar emitida para firma'; END IF;
  IF NOT EXISTS (SELECT 1 FROM contract_documents d WHERE d.contrato_id = a.contrato_id AND d.tipo = 'adenda' AND d.created_at >= a.doc_emitido_at) THEN
    RAISE EXCEPTION 'Adjunte primero la copia firmada de la adenda (tipo "Adenda")';
  END IF;
  UPDATE contract_amendments SET doc_estado = 'firmado' WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- Anular (si ya se facturó algún mes, la factura emitida no cambia: corregir con nota de crédito)
CREATE OR REPLACE FUNCTION public.amendment_cancel(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Indique el motivo'; END IF;
  UPDATE contract_amendments SET doc_estado = 'anulada', anulada_motivo = trim(p_motivo) WHERE id = p_id AND doc_estado <> 'anulada';
  IF NOT FOUND THEN RAISE EXCEPTION 'Adenda no encontrada o ya anulada'; END IF;
  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.amendment_create(uuid, date, integer, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amendment_update(uuid, date, integer, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amendment_issue(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amendment_accept(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amendment_mark_signed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amendment_cancel(uuid, text) TO authenticated;

-- Facturación con adendas: líneas propias y excedente contra lo contratado vigente cada día
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

  -- 1b) Adendas: posiciones adicionales desde su fecha de inicio, al precio de la adenda
  IF c.status NOT IN ('rascunho','suspenso') THEN
    FOR r IN SELECT * FROM contract_amendments am
             WHERE am.contrato_id = c.id AND am.doc_estado IN ('para_firma','aceptado','firmado')
               AND am.fecha_inicio <= least(m_end, coalesce(c.data_termino, m_end))
             ORDER BY am.fecha_inicio, am.numero
    LOOP
      a_from := greatest(m_start, c.data_inicio, r.fecha_inicio);
      a_to := least(m_end, coalesce(c.data_termino, m_end));
      IF a_to >= a_from THEN
        days := a_to - a_from + 1;
        amt := round(r.posiciones * r.precio * days / dim, 2);
        ord := ord + 1;
        lines := lines || jsonb_build_object(
          'orden', ord, 'categoria', 'almacenamiento', 'periodo', p_periodo,
          'descripcion', 'Almacenamiento ' || sf_month_name(p_periodo) || ' — adenda ' || r.numero,
          'detalle', r.posiciones || ' posiciones adicionales × ' || sf_money(r.precio)
                     || CASE WHEN days < dim THEN ' · proporcional ' || days || '/' || dim || ' días (' || to_char(a_from,'DD/MM') || '–' || to_char(a_to,'DD/MM') || ')' ELSE '' END,
          'cantidad', r.posiciones, 'unidad', 'posición', 'precio', r.precio, 'importe', amt,
          'base', jsonb_build_object('adenda', r.numero, 'dias', days, 'dias_mes', dim, 'desde', a_from, 'hasta', a_to));
      END IF;
    END LOOP;

    -- 1c) Adendas que empezaron en un mes ya facturado: ese tramo se cobra ahora (una sola vez)
    FOR r IN
      SELECT am.numero, am.posiciones, am.precio, am.fecha_inicio, bi.periodo AS per
      FROM contract_amendments am
      JOIN billing_invoices bi ON bi.contrato_id = am.contrato_id AND bi.kind = 'factura' AND bi.status = 'emitida'
           AND bi.periodo < p_periodo AND bi.periodo >= to_char(am.fecha_inicio, 'YYYY-MM')
      WHERE am.contrato_id = c.id AND am.doc_estado IN ('para_firma','aceptado','firmado')
        AND NOT EXISTS (SELECT 1 FROM billing_invoice_lines bl JOIN billing_invoices b2 ON b2.id = bl.invoice_id
                        WHERE b2.contrato_id = am.contrato_id AND b2.status = 'emitida'
                          AND bl.base->>'adenda' = am.numero AND bl.periodo = bi.periodo)
      ORDER BY bi.periodo, am.numero
    LOOP
      a_from := greatest(to_date(r.per || '-01', 'YYYY-MM-DD'), c.data_inicio, r.fecha_inicio);
      a_to := least((to_date(r.per || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date, coalesce(c.data_termino, m_end));
      IF a_to >= a_from THEN
        days := a_to - a_from + 1;
        amt := round(r.posiciones * r.precio * days / extract(day from (to_date(r.per || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'))::int, 2);
        ord := ord + 1;
        lines := lines || jsonb_build_object(
          'orden', ord, 'categoria', 'almacenamiento', 'periodo', r.per,
          'descripcion', 'Almacenamiento ' || sf_month_name(r.per) || ' — adenda ' || r.numero || ' (desde ' || to_char(a_from, 'DD/MM') || ')',
          'detalle', r.posiciones || ' posiciones adicionales × ' || sf_money(r.precio) || ' · ' || days || ' días (' || to_char(a_from,'DD/MM') || '–' || to_char(a_to,'DD/MM') || ')',
          'cantidad', r.posiciones, 'unidad', 'posición', 'precio', r.precio, 'importe', amt,
          'base', jsonb_build_object('adenda', r.numero, 'dias', days, 'desde', a_from, 'hasta', a_to));
      END IF;
    END LOOP;
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
    SELECT s.d, sum(s.pos) INTO peak_day, peak FROM _sf_presence s GROUP BY s.d
      ORDER BY sum(s.pos) - sf_contract_extra(c.id, s.d) DESC, s.d LIMIT 1;
    IF coalesce(peak, 0) > c.posicoes_contratadas + sf_contract_extra(c.id, peak_day) THEN
      qty := peak - c.posicoes_contratadas - sf_contract_extra(c.id, peak_day);
      amt := round(qty * (c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0)), 2);
      ord := ord + 1;
      lines := lines || jsonb_build_object(
        'orden', ord, 'categoria', 'excedente', 'periodo', u_per,
        'descripcion', 'Posiciones excedentes ' || sf_month_name(u_per),
        'detalle', 'Pico de ' || peak || ' posiciones el ' || to_char(peak_day, 'DD/MM') || ' (contratadas ' || (c.posicoes_contratadas + sf_contract_extra(c.id, peak_day)) || ') · '
                   || sf_num(qty) || ' × ' || sf_money(c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0)),
        'cantidad', qty, 'unidad', 'posición', 'precio', c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0), 'importe', amt,
        'base', jsonb_build_object('pico', peak, 'dia_pico', peak_day, 'contratadas', c.posicoes_contratadas + sf_contract_extra(c.id, peak_day)));
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
REVOKE EXECUTE ON FUNCTION public.billing_compute(uuid, text) FROM authenticated, anon, public;

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
         coalesce((SELECT sum(posicoes_contratadas + sf_contract_extra(k.id, mo.me))::int FROM contracts k WHERE k.cliente_id = cid AND k.status NOT IN ('rascunho')
                   AND k.data_inicio <= mo.me AND (k.data_termino IS NULL OR k.data_termino >= mo.ms)), 0),
         coalesce((SELECT max(pos) FROM pres WHERE pres.per = mo.per), 0),
         coalesce((SELECT round(sum(pos)::numeric / (mo.me - mo.ms + 1), 1) FROM pres WHERE pres.per = mo.per), 0),
         (SELECT count(*)::int FROM movements m WHERE m.cliente_id = cid AND m.status = 'executada'
            AND m.tipo IN ('entrada','saida','transferencia') AND NOT coalesce(m.interna, false)
            AND (m.data_hora AT TIME ZONE 'America/Asuncion')::date BETWEEN mo.ms AND mo.me)
  FROM months mo ORDER BY mo.per;
END $$;

-- El cliente también puede adjuntar la copia firmada de una adenda (sigue sin poder editar ni borrar)
DROP POLICY IF EXISTS "Cliente adjunta documentos" ON public.contract_documents;
CREATE POLICY "Cliente adjunta documentos" ON public.contract_documents FOR INSERT TO authenticated
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND subido_por_cliente = true AND tipo IN ('firmado','anexo','adenda')
              AND path LIKE (cliente_id::text || '/contratos/%')
              AND EXISTS (SELECT 1 FROM contracts c WHERE c.id = contrato_id AND c.cliente_id = contract_documents.cliente_id));
