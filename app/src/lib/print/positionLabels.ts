// Etiquetas de posição para colar na longarina do rack (código grande + código de barras + QR)
import { barcodeSvg, qrSvg } from "./codes";
import { escapeHtml as e, printPages } from "./printer";
import type { WarehousePosition } from "@/data/types";

/** 3 colunas × 8 linhas por folha A4 (etiquetas ~70 × 37 mm) */
export async function printPositionLabels(positions: WarehousePosition[], warehouseName: string) {
  if (positions.length === 0) return;
  const sorted = [...positions].sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
  const cells = await Promise.all(
    sorted.map(async (p) => {
      const qr = await qrSvg(p.id, 74);
      const bar = barcodeSvg(p.id, { height: 26, width: 1.1, fontSize: 9 });
      const arrow = p.nivel === 1 ? "▼" : "▲";
      return `<div style="border:1px dashed #bbb;padding:2mm 3mm;display:flex;gap:2mm;align-items:center;height:37mm;box-sizing:border-box">
        <div style="flex:1;min-width:0">
          <div style="font-size:9px;color:#555">${e(warehouseName)} · Nivel ${p.nivel}</div>
          <div style="font-family:monospace;font-weight:bold;font-size:24px;line-height:1.1">${arrow} ${e(p.code)}</div>
          <div style="margin-top:1mm">${bar}</div>
        </div>
        <div>${qr}</div>
      </div>`;
    }),
  );
  const pages: string[] = [];
  for (let i = 0; i < cells.length; i += 24) {
    pages.push(`<div style="padding:8mm 6mm;display:grid;grid-template-columns:repeat(3,1fr);gap:0">${cells.slice(i, i + 24).join("")}</div>`);
  }
  return printPages(pages, "@page { size: A4 portrait; margin: 0; }", `Etiquetas de posición — ${warehouseName}`);
}
