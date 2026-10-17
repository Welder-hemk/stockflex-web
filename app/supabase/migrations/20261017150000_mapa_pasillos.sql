-- Planta: después de qué calles hay un pasillo (ej.: "A,C,E"), para dibujar la planta del depósito
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS pasillos text NOT NULL DEFAULT '';
