// Adendas de contrato: más posiciones durante la vigencia, al precio de la adenda (solo las adicionales)
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export type AmendmentState = "borrador" | "para_firma" | "aceptado" | "firmado" | "anulada";

export interface Amendment {
  id: string;
  contratoId: string;
  numero: string;
  fechaInicio: string;
  posiciones: number;
  precio: number;
  motivo: string;
  docEstado: AmendmentState;
  docTexto: string | null;
  docEmitidoAt: string | null;
  aceptadoAt: string | null;
  aceptadoNombre: string | null;
  aceptadoDocumento: string | null;
  anuladaMotivo: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mapAmendment = (r: any): Amendment => ({
  id: r.id, contratoId: r.contrato_id, numero: r.numero, fechaInicio: r.fecha_inicio, posiciones: r.posiciones, precio: Number(r.precio),
  motivo: r.motivo || "", docEstado: r.doc_estado, docTexto: r.doc_texto, docEmitidoAt: r.doc_emitido_at, aceptadoAt: r.aceptado_at,
  aceptadoNombre: r.aceptado_nombre, aceptadoDocumento: r.aceptado_documento, anuladaMotivo: r.anulada_motivo, createdAt: r.created_at,
});

/** Una adenda cuenta (facturación y capacidad) desde que se emite para firma */
export const amendmentCounts = (a: Amendment) => a.docEstado === "para_firma" || a.docEstado === "aceptado" || a.docEstado === "firmado";

export async function createAmendment(contratoId: string, fecha: string, posiciones: number, precio: number, motivo: string) {
  const { data, error } = await db.rpc("amendment_create", { p_contract_id: contratoId, p_fecha: fecha, p_posiciones: posiciones, p_precio: precio, p_motivo: motivo });
  check(error);
  return data as { id: string; numero: string };
}
export async function updateAmendment(id: string, fecha: string, posiciones: number, precio: number, motivo: string) {
  const { error } = await db.rpc("amendment_update", { p_id: id, p_fecha: fecha, p_posiciones: posiciones, p_precio: precio, p_motivo: motivo });
  check(error);
}
export async function issueAmendment(id: string, texto: string) {
  const { error } = await db.rpc("amendment_issue", { p_id: id, p_texto: texto });
  check(error);
}
export async function acceptAmendment(id: string, nombre: string, documento: string) {
  const { error } = await db.rpc("amendment_accept", { p_id: id, p_nombre: nombre, p_documento: documento });
  check(error);
}
export async function markAmendmentSigned(id: string) {
  const { error } = await db.rpc("amendment_mark_signed", { p_id: id });
  check(error);
}
export async function cancelAmendment(id: string, motivo: string) {
  const { error } = await db.rpc("amendment_cancel", { p_id: id, p_motivo: motivo });
  check(error);
}
