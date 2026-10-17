// "Mi cuenta" del cliente: estado → lo que viene → última factura → uso → cuenta corriente → historial → tarifas
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend } from "recharts";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText, HelpCircle, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StatusBadge from "@/components/shared/StatusBadge";
import InvoiceDetail, { invoiceState } from "@/components/finance/InvoiceDetail";
import {
  buildStatement, fetchEstimate, fetchInvoiceLines, fetchInvoices, fetchPayments, fetchUsage, periodLabel, summarize, CATEGORY_LABEL, SUMMARY_ORDER,
  type Invoice,
} from "@/data/billing";
import { printInvoices, printStatement } from "@/lib/print/invoiceDoc";
import { formatMoney, formatNumber, toInputDecimal } from "@/lib/formatters";
import { formatDate, todayLocal } from "@/lib/dates";
import type { Client, Contract } from "@/data/types";

const WHATSAPP = "595983110207";
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function ClientBilling({ client, contracts }: { client: Client; contracts: Contract[] }) {
  const cid = client.id;
  const invQ = useQuery({ queryKey: ["billing", "invoices", "client", cid], queryFn: () => fetchInvoices({ clienteId: cid }) });
  const payQ = useQuery({ queryKey: ["billing", "payments", "client", cid], queryFn: () => fetchPayments({ clienteId: cid }) });
  const estQ = useQuery({ queryKey: ["billing", "estimate", cid], queryFn: () => fetchEstimate(cid), staleTime: 60_000 });
  const useQ = useQuery({ queryKey: ["billing", "usage", cid], queryFn: () => fetchUsage(cid, 12), staleTime: 60_000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [histFilter, setHistFilter] = useState("todas");
  const [showAllStatement, setShowAllStatement] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);

  const invoices = (invQ.data || []).filter((i) => i.status !== "borrador");
  const payments = payQ.data || [];
  const facturas = invoices.filter((i) => i.kind === "factura" && i.status === "emitida");
  const open = facturas.filter((i) => i.saldo > 0).sort((a, b) => (a.fechaVencimiento || "").localeCompare(b.fechaVencimiento || ""));
  const saldo = open.reduce((s, i) => s + i.saldo, 0);
  const vencido = open.filter((i) => i.estadoPago === "vencida").reduce((s, i) => s + i.saldo, 0);
  const aFavor = payments.filter((p) => !p.anulado && !p.invoiceId).reduce((s, p) => s + p.importe, 0);
  const next = open[0];
  const last = [...facturas].sort((a, b) => (b.periodo + (b.numero || "")).localeCompare(a.periodo + (a.numero || "")))[0];
  const lastLinesQ = useQuery({ queryKey: ["billing", "lines", "one", last?.id], queryFn: () => fetchInvoiceLines([last!.id]), enabled: !!last });

  const statement = useMemo(() => buildStatement(invoices, payments), [invoices, payments]);
  const stRows = showAllStatement ? statement.rows : statement.rows.slice(-12);

  const history = invoices.filter((i) => {
    if (histFilter === "todas") return true;
    if (histFilter === "abiertas") return i.kind === "factura" && i.status === "emitida" && i.saldo > 0;
    return invoiceState(i) === histFilter;
  }).sort((a, b) => (b.fechaEmision || "").localeCompare(a.fechaEmision || "") || (b.numero || "").localeCompare(a.numero || ""));

  const activeContracts = contracts.filter((c) => c.status === "ativo");
  const est = estQ.data;
  const estByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of est?.contratos || []) for (const l of c.lines) {
      const k = CATEGORY_LABEL[l.categoria] || "Otros";
      m.set(k, (m.get(k) || 0) + Number(l.importe));
    }
    return SUMMARY_ORDER.filter((k) => m.has(k)).map((k) => ({ label: k, v: m.get(k)! }));
  }, [est]);

  const consultLink = (i: Invoice) =>
    `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, soy de ${client.nomeFantasia || client.razaoSocial}. Tengo una consulta sobre la factura ${i.numero} (${periodLabel(i.periodo)}):`)}`;

  async function pdf(i: Invoice) {
    const lines = await fetchInvoiceLines([i.id]);
    await printInvoices([{ invoice: i, lines, payments, client, contract: contracts.find((c) => c.id === i.contratoId), origin: invoices.find((x) => x.id === i.facturaOrigenId) }]);
  }

  if (invQ.isLoading || payQ.isLoading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Cargando su cuenta…</div>;
  if (invQ.error) return <div className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">No se pudo cargar la facturación: {(invQ.error as Error).message}</div>;

  const openInv = invoices.find((i) => i.id === openId);

  return (
    <div className="space-y-6">
      {/* 1. Estado de la cuenta */}
      <div className={`rounded-xl border p-5 flex flex-wrap gap-6 items-center ${vencido > 0 ? "border-destructive/40 bg-destructive/5" : "border-success/30 bg-success/5"}`}>
        <div className="flex items-center gap-3 flex-1 min-w-56">
          {vencido > 0 ? <AlertTriangle className="h-9 w-9 text-destructive" /> : <CheckCircle2 className="h-9 w-9 text-success" />}
          <div>
            <div className="text-sm text-muted-foreground">Saldo de su cuenta</div>
            <div className="text-3xl font-bold tabular-nums">{formatMoney(saldo)}</div>
            <div className="text-sm">{vencido > 0 ? <span className="text-destructive font-medium">{formatMoney(vencido)} vencido</span> : saldo > 0 ? "Al día" : "Sin saldo pendiente"}
              {aFavor > 0 && <span className="text-muted-foreground"> · a su favor {formatMoney(aFavor)}</span>}</div>
          </div>
        </div>
        {next && (
          <div className="min-w-48">
            <div className="text-sm text-muted-foreground">{next.estadoPago === "vencida" ? "Pendiente más antigua (vencida)" : "Próximo vencimiento"}</div>
            <div className="text-lg font-semibold">{formatDate(next.fechaVencimiento)}</div>
            <div className="text-sm">{formatMoney(next.saldo)} · {next.numero}</div>
          </div>
        )}
        <div className="flex gap-2">
          {next && <Button onClick={() => setOpenId(next.id)}>Ver factura</Button>}
          <Button variant="outline" onClick={() => printStatement(client, statement)}><Printer className="h-4 w-4 mr-1" />Estado de cuenta</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 2. Próxima factura (estimación) */}
        <section className="rounded-xl border p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">Próxima factura (estimada)</h3>
              <p className="text-xs text-muted-foreground">{est ? `${periodLabel(est.periodo, true)} · almacenamiento adelantado + extras de este mes hasta hoy` : "Calculando…"}</p>
            </div>
            <div className="text-xl font-bold tabular-nums whitespace-nowrap">{est ? formatMoney(est.total) : "—"}</div>
          </div>
          {estQ.isLoading ? <div className="py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-1" />Calculando</div> : (
            <div className="mt-3 divide-y text-sm">
              {estByCat.map((r) => <div key={r.label} className="flex justify-between py-1.5"><span>{r.label}</span><span className="tabular-nums">{formatMoney(r.v)}</span></div>)}
              {estByCat.length === 0 && <div className="py-2 text-muted-foreground">Sin cargos previstos.</div>}
            </div>
          )}
          {est && est.contratos.some((c) => c.lines.length) && (
            <button className="text-xs text-primary mt-2 inline-flex items-center" onClick={() => setShowEstimate((v) => !v)}>
              {showEstimate ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Cómo se calcula
            </button>
          )}
          {showEstimate && est && (
            <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              {est.contratos.flatMap((c) => c.lines).map((l, n) => <div key={n}><span className="text-foreground">{l.descripcion}:</span> {l.detalle} = {formatMoney(l.importe)}</div>)}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">Estimación informativa: puede cambiar con los movimientos que haga hasta fin de mes.</p>
        </section>

        {/* 3. Última factura */}
        <section className="rounded-xl border p-5">
          {!last ? <div className="text-sm text-muted-foreground"><FileText className="h-6 w-6 mb-2 opacity-50" />Aún no tiene facturas emitidas.</div> : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Última factura · {periodLabel(last.periodo, true)}</h3>
                  <p className="text-xs text-muted-foreground">{last.numero} · emitida {formatDate(last.fechaEmision)} · vence {formatDate(last.fechaVencimiento)}</p>
                </div>
                <StatusBadge status={invoiceState(last)} />
              </div>
              <div className="mt-3 divide-y text-sm">
                {summarize(lastLinesQ.data || []).map((s) => <div key={s.label} className="flex justify-between py-1.5"><span>{s.label}</span><span className="tabular-nums">{formatMoney(s.importe)}</span></div>)}
                <div className="flex justify-between py-1.5 font-semibold"><span>Total (IVA incluido)</span><span className="tabular-nums">{formatMoney(last.total)}</span></div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" onClick={() => setOpenId(last.id)}>Ver detalle</Button>
                <Button size="sm" variant="outline" onClick={() => pdf(last)}><Printer className="h-4 w-4 mr-1" />PDF</Button>
                <Button size="sm" variant="outline" asChild><a href={consultLink(last)} target="_blank" rel="noopener"><HelpCircle className="h-4 w-4 mr-1" />Consultar</a></Button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* 4. Uso */}
      <section className="rounded-xl border p-5">
        <h3 className="font-semibold">Uso de posiciones · últimos 12 meses</h3>
        <p className="text-xs text-muted-foreground mb-3">Pico del mes vs. posiciones contratadas. Lo que supera lo contratado se cobra como excedente al mes siguiente.</p>
        {useQ.isLoading ? <div className="h-56 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={(useQ.data || []).filter((u, i, arr) => arr.slice(0, i + 1).some((x) => x.contratadas > 0 || x.pico > 0)).map((u) => ({ ...u, mes: `${MES[Number(u.periodo.slice(5, 7)) - 1]} ${u.periodo.slice(2, 4)}` }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={32} />
                <RTooltip formatter={(v: number, n: string) => [formatNumber(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="pico" name="Pico de posiciones" fill="#0C4774" radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                <Line dataKey="contratadas" name="Contratadas" stroke="#FC8711" strokeWidth={2} dot={false} type="stepAfter" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 5. Cuenta corriente */}
      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold">Cuenta corriente</h3>
            <p className="text-xs text-muted-foreground">Facturas (cargo), pagos y notas de crédito (abono), en orden de fecha.</p>
          </div>
          {statement.rows.length > 12 && <Button variant="ghost" size="sm" onClick={() => setShowAllStatement((v) => !v)}>{showAllStatement ? "Ver últimos 12" : `Ver todo (${statement.rows.length})`}</Button>}
        </div>
        <div className="md:hidden divide-y">
          {stRows.map((r, n) => (
            <button key={`m-${r.documento}-${n}`} className="w-full text-left py-2.5 flex justify-between gap-3" onClick={() => r.invoiceId && setOpenId(r.invoiceId)}>
              <div className="min-w-0"><div className="text-sm">{r.descripcion}</div><div className="text-xs text-muted-foreground">{formatDate(r.fecha)} · <span className="font-mono">{r.documento}</span></div></div>
              <div className="text-right whitespace-nowrap"><div className={`text-sm tabular-nums ${r.haber ? "text-success" : ""}`}>{r.debe ? formatMoney(r.debe) : `− ${formatMoney(r.haber)}`}</div><div className="text-xs text-muted-foreground tabular-nums">saldo {formatMoney(r.saldo)}</div></div>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto hidden md:block">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Documento</TableHead><TableHead>Concepto</TableHead><TableHead className="text-right">Cargo</TableHead><TableHead className="text-right">Abono</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
            <TableBody>
              {stRows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin movimientos.</TableCell></TableRow>}
              {stRows.map((r, n) => (
                <TableRow key={`${r.documento}-${n}`} className={r.invoiceId ? "cursor-pointer" : ""} onClick={() => r.invoiceId && setOpenId(r.invoiceId)}>
                  <TableCell className="whitespace-nowrap">{formatDate(r.fecha)}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{r.documento}</TableCell>
                  <TableCell className="text-sm">{r.descripcion}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{r.debe ? formatMoney(r.debe) : ""}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{r.haber ? formatMoney(r.haber) : ""}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">{formatMoney(r.saldo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 6. Historial */}
      <section className="rounded-xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold">Facturas</h3>
          <Select value={histFilter} onValueChange={setHistFilter}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem><SelectItem value="abiertas">Con saldo</SelectItem><SelectItem value="vencida">Vencidas</SelectItem>
              <SelectItem value="pagada">Pagadas</SelectItem><SelectItem value="acreditada">Notas de crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:hidden divide-y">
          {history.map((i) => (
            <button key={`m-${i.id}`} className="w-full text-left py-2.5 flex justify-between gap-3" onClick={() => setOpenId(i.id)}>
              <div><div className="text-sm font-medium">{periodLabel(i.periodo, true)}</div><div className="text-xs text-muted-foreground font-mono">{i.numero}</div>
                {i.kind === "factura" && <div className={`text-xs ${i.estadoPago === "vencida" ? "text-destructive" : "text-muted-foreground"}`}>vence {formatDate(i.fechaVencimiento)}</div>}</div>
              <div className="text-right whitespace-nowrap"><div className="text-sm tabular-nums font-medium">{formatMoney(i.total)}</div><StatusBadge status={invoiceState(i)} /></div>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto hidden md:block">
          <Table>
            <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Período</TableHead><TableHead>Vence</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {history.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin facturas.</TableCell></TableRow>}
              {history.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{i.numero}{i.fiscalNumero && <div className="text-muted-foreground">Fiscal {i.fiscalNumero}</div>}</TableCell>
                  <TableCell>{periodLabel(i.periodo, true)}</TableCell>
                  <TableCell className={i.estadoPago === "vencida" ? "text-destructive" : ""}>{i.kind === "factura" ? formatDate(i.fechaVencimiento) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(i.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{i.kind === "factura" && i.status === "emitida" ? formatMoney(i.saldo) : "—"}</TableCell>
                  <TableCell><StatusBadge status={invoiceState(i)} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(i.id)}>Ver</Button>
                    <Button size="sm" variant="ghost" onClick={() => pdf(i)}>PDF</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 7. Contrato y tarifas */}
      <section className="rounded-xl border p-5">
        <h3 className="font-semibold mb-3">Su contrato y tarifas</h3>
        {activeContracts.length === 0 ? <p className="text-sm text-muted-foreground">Sin contratos activos.</p> : (
          <div className="grid md:grid-cols-2 gap-4">
            {activeContracts.map((c) => (
              <div key={c.id} className="rounded-lg bg-muted/40 p-4 text-sm space-y-1.5">
                <div className="font-semibold">{c.numero} <span className="font-normal text-muted-foreground">· {formatDate(c.dataInicio)} a {formatDate(c.dataTermino)}</span></div>
                <Row k="Posiciones contratadas" v={String(c.posicoesContratadas)} />
                <Row k="Precio por posición/mes" v={formatMoney(c.precoPorPosicao, c.moeda)} />
                {(c.recargoPorPosicao ?? 0) > 0 && <Row k={c.recargoDescricao || "Recargo por posición/mes"} v={formatMoney(c.recargoPorPosicao, c.moeda)} />}
                <Row k="Mensualidad" v={formatMoney(c.posicoesContratadas * (c.precoPorPosicao + (c.recargoPorPosicao ?? 0)), c.moeda)} strong />
                <Row k="Movimientos incluidos" v="1 por posición al mes (la entrada o la salida usan el del mes)" />
                <Row k="Movimiento extra" v={formatMoney(c.precoMovExtra, c.moeda)} />
                <Row k="Seguro" v={`${toInputDecimal(c.percentualSeguro)}% mensual del valor declarado`} />
                <Row k="Vencimiento" v={`día ${c.diaVencimento ?? 10} de cada mes`} />
                <p className="text-xs text-muted-foreground pt-1">Almacenamiento por adelantado; excedentes, movimientos extra, seguro y servicios del mes anterior en la misma factura. Precios con IVA incluido.</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={!!openInv} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{openInv?.kind === "nota_credito" ? "Nota de crédito" : "Factura"} {openInv?.numero}</DialogTitle></DialogHeader>
          {openInv && <InvoiceModal invoice={openInv} invoices={invoices} payments={payments} client={client} contract={contracts.find((c) => c.id === openInv.contratoId)} onPdf={() => pdf(openInv)} consult={consultLink(openInv)} />}
        </DialogContent>
      </Dialog>
      <p className="text-[11px] text-muted-foreground">Actualizado {formatDate(todayLocal())}. La factura electrónica oficial (SIFEN) se envía por correo; aquí ve el detalle de cada cargo.</p>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className={`text-right ${strong ? "font-semibold" : ""}`}>{v}</span></div>;
}

function InvoiceModal({ invoice, invoices, payments, client, contract, onPdf, consult }: {
  invoice: Invoice; invoices: Invoice[]; payments: import("@/data/billing").Payment[]; client: Client; contract?: Contract; onPdf: () => void; consult: string;
}) {
  const q = useQuery({ queryKey: ["billing", "lines", "one", invoice.id], queryFn: () => fetchInvoiceLines([invoice.id]) });
  return (
    <div className="space-y-4">
      {q.isLoading ? <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> :
        <InvoiceDetail invoice={invoice} lines={q.data || []} payments={payments} creditNotes={invoices.filter((n) => n.facturaOrigenId === invoice.id)} client={client} contract={contract} compact />}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" asChild><a href={consult} target="_blank" rel="noopener"><HelpCircle className="h-4 w-4 mr-1" />Consultar esta factura</a></Button>
        <Button onClick={onPdf}><Printer className="h-4 w-4 mr-1" />Descargar PDF</Button>
      </div>
    </div>
  );
}

