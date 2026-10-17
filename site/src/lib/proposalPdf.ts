// Gera a proposta comercial em PDF no navegador (jsPDF carregado só ao clicar)
import { PRICING, money, type Quote } from "./pricing";
import { proposalText } from "./proposalText";

export interface ProposalClient {
  name: string;
  company: string;
  email: string;
  phone: string;
  taxId?: string;
}

const NAVY: [number, number, number] = [12, 71, 116];
const ORANGE: [number, number, number] = [252, 135, 17];
const GRAY: [number, number, number] = [90, 100, 110];

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/logo-stockflex.png");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const fmtDate = (d: Date, lang: string) =>
  new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "es-PY", { timeZone: "America/Asuncion", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const m = (v: number) => v.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildProposalPdf(q: Quote, client: ProposalClient, number: string, lang: string): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const T = proposalText(lang);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 16;
  const now = new Date();
  const valid = new Date(now.getTime() + PRICING.validityDays * 864e5);

  // Cabeçalho
  const logo = await loadLogo();
  if (logo) doc.addImage(logo, "PNG", M, 12, 46, 13.4);
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...NAVY);
  doc.text(T.pdfTitle, W - M, 17, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GRAY);
  doc.text(`${T.pdfNumber} ${number}`, W - M, 22.5, { align: "right" });
  doc.text(`${T.pdfDate}: ${fmtDate(now, lang)}  ·  ${T.pdfValid}: ${fmtDate(valid, lang)}`, W - M, 27, { align: "right" });
  doc.setDrawColor(...ORANGE).setLineWidth(0.8).line(M, 32, W - M, 32);

  // Cliente
  doc.setFontSize(9).setTextColor(...GRAY).text(T.pdfClient.toUpperCase(), M, 39);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20, 30, 40).text(client.company + (client.taxId ? `  ·  ${client.taxId}` : ""), M, 44.5);
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(40, 50, 60);
  doc.text(`${T.pdfContact}: ${client.name}  ·  ${client.email}  ·  ${client.phone}`, M, 50);
  doc.setFontSize(9.5).setTextColor(...NAVY).text(T.pdfService, M, 57);

  // Tabela de pallets
  const rows = q.lines.map((x) => [
    `${m(x.line.length)} × ${m(x.line.width)} × ${m(x.line.height)} m${x.oversize ? (lang === "pt" ? " (fora do padrão)" : " (fuera de estándar)") : ""}`,
    `${m(x.volume)} m3`,
    String(Math.floor(x.line.quantity)),
    money(x.pricePerPosition, lang),
    money(x.rentMonthly, lang),
  ]);
  const T2 = lang === "pt" ? "Sob consulta" : "A consultar";
  q.consultLines.forEach((l) => rows.push([
    `${m(l.length)} × ${m(l.width)} × ${m(l.height)} m (${lang === "pt" ? "acima da medida máxima" : "supera la medida máxima"})`,
    `${m(l.length * l.width * l.height)} m3`,
    String(Math.floor(l.quantity)),
    T2,
    T2,
  ]));
  autoTable(doc, {
    startY: 61,
    head: [[T.thType, T.thVolume, T.thQty, T.thUnit, T.thSub]],
    body: rows,
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [30, 40, 50], lineColor: [215, 222, 230] },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 6;

  // Como o preço é formado
  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...NAVY).text(T.breakdown, M, y);
  y += 5;
  doc.setFont("helvetica", "normal").setFontSize(8.8).setTextColor(40, 50, 60);
  const parts: string[] = [T.bTier(money(q.tierPrice, lang), q.totalPositions)];
  if (q.lines.some((x) => x.volumeFactor > 1)) parts.push(T.bVolume(q.lines.map((x) => m(x.volumeFactor)).join(" / ")));
  if (q.lines.some((x) => x.oversizeFee > 0)) parts.push(T.bOversize(money(PRICING.oversizeFee, lang)));
  if (q.smallQuantityFee > 0) parts.push(T.bSmall(money(q.smallQuantityFee, lang)));
  if (q.termFee > 0) parts.push(T.bTerm(money(q.termFee, lang)));
  parts.forEach((p) => { doc.text(`•  ${p}`, M + 1, y); y += 4.6; });

  // Resumo
  y += 3;
  const boxX = W - M - 82, boxW = 82;
  const summary: [string, string, boolean][] = [
    [T.rentMonthly, money(q.rentMonthly, lang), false],
    [T.insuranceMonthly, money(q.insuranceMonthly, lang), false],
    [T.totalMonthly, money(q.totalMonthly, lang), true],
    [T.totalContract(q.months), money(q.totalContract, lang), true],
  ];
  const boxH = 8 + summary.length * 7;
  doc.setFillColor(242, 246, 250).setDrawColor(...NAVY).setLineWidth(0.3).roundedRect(boxX, y, boxW, boxH, 2, 2, "FD");
  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...NAVY).text(T.pdfSummary, boxX + 4, y + 6);
  let sy = y + 12.5;
  summary.forEach(([label, value, strong]) => {
    doc.setFont("helvetica", strong ? "bold" : "normal").setFontSize(strong ? 10 : 9).setTextColor(strong ? 20 : 60, strong ? 30 : 70, strong ? 40 : 80);
    doc.text(label, boxX + 4, sy);
    doc.text(value, boxX + boxW - 4, sy, { align: "right" });
    sy += 7;
  });
  // Prazo à esquerda do resumo
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GRAY).text(T.pdfTerm, M, y + 6);
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...NAVY).text(T.months(q.months), M, y + 14);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GRAY).text(`${q.totalPositions} ${T.positions}`, M, y + 20);
  y += boxH + 9;

  // Condições
  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...NAVY).text(T.pdfConditions, M, y);
  y += 5;
  doc.setFont("helvetica", "normal").setFontSize(8.6).setTextColor(40, 50, 60);
  T.conditions.forEach((c) => {
    const lines = doc.splitTextToSize(`•  ${c}`, W - 2 * M - 2) as string[];
    doc.text(lines, M + 1, y);
    y += lines.length * 4.1 + 1.2;
  });

  // Rodapé
  doc.setDrawColor(215, 222, 230).setLineWidth(0.3).line(M, 280, W - M, 280);
  doc.setFontSize(7.8).setTextColor(...GRAY);
  doc.text(doc.splitTextToSize(T.pdfDisclaimer, W - 2 * M) as string[], M, 284);
  doc.setTextColor(...NAVY).text(T.pdfFooter, W / 2, 291, { align: "center" });

  return doc.output("blob");
}
