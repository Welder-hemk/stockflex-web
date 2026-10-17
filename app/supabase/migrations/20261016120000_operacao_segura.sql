-- =====================================================================
-- StockFlex — operação segura (16/10/2026)
-- 1) Data local de Assunção nas funções do banco
-- 2) Código de pallet gerado no banco (sem duplicidade)
-- 3) Entrada, confirmação e cancelamento de movimentos em uma única transação
-- 4) Travas de perfil nas funções de painel e fechamento
-- 5) Cliente só cria/cancela as próprias solicitações
-- 6) Recalcula as posições ocupadas por contrato
-- =====================================================================

-- ---------- 1) Data local ----------
CREATE OR REPLACE FUNCTION public.sf_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$ SELECT (now() AT TIME ZONE 'America/Asuncion')::date $$;

-- ---------- 2) Código do pallet ----------
CREATE OR REPLACE FUNCTION public.next_pallet_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max integer;
BEGIN
  -- Trava por transação: duas entradas simultâneas não recebem o mesmo número
  PERFORM pg_advisory_xact_lock(hashtext('stockflex_pallet_code'));
  SELECT COALESCE(MAX(substring(sku FROM '^PL-(\d+)$')::integer), 0)
    INTO v_max
    FROM pallets
   WHERE sku ~ '^PL-\d+$';
  RETURN 'PL-' || lpad((v_max + 1)::text, 6, '0');
END;
$$;

