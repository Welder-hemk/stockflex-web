// Documento del contrato: modelo, ajustes de la empresa, emisión para firma, aceptación y anexos
import { supabase } from "@/integrations/supabase/client";
import type { Settings } from "@/lib/contract/render";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export interface ContractTemplate { id: string; nombre: string; version: number; cuerpo: string; activo: boolean; updatedAt: string }

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await db.from("app_settings").select("key,value");
  check(error);
  return Object.fromEntries((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
}

export async function saveSettings(values: Settings) {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value: value.trim(), updated_at: new Date().toISOString() }));
  const { error } = await db.from("app_settings").upsert(rows);
  check(error);
}

export async function fetchActiveTemplate(): Promise<ContractTemplate | null> {
  const { data, error } = await db.from("contract_templates").select("*").eq("activo", true).order("version", { ascending: false }).limit(1);
  check(error);
  const r = data?.[0];
  return r ? { id: r.id, nombre: r.nombre, version: r.version, cuerpo: r.cuerpo, activo: r.activo, updatedAt: r.updated_at } : null;
}

/** Guardar crea una versión nueva (las anteriores quedan como historial) */
export async function saveTemplate(cuerpo: string, nombre = "Contrato de almacenamiento") {
  const cur = await fetchActiveTemplate();
  if (cur) { const { error } = await db.from("contract_templates").update({ activo: false }).eq("id", cur.id); check(error); }
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db.from("contract_templates").insert({ nombre, cuerpo, version: (cur?.version || 0) + 1, activo: true, updated_by: u.user?.id });
  check(error);
}

export interface ContractDocInfo {
  docEstado: "borrador" | "para_firma" | "aceptado" | "firmado";
  docTexto: string | null;
  docVersion: number;
  docEmitidoAt: string | null;
  aceptadoAt: string | null;
  aceptadoNombre: string | null;
  aceptadoDocumento: string | null;
  clausulasEspeciales: string;
}

export async function fetchContractDoc(contratoId: string): Promise<ContractDocInfo> {
  const { data, error } = await db.from("contracts")
    .select("doc_estado,doc_texto,doc_version,doc_emitido_at,aceptado_at,aceptado_nombre,aceptado_documento,clausulas_especiales")
    .eq("id", contratoId).maybeSingle();
  check(error);
  return {
    docEstado: data?.doc_estado || "borrador", docTexto: data?.doc_texto ?? null, docVersion: data?.doc_version || 0,
    docEmitidoAt: data?.doc_emitido_at ?? null, aceptadoAt: data?.aceptado_at ?? null, aceptadoNombre: data?.aceptado_nombre ?? null,
    aceptadoDocumento: data?.aceptado_documento ?? null, clausulasEspeciales: data?.clausulas_especiales || "",
  };
}

export async function saveSpecialClauses(contratoId: string, texto: string) {
  const { error } = await db.from("contracts").update({ clausulas_especiales: texto }).eq("id", contratoId);
  check(error);
}

export async function issueContract(contratoId: string, texto: string, templateId?: string) {
  const { error } = await db.rpc("contract_issue_document", { p_contract_id: contratoId, p_texto: texto, p_template_id: templateId ?? null });
  check(error);
}

export async function acceptContract(contratoId: string, nombre: string, documento: string) {
  const { error } = await db.rpc("contract_accept", { p_contract_id: contratoId, p_nombre: nombre, p_documento: documento });
  check(error);
}

export async function markSigned(contratoId: string) {
  const { error } = await db.rpc("contract_mark_signed", { p_contract_id: contratoId });
  check(error);
}

export interface ContractFile { id: string; contratoId: string; tipo: string; nombre: string; path: string; subidoPorCliente: boolean; createdAt: string }
export const FILE_TYPE_LABEL: Record<string, string> = { firmado: "Contrato firmado", anexo: "Anexo", adenda: "Adenda", otro: "Otro" };

export async function fetchContractFiles(contratoIds: string[]): Promise<ContractFile[]> {
  if (!contratoIds.length) return [];
  const { data, error } = await db.from("contract_documents").select("*").in("contrato_id", contratoIds).order("created_at", { ascending: false });
  check(error);
  return (data || []).map((r: any) => ({ id: r.id, contratoId: r.contrato_id, tipo: r.tipo, nombre: r.nombre, path: r.path, subidoPorCliente: r.subido_por_cliente, createdAt: r.created_at }));
}

/** Sube a documents/<cliente>/contratos/ (sin reemplazar) y registra el anexo */
export async function uploadContractFile(p: { contratoId: string; clienteId: string; tipo: string; file: File; byClient: boolean }) {
  if (p.file.size > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MB. Escanee en menor resolución o comprima el PDF.");
  const ext = (p.file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${p.clienteId}/contratos/${p.contratoId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("documents").upload(path, p.file, { upsert: false });
  if (upErr) throw new Error(`No se pudo subir: ${upErr.message}`);
  const { error } = await db.from("contract_documents").insert({
    contrato_id: p.contratoId, cliente_id: p.clienteId, tipo: p.tipo, nombre: p.file.name.slice(0, 120), path, subido_por_cliente: p.byClient,
  });
  check(error);
}

/** Solo gestión: borra el registro y el archivo */
export async function deleteContractFile(f: ContractFile) {
  const { error } = await db.from("contract_documents").delete().eq("id", f.id);
  check(error);
  await supabase.storage.from("documents").remove([f.path]);
}
