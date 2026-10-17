// Facturación v2: todo cambio de estado o importe pasa por funciones del banco.
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type InvoiceStatus = "borrador" | "emitida" | "anulada";
export type PaymentState = "borrador" | "anulada" | "acreditada" | "pagada" | "vencida" | "parcial" | "pendiente";
export type LineCategory =
  | "almacenamiento" | "recargo" | "excedente" | "movimientos" | "seguro" | "sobremedida" | "servicios" | "ajuste" | "credito" | "legado";

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  orden: number;
  categoria: LineCategory;
  descripcion: string;
  detalle: string;
  periodo: string | null;
  cantidad: number;
  unidad: string;
  precio: number;
  importe: number;
  base: Record<string, unknown>;
  manual: boolean;
}

export interface Invoice {
  id: string;
  numero: string | null;
  kind: "factura" | "nota_credito";
  clienteId: string;
  contratoId: string | null;
  periodo: string;
  periodoUso: string | null;
  status: InvoiceStatus;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  moneda: string;
  total: number;
  facturaOrigenId: string | null;
  motivo: string;
  notas: string;
  fiscalNumero: string;
  fiscalCdc: string;
  legado: boolean;
  calculadoAt: string | null;
  createdAt: string;
  // de billing_invoice_balances
  creditos: number;
  pagado: number;
  saldo: number;
  estadoPago: PaymentState;
  diasVencida: number;
}

export interface Payment {
  id: string;
  recibo: string;
  clienteId: string;
  invoiceId: string | null;
  fecha: string;
  importe: number;
  metodo: string;
  referencia: string;
  comprobante: string | null;
  notas: string;
  anulado: boolean;
  anuladoMotivo: string;
  createdAt: string;
}

export const CATEGORY_LABEL: Record<LineCategory, string> = {
  almacenamiento: "Almacenamiento",
  recargo: "Almacenamiento",
  excedente: "Posiciones excedentes",
  movimientos: "Movimientos extra",
  seguro: "Seguro",
  sobremedida: "Sobremedida",
  servicios: "Servicios extra",
  ajuste: "Ajustes",
  credito: "Créditos",
  legado: "Almacenamiento",
};

/** Orden del resumen de la factura */
export const SUMMARY_ORDER = ["Almacenamiento", "Posiciones excedentes", "Movimientos extra", "Seguro", "Sobremedida", "Servicios extra", "Ajustes", "Créditos"];

export const METHOD_LABEL: Record<string, string> = {
  transferencia: "Transferencia",
  deposito: "Depósito bancario",
  efectivo: "Efectivo",
  cheque: "Cheque",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  borrador: "Borrador",
  anulada: "Anulada",
  acreditada: "Nota de crédito",
  pagada: "Pagada",
  vencida: "Vencida",
  parcial: "Pago parcial",
  pendiente: "Pendiente",
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** "2026-10" → "octubre 2026" */
export function periodLabel(p: string | null | undefined, capital = false): string {
  if (!p || !/^\d{4}-\d{2}$/.test(p)) return p || "—";
  const [y, m] = p.split("-");
  const s = `${MONTHS[Number(m) - 1]} ${y}`;
  return capital ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
export function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** IVA 10% contenido en precio con IVA incluido */
export const ivaIncluded = (total: number) => Math.round((total / 11) * 100) / 100;

/** Agrupa líneas por categoría de resumen, en el orden estándar */
export function summarize(lines: InvoiceLine[]): { label: string; importe: number }[] {
  const map = new Map<string, number>();
  for (const l of lines) {
    const k = CATEGORY_LABEL[l.categoria] || "Otros";
    map.set(k, (map.get(k) || 0) + Number(l.importe));
  }
  return SUMMARY_ORDER.filter((k) => map.has(k)).map((k) => ({ label: k, importe: Math.round(map.get(k)! * 100) / 100 }));
}

const mapInvoice = (r: any): Invoice => ({
  id: r.id, numero: r.numero, kind: r.kind, clienteId: r.cliente_id, contratoId: r.contrato_id,
  periodo: r.periodo, periodoUso: r.periodo_uso, status: r.status, fechaEmision: r.fecha_emision,
  fechaVencimiento: r.fecha_vencimiento, moneda: r.moneda || "USD", total: Number(r.total),
  facturaOrigenId: r.factura_origen_id, motivo: r.motivo || "", notas: r.notas || "",
  fiscalNumero: r.fiscal_numero || "", fiscalCdc: r.fiscal_cdc || "", legado: !!r.legado,
  calculadoAt: r.calculado_at, createdAt: r.created_at,
  creditos: Number(r.balance?.creditos ?? 0), pagado: Number(r.balance?.pagado ?? 0), saldo: Number(r.balance?.saldo ?? 0),
  estadoPago: (r.balance?.estado_pago ?? (r.status === "borrador" ? "borrador" : "pendiente")) as PaymentState,
  diasVencida: Number(r.balance?.dias_vencida ?? 0),
});

const mapLine = (r: any): InvoiceLine => ({
  id: r.id, invoiceId: r.invoice_id, orden: r.orden, categoria: r.categoria, descripcion: r.descripcion,
  detalle: r.detalle || "", periodo: r.periodo, cantidad: Number(r.cantidad), unidad: r.unidad || "",
  precio: Number(r.precio), importe: Number(r.importe), base: r.base || {}, manual: !!r.manual,
});

const mapPayment = (r: any): Payment => ({
  id: r.id, recibo: r.recibo, clienteId: r.cliente_id, invoiceId: r.invoice_id, fecha: r.fecha,
  importe: Number(r.importe), metodo: r.metodo, referencia: r.referencia || "", comprobante: r.comprobante,
  notas: r.notas || "", anulado: !!r.anulado, anuladoMotivo: r.anulado_motivo || "", createdAt: r.created_at,
});

export interface InvoiceFilter {
  clienteId?: string;
  periodo?: string;
  status?: InvoiceStatus | "todas";
  kind?: "factura" | "nota_credito";
}

/** Facturas con saldo (dos consultas: tabla + vista de saldos) */
export async function fetchInvoices(f: InvoiceFilter = {}): Promise<Invoice[]> {
  let q = db.from("billing_invoices").select("*").order("periodo", { ascending: false }).order("numero", { ascending: false, nullsFirst: true }).limit(2000);
  if (f.clienteId) q = q.eq("cliente_id", f.clienteId);
  if (f.periodo) q = q.eq("periodo", f.periodo);
  if (f.status && f.status !== "todas") q = q.eq("status", f.status);
  if (f.kind) q = q.eq("kind", f.kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (rows.length === 0) return [];
  const balances = new Map<string, any>();
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r: any) => r.id);
    const { data: b, error: e2 } = await db.from("billing_invoice_balances").select("id,creditos,pagado,saldo,estado_pago,dias_vencida").in("id", ids);
    if (e2) throw new Error(e2.message);
    for (const x of b || []) balances.set(x.id, x);
  }
  return rows.map((r: any) => mapInvoice({ ...r, balance: balances.get(r.id) }));
}

