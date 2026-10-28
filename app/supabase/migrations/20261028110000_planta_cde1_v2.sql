-- =====================================================================
-- 28/10/2026 — Nueva planta del depósito CDE1 (Layout Porta Pallet Inbras, proyecto 01-01, 28/10/2026)
--
--   Calle  Tipo        Bloques  Niveles  Pos/nivel  Posiciones
--   A      selectivo   12       5        2          120   (contra la pared)
--   B      piso        12       1        2           24   (frente a A)
--   ── pasillo 3,49 m ──
--   C      selectivo   12       5        2          120   (C y D espalda con espalda)
--   D      selectivo   12       5        2          120
--   E      piso        12       1        2           24   (frente a D)
--   ── pasillo 3,49 m ──
--   F      selectivo   14       5        2          140   (F y G espalda con espalda)
--   G      selectivo   14       5        2          140
--   ── pasillo 3,49 m ──
--   H      piso        14       1        2           28   (frente a I)
--   I      selectivo   14       5        2          140   (contra la pared)
--                                                   ─────
--   Estructura 780 + piso 76 = 856 posiciones. Vano 2,30 m, 1000 kg por pallet.
--
-- Seguridad: si alguna posición que desaparece tiene pallet o está reservada, la
-- migración se detiene sin cambiar nada (hay que reubicar esos pallets antes).
-- Las posiciones que siguen existiendo conservan su pallet. Las posiciones sin
-- pallet de la planta nueva quedan libres (se pueden bloquear después en el mapa).
-- =====================================================================

DO $$
DECLARE
  v_wh uuid;
  v_conflicts int;
  v_list text;
BEGIN
  SELECT id INTO v_wh FROM warehouses WHERE code = 'CDE1';
  IF v_wh IS NULL THEN
    RAISE NOTICE 'Depósito CDE1 no existe; nada que hacer';
    RETURN;
  END IF;

  CREATE TEMP TABLE _plan (rua text, tipo text, bloques int, niveles int, slots int) ON COMMIT DROP;
  INSERT INTO _plan VALUES
    ('A', 'selectivo', 12, 5, 2),
    ('B', 'piso',      12, 1, 2),
    ('C', 'selectivo', 12, 5, 2),
    ('D', 'selectivo', 12, 5, 2),
    ('E', 'piso',      12, 1, 2),
    ('F', 'selectivo', 14, 5, 2),
    ('G', 'selectivo', 14, 5, 2),
    ('H', 'piso',      14, 1, 2),
    ('I', 'selectivo', 14, 5, 2);

  CREATE TEMP TABLE _new ON COMMIT DROP AS
  SELECT p.rua, p.tipo, b AS bloco, n AS nivel, s AS posicao,
         p.rua || '-' || lpad(b::text, 2, '0') || '-' || n || '-' || s AS code
    FROM _plan p,
         LATERAL generate_series(1, p.bloques) b,
         LATERAL generate_series(1, p.niveles) n,
         LATERAL generate_series(1, p.slots) s;

  -- 1) Posiciones que dejan de existir pero tienen pallet o reserva → detener
  SELECT count(*), string_agg(w.code, ', ' ORDER BY w.code)
    INTO v_conflicts, v_list
    FROM warehouse_positions w
   WHERE w.warehouse_id = v_wh
     AND NOT EXISTS (SELECT 1 FROM _new x WHERE x.code = w.code)
     AND (w.pallet_id IS NOT NULL OR w.status IN ('occupied', 'reserved'));
  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'Planta CDE1: % posiciones con pallet o reserva no existen en la planta nueva (%). Reubique esos pallets y vuelva a ejecutar.',
      v_conflicts, left(v_list, 400);
  END IF;

  -- 2) Borrar las que no existen más (libres o bloqueadas)
  DELETE FROM warehouse_positions w
   WHERE w.warehouse_id = v_wh
     AND NOT EXISTS (SELECT 1 FROM _new x WHERE x.code = w.code);

  -- 3) Actualizar las que siguen (tipo y capacidad); las vacías quedan libres
  UPDATE warehouse_positions w
     SET tipo = x.tipo,
         capacidade_kg = 1000,
         status = CASE WHEN w.pallet_id IS NULL AND w.status = 'blocked' THEN 'free'::cell_status ELSE w.status END
    FROM _new x
   WHERE w.warehouse_id = v_wh AND w.code = x.code;

  -- 4) Crear las nuevas
  INSERT INTO warehouse_positions (id, code, warehouse_id, rua, bloco, nivel, posicao, status, capacidade_kg, tipo)
  SELECT 'CDE1:' || x.code, x.code, v_wh, x.rua, x.bloco, x.nivel, x.posicao, 'free', 1000, x.tipo
    FROM _new x
   WHERE NOT EXISTS (SELECT 1 FROM warehouse_positions w WHERE w.warehouse_id = v_wh AND w.code = x.code);

  -- 5) Pasillos para dibujar la planta: después de B, E y G
  UPDATE warehouses SET pasillos = 'B,E,G' WHERE id = v_wh;

  RAISE NOTICE 'Planta CDE1 actualizada: % posiciones', (SELECT count(*) FROM warehouse_positions WHERE warehouse_id = v_wh);
END $$;
