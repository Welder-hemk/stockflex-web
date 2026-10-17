-- =====================================================================
-- StockFlex — operação v2 (17/10/2026)
-- * Ingresso recusa contrato vencido e cliente inativo
-- * Cancelar movimento fecha a solicitação do cliente quando nada mais pende
-- * Saída cancela pendentes do pallet e fecha a solicitação de retirada
-- * Solicitações do cliente processadas pela equipe numa só transação
-- * Base de prospectos: dados anônimos não sobrescrevem um contato existente
-- =====================================================================

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
  IF v_contract.data_termino < sf_today() THEN
    RAISE EXCEPTION 'El contrato % venció el %', v_contract.numero, to_char(v_contract.data_termino, 'DD/MM/YYYY');
  END IF;
  IF NOT (SELECT ativo FROM clients WHERE id = p_cliente_id) THEN
    RAISE EXCEPTION 'El cliente está inactivo';
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
  -- Solicitação do cliente ligada a este movimento: fecha se não sobrar nada pendente
  UPDATE client_requests r
     SET status = CASE WHEN EXISTS (SELECT 1 FROM movements m WHERE m.id = ANY(r.movimento_ids) AND m.status = 'executada')
                       THEN 'executado'::request_status ELSE 'cancelado'::request_status END
   WHERE p_movement_id = ANY(r.movimento_ids) AND r.status IN ('pendente', 'separado')
     AND NOT EXISTS (SELECT 1 FROM movements m WHERE m.id = ANY(r.movimento_ids) AND m.status IN ('solicitada', 'aprovada'));
  RETURN jsonb_build_object('success', true);
END;
$$;

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
  -- Movimentos pendentes deste pallet perdem sentido: saída pendente vira a executada, os demais são cancelados
  UPDATE client_requests r SET movimento_ids = array_append(COALESCE(r.movimento_ids, '{}'), v_movement_id)
   WHERE r.status IN ('pendente', 'separado') AND p_pallet_id = ANY(r.pallet_ids) AND r.tipo = 'coleta'
     AND NOT (v_movement_id = ANY(COALESCE(r.movimento_ids, '{}')));
  UPDATE movements SET status = 'cancelada', motivo = trim(both ' ' FROM motivo || ' | Cancelado: pallet ya salió')
   WHERE pallet_id = p_pallet_id AND status IN ('solicitada', 'aprovada') AND id <> v_movement_id;
  UPDATE client_requests r SET status = 'executado'
   WHERE r.status IN ('pendente', 'separado') AND p_pallet_id = ANY(r.pallet_ids) AND r.tipo = 'coleta'
     AND NOT EXISTS (
       SELECT 1 FROM unnest(r.pallet_ids) pid JOIN pallets p ON p.id = pid WHERE p.status <> 'expedido'
     );
  RETURN jsonb_build_object('success', true, 'positions_freed', v_freed, 'movement_id', v_movement_id);
END;
$$;

