// Pre-factura / nota de crédito en A4 (imprimir o "Guardar como PDF")
import { escapeHtml as e, printPages } from "./printer";
import { formatMoney } from "@/lib/formatters";
import { formatDate } from "@/lib/dates";
import { ivaIncluded, periodLabel, summarize, PAYMENT_STATE_LABEL, METHOD_LABEL, type Invoice, type InvoiceLine, type Payment, type StatementRow } from "@/data/billing";
import { todayLocal } from "@/lib/dates";
import type { Client, Contract } from "@/data/types";

const NAVY = "#0C4774";
const ORANGE = "#FC8711";

export interface InvoiceDocData {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  client?: Client;
  contract?: Contract;
  origin?: Invoice; // factura original, para notas de crédito
}

interface MovDetail { sku: string; entradas: number; salidas: number; transferencias: number; incluidos: number; extra: number }

function invoiceHtml(d: InvoiceDocData): string {
  const { invoice: i, lines, payments, client, contract } = d;
  const isNC = i.kind === "nota_credito";
  const m = (v: number) => formatMoney(v, i.moneda);
  const summary = summarize(lines);
  const movLine = lines.find((l) => l.categoria === "movimientos");
  const movDetail = ((movLine?.base as { pallets?: MovDetail[] })?.pallets || []).slice(0, 40);
  const paid = payments.filter((p) => !p.anulado && p.invoiceId === i.id);
  const title = isNC ? "NOTA DE CRÉDITO" : i.status === "borrador" ? "BORRADOR DE FACTURA" : "PRE-FACTURA";
  const fiscal = i.fiscalNumero
    ? `Factura electrónica N.º <b>${e(i.fiscalNumero)}</b>${i.fiscalCdc ? `<br/>CDC ${e(i.fiscalCdc)}` : ""}`
    : "Documento de control interno. La factura electrónica (SIFEN) se emite por separado.";

  const th = (t: string, right = false) => `<th style="text-align:${right ? "right" : "left"};padding:5px 6px;border-bottom:2px solid ${NAVY};font-size:10px;text-transform:uppercase;color:${NAVY}">${t}</th>`;
  const td = (t: string, right = false, extra = "") => `<td style="text-align:${right ? "right" : "left"};padding:5px 6px;border-bottom:1px solid #e5e5e5;vertical-align:top;${extra}">${t}</td>`;

  return `<div style="padding:14mm 14mm 10mm;font-size:11.5px;line-height:1.35;position:relative;min-height:297mm">
    ${i.status === "borrador" ? `<div style="position:absolute;top:110mm;left:0;right:0;text-align:center;font-size:90px;color:rgba(0,0,0,.06);transform:rotate(-24deg);font-weight:bold">BORRADOR</div>` : ""}
    ${i.status === "anulada" ? `<div style="position:absolute;top:110mm;left:0;right:0;text-align:center;font-size:90px;color:rgba(200,0,0,.09);transform:rotate(-24deg);font-weight:bold">ANULADA</div>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${ORANGE};padding-bottom:4mm">
      <div>
        <img src="${window.location.origin}${import.meta.env.BASE_URL}logo-stockflex.png" style="height:34px" onerror="this.style.display='none'"/>
        <div style="color:#555;margin-top:2mm;font-size:10.5px">Almacenaje por posición pallet · Ciudad del Este, Paraguay</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:bold;color:${NAVY}">${title}</div>
        <div style="font-size:15px;font-family:monospace;margin-top:1mm">${e(i.numero || "Sin número")}</div>
        <div style="font-size:9.5px;color:#666;max-width:80mm;margin-top:1mm">${fiscal}</div>
      </div>
    </div>

    <div style="display:flex;gap:6mm;margin-top:5mm">
      <div style="flex:1.3;background:#f5f7fa;border-radius:6px;padding:3mm 4mm">
        <div style="font-size:9.5px;color:#666;text-transform:uppercase">Cliente</div>
        <div style="font-weight:bold;font-size:13px">${e(client?.razaoSocial || "")}</div>
        ${client?.rucCnpj ? `<div>RUC ${e(client.rucCnpj)}</div>` : ""}
        ${client?.endereco ? `<div style="color:#444">${e(client.endereco)}</div>` : ""}
        ${client?.codigo ? `<div style="color:#666">Código ${e(client.codigo)}</div>` : ""}
      </div>
      <div style="flex:1;font-size:11px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#666;padding:1px 0">Período facturado</td><td style="text-align:right"><b>${e(periodLabel(i.periodo, true))}</b></td></tr>
          ${i.periodoUso && !isNC ? `<tr><td style="color:#666;padding:1px 0">Extras de</td><td style="text-align:right">${e(periodLabel(i.periodoUso, true))}</td></tr>` : ""}
          <tr><td style="color:#666;padding:1px 0">Contrato</td><td style="text-align:right">${e(contract?.numero || "—")}</td></tr>
          <tr><td style="color:#666;padding:1px 0">Emisión</td><td style="text-align:right">${i.fechaEmision ? formatDate(i.fechaEmision) : "—"}</td></tr>
          ${!isNC ? `<tr><td style="color:#666;padding:1px 0">Vencimiento</td><td style="text-align:right"><b>${i.fechaVencimiento ? formatDate(i.fechaVencimiento) : "—"}</b></td></tr>` : ""}
          ${d.origin ? `<tr><td style="color:#666;padding:1px 0">Sobre factura</td><td style="text-align:right">${e(d.origin.numero || "")}</td></tr>` : ""}
          ${!isNC && i.status === "emitida" ? `<tr><td style="color:#666;padding:1px 0">Estado</td><td style="text-align:right"><b>${e(PAYMENT_STATE_LABEL[i.estadoPago])}</b></td></tr>` : ""}
        </table>
      </div>
    </div>

    <div style="display:flex;gap:6mm;margin-top:6mm;align-items:stretch">
      <div style="flex:1.3">
        <div style="font-weight:bold;color:${NAVY};margin-bottom:1.5mm">Resumen</div>
        <table style="width:100%;border-collapse:collapse">
          ${summary.map((s) => `<tr>${td(e(s.label))}${td(m(s.importe), true)}</tr>`).join("")}
        </table>
      </div>
      <div style="flex:1;background:${NAVY};color:#fff;border-radius:8px;padding:4mm 5mm;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:10px;opacity:.85;text-transform:uppercase">${isNC ? "Total acreditado" : "Total a pagar"}</div>
        <div style="font-size:26px;font-weight:bold">${m(isNC ? -i.total : i.total)}</div>
        <div style="font-size:10px;opacity:.85">IVA 10% incluido: ${m(ivaIncluded(Math.abs(i.total)))}</div>
        ${!isNC && i.status === "emitida" && (i.pagado > 0 || i.creditos < 0) ? `<div style="margin-top:2mm;font-size:11px;border-top:1px solid rgba(255,255,255,.3);padding-top:2mm">
            ${i.creditos < 0 ? `Notas de crédito: ${m(i.creditos)}<br/>` : ""}${i.pagado > 0 ? `Pagado: ${m(i.pagado)}<br/>` : ""}<b>Saldo: ${m(i.saldo)}</b></div>` : ""}
      </div>
    </div>

    <div style="font-weight:bold;color:${NAVY};margin:7mm 0 1.5mm">Detalle</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${th("Concepto")}${th("Cálculo")}${th("Importe", true)}</tr></thead>
      <tbody>${lines.map((l) => `<tr>${td(`<b>${e(l.descripcion)}</b>`)}${td(`<span style="color:#444">${e(l.detalle)}</span>`)}${td(m(l.importe), true, "white-space:nowrap")}</tr>`).join("")}</tbody>
      <tfoot><tr><td></td><td style="text-align:right;padding:6px;font-weight:bold">Total</td><td style="text-align:right;padding:6px;font-weight:bold;white-space:nowrap">${m(i.total)}</td></tr></tfoot>
    </table>

    ${movDetail.length ? `<div style="font-weight:bold;color:${NAVY};margin:6mm 0 1.5mm">Movimientos extra por pallet (${e(periodLabel(movLine?.periodo))})</div>
      <div style="font-size:10px;color:#555;margin-bottom:1.5mm">Cada posición incluye 1 movimiento por mes. La entrada o la salida usan el movimiento del mes.</div>
      <table style="width:100%;border-collapse:collapse;font-size:10.5px">
        <thead><tr>${th("Pallet")}${th("Entradas", true)}${th("Salidas", true)}${th("Transferencias", true)}${th("Incluidos", true)}${th("Extra", true)}</tr></thead>
        <tbody>${movDetail.map((r) => `<tr>${td(e(r.sku))}${td(String(r.entradas), true)}${td(String(r.salidas), true)}${td(String(r.transferencias), true)}${td(String(r.incluidos), true)}${td(`<b>${r.extra}</b>`, true)}</tr>`).join("")}</tbody>
      </table>` : ""}

    ${paid.length ? `<div style="font-weight:bold;color:${NAVY};margin:6mm 0 1.5mm">Pagos aplicados</div>
      <table style="width:100%;border-collapse:collapse;font-size:10.5px">
        <thead><tr>${th("Fecha")}${th("Recibo")}${th("Medio")}${th("Referencia")}${th("Importe", true)}</tr></thead>
        <tbody>${paid.map((p) => `<tr>${td(formatDate(p.fecha))}${td(e(p.recibo))}${td(e(METHOD_LABEL[p.metodo] || p.metodo))}${td(e(p.referencia || "—"))}${td(m(p.importe), true)}</tr>`).join("")}</tbody>
      </table>` : ""}

    ${i.motivo ? `<p style="margin-top:5mm"><b>Motivo:</b> ${e(i.motivo)}</p>` : ""}
    ${i.notas ? `<p style="margin-top:2mm;color:#444">${e(i.notas)}</p>` : ""}

    <div style="position:absolute;left:14mm;right:14mm;bottom:10mm;border-top:1px solid #ddd;padding-top:2mm;font-size:9.5px;color:#666;display:flex;justify-content:space-between">
      <span>Precios en ${e(i.moneda === "USD" ? "dólares (US$)" : i.moneda)} con IVA incluido. Consultas sobre esta factura: responda al correo o use “Consultar” en el portal.</span>
      <span>${e(i.numero || "")}</span>
    </div>
  </div>`;
}

export function printInvoices(docs: InvoiceDocData[]) {
  if (docs.length === 0) return Promise.resolve();
  const title = docs.length === 1 ? `${docs[0].invoice.numero || "Borrador"} ${docs[0].client?.nomeFantasia || ""}` : `Facturas (${docs.length})`;
  return printPages(docs.map(invoiceHtml), "@page { size: A4 portrait; margin: 0; }", title);
}

/** Estado de cuenta (cuenta corriente) del cliente */
export function printStatement(client: Client, st: { saldoAnterior: number; rows: StatementRow[]; saldoFinal: number }, desde?: string) {
  const m = (v: number) => formatMoney(v);
  const th = (t: string, r = false) => `<th style="text-align:${r ? "right" : "left"};padding:5px 6px;border-bottom:2px solid ${NAVY};font-size:10px;text-transform:uppercase;color:${NAVY}">${t}</th>`;
  const td = (t: string, r = false) => `<td style="text-align:${r ? "right" : "left"};padding:4px 6px;border-bottom:1px solid #e5e5e5;white-space:${r ? "nowrap" : "normal"}">${t}</td>`;
  const html = `<div style="padding:14mm;font-size:11px">
    <div style="display:flex;justify-content:space-between;border-bottom:3px solid ${ORANGE};padding-bottom:3mm">
      <img src="${window.location.origin}${import.meta.env.BASE_URL}logo-stockflex.png" style="height:30px" onerror="this.style.display='none'"/>
      <div style="text-align:right"><div style="font-size:17px;font-weight:bold;color:${NAVY}">ESTADO DE CUENTA</div><div>al ${formatDate(todayLocal())}</div></div>
    </div>
    <div style="margin:4mm 0"><b style="font-size:13px">${e(client.razaoSocial)}</b>${client.rucCnpj ? ` · RUC ${e(client.rucCnpj)}` : ""}${client.codigo ? ` · ${e(client.codigo)}` : ""}</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${th("Fecha")}${th("Documento")}${th("Concepto")}${th("Cargo", true)}${th("Abono", true)}${th("Saldo", true)}</tr></thead>
      <tbody>
        ${desde ? `<tr>${td(formatDate(desde))}${td("")}${td("<i>Saldo anterior</i>")}${td("", true)}${td("", true)}${td(m(st.saldoAnterior), true)}</tr>` : ""}
        ${st.rows.map((r) => `<tr>${td(formatDate(r.fecha))}${td(`<span style="font-family:monospace;white-space:nowrap">${e(r.documento)}</span>`)}${td(e(r.descripcion))}${td(r.debe ? m(r.debe) : "", true)}${td(r.haber ? m(r.haber) : "", true)}${td(m(r.saldo), true)}</tr>`).join("")}
      </tbody>
    </table>
    <div style="margin-top:5mm;text-align:right;font-size:14px">${st.saldoFinal >= 0 ? "Saldo a pagar" : "Saldo a favor"}: <b>${m(Math.abs(st.saldoFinal))}</b></div>
    <p style="color:#666;font-size:9.5px;margin-top:8mm">Importes en US$ con IVA incluido. Cargo = facturas; abono = pagos y notas de crédito.</p>
  </div>`;
  return printPages([html], "@page { size: A4 portrait; margin: 0; }", `Estado de cuenta ${client.nomeFantasia || client.razaoSocial}`);
}