export async function fetchInvoiceLines(invoiceIds: string[]): Promise<InvoiceLine[]> {
  if (invoiceIds.length === 0) return [];
  const out: InvoiceLine[] = [];
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const { data, error } = await db.from("billing_invoice_lines").select("*").in("invoice_id", invoiceIds.slice(i, i + 200)).order("orden");
    if (error) throw new Error(error.message);
    out.push(...(data || []).map(mapLine));
  }
  return out;
}

export async function fetchPayments(f: { clienteId?: string; desde?: string } = {}): Promise<Payment[]> {
  let q = db.from("billing_payments").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(3000);
  if (f.clienteId) q = q.eq("cliente_id", f.clienteId);
  if (f.desde) q = q.gte("fecha", f.desde);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(mapPayment);
}

// ---------- Acciones ----------
export const generateDrafts = (periodo: string, contratoId?: string) =>
  rpc<{ creadas: number; actualizadas: number; ya_emitidas: number; sin_cargos: number }>("billing_generate_drafts", { p_periodo: periodo, p_contrato_id: contratoId ?? null });

export const addAdjustment = (invoiceId: string, descripcion: string, importe: number, motivo: string, categoria: "ajuste" | "servicios" = "ajuste") =>
  rpc<{ total: number }>("billing_add_line", { p_invoice_id: invoiceId, p_descripcion: descripcion, p_importe: importe, p_motivo: motivo, p_categoria: categoria });

export const deleteLine = (lineId: string) => rpc<{ total: number }>("billing_delete_line", { p_line_id: lineId });

export const issueInvoices = (ids: string[]) => rpc<{ emitidas: number; numeros: string[] }>("billing_issue", { p_invoice_ids: ids });

export const setFiscal = (invoiceId: string, numero: string, cdc: string) =>
  rpc("billing_set_fiscal", { p_invoice_id: invoiceId, p_numero: numero, p_cdc: cdc });

export const cancelInvoice = (invoiceId: string, motivo: string) =>
  rpc<{ accion: "eliminado" | "anulada" }>("billing_cancel", { p_invoice_id: invoiceId, p_motivo: motivo });

export const creditNote = (invoiceId: string, importe: number, motivo: string) =>
  rpc<{ numero: string }>("billing_credit_note", { p_invoice_id: invoiceId, p_importe: importe, p_motivo: motivo });

export interface PaymentInput {
  clienteId: string;
  fecha: string;
  importe: number;
  metodo: string;
  referencia: string;
  invoiceId?: string | null;
  comprobante?: string | null;
  notas?: string;
}
export const registerPayment = (p: PaymentInput) =>
  rpc<{ recibo: string; aplicado: { numero: string | null; importe: number }[]; a_cuenta: number }>("billing_register_payment", {
    p_cliente_id: p.clienteId, p_fecha: p.fecha, p_importe: p.importe, p_metodo: p.metodo,
    p_referencia: p.referencia, p_invoice_id: p.invoiceId || null, p_comprobante: p.comprobante || null, p_notas: p.notas || "",
  });

