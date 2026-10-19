import { qrSvg } from "./codes";
import { escapeHtml as e, getLabelFormat, printPages, type LabelFormat } from "./printer";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatNumber } from "@/lib/formatters";

export interface PrintPallet {
  id: string;
  sku: string;
  descricao: string;
  peso: number;
  localizacao?: string;
  localizacao2?: string;
  lote?: string;
  quantidade?: number;
  dataEntrada?: string;
  seguro?: boolean;
  palletDuplo?: boolean;
  largo?: number;
  ancho?: number;
  alto?: number;
}

export interface PrintParty {
  nome: string;
  documento?: string;
}

export interface LabelData {
  pallet: PrintPallet;
  clienteNome: string;
  contratoNumero?: string;
}

export type ReceiptKind = "entrada" | "saida" | "transferencia" | "ajuste" | "avaria" | "bloqueio";

export interface ReceiptLine {
  sku: string;
  descricao: string;
  peso: number;
  pesoFinal?: number;
  origem?: string;
  destino?: string;
}

export interface ReceiptData {
  tipo: ReceiptKind;
  movementIds: string[];
  dataHora: string | Date;
  operador: string;
  clienteNome: string;
  clienteDoc?: string;
  contratoNumero?: string;
  autorizado?: PrintParty;
  motivo?: string;
  lines: ReceiptLine[];
}

const TITLES: Record<ReceiptKind, string> = {
  entrada: "INGRESO DE MERCADERÍA",
  saida: "SALIDA DE MERCADERÍA",
  transferencia: "TRANSFERENCIA INTERNA",
  ajuste: "AJUSTE DE INVENTARIO",
  avaria: "REGISTRO DE AVERÍA",
  bloqueio: "BLOQUEO / LIBERACIÓN DE POSICIÓN",
};

const logoUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}logo-stockflex.png`;
const kg = (v: number | undefined) => `${formatNumber(Number(v || 0), 2)} kg`;
const loc = (p: { localizacao?: string; localizacao2?: string }) =>
  [p.localizacao, p.localizacao2].filter(Boolean).join(" / ") || "—";

/** Número curto do comprovante (8 primeiros caracteres do id, em maiúsculas) */
export const shortId = (id: string) => (id || "").replace(/-/g, "").slice(0, 8).toUpperCase();

// ---------------------------------------------------------------- Etiqueta do pallet

async function labelHtml(d: LabelData, format: LabelFormat): Promise<string> {
  const p = d.pallet;
  const thermal = format === "thermal100x150";
  // QR grande: se lê com a câmera do celular de qualquer ângulo
  const qr = await qrSvg(p.sku, thermal ? 160 : 210);

  const field = (label: string, value: string, big = false) => `
    <div style="min-width:0">
      <div style="font-size:${thermal ? 9 : 10}px;font-weight:bold;color:#555;text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:${big ? (thermal ? 20 : 22) : thermal ? 13 : 14}px;font-weight:${big ? "bold" : "normal"};${big ? "font-family:monospace;" : ""}overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${value}</div>
    </div>`;

  const size = thermal ? "width:100mm;height:150mm;padding:4mm;" : "width:210mm;height:148mm;padding:7mm;";
  const clamp2 = "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;";
  return `
  <div style="${size}">
    <div style="height:100%;border:3px solid #111;border-radius:${thermal ? 6 : 10}px;padding:${thermal ? "3mm" : "5mm"};display:flex;flex-direction:column;gap:${thermal ? "2mm" : "3mm"}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <img src="${logoUrl()}" alt="StockFlex" style="height:${thermal ? 22 : 28}px" onerror="this.style.display='none'"/>
        <div style="font-size:${thermal ? 10 : 12}px;color:#333">${d.contratoNumero ? `Contrato <strong>${e(d.contratoNumero)}</strong>` : ""}</div>
      </div>
      <!-- Cliente: lo primero que se lee de lejos -->
      <div style="background:#111;color:#fff;border-radius:${thermal ? 4 : 6}px;padding:${thermal ? "1.5mm 3mm" : "2mm 4mm"};text-align:center;font-weight:800;text-transform:uppercase;letter-spacing:.5px;line-height:1.1;font-size:${thermal ? 26 : 38}px;${clamp2}">${e(d.clienteNome)}</div>
      <div style="display:flex;gap:${thermal ? "3mm" : "6mm"};align-items:center;${thermal ? "flex-direction:column;" : ""}">
        <div>${qr}</div>
        <div style="flex:1;min-width:0;${thermal ? "text-align:center;" : ""}">
          <div style="font-size:${thermal ? 9 : 10}px;font-weight:bold;color:#555;text-transform:uppercase;letter-spacing:.5px">Pallet</div>
          <div style="font-size:${thermal ? 32 : 44}px;font-weight:bold;font-family:monospace;letter-spacing:2px;line-height:1">${e(p.sku)}</div>
          <div style="margin-top:3mm;display:grid;grid-template-columns:1fr 1fr;gap:2mm 4mm">
            ${field("Ubicación" + (p.palletDuplo ? " (doble)" : ""), e(loc(p)), true)}
            ${field("Peso", e(kg(p.peso)), true)}
          </div>
        </div>
      </div>
      <!-- Descripción: el cliente la usa para identificar su mercadería -->
      <div style="border:2px solid #111;border-radius:${thermal ? 4 : 6}px;padding:${thermal ? "1.5mm 2.5mm" : "2mm 4mm"}">
        <div style="font-size:${thermal ? 9 : 10}px;font-weight:bold;color:#555;text-transform:uppercase;letter-spacing:.5px">Descripción</div>
        <div style="font-size:${thermal ? 20 : 30}px;font-weight:bold;line-height:1.15;${clamp2}">${e(p.descricao || "—")}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:${thermal ? "2mm" : "4mm"};margin-top:auto">
        ${field("Lote", e(p.lote || "—"))}
        ${field("Cantidad", e(p.quantidade ?? "—"))}
        ${field("Ingreso", e(formatDate(p.dataEntrada)))}
        ${field("Seguro", p.seguro ? "Sí" : "No")}
      </div>
    </div>
  </div>`;
}

export async function printLabels(items: LabelData[], format: LabelFormat = getLabelFormat()) {
  if (items.length === 0) return;
  const pages = await Promise.all(items.map((i) => labelHtml(i, format)));
  const css = format === "thermal100x150" ? "@page { size: 100mm 150mm; margin: 0; }" : "@page { size: A4 landscape; margin: 0; }";
  // A4 em paisagem com meia folha por etiqueta → duas etiquetas por folha em retrato
  if (format === "a4half") {
    const sheets: string[] = [];
    for (let i = 0; i < pages.length; i += 2) sheets.push(pages.slice(i, i + 2).join(""));
    return printPages(sheets, "@page { size: A4 portrait; margin: 0; }", "Etiquetas StockFlex");
  }
  return printPages(pages, css, "Etiquetas StockFlex");
}

// ---------------------------------------------------------------- Comprovante

async function receiptHalf(r: ReceiptData, via: string, page?: { n: number; of: number; offset: number; totalPallets: number; totalPeso: number }): Promise<string> {
  const ref = shortId(r.movementIds[0] || "") + (r.movementIds.length > 1 ? ` (+${r.movementIds.length - 1})` : "");
  const qr = await qrSvg(`SF-MOV:${(r.movementIds.length > 5 ? r.movementIds.slice(0, 1) : r.movementIds).join(",")}`, 78);
  const totalPeso = r.lines.reduce((s, l) => s + Number(l.pesoFinal ?? l.peso ?? 0), 0);
  const showOrigin = r.lines.some((l) => l.origem);
  const showDest = r.lines.some((l) => l.destino);
  const many = r.lines.length > 9;
  const off = page?.offset || 0;

  const rows = r.lines
    .map(
      (l, i) => `<tr>
        <td>${off + i + 1}</td>
        <td style="font-family:monospace;font-weight:bold">${e(l.sku)}</td>
        <td>${e(l.descricao || "—")}</td>
        ${showOrigin ? `<td style="font-family:monospace">${e(l.origem || "—")}</td>` : ""}
        ${showDest ? `<td style="font-family:monospace">${e(l.destino || "—")}</td>` : ""}
        <td style="text-align:right">${e(kg(l.pesoFinal ?? l.peso))}</td>
      </tr>`,
    )
    .join("");

  const signer =
    r.tipo === "saida"
      ? `Retirado por${r.autorizado ? `: ${e(r.autorizado.nome)}${r.autorizado.documento ? ` — ${e(r.autorizado.documento)}` : ""}` : " (nombre y documento)"}`
      : r.tipo === "entrada"
        ? "Entregado por (nombre y documento)"
        : "Conforme cliente";

  return `
  <div style="height:148.5mm;padding:7mm 9mm;display:flex;flex-direction:column;font-size:${many ? 9 : 10.5}px;border-bottom:1px dashed #999">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:2mm">
      <div style="display:flex;gap:4mm;align-items:center">
        <img src="${logoUrl()}" alt="StockFlex" style="height:28px" onerror="this.style.display='none'"/>
        <div>
          <div style="font-size:13px;font-weight:bold">${TITLES[r.tipo]}</div>
          <div style="color:#555">Comprobante N° <strong style="font-family:monospace">${e(ref)}</strong> · ${e(formatDateTime(r.dataHora))}${page && page.of > 1 ? ` · Hoja ${page.n}/${page.of}` : ""}</div>
        </div>
      </div>
      <div style="display:flex;gap:3mm;align-items:flex-start">
        <div style="text-align:right;font-size:9px;color:#555;text-transform:uppercase">${e(via)}</div>
        ${qr}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:1.5mm 5mm;padding:2mm 0">
      <div><span style="color:#666">Cliente:</span> <strong>${e(r.clienteNome)}</strong>${r.clienteDoc ? ` · ${e(r.clienteDoc)}` : ""}</div>
      <div><span style="color:#666">Contrato:</span> ${e(r.contratoNumero || "—")}</div>
      <div><span style="color:#666">Operador:</span> ${e(r.operador || "—")}</div>
      ${r.motivo ? `<div style="grid-column:1/-1"><span style="color:#666">Motivo:</span> ${e(r.motivo)}</div>` : ""}
    </div>
    <div style="flex:1 1 auto;min-height:0;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:inherit">
      <thead><tr style="background:#eee">
        <th style="text-align:left;padding:1mm">#</th><th style="text-align:left">Pallet</th><th style="text-align:left">Descripción</th>
        ${showOrigin ? `<th style="text-align:left">Origen</th>` : ""}${showDest ? `<th style="text-align:left">Destino</th>` : ""}
        <th style="text-align:right">Peso</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="border-top:1px solid #111"><td colspan="${3 + (showOrigin ? 1 : 0) + (showDest ? 1 : 0)}" style="padding-top:1mm"><strong>${page && page.of > 1 ? (page.n === page.of ? `Total: ${page.totalPallets} pallet(s)` : `Pallets ${off + 1}–${off + r.lines.length} de ${page.totalPallets}`) : `${r.lines.length} pallet(s)`}</strong></td><td style="text-align:right"><strong>${e(kg(page && page.of > 1 && page.n === page.of ? page.totalPeso : totalPeso))}</strong></td></tr></tfoot>
    </table></div>
    <style>td,th{padding:.8mm 1mm;border-bottom:1px solid #ddd;vertical-align:top}</style>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:auto;padding-top:10mm">
      <div style="border-top:1px solid #111;padding-top:1mm;text-align:center">${signer}</div>
      <div style="border-top:1px solid #111;padding-top:1mm;text-align:center">StockFlex — ${e(r.operador || "Operador")}</div>
    </div>
  </div>`;
}

/** Comprovante em A4 com duas vias (cliente e depósito) na mesma folha; ingressos grandes ocupam várias folhas */
export async function printReceipt(r: ReceiptData) {
  const PER = 15;
  const chunks: ReceiptLine[][] = [];
  for (let i = 0; i < r.lines.length; i += PER) chunks.push(r.lines.slice(i, i + PER));
  if (!chunks.length) chunks.push([]);
  const totalPeso = r.lines.reduce((s, l) => s + Number(l.pesoFinal ?? l.peso ?? 0), 0);
  const sheets: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const part = { ...r, lines: chunks[i] };
    const page = { n: i + 1, of: chunks.length, offset: i * PER, totalPallets: r.lines.length, totalPeso };
    sheets.push((await receiptHalf(part, "Vía cliente", page)) + (await receiptHalf(part, "Vía StockFlex", page)));
  }
  return printPages(sheets, "@page { size: A4 portrait; margin: 0; }", `Comprobante ${shortId(r.movementIds[0] || "")}`);
}
