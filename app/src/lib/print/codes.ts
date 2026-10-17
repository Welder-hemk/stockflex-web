import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

/** Código de barras Code128 em SVG (lido por qualquer pistola leitora) */
export function barcodeSvg(text: string, opts: { height?: number; width?: number; fontSize?: number } = {}): string {
  if (!text) return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, text, {
      format: "CODE128",
      height: opts.height ?? 60,
      width: opts.width ?? 2,
      fontSize: opts.fontSize ?? 16,
      margin: 0,
      displayValue: true,
      font: "monospace",
    });
    return svg.outerHTML;
  } catch {
    return "";
  }
}

/** QR em SVG (lido pela câmera do celular) */
export async function qrSvg(text: string, size = 120): Promise<string> {
  if (!text) return "";
  try {
    const svg = await QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    return svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  } catch {
    return "";
  }
}
