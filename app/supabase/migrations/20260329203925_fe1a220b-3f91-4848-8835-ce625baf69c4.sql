
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
