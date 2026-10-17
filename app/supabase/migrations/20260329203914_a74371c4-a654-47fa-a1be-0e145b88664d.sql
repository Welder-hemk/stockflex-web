
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