-- Posição contígua (posição 1 ↔ 2 no mesmo vão), usada por pallet duplo
CREATE OR REPLACE FUNCTION public.sf_contiguous_position(p_position_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT o.id
    FROM warehouse_positions p
    JOIN warehouse_positions o
      ON o.rua = p.rua AND o.bloco = p.bloco AND o.nivel = p.nivel
     AND o.posicao = CASE WHEN p.posicao = 1 THEN 2 ELSE 1 END
   WHERE p.id = p_position_id
$$;

-- Ocupa uma posição para um pallet; falha se não estiver livre
CREATE OR REPLACE FUNCTION public.sf_occupy_position(p_position_id text, p_pallet_id uuid, p_cliente_id uuid, p_peso numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pos warehouse_positions%ROWTYPE;
BEGIN
  SELECT * INTO v_pos FROM warehouse_positions WHERE id = p_position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La posición % no existe', p_position_id;
  END IF;
  IF v_pos.status <> 'free' THEN
    RAISE EXCEPTION 'La posición % no está libre (estado: %)', p_position_id, v_pos.status;
  END IF;
  IF p_peso IS NOT NULL AND p_peso > v_pos.capacidade_kg THEN
    RAISE EXCEPTION 'El peso (% kg) supera la capacidad de la posición % (% kg)', p_peso, p_position_id, v_pos.capacidade_kg;
  END IF;
  UPDATE warehouse_positions
     SET status = 'occupied', pallet_id = p_pallet_id, cliente_id = p_cliente_id
   WHERE id = p_position_id;
END;
$$;

-- ---------- 3a) Entrada de pallet novo ----------
-- Mesma assinatura da versão anterior. Mudanças:
--  * SKU vazio → código gerado pelo banco (PL-000001...)
--  * localização sempre igual à posição ocupada
--  * contador do contrato soma só as posições realmente ocupadas
--  * data de entrada no fuso de Assunção
--  * devolve o id do movimento e o SKU, para o comprovante
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
AS $$
DECLARE
  v_pallet_id uuid;
  v_movement_id uuid;
  v_now timestamptz := now();
  v_contract contracts%ROWTYPE;
  v_sku text;
  v_pos1 text;
  v_pos2 text;
  v_count integer := 0;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden registrar pallets';
  END IF;
  IF p_peso IS NULL OR p_peso <= 0 THEN
    RAISE EXCEPTION 'El peso debe ser mayor que cero';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado';
  END IF;
  IF v_contract.status <> 'ativo' THEN
    RAISE EXCEPTION 'El contrato % no está activo (estado: %)', v_contract.numero, v_contract.status;
  END IF;
  IF v_contract.cliente_id <> p_cliente_id THEN
    RAISE EXCEPTION 'El contrato % no pertenece al cliente informado', v_contract.numero;
  END IF;

  v_sku := NULLIF(trim(COALESCE(p_sku, '')), '');
  IF v_sku IS NULL THEN
    v_sku := next_pallet_code();
  ELSIF EXISTS (SELECT 1 FROM pallets WHERE sku = v_sku AND status <> 'expedido') THEN
    RAISE EXCEPTION 'Ya existe un pallet activo con el código %', v_sku;
  END IF;

  v_pos1 := NULLIF(COALESCE(p_position_id, NULLIF(p_localizacao, '')), '');
  v_pos2 := NULLIF(COALESCE(p_position2_id, p_localizacao2), '');
  IF p_pallet_duplo AND v_pos1 IS NOT NULL AND v_pos2 IS NULL THEN
    v_pos2 := sf_contiguous_position(v_pos1);
    IF v_pos2 IS NULL THEN
      RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', v_pos1;
    END IF;
  END IF;

  INSERT INTO pallets (
    cliente_id, contrato_id, sku, descricao, lote, quantidade,
    peso, valor_declarado, status, localizacao, localizacao2,
    data_entrada, ultima_movimentacao, largo, ancho, alto,
    seguro, pallet_duplo
  ) VALUES (
    p_cliente_id, p_contrato_id, v_sku, COALESCE(p_descricao, ''), p_lote, p_quantidade,
    p_peso, COALESCE(p_valor_declarado, 0),
    CASE WHEN v_pos1 IS NULL THEN 'aguardando_entrada'::pallet_status ELSE 'armazenado'::pallet_status END,
    COALESCE(v_pos1, ''), v_pos2,
    sf_today(), v_now, p_largo, p_ancho, p_alto,
    COALESCE(p_seguro, false), COALESCE(p_pallet_duplo, false)
  ) RETURNING id INTO v_pallet_id;

  IF v_pos1 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos1, v_pallet_id, p_cliente_id, p_peso);
    v_count := 1;
  END IF;
  IF v_pos2 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos2, v_pallet_id, p_cliente_id, NULL);
    v_count := v_count + 1;
  END IF;

  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final
  ) VALUES (
    'entrada', v_now, COALESCE(p_operador, ''), p_operador_id, p_cliente_id, p_contrato_id,
    v_pallet_id, 'Exterior', COALESCE(v_pos1, ''), 'Ingreso inicial',
    CASE WHEN v_pos1 IS NULL THEN 'solicitada'::movement_status ELSE 'executada'::movement_status END,
    p_peso, p_peso
  ) RETURNING id INTO v_movement_id;

  IF v_count > 0 THEN
    UPDATE contracts SET posicoes_ocupadas = posicoes_ocupadas + v_count WHERE id = p_contrato_id;
  END IF;

  RETURN jsonb_build_object('pallet_id', v_pallet_id, 'movement_id', v_movement_id, 'sku', v_sku,
                            'localizacao', v_pos1, 'localizacao2', v_pos2);
END;
$$;

