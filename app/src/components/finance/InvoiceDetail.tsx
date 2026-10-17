import { useState } from "react";
import { ChevronDown, ChevronRight, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatMoney } from "@/lib/formatters";
import { formatDate } from "@/lib/dates";
import { ivaIncluded, METHOD_LABEL, openStorageFile, periodLabel, summarize, type Invoice, type InvoiceLine, type Payment } from "@/data/billing";
import type { Client, Contract } from "@/data/types";
import { toast } from "sonner";

interface MovDetail { sku: string; entradas: number; salidas: number; transferencias: number; incluidos: number; extra: number }

interface Props {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments?: Payment[];
  creditNotes?: Invoice[];
  client?: Client;
  contract?: Contract;
  /** Muestra papelera en líneas manuales de borradores */
  onDeleteLine?: (line: InvoiceLine) => void;
  compact?: boolean;
}

export function invoiceState(i: Invoice): string {
  return i.status === "emitida" ? i.estadoPago : i.status;
}

export default function InvoiceDetail({ invoice: i, lines, payments = [], creditNotes = [], client, contract, onDeleteLine, compact }: Props) {
  const [showMov, setShowMov] = useState(false);
  const m = (v: number) => formatMoney(v, i.moneda);
  const summary = summarize(lines);
  const movLine = lines.find((l) => l.categoria === "movimientos");
  const movDetail = (movLine?.base as { pallets?: MovDetail[] })?.pallets || [];
  const paid = payments.filter((p) => !p.anulado && p.invoiceId === i.id);
  const isNC = i.kind === "nota_credito";

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{isNC ? "Nota de crédito" : i.status === "borrador" ? "Borrador" : "Factura"}</div>
          <div className="font-mono text-lg font-semibold">{i.numero || "Sin número (borrador)"}</div>
          <div className="text-sm text-muted-foreground">
            {periodLabel(i.periodo, true)}{contract ? ` · Contrato ${contract.numero}` : ""}{!compact && client ? ` · ${client.nomeFantasia || client.razaoSocial}` : ""}
          </div>
        </div>
        <div className="text-right">
          <StatusBadge status={invoiceState(i)} />
          {i.status === "emitida" && !isNC && (
            <div className="text-xs text-muted-foreground mt-1">
              Emitida {formatDate(i.fechaEmision)} · vence <span className={i.estadoPago === "vencida" ? "text-destructive font-semibold" : ""}>{formatDate(i.fechaVencimiento)}</span>
              {i.diasVencida > 0 && <> · {i.diasVencida} días de atraso</>}
            </div>
          )}
          {i.fiscalNumero && <div className="text-xs mt-1">Factura fiscal <span className="font-mono">{i.fiscalNumero}</span></div>}
        </div>
      </div>

      {/* Resumen + total */}
      <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr]">
        <div className="rounded-lg border divide-y">
          {summary.map((s) => (
            <div key={s.label} className="flex justify-between px-3 py-2 text-sm"><span>{s.label}</span><span className="tabular-nums">{m(s.importe)}</span></div>
          ))}
          {summary.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground">Sin cargos</div>}
        </div>
        <div className="rounded-lg bg-[#0C4774] text-white p-4 flex flex-col justify-center">
          <div className="text-xs uppercase opacity-80">{isNC ? "Acreditado" : "Total"}</div>
          <div className="text-2xl font-bold tabular-nums">{m(isNC ? -i.total : i.total)}</div>
          <div className="text-xs opacity-80">IVA 10% incluido: {m(ivaIncluded(Math.abs(i.total)))}</div>
          {i.status === "emitida" && !isNC && (
            <div className="mt-2 pt-2 border-t border-white/25 text-sm space-y-0.5">
              {i.creditos < 0 && <div className="flex justify-between"><span>Notas de crédito</span><span>{m(i.creditos)}</span></div>}
              <div className="flex justify-between"><span>Pagado</span><span>{m(i.pagado)}</span></div>
              <div className="flex justify-between font-semibold"><span>Saldo</span><span>{m(i.saldo)}</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Detalle */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Detalle</h4>
        <div className="rounded-lg border divide-y">
          {lines.map((l) => (
            <div key={l.id} className="px-3 py-2 text-sm flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{l.descripcion}{l.manual && l.categoria === "ajuste" && <span className="ml-1.5 text-[10px] uppercase text-muted-foreground border rounded px-1">manual</span>}</div>
                {l.detalle && <div className="text-xs text-muted-foreground">{l.detalle}</div>}
                {l.categoria === "movimientos" && movDetail.length > 0 && (
                  <button type="button" className="text-xs text-primary inline-flex items-center mt-0.5" onClick={() => setShowMov((v) => !v)}>
                    {showMov ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Ver por pallet ({movDetail.length})
                  </button>
                )}
                {l.categoria === "movimientos" && showMov && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground"><tr><th className="text-left font-medium py-1">Pallet</th><th className="text-right font-medium">Entr.</th><th className="text-right font-medium">Sal.</th><th className="text-right font-medium">Transf.</th><th className="text-right font-medium">Incl.</th><th className="text-right font-medium">Extra</th></tr></thead>
                      <tbody>{movDetail.map((r) => (
                        <tr key={r.sku} className="border-t"><td className="py-1 font-mono">{r.sku}</td><td className="text-right">{r.entradas}</td><td className="text-right">{r.salidas}</td><td className="text-right">{r.transferencias}</td><td className="text-right">{r.incluidos}</td><td className="text-right font-semibold">{r.extra}</td></tr>
                      ))}</tbody>
                    </table>
                    <p className="text-[11px] text-muted-foreground mt-1">Cada posición incluye 1 movimiento por mes; la entrada o la salida usan el del mes.</p>
                  </div>
                )}
              </div>
              <div className="tabular-nums whitespace-nowrap text-right">{m(l.importe)}</div>
              {onDeleteLine && l.manual && i.status === "borrador" && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 -mr-1" title="Quitar ajuste" onClick={() => onDeleteLine(l)}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {(paid.length > 0 || creditNotes.length > 0) && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Pagos y créditos</h4>
          <div className="rounded-lg border divide-y text-sm">
            {creditNotes.filter((n) => n.status === "emitida").map((n) => (
              <div key={n.id} className="px-3 py-2 flex justify-between gap-2">
                <span>{formatDate(n.fechaEmision)} · Nota de crédito <span className="font-mono">{n.numero}</span> — {n.motivo}</span>
                <span className="tabular-nums">{m(n.total)}</span>
              </div>
            ))}
            {paid.map((p) => (
              <div key={p.id} className="px-3 py-2 flex justify-between gap-2 items-center">
                <span>{formatDate(p.fecha)} · {METHOD_LABEL[p.metodo] || p.metodo}{p.referencia ? ` (${p.referencia})` : ""} · <span className="font-mono text-xs">{p.recibo}</span>
                  {p.comprobante && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => openStorageFile(p.comprobante!).catch((e) => toast.error(e.message))}>
                      <Paperclip className="h-3 w-3 mr-0.5" />comprobante
                    </Button>
                  )}
                </span>
                <span className="tabular-nums">− {m(p.importe)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {i.motivo && <p className="text-sm"><span className="font-medium">Motivo:</span> {i.motivo}</p>}
      {i.legado && <p className="text-xs text-muted-foreground">Factura migrada del sistema anterior.</p>}
    </div>
  );
}
