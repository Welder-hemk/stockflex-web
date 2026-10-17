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