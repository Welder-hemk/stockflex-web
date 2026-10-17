-- =====================================================================
-- StockFlex — vários depósitos (17/10/2026)
-- * Cadastro de depósitos (cada um com sua planta)
-- * Cada posição pertence a um depósito; o id passa a ser "<DEPÓSITO>:<código>"
--   (ex.: CDE1:A-01-1-1) e o código curto (A-01-1-1) fica em `code`
-- * Gerador de ruas/blocos/níveis por depósito e remoção de posições livres
-- * Funções de operação respeitam o depósito (posição contígua só no mesmo depósito)
-- Segura para rodar com dados: atualiza as referências de pallets e movimentos.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Logados leem depositos" ON public.warehouses;
DROP POLICY IF EXISTS "Admin gerencia depositos" ON public.warehouses;
CREATE POLICY "Logados leem depositos" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gerencia depositos" ON public.warehouses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Depósito atual (primeiro barracão)
INSERT INTO public.warehouses (code, name, city)
VALUES ('CDE1', 'Depósito Ciudad del Este', 'Ciudad del Este')
ON CONFLICT (code) DO NOTHING;

-- ---------- Posições ----------
ALTER TABLE public.warehouse_positions ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_positions ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.warehouse_positions ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'selectivo'
  CHECK (tipo IN ('selectivo', 'drive-in', 'piso'));

DO $$
DECLARE
  v_wh uuid;
