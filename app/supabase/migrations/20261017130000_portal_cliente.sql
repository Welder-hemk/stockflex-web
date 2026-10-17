-- Portal del cliente: autorizados propuestos por el cliente y bloqueo de costos ya facturados

-- 1) El cliente propone autorizados (quedan inactivos hasta que StockFlex los apruebe)
ALTER TABLE public.authorized_contacts ADD COLUMN IF NOT EXISTS solicitado_por_cliente boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Cliente propone autorizados" ON public.authorized_contacts;
CREATE POLICY "Cliente propone autorizados" ON public.authorized_contacts FOR INSERT TO authenticated
  WITH CHECK (cliente_id::text = get_user_client_id(auth.uid()) AND ativo = false AND solicitado_por_cliente = true);

-- Documento del autorizado: el cliente sube a su carpeta documents/<cliente>/autorizados/
DROP POLICY IF EXISTS "Cliente sube documentos de autorizados" ON storage.objects;
CREATE POLICY "Cliente sube documentos de autorizados" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents'
              AND (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
              AND (storage.foldername(name))[2] = 'autorizados');

-- El cliente puede dar de baja (nunca dar de alta) a un autorizado suyo
CREATE OR REPLACE FUNCTION public.client_deactivate_contact(p_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid text := get_user_client_id(auth.uid()); n int;
BEGIN
  IF cid IS NULL AND NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  UPDATE authorized_contacts SET ativo = false,
         observacoes = trim(coalesce(observacoes, '') || ' [Baja solicitada por el cliente ' || to_char(sf_today(), 'DD/MM/YYYY') || ']')
   WHERE id = p_contact_id AND (cliente_id::text = cid OR is_staff(auth.uid()));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Autorizado no encontrado'; END IF;
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.client_deactivate_contact(uuid) TO authenticated;

-- 2) Un costo extra ya facturado no se edita ni se borra (se corrige con nota de crédito)
CREATE OR REPLACE FUNCTION public.protect_billed_extra_cost()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Este costo ya fue facturado; corrija con una nota de crédito'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.invoice_id IS NOT NULL AND current_setting('sf.billing_rpc', true) IS DISTINCT FROM 'on'
     AND (NEW.valor_total IS DISTINCT FROM OLD.valor_total OR NEW.valor_unitario IS DISTINCT FROM OLD.valor_unitario
          OR NEW.quantidade IS DISTINCT FROM OLD.quantidade OR NEW.status_aprovacao IS DISTINCT FROM OLD.status_aprovacao
          OR NEW.competencia IS DISTINCT FROM OLD.competencia OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id) THEN
    RAISE EXCEPTION 'Este costo ya fue facturado; corrija con una nota de crédito';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_billed_extra_cost ON public.extra_costs;
CREATE TRIGGER trg_protect_billed_extra_cost BEFORE UPDATE OR DELETE ON public.extra_costs
  FOR EACH ROW EXECUTE FUNCTION public.protect_billed_extra_cost();

-- 3) Dashboard: ingresos = facturado (facturas emitidas − notas de crédito) por período; meses futuros = estimado por contratos
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
  LEFT JOIN (SELECT competencia, sum(coalesce(valor_usd, valor)) AS total FROM expenses GROUP BY competencia) ex ON ex.competencia = m.k
  LEFT JOIN (
    SELECT to_char(ms, 'YYYY-MM') AS k, sum(c.posicoes_contratadas * (c.preco_por_posicao + coalesce(c.recargo_por_posicao, 0))) AS total
    FROM contracts c CROSS JOIN LATERAL generate_series(date_trunc('month', c.data_inicio), date_trunc('month', c.data_termino), interval '1 month') ms
    WHERE c.status = 'ativo' GROUP BY 1
  ) est ON est.k = m.k;
  RETURN result;
END $function$;

-- 4) Contrato firmado guardado de verdad (antes quedaba solo en la pantalla)
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS archivo_firmado text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS firmado_at timestamptz;

-- 5) Cerrar contrato: sin pallets en depósito; el término pasa a la fecha de cierre (la facturación prorratea)
CREATE OR REPLACE FUNCTION public.close_contract(p_contract_id uuid, p_fecha date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; n int; f date := coalesce(p_fecha, sf_today()); drafts int;
BEGIN
  IF NOT is_admin_or_financeiro(auth.uid()) THEN RAISE EXCEPTION 'Permiso denegado: solo administración o finanzas'; END IF;
  SELECT * INTO c FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato no encontrado'; END IF;
  IF c.status = 'encerrado' THEN RAISE EXCEPTION 'El contrato ya está cerrado'; END IF;
  SELECT count(*) INTO n FROM pallets WHERE contrato_id = c.id AND status NOT IN ('expedido');
  IF n > 0 THEN RAISE EXCEPTION 'El contrato tiene % pallet(s) en depósito o pendientes. Regístrelos como salida antes de cerrar.', n; END IF;
  IF f < c.data_inicio THEN RAISE EXCEPTION 'La fecha de cierre es anterior al inicio del contrato'; END IF;
  UPDATE contracts SET status = 'encerrado', data_termino = least(coalesce(data_termino, f), f) WHERE id = c.id;
  -- Borradores de meses posteriores al cierre ya no corresponden
  PERFORM set_config('sf.billing_rpc', 'on', true);
  DELETE FROM billing_invoices WHERE contrato_id = c.id AND status = 'borrador' AND periodo > to_char(f, 'YYYY-MM') ;
  GET DIAGNOSTICS drafts = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'fecha', f, 'borradores_eliminados', drafts);
END $$;
GRANT EXECUTE ON FUNCTION public.close_contract(uuid, date) TO authenticated;
