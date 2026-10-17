// Impressão por iframe oculto: não abre janela nova, então o navegador não bloqueia
// (o bloqueio de pop-up era a causa das impressões que "não saíam").

export type LabelFormat = "a4half" | "thermal100x150";

const FORMAT_KEY = "sf-label-format";

export function getLabelFormat(): LabelFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY);
    return v === "thermal100x150" ? "thermal100x150" : "a4half";
  } catch {
    return "a4half";
  }
}

export function setLabelFormat(f: LabelFormat) {
  try {
    localStorage.setItem(FORMAT_KEY, f);
  } catch {
    /* sem armazenamento: usa o padrão */
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Imprime um documento HTML.
 * @param pages  HTML de cada página (cada item vira uma página impressa)
 * @param pageCss regra @page (tamanho e margens)
 */
export function printPages(pages: string[], pageCss: string, title = "StockFlex"): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  ${pageCss}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  svg { display: block; }
</style></head><body>${pages.map((p) => `<div class="page">${p}</div>`).join("")}</body></html>`);
    doc.close();

    const cleanup = () => {
      setTimeout(() => {
        iframe.remove();
        resolve();
      }, 1000);
    };

    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        cleanup();
      }
    };

    // Espera o logo carregar (ou falhar) antes de imprimir
    const imgs = Array.from(doc.images);
    if (imgs.length === 0) {
      setTimeout(doPrint, 50);
      return;
    }
    let pending = imgs.length;
    const done = () => {
      pending -= 1;
      if (pending <= 0) doPrint();
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.onload = done;
        img.onerror = done;
      }
    });
    // Garantia: não fica preso se uma imagem nunca responder
    setTimeout(() => {
      if (pending > 0) {
        pending = 0;
        doPrint();
      }
    }, 3000);
  });
}
