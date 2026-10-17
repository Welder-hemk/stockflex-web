// Datas sempre no fuso do depósito (Assunção), independente do fuso do navegador
// ou do UTC. Evita que movimentos feitos à noite caiam no dia seguinte.

export const APP_TIMEZONE = "America/Asuncion";

function parts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  // Alguns navegadores devolvem "24" para meia-noite
  if (map.hour === "24") map.hour = "00";
  return map;
}

/** Data de hoje no depósito: "2026-10-16" */
export function todayLocal(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Competência do mês no depósito: "2026-10" */
export function monthLocal(date: Date = new Date()): string {
  return todayLocal(date).slice(0, 7);
}

/** Converte qualquer valor de data do banco em Date (aceita ISO, "YYYY-MM-DD" e "YYYY-MM-DD HH:mm") */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // "YYYY-MM-DD" puro: trata como data do depósito, não como meia-noite UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  const d = new Date(value.includes("T") || value.includes("+") ? value : value.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

/** "16/10/2026 21:45" no fuso do depósito */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "16/10/2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = toDate(value);
  if (!d) return "—";
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}`;
}
