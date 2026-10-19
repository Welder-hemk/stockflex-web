// Contrato para imprimir/firmar (A4): texto emitido + bloque de firmas + sello de aceptación electrónica
import { escapeHtml as e, printPages } from "./printer";
import { contractHtml } from "@/lib/contract/render";
import { formatDateTime } from "@/lib/dates";

export interface ContractPrint {
  texto: string;
  numero: string;
  version: number;
  borrador?: boolean;
  empresa: string;
  cliente: string;
  aceptado?: { nombre: string; documento: string; fecha: string } | null;
  /** Encabezado: "Contrato" (por defecto) o "Adenda" */
  tipo?: string;
}

export function printContract(c: ContractPrint) {
  const html = `<div style="padding:16mm 18mm 14mm;font:11px/1.45 Georgia,'Times New Roman',serif;color:#111;position:relative">
    ${c.borrador ? '<div style="position:fixed;top:120mm;left:0;right:0;text-align:center;font:bold 80px Arial;color:rgba(0,0,0,.06);transform:rotate(-24deg)">BORRADOR</div>' : ""}
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #FC8711;padding-bottom:3mm;margin-bottom:5mm">
      <img src="${window.location.origin}${import.meta.env.BASE_URL}logo-stockflex.png" style="height:26px" onerror="this.style.display='none'"/>
      <div style="font:10px Arial;color:#555;text-align:right">${e(c.tipo || "Contrato")} ${e(c.numero)}${c.tipo ? (c.borrador ? " · borrador" : "") : ` · versión ${c.version || "borrador"}`}</div>
    </div>
    ${contractHtml(c.texto)}
    <div style="display:flex;justify-content:space-between;gap:20mm;margin-top:22mm;font:10.5px Arial">
      <div style="flex:1;border-top:1px solid #000;padding-top:2mm;text-align:center">${e(c.empresa)}<br/><span style="color:#555">STOCKFLEX</span></div>
      <div style="flex:1;border-top:1px solid #000;padding-top:2mm;text-align:center">${e(c.cliente)}<br/><span style="color:#555">EL CLIENTE · Firma, aclaración y C.I.</span></div>
    </div>
    ${c.aceptado ? `<div style="margin-top:8mm;border:1px solid #0C4774;border-radius:4px;padding:3mm 4mm;font:10px Arial;color:#0C4774">
      Aceptado electrónicamente en el portal StockFlex por <b>${e(c.aceptado.nombre)}</b> (doc. ${e(c.aceptado.documento)}) el ${e(formatDateTime(c.aceptado.fecha))}.</div>` : ""}
  </div>`;
  return printPages([html], "@page { size: A4 portrait; margin: 0; } .page { overflow: visible !important; }", `Contrato ${c.numero}`);
}