-- ---------- 3b) Confirmar movimento solicitado (tudo ou nada) ----------
CREATE OR REPLACE FUNCTION public.confirm_movement(
  p_movement_id uuid,
  p_destino text DEFAULT NULL,
  p_peso_final numeric DEFAULT NULL,
  p_operador text DEFAULT NULL,
  p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov movements%ROWTYPE;
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_dest text;
  v_dest2 text;
  v_freed integer := 0;
  v_count integer := 0;
  v_pos warehouse_positions%ROWTYPE;
  v_peso numeric;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden confirmar movimientos';
  END IF;

  SELECT * INTO v_mov FROM movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;
  IF v_mov.status NOT IN ('solicitada', 'aprovada') THEN
    RAISE EXCEPTION 'El movimiento ya está %', v_mov.status;
  END IF;

  SELECT * INTO v_pallet FROM pallets WHERE id = v_mov.pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet del movimiento no encontrado';
  END IF;

  v_dest := NULLIF(COALESCE(p_destino, v_mov.destino_local), '');
  v_peso := COALESCE(NULLIF(p_peso_final, 0), NULLIF(v_mov.peso_final, 0), v_pallet.peso);

  CASE v_mov.tipo
    WHEN 'entrada' THEN
      IF v_pallet.status <> 'aguardando_entrada' THEN
        RAISE EXCEPTION 'El pallet % no está esperando ingreso (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      IF v_dest IS NULL THEN
        RAISE EXCEPTION 'Indique la posición de destino';
      END IF;
      PERFORM sf_occupy_position(v_dest, v_pallet.id, v_pallet.cliente_id, v_peso);
      v_count := 1;
      IF v_pallet.pallet_duplo THEN
        v_dest2 := sf_contiguous_position(v_dest);
        IF v_dest2 IS NULL THEN
          RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', v_dest;
        END IF;
        PERFORM sf_occupy_position(v_dest2, v_pallet.id, v_pallet.cliente_id, NULL);
        v_count := 2;
      END IF;
      UPDATE pallets
         SET status = 'armazenado', localizacao = v_dest, localizacao2 = v_dest2,
             peso = v_peso, ultima_movimentacao = v_now
       WHERE id = v_pallet.id;
      UPDATE contracts SET posicoes_ocupadas = posicoes_ocupadas + v_count WHERE id = v_pallet.contrato_id;

    WHEN 'saida' THEN
      IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
        RAISE EXCEPTION 'El pallet % no puede salir (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
       WHERE pallet_id = v_pallet.id;
      GET DIAGNOSTICS v_freed = ROW_COUNT;
      UPDATE pallets
         SET status = 'expedido', localizacao = '', localizacao2 = NULL, ultima_movimentacao = v_now
       WHERE id = v_pallet.id;
      UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed)
       WHERE id = v_pallet.contrato_id;
      v_dest := COALESCE(v_dest, 'Exterior');

    WHEN 'transferencia' THEN
      IF v_pallet.status <> 'armazenado' THEN
        RAISE EXCEPTION 'El pallet % no puede transferirse (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      IF v_dest IS NULL THEN
        RAISE EXCEPTION 'Indique la posición de destino';
      END IF;
      IF v_dest = v_pallet.localizacao THEN
        RAISE EXCEPTION 'La posición de destino es la misma que la de origen';
      END IF;
      UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
       WHERE pallet_id = v_pallet.id;
      GET DIAGNOSTICS v_freed = ROW_COUNT;
      PERFORM sf_occupy_position(v_dest, v_pallet.id, v_pallet.cliente_id, v_peso);
      v_count := 1;
      IF v_pallet.pallet_duplo THEN
        v_dest2 := sf_contiguous_position(v_dest);
        IF v_dest2 IS NULL THEN
          RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', v_dest;
        END IF;
        PERFORM sf_occupy_position(v_dest2, v_pallet.id, v_pallet.cliente_id, NULL);
        v_count := 2;
      END IF;
      UPDATE pallets
         SET localizacao = v_dest, localizacao2 = v_dest2, peso = v_peso, ultima_movimentacao = v_now
       WHERE id = v_pallet.id;
      IF v_count <> v_freed THEN
        UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed + v_count)
         WHERE id = v_pallet.contrato_id;
      END IF;

    WHEN 'ajuste' THEN
      UPDATE pallets
         SET peso = v_peso,
             valor_declarado = COALESCE(NULLIF(v_mov.novo_valor_declarado, 0), valor_declarado),
             ultima_movimentacao = v_now
       WHERE id = v_pallet.id;

    WHEN 'avaria' THEN
      UPDATE pallets SET ultima_movimentacao = v_now WHERE id = v_pallet.id;

    WHEN 'bloqueio' THEN
      -- Bloqueia uma posição livre ou libera uma posição bloqueada
      SELECT * INTO v_pos FROM warehouse_positions
       WHERE id = COALESCE(v_dest, NULLIF(v_mov.origem_local, '')) FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Posición a bloquear/liberar no encontrada';
      END IF;
      IF v_pos.status = 'free' THEN
        UPDATE warehouse_positions SET status = 'blocked' WHERE id = v_pos.id;
      ELSIF v_pos.status = 'blocked' THEN
        UPDATE warehouse_positions SET status = 'free' WHERE id = v_pos.id;
      ELSE
        RAISE EXCEPTION 'La posición % está ocupada; no se puede bloquear', v_pos.id;
      END IF;
      v_dest := v_pos.id;
  END CASE;

  UPDATE movements
     SET status = 'executada',
         data_hora = v_now,
         destino_local = COALESCE(v_dest, destino_local),
         peso_final = v_peso,
         operador = COALESCE(NULLIF(p_operador, ''), operador),
         operador_id = COALESCE(p_operador_id, operador_id)
   WHERE id = v_mov.id;

  -- Solicitações do cliente: fecha quando todos os movimentos vinculados estiverem executados
  UPDATE client_requests r
     SET status = 'executado'
   WHERE v_mov.id = ANY(r.movimento_ids)
     AND r.status IN ('pendente', 'separado')
     AND NOT EXISTS (
       SELECT 1 FROM movements m
        WHERE m.id = ANY(r.movimento_ids) AND m.status <> 'executada'
     );

  RETURN jsonb_build_object('success', true, 'movement_id', v_mov.id, 'pallet_id', v_pallet.id,
                            'destino', v_dest, 'destino2', v_dest2);
