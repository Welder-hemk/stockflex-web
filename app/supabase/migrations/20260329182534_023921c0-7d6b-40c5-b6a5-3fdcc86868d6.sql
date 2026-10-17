
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
