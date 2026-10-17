// Completa el modelo de contrato con los datos del contrato, del cliente y de la empresa,
// y lo convierte en HTML (subconjunto simple: "# " título, "## " cláusula, "- " ítem, **negrita**).
import type { Client, Contract } from "@/data/types";
import { formatMoney, toInputDecimal } from "@/lib/formatters";
import { formatDate, toDate } from "@/lib/dates";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type Settings = Record<string, string>;

/** Campos disponibles en el modelo (también se listan en la pantalla de edición) */
export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "empresa.razon_social", label: "Razón social de StockFlex" },
  { key: "empresa.ruc", label: "RUC de StockFlex" },
  { key: "empresa.domicilio", label: "Domicilio de StockFlex" },
  { key: "empresa.representante", label: "Representante legal" },
  { key: "empresa.representante_ci", label: "C.I. del representante" },
  { key: "empresa.email", label: "Correo de StockFlex" },
  { key: "cliente.razon_social", label: "Razón social del cliente" },
  { key: "cliente.ruc", label: "RUC del cliente" },
  { key: "cliente.domicilio", label: "Domicilio del cliente" },
  { key: "cliente.representante", label: "Contacto / representante del cliente" },
  { key: "cliente.email", label: "Correo del cliente" },
  { key: "contrato.numero", label: "Número del contrato" },
  { key: "contrato.fecha", label: "Fecha de emisión (en letras)" },
  { key: "contrato.ciudad", label: "Ciudad de firma" },
  { key: "contrato.inicio", label: "Fecha de inicio" },
  { key: "contrato.termino", label: "Fecha de término" },
  { key: "contrato.plazo_meses", label: "Plazo en meses" },
  { key: "contrato.posiciones", label: "Posiciones contratadas" },
  { key: "contrato.precio", label: "Precio por posición/mes" },
  { key: "contrato.recargo_linea", label: "Línea del recargo (vacía si no hay)" },
  { key: "contrato.mensualidad", label: "Mensualidad" },
  { key: "contrato.mov_extra", label: "Precio del movimiento extra" },
  { key: "contrato.seguro_pct", label: "% mensual de seguro" },
  { key: "contrato.dia_vencimiento", label: "Día de vencimiento" },
  { key: "contrato.mora_pct", label: "% de interés por mora" },
  { key: "contrato.jurisdiccion", label: "Jurisdicción" },
  { key: "contrato.clausulas_especiales", label: "Condiciones particulares del contrato" },
];

export function contractValues(c: Contract, cl: Client | undefined, s: Settings, emision = new Date()): Record<string, string> {
  const d = toDate(emision) || new Date();
  const start = toDate(c.dataInicio);
  const end = toDate(c.dataTermino);
  const meses = start && end ? Math.max(1, Math.round(((end.getTime() - start.getTime()) / 86400000 + 1) / 30.4375)) : 0;
  const recargo = c.recargoPorPosicao ?? 0;
  const v: Record<string, string> = {
    "empresa.razon_social": s.empresa_razon_social || "",
    "empresa.ruc": s.empresa_ruc || "",
    "empresa.domicilio": s.empresa_domicilio || "",
    "empresa.representante": s.empresa_representante || "",
    "empresa.representante_ci": s.empresa_representante_ci || "",
    "empresa.email": s.empresa_email || "",
    "cliente.razon_social": cl?.razaoSocial || "",
    "cliente.ruc": cl?.rucCnpj || "",
    "cliente.domicilio": cl?.endereco || "",
    "cliente.representante": cl?.contato || "",
    "cliente.email": cl?.email || "",
    "contrato.numero": c.numero,
    "contrato.fecha": `${d.getDate()} días del mes de ${MESES[d.getMonth()]} de ${d.getFullYear()}`,
    "contrato.ciudad": s.contrato_ciudad || "Ciudad del Este",
    "contrato.inicio": formatDate(c.dataInicio),
    "contrato.termino": formatDate(c.dataTermino),
    "contrato.plazo_meses": String(meses),
    "contrato.posiciones": String(c.posicoesContratadas),
    "contrato.precio": formatMoney(c.precoPorPosicao, c.moeda),
    "contrato.recargo_linea": recargo > 0 ? `- ${c.recargoDescricao || "Recargo por plazo/cantidad"}: **${formatMoney(recargo, c.moeda)}** por posición por mes.` : "",
    "contrato.mensualidad": formatMoney(c.posicoesContratadas * (c.precoPorPosicao + recargo), c.moeda),
    "contrato.mov_extra": formatMoney(c.precoMovExtra, c.moeda),
    "contrato.seguro_pct": toInputDecimal(c.percentualSeguro),
    "contrato.dia_vencimiento": String(c.diaVencimento ?? 10),
    "contrato.mora_pct": s.contrato_mora_pct || "1",
    "contrato.jurisdiccion": s.contrato_jurisdiccion || "",
    "contrato.clausulas_especiales": (c.clausulasEspeciales || "").trim() || "No se pactan condiciones particulares.",
  };
  return v;
}

/** Completa el texto; los campos vacíos quedan marcados [COMPLETAR …] y los desconocidos como {{…}} */
export function fillTemplate(tpl: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = tpl.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (m, key: string) => {
    if (!(key in values)) { missing.push(key); return m; }
    const val = values[key];
    if (val === "" && key !== "contrato.recargo_linea") { missing.push(key); return m; }
    return val;
  });
  // línea de recargo vacía no deja renglón en blanco
  return { text: text.replace(/\n[ \t]*\n(?=- )/g, "\n").replace(/\n{3,}/g, "\n\n"), missing: [...new Set(missing)] };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\{\{([^}]+)\}\}/g, '<mark style="background:#FFE8CC">{{$1}}</mark>');

export function contractHtml(text: string): string {
  const out: string[] = [];
  let list = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      if (!list) { out.push('<ul style="margin:4px 0 8px 18px;padding:0">'); list = true; }
      out.push(`<li style="margin:2px 0">${inline(line.slice(2))}</li>`);
      continue;
    }
    if (list) { out.push("</ul>"); list = false; }
    if (!line.trim()) continue;
    if (line.startsWith("# ")) out.push(`<h1 style="font-size:15px;text-align:center;margin:0 0 6px">${inline(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) out.push(`<h2 style="font-size:12.5px;margin:12px 0 3px">${inline(line.slice(3))}</h2>`);
    else out.push(`<p style="margin:0 0 6px;text-align:justify">${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}