END;
$$;

-- ---------- 3c) Cancelar movimento solicitado ----------
CREATE OR REPLACE FUNCTION public.cancel_movement(p_movement_id uuid, p_motivo text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov movements%ROWTYPE;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  SELECT * INTO v_mov FROM movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;
  IF v_mov.status NOT IN ('solicitada', 'aprovada') THEN
    RAISE EXCEPTION 'Solo se pueden cancelar movimientos pendientes (estado: %)', v_mov.status;
  END IF;
  UPDATE movements
     SET status = 'cancelada',
         motivo = CASE WHEN COALESCE(trim(p_motivo), '') = '' THEN motivo
                       ELSE trim(both ' ' FROM motivo || ' | Cancelado: ' || trim(p_motivo)) END
   WHERE id = p_movement_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Saída e transferência diretas: mesmas regras, agora com data local e id do movimento
CREATE OR REPLACE FUNCTION public.execute_pallet_exit(
  p_pallet_id uuid, p_motivo text DEFAULT '', p_autorizado_id text DEFAULT NULL,
  p_operador text DEFAULT '', p_operador_id text DEFAULT NULL,
  p_peso_final numeric DEFAULT 0, p_destino text DEFAULT 'Exterior'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_freed integer := 0;
  v_movement_id uuid;
  v_origem text;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden registrar salidas';
  END IF;
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet no encontrado';
  END IF;
  IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
    RAISE EXCEPTION 'El pallet % no puede salir (estado: %)', v_pallet.sku, v_pallet.status;
  END IF;
  IF p_peso_final < 0 THEN
    RAISE EXCEPTION 'El peso final no puede ser negativo';
  END IF;
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de la salida es obligatorio';
  END IF;
  IF p_autorizado_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM authorized_contacts
     WHERE id::text = p_autorizado_id AND cliente_id = v_pallet.cliente_id AND ativo
  ) THEN
    RAISE EXCEPTION 'El autorizado no pertenece a este cliente o está inactivo';
  END IF;

  v_origem := concat_ws(' / ', NULLIF(v_pallet.localizacao, ''), v_pallet.localizacao2);
  UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
   WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_freed = ROW_COUNT;
  UPDATE pallets
     SET status = 'expedido', localizacao = '', localizacao2 = NULL, ultima_movimentacao = v_now
   WHERE id = p_pallet_id;
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, autorizado_id
  ) VALUES (
    'saida', v_now, COALESCE(p_operador, ''), p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_origem, COALESCE(NULLIF(p_destino, ''), 'Exterior'), trim(p_motivo), 'executada',
    v_pallet.peso, COALESCE(NULLIF(p_peso_final, 0), v_pallet.peso), p_autorizado_id
  ) RETURNING id INTO v_movement_id;
  UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed)
   WHERE id = v_pallet.contrato_id;
  RETURN jsonb_build_object('success', true, 'positions_freed', v_freed, 'movement_id', v_movement_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_pallet(
  p_pallet_id uuid, p_new_position_id text, p_new_position2_id text DEFAULT NULL,
  p_motivo text DEFAULT '', p_operador text DEFAULT '', p_operador_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_now timestamptz := now();
  v_old text;
  v_pos2 text;
  v_freed integer := 0;
  v_count integer := 1;
  v_movement_id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado: solo operadores y administradores pueden transferir pallets';
  END IF;
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet no encontrado';
  END IF;
  IF v_pallet.status <> 'armazenado' THEN
    RAISE EXCEPTION 'El pallet % no puede transferirse (estado: %)', v_pallet.sku, v_pallet.status;
  END IF;
  IF p_new_position_id IS NULL OR p_new_position_id = '' THEN
    RAISE EXCEPTION 'Indique la posición de destino';
  END IF;
  IF p_new_position_id = v_pallet.localizacao THEN
    RAISE EXCEPTION 'La posición de destino es la misma que la de origen';
  END IF;

  v_old := concat_ws(' / ', NULLIF(v_pallet.localizacao, ''), v_pallet.localizacao2);
  v_pos2 := NULLIF(p_new_position2_id, '');
  IF v_pallet.pallet_duplo AND v_pos2 IS NULL THEN
    v_pos2 := sf_contiguous_position(p_new_position_id);
    IF v_pos2 IS NULL THEN
      RAISE EXCEPTION 'Pallet doble: la posición % no tiene posición contigua', p_new_position_id;
    END IF;
  END IF;

  UPDATE warehouse_positions SET status = 'free', pallet_id = NULL, cliente_id = NULL
   WHERE pallet_id = p_pallet_id;
  GET DIAGNOSTICS v_freed = ROW_COUNT;
  PERFORM sf_occupy_position(p_new_position_id, p_pallet_id, v_pallet.cliente_id, v_pallet.peso);
  IF v_pos2 IS NOT NULL THEN
    PERFORM sf_occupy_position(v_pos2, p_pallet_id, v_pallet.cliente_id, NULL);
    v_count := 2;
  END IF;
  UPDATE pallets
     SET localizacao = p_new_position_id, localizacao2 = v_pos2, ultima_movimentacao = v_now
   WHERE id = p_pallet_id;
  INSERT INTO movements (
    tipo, data_hora, operador, operador_id, cliente_id, contrato_id,
    pallet_id, origem_local, destino_local, motivo, status,
    peso_inicial, peso_final, interna
  ) VALUES (
    'transferencia', v_now, COALESCE(p_operador, ''), p_operador_id, v_pallet.cliente_id, v_pallet.contrato_id,
    p_pallet_id, v_old, concat_ws(' / ', p_new_position_id, v_pos2), COALESCE(p_motivo, ''), 'executada',
    v_pallet.peso, v_pallet.peso, true
  ) RETURNING id INTO v_movement_id;
  IF v_count <> v_freed THEN
    UPDATE contracts SET posicoes_ocupadas = GREATEST(0, posicoes_ocupadas - v_freed + v_count)
     WHERE id = v_pallet.contrato_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'new_location', p_new_position_id,
                            'new_location2', v_pos2, 'movement_id', v_movement_id);
END;
$$;

-- ---------- 5) Solicitações do cliente ----------
DROP POLICY IF EXISTS "Cliente manage own requests" ON public.client_requests;
DROP POLICY IF EXISTS "Cliente read own requests" ON public.client_requests;
DROP POLICY IF EXISTS "Cliente create own requests" ON public.client_requests;
DROP POLICY IF EXISTS "Cliente cancel own requests" ON public.client_requests;

