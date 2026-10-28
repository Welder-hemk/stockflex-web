-- =====================================================================
-- 28/10/2026 — Proyección financiera dentro del sistema
--  * Escenarios del simulador guardados (uno marcado como "base" = plan oficial).
--  * Categoría de gasto "inversion" (activo fijo: estructura, apiladora, seguridad, obras).
--    No entra en EBITDA; sí en el caja.
--  * projection_actuals(): datos reales por mes para comparar con el escenario.
-- =====================================================================

ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'inversion';

CREATE TABLE IF NOT EXISTS public.projection_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 80),
  inicio text NOT NULL CHECK (inicio ~ '^\d{4}-\d{2}$'),   -- mes 1 de la proyección
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  es_base boolean NOT NULL DEFAULT false,
  notas text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS projection_scenarios_one_base ON public.projection_scenarios (es_base) WHERE es_base;

ALTER TABLE public.projection_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestion lee escenarios" ON public.projection_scenarios;
CREATE POLICY "Gestion lee escenarios" ON public.projection_scenarios FOR SELECT TO authenticated
  USING (is_admin_or_financeiro(auth.uid()));
DROP POLICY IF EXISTS "Gestion escribe escenarios" ON public.projection_scenarios;
CREATE POLICY "Gestion escribe escenarios" ON public.projection_scenarios FOR ALL TO authenticated
  USING (is_admin_or_financeiro(auth.uid())) WITH CHECK (is_admin_or_financeiro(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projection_scenarios TO authenticated;

-- Marca un escenario como base (desmarca el anterior en la misma transacción)
CREATE OR REPLACE FUNCTION public.projection_set_base(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  UPDATE projection_scenarios SET es_base = false WHERE es_base AND id <> p_id;
  UPDATE projection_scenarios SET es_base = true, updated_at = now() WHERE id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.projection_set_base(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.projection_set_base(uuid) TO authenticated;

-- Datos reales por mes (todos los depósitos)
--   posiciones           posiciones registradas hoy (no bloqueadas) — capacidad de referencia
--   pallets_promedio     posiciones ocupadas en promedio por día (pallet doble = 2)
--   pallets_pico         máximo diario del mes
--   facturado            facturas + notas de crédito emitidas del período (IVA incluido)
--   cobrado              pagos recibidos con fecha en el mes (sin anulados)
--   gastos               gastos del mes (competencia), sin inversiones, en US$
--   gastos_cac           de los gastos, comisiones de captación
--   inversiones          gastos de categoría "inversion" del mes
--   gastos_categoria     detalle por categoría (US$)
CREATE OR REPLACE FUNCTION public.projection_actuals(p_desde text, p_hasta text)
RETURNS TABLE (periodo text, posiciones int, pallets_promedio numeric, pallets_pico int, facturado numeric,
               cobrado numeric, gastos numeric, gastos_cac numeric, inversiones numeric, gastos_categoria jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  IF p_desde !~ '^\d{4}-\d{2}$' OR p_hasta !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Período inválido'; END IF;
  RETURN QUERY
  WITH months AS (
    SELECT to_char(g, 'YYYY-MM') AS per, g::date AS ms, least((g + interval '1 month - 1 day')::date, sf_today()) AS me
      FROM generate_series(to_date(p_desde || '-01', 'YYYY-MM-DD'), to_date(p_hasta || '-01', 'YYYY-MM-DD'), interval '1 month') g
     WHERE g::date <= sf_today()
  ),
  pal AS (
    SELECT p.id, p.data_entrada AS ent, sf_pallet_exit_date(p.id) AS sal, CASE WHEN p.pallet_duplo THEN 2 ELSE 1 END AS w
      FROM pallets p
     WHERE p.status <> 'aguardando_entrada' AND p.data_entrada IS NOT NULL
  ),
  daily AS (
    SELECT mo.per, d::date AS d, sum(pal.w)::int AS pos
      FROM months mo
      JOIN pal ON pal.ent <= mo.me AND (pal.sal IS NULL OR pal.sal >= mo.ms)
     CROSS JOIN LATERAL generate_series(greatest(mo.ms, pal.ent), least(mo.me, coalesce(pal.sal, mo.me)), interval '1 day') d
     GROUP BY mo.per, d::date
  ),
  exp AS (
    SELECT e.competencia AS per, e.categoria::text AS cat, sum(e.valor_usd) AS v
      FROM expenses e GROUP BY 1, 2
  )
  SELECT mo.per,
         (SELECT count(*)::int FROM warehouse_positions w JOIN warehouses h ON h.id = w.warehouse_id
           WHERE h.active AND w.status <> 'blocked'),
         coalesce((SELECT round(sum(pos)::numeric / (mo.me - mo.ms + 1), 1) FROM daily WHERE daily.per = mo.per), 0),
         coalesce((SELECT max(pos) FROM daily WHERE daily.per = mo.per), 0),
         coalesce((SELECT sum(i.total) FROM billing_invoices i WHERE i.periodo = mo.per AND i.status = 'emitida'), 0),
         coalesce((SELECT sum(b.importe) FROM billing_payments b WHERE NOT b.anulado AND b.fecha BETWEEN mo.ms AND (mo.ms + interval '1 month - 1 day')::date), 0),
         coalesce((SELECT sum(v) FROM exp WHERE exp.per = mo.per AND exp.cat <> 'inversion'), 0),
         coalesce((SELECT sum(v) FROM exp WHERE exp.per = mo.per AND exp.cat = 'cac'), 0),
         coalesce((SELECT sum(v) FROM exp WHERE exp.per = mo.per AND exp.cat = 'inversion'), 0),
         coalesce((SELECT jsonb_object_agg(cat, round(v, 2)) FROM exp WHERE exp.per = mo.per), '{}'::jsonb)
    FROM months mo
   ORDER BY mo.per;
END $$;
REVOKE EXECUTE ON FUNCTION public.projection_actuals(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.projection_actuals(text, text) TO authenticated;


-- Dashboard: las inversiones (activo fijo) no cuentan como gasto del mes
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
  LEFT JOIN (SELECT competencia, sum(coalesce(valor_usd, valor)) AS total FROM expenses WHERE categoria::text <> 'inversion' GROUP BY competencia) ex ON ex.competencia = m.k
  LEFT JOIN (
    SELECT to_char(ms, 'YYYY-MM') AS k, sum(c.posicoes_contratadas * (c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0))) AS total
    FROM contracts c CROSS JOIN LATERAL generate_series(date_trunc('month', c.data_inicio), date_trunc('month', c.data_termino), interval '1 month') ms
    WHERE c.status = 'ativo' GROUP BY 1
  ) est ON est.k = m.k;
  RETURN result;
END $function$;
