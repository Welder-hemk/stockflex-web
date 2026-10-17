// Agentes que indican clientes y sus comisiones (CAC)
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface Agent {
  id: string;
  nombre: string;
  documento: string;
  telefono: string;
  email: string;
  cuentaPago: string;
  activo: boolean;
  notas: string;
}

export type CommissionState = "prevista" | "liberada" | "pagada" | "anulada";
export interface Commission {
  id: string;
  agenteId: string;
  agenteNombre: string;
  clienteId: string;
  clienteNombre: string;
  contratoId: string;
  contratoNumero: string;
  dataInicio: string;
  dataTermino: string;
  posiciones: number;
  precio: number;
  meses: number;
  factor: number;
  importe: number;
  estado: CommissionState;
  fechaPago: string | null;
  metodo: string;
  referencia: string;
  motivo: string;
  createdAt: string;
}

export const COMMISSION_STATE_LABEL: Record<CommissionState, string> = {
  prevista: "Esperando 1.er pago del cliente",
  liberada: "Lista para pagar",
  pagada: "Pagada",
  anulada: "Anulada",
};

export async function fetchAgents(): Promise<Agent[]> {
  const { data, error } = await db.from("agents").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: r.id, nombre: r.nombre, documento: r.documento, telefono: r.telefono, email: r.email,
    cuentaPago: r.cuenta_pago, activo: r.activo, notas: r.notas,
  }));
}

export async function saveAgent(a: Partial<Agent> & { nombre: string }) {
  const row = {
    nombre: a.nombre.trim(), documento: (a.documento || "").trim(), telefono: (a.telefono || "").trim(), email: (a.email || "").trim(),
    cuenta_pago: (a.cuentaPago || "").trim(), activo: a.activo ?? true, notas: (a.notas || "").trim(),
  };
  if (row.nombre.length < 2) throw new Error("Indique el nombre del agente");
  const q = a.id ? db.from("agents").update(row).eq("id", a.id) : db.from("agents").insert(row);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function fetchCommissions(): Promise<Commission[]> {
  const { data, error } = await db.from("commissions_view").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: r.id, agenteId: r.agente_id, agenteNombre: r.agente_nombre, clienteId: r.cliente_id, clienteNombre: r.cliente_nombre,
    contratoId: r.contrato_id, contratoNumero: r.contrato_numero, dataInicio: r.data_inicio, dataTermino: r.data_termino,
    posiciones: r.posiciones, precio: Number(r.precio), meses: r.meses, factor: Number(r.factor), importe: Number(r.importe),
    estado: r.estado, fechaPago: r.fecha_pago, metodo: r.metodo, referencia: r.referencia, motivo: r.motivo, createdAt: r.created_at,
  }));
}

export async function payCommission(id: string, fecha: string, metodo: string, referencia: string, forzar = false, motivo = "") {
  const { error } = await db.rpc("commission_pay", { p_id: id, p_fecha: fecha, p_metodo: metodo, p_referencia: referencia, p_forzar: forzar, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

export async function cancelCommission(id: string, motivo: string) {
  const { error } = await db.rpc("commission_cancel", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

/** CAC pagado por mes (gastos categoría "cac") */
export async function fetchCacExpenses(): Promise<{ competencia: string; valor: number }[]> {
  const { data, error } = await db.from("expenses").select("competencia,valor_usd,valor").eq("categoria", "cac");
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({ competencia: r.competencia, valor: Number(r.valor_usd ?? r.valor) }));
}