BEGIN
  SELECT id INTO v_wh FROM warehouses WHERE code = 'CDE1';
  -- Só posições ainda no formato antigo (sem prefixo)
  IF EXISTS (SELECT 1 FROM warehouse_positions WHERE warehouse_id IS NULL) THEN
    -- Referências em texto: pallets e movimentos passam a usar o id novo
    UPDATE pallets SET localizacao = 'CDE1:' || localizacao
     WHERE localizacao <> '' AND position(':' in localizacao) = 0
       AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = pallets.localizacao);
    UPDATE pallets SET localizacao2 = 'CDE1:' || localizacao2
     WHERE localizacao2 IS NOT NULL AND localizacao2 <> '' AND position(':' in localizacao2) = 0
       AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = pallets.localizacao2);
    UPDATE movements SET origem_local = 'CDE1:' || origem_local
     WHERE position(':' in origem_local) = 0 AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = movements.origem_local);
    UPDATE movements SET destino_local = 'CDE1:' || destino_local
     WHERE position(':' in destino_local) = 0 AND EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.id = movements.destino_local);

    UPDATE warehouse_positions
       SET code = id, id = 'CDE1:' || id, warehouse_id = v_wh
     WHERE warehouse_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.warehouse_positions ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE public.warehouse_positions ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_wh_code ON public.warehouse_positions (warehouse_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_wh_slot ON public.warehouse_positions (warehouse_id, rua, bloco, nivel, posicao);
CREATE INDEX IF NOT EXISTS idx_positions_wh_status ON public.warehouse_positions (warehouse_id, status);

-- ---------- Posição contígua: só no mesmo depósito ----------
CREATE OR REPLACE FUNCTION public.sf_contiguous_position(p_position_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT o.id
    FROM warehouse_positions p
    JOIN warehouse_positions o
      ON o.warehouse_id = p.warehouse_id
     AND o.rua = p.rua AND o.bloco = p.bloco AND o.nivel = p.nivel
     AND o.posicao = CASE WHEN p.posicao = 1 THEN 2 ELSE 1 END
   WHERE p.id = p_position_id
$$;

-- ---------- Gerador de planta ----------
-- Cria as posições de uma rua: blocos × níveis × posições por nível.
-- Níveis 1..p_levels; p_capacity_kg vale para todos (ajustável depois por posição).
CREATE OR REPLACE FUNCTION public.generate_positions(
  p_warehouse_id uuid,
  p_rua text,
  p_blocks integer,
  p_levels integer,
  p_slots integer DEFAULT 2,
  p_tipo text DEFAULT 'selectivo',
  p_capacity_kg numeric DEFAULT 1000,
  p_block_start integer DEFAULT 1,
  p_status cell_status DEFAULT 'free'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wh warehouses%ROWTYPE;
  v_rua text := upper(trim(p_rua));
  v_created integer := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permiso denegado: solo administradores configuran depósitos';
  END IF;
  SELECT * INTO v_wh FROM warehouses WHERE id = p_warehouse_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Depósito no encontrado'; END IF;
  IF v_rua !~ '^[A-Z]{1,2}$' THEN RAISE EXCEPTION 'La calle debe ser 1 o 2 letras (ej.: A, B, AA)'; END IF;
  IF p_blocks NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'Bloques: entre 1 y 99'; END IF;
  IF p_block_start NOT BETWEEN 1 AND 99 OR p_block_start + p_blocks - 1 > 99 THEN RAISE EXCEPTION 'Numeración de bloques fuera de rango (1 a 99)'; END IF;
  IF p_levels NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION 'Niveles: entre 1 y 9'; END IF;
  IF p_slots NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION 'Posiciones por nivel: entre 1 y 9'; END IF;
  IF p_tipo NOT IN ('selectivo', 'drive-in', 'piso') THEN RAISE EXCEPTION 'Tipo de estructura inválido'; END IF;
  IF p_capacity_kg IS NULL OR p_capacity_kg <= 0 THEN RAISE EXCEPTION 'Capacidad debe ser mayor que cero'; END IF;

  INSERT INTO warehouse_positions (id, code, warehouse_id, rua, bloco, nivel, posicao, status, capacidade_kg, tipo)
  SELECT v_wh.code || ':' || c, c, v_wh.id, v_rua, b, n, s, p_status, p_capacity_kg, p_tipo
    FROM generate_series(p_block_start, p_block_start + p_blocks - 1) b,
         generate_series(1, p_levels) n,
         generate_series(1, p_slots) s,
         LATERAL (SELECT v_rua || '-' || lpad(b::text, 2, '0') || '-' || n || '-' || s AS c) x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object('created', v_created, 'requested', p_blocks * p_levels * p_slots);
END;
$$;

-- Remove posições LIVRES ou BLOQUEADAS de uma rua (ex.: corrigir uma planta). Ocupadas nunca.
CREATE OR REPLACE FUNCTION public.remove_positions(p_warehouse_id uuid, p_rua text, p_block_from integer DEFAULT NULL, p_block_to integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_occupied integer;
  v_removed integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permiso denegado: solo administradores configuran depósitos';
  END IF;
  SELECT count(*) INTO v_occupied FROM warehouse_positions
   WHERE warehouse_id = p_warehouse_id AND rua = upper(trim(p_rua))
     AND (p_block_from IS NULL OR bloco >= p_block_from) AND (p_block_to IS NULL OR bloco <= p_block_to)
     AND (status IN ('occupied', 'reserved') OR pallet_id IS NOT NULL);
  IF v_occupied > 0 THEN
    RAISE EXCEPTION 'Hay % posiciones ocupadas o reservadas en ese tramo; libérelas antes de eliminar', v_occupied;
  END IF;
  DELETE FROM warehouse_positions
   WHERE warehouse_id = p_warehouse_id AND rua = upper(trim(p_rua))
     AND (p_block_from IS NULL OR bloco >= p_block_from) AND (p_block_to IS NULL OR bloco <= p_block_to);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN jsonb_build_object('removed', v_removed);
END;
$$;

-- Bloquear / liberar várias posições livres de uma vez (sem pallet)
CREATE OR REPLACE FUNCTION public.set_positions_blocked(p_ids text[], p_blocked boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changed integer;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  UPDATE warehouse_positions
     SET status = CASE WHEN p_blocked THEN 'blocked'::cell_status ELSE 'free'::cell_status END
   WHERE id = ANY(p_ids) AND pallet_id IS NULL
     AND status = CASE WHEN p_blocked THEN 'free'::cell_status ELSE 'blocked'::cell_status END;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('changed', v_changed);
END;
$$;

-- Ocupação por depósito (painel)
CREATE OR REPLACE FUNCTION public.warehouse_occupancy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN is_staff(auth.uid()) OR is_admin_or_financeiro(auth.uid()) THEN
    COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.code), '[]'::jsonb) ELSE '[]'::jsonb END
  FROM (
    SELECT w.id, w.code, w.name, w.active,
           count(p.*) AS total,
           count(p.*) FILTER (WHERE p.status = 'occupied') AS occupied,
           count(p.*) FILTER (WHERE p.status = 'free') AS free,
           count(p.*) FILTER (WHERE p.status = 'blocked') AS blocked,
           count(p.*) FILTER (WHERE p.status = 'reserved') AS reserved
      FROM warehouses w LEFT JOIN warehouse_positions p ON p.warehouse_id = w.id
     GROUP BY w.id
  ) x
$$;

REVOKE EXECUTE ON FUNCTION public.generate_positions(uuid, text, integer, integer, integer, text, numeric, integer, cell_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_positions(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_positions_blocked(text[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.warehouse_occupancy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_positions(uuid, text, integer, integer, integer, text, numeric, integer, cell_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_positions(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_positions_blocked(text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_occupancy() TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouses;
EXCEPTION WHEN others THEN NULL; END $$;