-- ---------- Processar solicitação do cliente ----------
-- coleta (retirada): cria um movimento de saída pendente por pallet e reserva os pallets
-- ingreso (envio de mercadoria): marca como separado (a entrada é registrada na operação)
-- acesso (visita): marca como executado
CREATE OR REPLACE FUNCTION public.process_client_request(p_request_id uuid, p_action text, p_motivo text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req client_requests%ROWTYPE;
  v_ids uuid[] := '{}';
  v_pallet pallets%ROWTYPE;
  v_mid uuid;
  v_user_name text;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  SELECT * INTO v_req FROM client_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  SELECT nome INTO v_user_name FROM profiles WHERE id = auth.uid();

  IF p_action = 'cancelar' THEN
    IF v_req.status NOT IN ('pendente', 'separado') THEN
      RAISE EXCEPTION 'La solicitud ya está %', v_req.status;
    END IF;
    UPDATE movements SET status = 'cancelada', motivo = trim(both ' ' FROM motivo || ' | Solicitud cancelada: ' || COALESCE(p_motivo, ''))
     WHERE id = ANY(COALESCE(v_req.movimento_ids, '{}')) AND status IN ('solicitada', 'aprovada');
    UPDATE pallets SET status = 'armazenado'
     WHERE id = ANY(v_req.pallet_ids) AND status = 'reservado_saida';
    UPDATE client_requests SET status = 'cancelado', operador_id = auth.uid()::text,
           observacoes = trim(both ' ' FROM COALESCE(observacoes, '') || ' | Cancelada: ' || COALESCE(p_motivo, ''))
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'cancelado');
  END IF;

  IF p_action <> 'procesar' THEN
    RAISE EXCEPTION 'Acción inválida';
  END IF;
  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'La solicitud ya está %', v_req.status;
  END IF;

  IF v_req.tipo = 'coleta' THEN
    IF cardinality(v_req.pallet_ids) = 0 THEN RAISE EXCEPTION 'La solicitud no tiene pallets'; END IF;
    FOR v_pallet IN SELECT * FROM pallets WHERE id = ANY(v_req.pallet_ids) FOR UPDATE LOOP
      IF v_pallet.cliente_id <> v_req.cliente_id THEN
        RAISE EXCEPTION 'El pallet % no pertenece al cliente', v_pallet.sku;
      END IF;
      IF v_pallet.status NOT IN ('armazenado', 'reservado_saida') THEN
        RAISE EXCEPTION 'El pallet % no está en depósito (estado: %)', v_pallet.sku, v_pallet.status;
      END IF;
      INSERT INTO movements (tipo, operador, operador_id, cliente_id, contrato_id, pallet_id, origem_local, destino_local, motivo, status, peso_inicial, peso_final)
      VALUES ('saida', COALESCE(v_user_name, ''), auth.uid()::text, v_pallet.cliente_id, v_pallet.contrato_id, v_pallet.id,
              concat_ws(' / ', NULLIF(v_pallet.localizacao, ''), v_pallet.localizacao2), 'Exterior', 'Retiro solicitado por el cliente', 'solicitada',
              v_pallet.peso, v_pallet.peso)
      RETURNING id INTO v_mid;
      v_ids := array_append(v_ids, v_mid);
      UPDATE pallets SET status = 'reservado_saida' WHERE id = v_pallet.id;
    END LOOP;
    UPDATE client_requests SET status = 'separado', operador_id = auth.uid()::text,
           movimento_ids = COALESCE(movimento_ids, '{}') || v_ids
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'separado', 'movement_ids', to_jsonb(v_ids));
  ELSIF v_req.tipo = 'ingreso' THEN
    UPDATE client_requests SET status = 'separado', operador_id = auth.uid()::text WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'separado');
  ELSE
    UPDATE client_requests SET status = 'executado', operador_id = auth.uid()::text WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'executado');
  END IF;
END;
$$;

-- Ingreso agendado pelo cliente: fecha quando a equipe confirma a chegada
CREATE OR REPLACE FUNCTION public.close_client_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  UPDATE client_requests SET status = 'executado', operador_id = auth.uid()::text
   WHERE id = p_request_id AND status IN ('pendente', 'separado');
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada o ya cerrada'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_client_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_client_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_client_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_client_request(uuid) TO authenticated;

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
    -- Dados vindos do site só preenchem o que está vazio (não sobrescrevem o cadastro)
    name = CASE WHEN c.name = '' THEN EXCLUDED.name ELSE c.name END,
    company = CASE WHEN c.company = '' THEN EXCLUDED.company ELSE c.company END,
    phone = CASE WHEN c.phone = '' THEN EXCLUDED.phone ELSE c.phone END,
    tax_id = CASE WHEN c.tax_id = '' THEN EXCLUDED.tax_id ELSE c.tax_id END,
    lang = EXCLUDED.lang,
    consent_marketing = c.consent_marketing OR EXCLUDED.consent_marketing,
    consent_at = COALESCE(c.consent_at, EXCLUDED.consent_at),
    last_source = CASE WHEN EXCLUDED.last_source <> '' THEN EXCLUDED.last_source ELSE c.last_source END,
    -- Volta ao site e repete o interesse: soma 5 pontos por nova interação
    -- Volta ao site: +5 no máximo uma vez a cada 6 horas
    score = LEAST(100, GREATEST(c.score, EXCLUDED.score) + CASE WHEN c.last_seen_at < now() - interval '6 hours' THEN 5 ELSE 0 END),
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
