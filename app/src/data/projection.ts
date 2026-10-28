// Escenarios del simulador y datos reales para la proyección
import { supabase } from "@/integrations/supabase/client";
import { normalizeParams, type ActualMonth, type ProjectionParams } from "@/lib/projection";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface Scenario {
  id: string;
  nombre: string;
  inicio: string;
  params: ProjectionParams;
  esBase: boolean;
  notas: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapScenario = (r: any): Scenario => ({
  id: r.id, nombre: r.nombre, inicio: r.inicio, params: normalizeParams(r.params), esBase: !!r.es_base, notas: r.notas || "", updatedAt: r.updated_at,
});

export async function fetchScenarios(): Promise<Scenario[]> {
  const { data, error } = await db.from("projection_scenarios").select("*").order("es_base", { ascending: false }).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(mapScenario);
}

export async function saveScenario(s: { id?: string; nombre: string; inicio: string; params: ProjectionParams; notas?: string }): Promise<Scenario> {
  const row = { nombre: s.nombre.trim(), inicio: s.inicio, params: s.params, notas: s.notas ?? "", updated_at: new Date().toISOString() };
  const q = s.id ? db.from("projection_scenarios").update(row).eq("id", s.id).select().single() : db.from("projection_scenarios").insert(row).select().single();
  const { data, error } = await q;
  if (error) {
    if (/check/i.test(error.message)) throw new Error("Nombre: entre 2 y 80 caracteres. Inicio: mes en formato AAAA-MM.");
    throw new Error(error.message);
  }
  return mapScenario(data);
}

export async function deleteScenario(id: string) {
  const { error } = await db.from("projection_scenarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setBaseScenario(id: string) {
  const { error } = await db.rpc("projection_set_base", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function fetchActuals(desde: string, hasta: string): Promise<ActualMonth[]> {
  const { data, error } = await db.rpc("projection_actuals", { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((r: any) => ({
    periodo: r.periodo,
    posiciones: Number(r.posiciones) || 0,
    pallets_promedio: Number(r.pallets_promedio) || 0,
    pallets_pico: Number(r.pallets_pico) || 0,
    facturado: Number(r.facturado) || 0,
    cobrado: Number(r.cobrado) || 0,
    gastos: Number(r.gastos) || 0,
    gastos_cac: Number(r.gastos_cac) || 0,
    inversiones: Number(r.inversiones) || 0,
    gastos_categoria: r.gastos_categoria || {},
  }));
}