CREATE POLICY "Cliente read own requests" ON public.client_requests
  FOR SELECT TO authenticated
  USING (cliente_id::text = get_user_client_id(auth.uid()));

CREATE POLICY "Cliente create own requests" ON public.client_requests
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND status = 'pendente');

CREATE POLICY "Cliente cancel own requests" ON public.client_requests
  FOR UPDATE TO authenticated
  USING (cliente_id::text = get_user_client_id(auth.uid()) AND status = 'pendente')
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND status IN ('pendente', 'cancelado'));

-- ---------- 6) Recalcula posições ocupadas por contrato ----------
UPDATE contracts c
   SET posicoes_ocupadas = COALESCE(x.n, 0)
  FROM (
    SELECT ct.id, (
      SELECT count(*) FROM warehouse_positions wp
        JOIN pallets p ON p.id = wp.pallet_id
       WHERE p.contrato_id = ct.id AND wp.status = 'occupied'
    ) AS n
    FROM contracts ct
  ) x
 WHERE x.id = c.id AND c.posicoes_ocupadas IS DISTINCT FROM COALESCE(x.n, 0);

-- Movimentos: índice para a busca por pallet + status (fila de pendentes)
CREATE INDEX IF NOT EXISTS idx_movements_pallet_status ON public.movements (pallet_id, status);
CREATE INDEX IF NOT EXISTS idx_pallets_sku ON public.pallets (sku);

