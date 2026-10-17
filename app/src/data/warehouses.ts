// Cadastro de depósitos e da planta (ruas, blocos, níveis)
import { supabase } from "@/integrations/supabase/client";
import type { PositionType } from "@/data/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface WarehouseOccupancy {
  id: string;
  code: string;
  name: string;
  active: boolean;
  total: number;
  occupied: number;
  free: number;
  blocked: number;
  reserved: number;
}

export const fetchOccupancy = () => rpc<WarehouseOccupancy[]>("warehouse_occupancy", {});

export async function saveWarehouse(w: { id?: string; code: string; name: string; city: string; address: string; notes: string; active: boolean; pasillos?: string }) {
  const row = { code: w.code.trim().toUpperCase(), name: w.name.trim(), city: w.city.trim(), address: w.address.trim(), notes: w.notes.trim(), active: w.active, pasillos: (w.pasillos || '').toUpperCase().replace(/[^A-Z0-9,]/g, '') };
  const q = w.id ? db.from("warehouses").update(row).eq("id", w.id) : db.from("warehouses").insert(row);
  const { error } = await q;
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error(`Ya existe un depósito con el código ${row.code}`);
    if (/check/i.test(error.message)) throw new Error("Código: 2 a 8 letras o números, sin espacios (ej.: CDE2). Nombre: mínimo 2 caracteres.");
    throw new Error(error.message);
  }
}

export interface StreetSpec {
  warehouseId: string;
  rua: string;
  blocks: number;
  blockStart: number;
  levels: number;
  slots: number;
  tipo: PositionType;
  capacityKg: number;
  blocked: boolean;
}

export const generateStreet = (s: StreetSpec) =>
  rpc<{ created: number; requested: number }>("generate_positions", {
    p_warehouse_id: s.warehouseId,
    p_rua: s.rua,
    p_blocks: s.blocks,
    p_levels: s.levels,
    p_slots: s.slots,
    p_tipo: s.tipo,
    p_capacity_kg: s.capacityKg,
    p_block_start: s.blockStart,
    p_status: s.blocked ? "blocked" : "free",
  });

export const removeStreet = (warehouseId: string, rua: string, from?: number, to?: number) =>
  rpc<{ removed: number }>("remove_positions", { p_warehouse_id: warehouseId, p_rua: rua, p_block_from: from ?? null, p_block_to: to ?? null });