export const applyCredit = (clienteId: string) => rpc<{ imputaciones: number }>("billing_apply_credit", { p_cliente_id: clienteId });
export const voidPayment = (recibo: string, motivo: string) => rpc("billing_void_payment", { p_recibo: recibo, p_motivo: motivo });

export interface EstimateLine { categoria: LineCategory; descripcion: string; detalle: string; importe: number; periodo: string }
export interface Estimate {
  periodo: string;
  hasta: string;
  total: number;
  contratos: { contrato_id: string; periodo: string; periodo_uso: string; total: number; lines: EstimateLine[] }[];
}
export const fetchEstimate = (clienteId?: string) => rpc<Estimate>("billing_estimate", { p_cliente_id: clienteId ?? null });

export interface UsageRow { periodo: string; contratadas: number; pico: number; promedio: number; movimientos: number }
export const fetchUsage = (clienteId?: string, months = 12) => rpc<UsageRow[]>("billing_usage", { p_cliente_id: clienteId ?? null, p_months: months });

/** Sube comprobante de pago al bucket "documents" */
export async function uploadPaymentProof(clienteId: string, file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo supera 10 MB");
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${clienteId}/pagos/${Date.now()}.${ext}`; // 1ª pasta = cliente (ele pode ver o próprio comprovante)
  const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function openStorageFile(path: string) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message || "No se pudo abrir el archivo");
  window.open(data.signedUrl, "_blank", "noopener");
}

// ---------- Cuenta corriente ----------
export interface StatementRow {
  fecha: string;
  tipo: "factura" | "nota_credito" | "pago";
  documento: string;
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
  invoiceId?: string;
}

/** Movimientos cronológicos (ascendente) con saldo acumulado; saldo positivo = el cliente debe */
export function buildStatement(invoices: Invoice[], payments: Payment[], desde?: string): { saldoAnterior: number; rows: StatementRow[]; saldoFinal: number } {
  type Ev = Omit<StatementRow, "saldo"> & { order: number };
  const evs: Ev[] = [];
  const numById = new Map(invoices.map((i) => [i.id, i.numero || ""]));
  for (const i of invoices) {
    if (i.status !== "emitida") continue;
    if (i.kind === "factura") {
      evs.push({ fecha: i.fechaEmision || i.createdAt.slice(0, 10), tipo: "factura", documento: i.numero || "", descripcion: `Factura ${periodLabel(i.periodo)}`, debe: i.total, haber: 0, invoiceId: i.id, order: 0 });
    } else {
      evs.push({ fecha: i.fechaEmision || i.createdAt.slice(0, 10), tipo: "nota_credito", documento: i.numero || "", descripcion: `Nota de crédito${i.facturaOrigenId ? ` s/ ${numById.get(i.facturaOrigenId) || ""}` : ""} — ${i.motivo}`, debe: 0, haber: -i.total, invoiceId: i.id, order: 1 });
    }
  }
  // Un pago puede estar imputado a varias facturas: agrupa por recibo
  const byRecibo = new Map<string, Payment[]>();
  for (const p of payments) {
    if (p.anulado) continue;
    byRecibo.set(p.recibo, [...(byRecibo.get(p.recibo) || []), p]);
  }
  for (const [recibo, ps] of byRecibo) {
    const total = ps.reduce((s, p) => s + p.importe, 0);
    const docs = ps.map((p) => (p.invoiceId ? numById.get(p.invoiceId) || "" : "a cuenta")).filter(Boolean).sort();
    evs.push({ fecha: ps[0].fecha, tipo: "pago", documento: recibo, descripcion: `Pago ${METHOD_LABEL[ps[0].metodo] || ps[0].metodo}${ps[0].referencia ? ` (${ps[0].referencia})` : ""} → ${docs.join(", ")}`, debe: 0, haber: Math.round(total * 100) / 100, order: 2 });
  }
  evs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.order - b.order || a.documento.localeCompare(b.documento));
  let saldo = 0;
  let saldoAnterior = 0;
  const rows: StatementRow[] = [];
  for (const ev of evs) {
    saldo = Math.round((saldo + ev.debe - ev.haber) * 100) / 100;
    if (desde && ev.fecha < desde) { saldoAnterior = saldo; continue; }
    const { order: _o, ...rest } = ev;
    rows.push({ ...rest, saldo });
  }
  return { saldoAnterior, rows, saldoFinal: saldo };
}

export type AgingBucket = "al_dia" | "d1_30" | "d31_60" | "d61_90" | "d90";
export const AGING_LABEL: Record<AgingBucket, string> = { al_dia: "Por vencer", d1_30: "1–30 días", d31_60: "31–60 días", d61_90: "61–90 días", d90: "Más de 90" };
export function agingBucket(i: Invoice): AgingBucket {
  const d = i.diasVencida;
  if (d <= 0) return "al_dia";
  if (d <= 30) return "d1_30";
  if (d <= 60) return "d31_60";
  if (d <= 90) return "d61_90";
  return "d90";
}