-- ---------- 4) Travas de perfil no painel e no fechamento ----------
CREATE OR REPLACE FUNCTION public.dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_occupancy_by_client()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_financial_summary(p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_min_date date;
  v_max_date date;
BEGIN
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.monthly_close_data(p_month text, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_month_start date;
  v_month_end date;
BEGIN
  -- Equipe interna vê todos; cliente só enxerga o próprio fechamento
  IF NOT (is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid())) THEN
    IF get_user_client_id(auth.uid()) IS NULL THEN
      RAISE EXCEPTION 'Permiso denegado';
    END IF;
    p_client_id := get_user_client_id(auth.uid())::uuid;
  END IF;
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
$function$;

-- ---------- Execução das funções: só usuários logados ----------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'register_pallet_entry(uuid,uuid,text,text,text,integer,numeric,numeric,text,text,numeric,numeric,numeric,boolean,boolean,text,text,text,text)',
    'confirm_movement(uuid,text,numeric,text,text)',
    'cancel_movement(uuid,text)',
    'execute_pallet_exit(uuid,text,text,text,text,numeric,text)',
    'transfer_pallet(uuid,text,text,text,text,text)',
    'delete_pallet_safe(uuid)',
    'next_pallet_code()',
    'sf_occupy_position(text,uuid,uuid,numeric)',
    'dashboard_stats()',
    'dashboard_occupancy_by_client()',
    'dashboard_financial_summary(text,text)',
    'monthly_close_data(text,uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
-- Funções internas não devem ser chamadas diretamente pelo app
REVOKE EXECUTE ON FUNCTION public.sf_occupy_position(text,uuid,uuid,numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_pallet_code() FROM authenticated;
