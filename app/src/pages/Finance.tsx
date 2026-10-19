import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Ban, Calculator, CheckCircle2, ChevronLeft, ChevronRight, Copy, DollarSign, FileCheck2, FileDown, FileText,
  Loader2, MessageCircle, Plus, Printer, Receipt, RefreshCw, Search, Send, Wallet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsBar } from "@/components/layout/SectionHub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import KpiCard from "@/components/shared/KpiCard";
import StatusBadge from "@/components/shared/StatusBadge";
import InvoiceDetail, { invoiceState } from "@/components/finance/InvoiceDetail";
import { FiscalDialog, PaymentDialog, ReasonDialog } from "@/components/finance/FinanceDialogs";
import { useStockData } from "@/contexts/StockDataContext";
import { dbUpdateExtraCost } from "@/data/dbMutations";
import { EXTRA_COST_CATEGORIES, type Client } from "@/data/types";
import {
  addAdjustment, agingBucket, AGING_LABEL, applyCredit, buildStatement, cancelInvoice, creditNote, deleteLine, fetchInvoiceLines, fetchInvoices,
  fetchPayments, generateDrafts, issueInvoices, METHOD_LABEL, openStorageFile, periodLabel, setFiscal, shiftPeriod, summarize, voidPayment,
  type AgingBucket, type Invoice, type InvoiceLine, type Payment,
} from "@/data/billing";
import { printInvoices, printStatement } from "@/lib/print/invoiceDoc";
import { formatMoney, parseDecimal } from "@/lib/formatters";
import { formatDate, monthLocal, todayLocal } from "@/lib/dates";
import { toast } from "sonner";

const TABS = ["resumen", "cierre", "facturas", "cobranzas", "pagos", "gastos", "comisiones"] as const;
const TAB_LABEL: Record<string, string> = { resumen: "Resumen", cierre: "Cierre del mes", facturas: "Facturas", cobranzas: "Cobranzas", pagos: "Pagos recibidos", gastos: "Gastos", comisiones: "Agentes y comisiones" };
const Expenses = lazy(() => import("@/pages/Expenses"));
const Commissions = lazy(() => import("@/pages/Commissions"));
type Tab = (typeof TABS)[number];

const clientName = (c?: Client) => c?.nomeFantasia || c?.razaoSocial || "—";

function useBilling() {
  const invoices = useQuery({ queryKey: ["billing", "invoices"], queryFn: () => fetchInvoices(), staleTime: 15_000 });
  const payments = useQuery({ queryKey: ["billing", "payments"], queryFn: () => fetchPayments(), staleTime: 15_000 });
  return { invoices: invoices.data || [], payments: payments.data || [], loading: invoices.isLoading || payments.isLoading, error: invoices.error || payments.error };
}

export default function Finance() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "resumen") as Tab;
  const setTab = (t: string) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });
  const qc = useQueryClient();
  const { clients, contracts, extraCosts, refresh } = useStockData();
  const { invoices, payments, loading, error } = useBilling();
  const reload = () => { qc.invalidateQueries({ queryKey: ["billing"] }); };

  const [detailId, setDetailId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<{ clientId?: string; invoiceId?: string } | null>(null);

  const byClient = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const byContract = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  return (
    <div className="space-y-5">
      <SectionTabsBar
        title="Finanzas"
        current={tab}
        onChange={setTab}
        tabs={TABS.map((k) => ({ key: k, label: TAB_LABEL[k] }))}
      />
      {tab !== "gastos" && tab !== "comisiones" && <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{TAB_LABEL[tab]}</h1>
          <p className="text-sm text-muted-foreground">Cierre del mes, facturas, cobranzas y pagos. Precios con IVA incluido.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="h-4 w-4 mr-1" />Actualizar</Button>
          <Button size="sm" onClick={() => setPayFor({})}><Plus className="h-4 w-4 mr-1" />Registrar pago</Button>
        </div>
      </div>}

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">No se pudieron cargar los datos: {(error as Error).message}</div>}

      <Tabs value={tab} onValueChange={setTab}>

        <TabsContent value="resumen"><Summary invoices={invoices} payments={payments} byClient={byClient} loading={loading} onOpen={setDetailId} onGo={setTab} /></TabsContent>
        <TabsContent value="cierre">
          <MonthClose invoices={invoices} byClient={byClient} byContract={byContract} extraCosts={extraCosts} onChanged={() => { reload(); refresh(); }} onOpen={setDetailId} />
        </TabsContent>
        <TabsContent value="facturas"><InvoiceList invoices={invoices} byClient={byClient} byContract={byContract} payments={payments} onOpen={setDetailId} /></TabsContent>
        <TabsContent value="cobranzas"><Collections invoices={invoices} payments={payments} clients={clients} byContract={byContract} onPay={(clientId) => setPayFor({ clientId })} onChanged={reload} /></TabsContent>
        <TabsContent value="pagos"><PaymentsList payments={payments} invoices={invoices} byClient={byClient} onChanged={reload} /></TabsContent>
        <TabsContent value="gastos" className="mt-4"><Suspense fallback={null}>{tab === "gastos" && <Expenses />}</Suspense></TabsContent>
        <TabsContent value="comisiones" className="mt-4"><Suspense fallback={null}>{tab === "comisiones" && <Commissions />}</Suspense></TabsContent>
      </Tabs>

      <InvoiceSheet
        invoiceId={detailId}
        onClose={() => setDetailId(null)}
        invoices={invoices}
        payments={payments}
        byClient={byClient}
        byContract={byContract}
        onChanged={reload}
        onPay={(invoiceId) => setPayFor({ invoiceId })}
        onOpen={setDetailId}
      />

      <PaymentDialog
        open={!!payFor}
        onOpenChange={(o) => !o && setPayFor(null)}
        clients={clients}
        invoices={invoices}
        initialClientId={payFor?.clientId}
        initialInvoiceId={payFor?.invoiceId}
        onDone={reload}
      />
    </div>
  );
}

// ======================================================================= Resumen
function Summary({ invoices, payments, byClient, loading, onOpen, onGo }: {
  invoices: Invoice[]; payments: Payment[]; byClient: Map<string, Client>; loading: boolean; onOpen: (id: string) => void; onGo: (t: string) => void;
}) {
  const month = monthLocal();
  const issued = invoices.filter((i) => i.status === "emitida");
  const facturadoMes = issued.filter((i) => i.periodo === month).reduce((s, i) => s + i.total, 0);
  const cobradoMes = payments.filter((p) => !p.anulado && p.fecha.startsWith(month)).reduce((s, p) => s + p.importe, 0);
  const abiertas = issued.filter((i) => i.kind === "factura" && i.saldo > 0);
  const porCobrar = abiertas.reduce((s, i) => s + i.saldo, 0);
  const vencidas = abiertas.filter((i) => i.estadoPago === "vencida");
  const vencido = vencidas.reduce((s, i) => s + i.saldo, 0);
  const borradores = invoices.filter((i) => i.status === "borrador");
  const sinFiscal = issued.filter((i) => i.kind === "factura" && !i.fiscalNumero && !i.legado);
  const buckets = (Object.keys(AGING_LABEL) as AgingBucket[]).map((b) => ({ b, v: abiertas.filter((i) => agingBucket(i) === b).reduce((s, i) => s + i.saldo, 0) }));
  const maxB = Math.max(1, ...buckets.map((x) => x.v));

  if (loading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Cargando…</div>;

  return (
    <div className="space-y-5 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title={`Facturado ${periodLabel(month)}`} value={formatMoney(facturadoMes)} icon={Receipt} />
        <KpiCard title={`Cobrado en ${periodLabel(month).split(" ")[0]}`} value={formatMoney(cobradoMes)} icon={DollarSign} color="success" />
        <KpiCard title="Por cobrar" value={formatMoney(porCobrar)} subtitle={`${abiertas.length} facturas abiertas`} icon={Wallet} color="warning" />
        <KpiCard title="Vencido" value={formatMoney(vencido)} subtitle={`${new Set(vencidas.map((i) => i.clienteId)).size} clientes`} icon={AlertTriangle} color="destructive" />
      </div>

      {(borradores.length > 0 || sinFiscal.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {borradores.length > 0 && (
            <button onClick={() => onGo("cierre")} className="text-left rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm hover:bg-warning/10">
              <b>{borradores.length} borradores</b> esperando revisión y emisión <span className="text-primary">→ Cierre del mes</span>
            </button>
          )}
          {sinFiscal.length > 0 && (
            <button onClick={() => onGo("facturas")} className="text-left rounded-lg border p-3 text-sm hover:bg-muted/50">
              <b>{sinFiscal.length} facturas</b> sin número fiscal (SIFEN) cargado <span className="text-primary">→ Facturas</span>
            </button>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-3">Antigüedad de la deuda</h3>
          <div className="space-y-2">
            {buckets.map(({ b, v }) => (
              <div key={b} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{AGING_LABEL[b]}</span>
                <div className="flex-1 h-3 rounded bg-muted overflow-hidden"><div className={`h-full ${b === "al_dia" ? "bg-success" : b === "d1_30" ? "bg-warning" : "bg-destructive"}`} style={{ width: `${(v / maxB) * 100}%` }} /></div>
                <span className="w-28 text-right tabular-nums">{formatMoney(v)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-3">Facturas vencidas</h3>
          {vencidas.length === 0 ? <p className="text-sm text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />Ninguna factura vencida.</p> : (
            <div className="divide-y text-sm">
              {vencidas.sort((a, b) => b.diasVencida - a.diasVencida).slice(0, 8).map((i) => (
                <button key={i.id} onClick={() => onOpen(i.id)} className="w-full flex justify-between py-2 hover:bg-muted/40 px-1 text-left">
                  <span>{clientName(byClient.get(i.clienteId))} · <span className="font-mono text-xs">{i.numero}</span></span>
                  <span className="tabular-nums"><span className="text-destructive mr-2">{i.diasVencida} d</span>{formatMoney(i.saldo)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ======================================================================= Cierre del mes
function MonthClose({ invoices, byClient, byContract, extraCosts, onChanged, onOpen }: {
  invoices: Invoice[]; byClient: Map<string, Client>; byContract: Map<string, import("@/data/types").Contract>;
  extraCosts: import("@/data/types").ExtraCost[]; onChanged: () => void; onOpen: (id: string) => void;
}) {
  const [periodo, setPeriodo] = useState(monthLocal());
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const usePer = shiftPeriod(periodo, -1);

  const ofPeriod = invoices.filter((i) => i.periodo === periodo && i.kind === "factura" && !i.legado && i.status !== "anulada");
  const drafts = ofPeriod.filter((i) => i.status === "borrador");
  const issued = ofPeriod.filter((i) => i.status === "emitida");
  const linesQ = useQuery({ queryKey: ["billing", "lines", ofPeriod.map((i) => i.id).join(",")], queryFn: () => fetchInvoiceLines(ofPeriod.map((i) => i.id)), enabled: ofPeriod.length > 0 });
  const lines = linesQ.data || [];

  // Contratos vigentes en M o M-1 sin factura
  const uStart = `${usePer}-01`;
  const expected = [...byContract.values()].filter((c) => c.status !== "rascunho" && c.dataInicio <= `${periodo}-31` && (!c.dataTermino || c.dataTermino >= uStart));
  const missing = expected.filter((c) => !ofPeriod.some((i) => i.contratoId === c.id));
  const pendingCosts = extraCosts.filter((e) => e.statusAprovacao === "pendente" && e.competencia <= usePer);

  // Comparación con la factura anterior del mismo contrato
  const prevTotal = (contratoId: string | null) => {
    const prev = invoices.filter((i) => i.contratoId === contratoId && i.kind === "factura" && i.status === "emitida" && i.periodo < periodo).sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
    return prev?.total;
  };
  const warnings = (i: Invoice): string[] => {
    const w: string[] = [];
    const c = i.contratoId ? byContract.get(i.contratoId) : undefined;
    const p = prevTotal(i.contratoId);
    if (p && p > 0 && Math.abs(i.total - p) / p > 0.3) w.push(`${i.total > p ? "+" : "−"}${Math.round(Math.abs(i.total - p) / p * 100)}% vs. mes anterior`);
    if (c?.dataTermino && c.dataTermino.slice(0, 7) === periodo) w.push("Contrato termina este mes");
    if (c?.dataInicio && c.dataInicio.slice(0, 7) === periodo) w.push("Primer mes (proporcional)");
    if (lines.some((l) => l.invoiceId === i.id && l.categoria === "excedente")) w.push("Excedente de posiciones");
    if (i.total <= 0) w.push("Total cero");
    return w;
  };
  const sumCat = (i: Invoice, cats: string[]) => lines.filter((l) => l.invoiceId === i.id && cats.includes(l.categoria)).reduce((s, l) => s + l.importe, 0);

  async function calc() {
    setBusy(true);
    try {
      const r = await generateDrafts(periodo);
      toast.success("Borradores calculados", { description: `${r.creadas} nuevos · ${r.actualizadas} recalculados · ${r.ya_emitidas} ya emitidos · ${r.sin_cargos} sin cargos` });
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function issue() {
    setBusy(true);
    try {
      const r = await issueInvoices(selected);
      toast.success(`${r.emitidas} facturas emitidas`, { description: r.numeros.join(", ") });
      setSelected([]);
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setConfirmIssue(false); }
  }

  async function printAll(list: Invoice[]) {
    const ls = await fetchInvoiceLines(list.map((i) => i.id));
    await printInvoices(list.map((i) => ({ invoice: i, lines: ls.filter((l) => l.invoiceId === i.id), payments: [], client: byClient.get(i.clienteId), contract: i.contratoId ? byContract.get(i.contratoId) : undefined })));
  }

  const selTotal = drafts.filter((d) => selected.includes(d.id)).reduce((s, d) => s + d.total, 0);
  const steps = [
    { ok: pendingCosts.length === 0, label: "Costos extra aprobados", hint: pendingCosts.length ? `${pendingCosts.length} pendientes` : "" },
    { ok: ofPeriod.length > 0 && missing.length === 0, label: "Borradores calculados", hint: missing.length ? `${missing.length} contratos sin calcular` : "" },
    { ok: ofPeriod.length > 0 && drafts.length === 0, label: "Facturas emitidas", hint: drafts.length ? `${drafts.length} por emitir` : "" },
    { ok: issued.length > 0 && issued.every((i) => i.fiscalNumero), label: "Número fiscal cargado", hint: issued.filter((i) => !i.fiscalNumero).length ? `${issued.filter((i) => !i.fiscalNumero).length} sin número` : "" },
  ];

  return (
    <div className="space-y-5 mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-md border">
          <Button variant="ghost" size="icon" onClick={() => { setPeriodo(shiftPeriod(periodo, -1)); setSelected([]); }}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="px-3 text-sm font-semibold min-w-36 text-center">{periodLabel(periodo, true)}</div>
          <Button variant="ghost" size="icon" onClick={() => { setPeriodo(shiftPeriod(periodo, 1)); setSelected([]); }}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground flex-1 min-w-64">Factura de {periodLabel(periodo)}: almacenamiento de {periodLabel(periodo)} (adelantado) + excedentes, movimientos extra, seguro y servicios de {periodLabel(usePer)}.</p>
        <Button onClick={calc} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calculator className="h-4 w-4 mr-1" />}{drafts.length || issued.length ? "Recalcular borradores" : "Calcular borradores"}</Button>
      </div>

      <ol className="grid sm:grid-cols-4 gap-2">
        {steps.map((s, n) => (
          <li key={s.label} className={`rounded-lg border p-3 text-sm ${s.ok ? "border-success/40 bg-success/5" : ""}`}>
            <div className="flex items-center gap-1.5 font-medium">{s.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <span className="h-4 w-4 rounded-full border text-[10px] grid place-items-center">{n + 1}</span>}{s.label}</div>
            {s.hint && <div className="text-xs text-muted-foreground mt-0.5">{s.hint}</div>}
          </li>
        ))}
      </ol>

      {pendingCosts.length > 0 && <PendingCosts costs={pendingCosts} byClient={byClient} onChanged={onChanged} />}

      {missing.length > 0 && ofPeriod.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
          Sin factura en este período: {missing.map((c) => `${c.numero} (${clientName(byClient.get(c.clienteId))})`).join(", ")}. Pulse “Recalcular borradores”; si siguen sin aparecer, no tienen cargos.
        </div>
      )}

      {ofPeriod.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aún no hay facturas para {periodLabel(periodo)}. Pulse <b>Calcular borradores</b>: nada se envía al cliente hasta que usted emita.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8"><Checkbox checked={drafts.length > 0 && selected.length === drafts.length} onCheckedChange={(v) => setSelected(v ? drafts.map((d) => d.id) : [])} aria-label="Seleccionar borradores" /></TableHead>
              <TableHead>Cliente / contrato</TableHead>
              <TableHead className="text-right">Almacenamiento</TableHead>
              <TableHead className="text-right">Extras {periodLabel(usePer).split(" ")[0]}</TableHead>
              <TableHead className="text-right">Ajustes</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Revisar</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {ofPeriod.sort((a, b) => clientName(byClient.get(a.clienteId)).localeCompare(clientName(byClient.get(b.clienteId)))).map((i) => {
                const w = warnings(i);
                return (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => onOpen(i.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {i.status === "borrador" && <Checkbox checked={selected.includes(i.id)} onCheckedChange={(v) => setSelected((s) => v ? [...s, i.id] : s.filter((x) => x !== i.id))} />}
                    </TableCell>
                    <TableCell><div className="font-medium">{clientName(byClient.get(i.clienteId))}</div><div className="text-xs text-muted-foreground whitespace-nowrap">{i.contratoId ? byContract.get(i.contratoId)?.numero : ""}{i.numero ? ` · ${i.numero}` : ""}</div></TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(sumCat(i, ["almacenamiento", "recargo"]))}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(sumCat(i, ["excedente", "movimientos", "seguro", "sobremedida", "servicios"]))}</TableCell>
                    <TableCell className="text-right tabular-nums">{sumCat(i, ["ajuste"]) ? formatMoney(sumCat(i, ["ajuste"])) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatMoney(i.total)}</TableCell>
                    <TableCell><StatusBadge status={invoiceState(i)} /></TableCell>
                    <TableCell className="text-xs">{w.length ? <span className="text-amber-700 dark:text-amber-400 inline-flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-px" />{w.join(" · ")}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter><TableRow>
              <TableCell colSpan={5} className="text-right">Total del período</TableCell>
              <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatMoney(ofPeriod.reduce((s, i) => s + i.total, 0))}</TableCell>
              <TableCell colSpan={2} />
            </TableRow></TableFooter>
          </Table>
        </div>
      )}

      {ofPeriod.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={() => printAll(ofPeriod)}><Printer className="h-4 w-4 mr-1" />Imprimir / PDF ({ofPeriod.length})</Button>
          <Button onClick={() => setConfirmIssue(true)} disabled={selected.length === 0 || busy}><Send className="h-4 w-4 mr-1" />Emitir seleccionadas ({selected.length})</Button>
        </div>
      )}

      <AlertDialog open={confirmIssue} onOpenChange={setConfirmIssue}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Emitir {selected.length} facturas?</AlertDialogTitle>
            <AlertDialogDescription>
              Total {formatMoney(selTotal)}. Al emitir se asigna el número interno, los clientes las ven en su portal y ya no se pueden editar (las correcciones se hacen con nota de crédito).
              Después cargue el número de la factura electrónica (SIFEN).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar más</AlertDialogCancel>
            <AlertDialogAction onClick={issue}>Emitir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PendingCosts({ costs, byClient, onChanged }: { costs: import("@/data/types").ExtraCost[]; byClient: Map<string, Client>; onChanged: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  async function approve(id: string, qty: number) {
    const unit = parseDecimal(values[id] ?? "");
    if (isNaN(unit) || unit <= 0) return toast.error("Indique el valor unitario (ej.: 25,00)");
    setBusy(id);
    try {
      await dbUpdateExtraCost(id, { valorUnitario: unit, valorTotal: Math.round(unit * qty * 100) / 100, statusAprovacao: "aprovado" });
      toast.success("Costo aprobado: entrará en la próxima factura");
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  return (
    <div className="rounded-lg border border-warning/40 p-4">
      <h3 className="font-semibold text-sm mb-1">Costos extra registrados por la operación</h3>
      <p className="text-xs text-muted-foreground mb-3">Defina el valor y apruebe para que entren en la factura. Si no corresponde cobrar, déjelo pendiente.</p>
      <div className="divide-y">
        {costs.map((c) => (
          <div key={c.id} className="py-2 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1 min-w-48">
              <div className="font-medium">{EXTRA_COST_CATEGORIES[c.categoria]}{c.descricao ? ` — ${c.descricao}` : ""}</div>
              <div className="text-xs text-muted-foreground">{clientName(byClient.get(c.clienteId))} · {periodLabel(c.competencia)} · cantidad {c.quantidade}</div>
            </div>
            <Input className="w-28" inputMode="decimal" placeholder="US$ unit." value={values[c.id] ?? (c.valorUnitario ? String(c.valorUnitario).replace(".", ",") : "")} onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))} />
            <Button size="sm" onClick={() => approve(c.id, c.quantidade || 1)} disabled={busy === c.id}>Aprobar</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================================================================= Facturas
function InvoiceList({ invoices, byClient, byContract, payments, onOpen }: {
  invoices: Invoice[]; byClient: Map<string, Client>; byContract: Map<string, import("@/data/types").Contract>; payments: Payment[]; onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("abiertas");
  const [client, setClient] = useState("");
  const [period, setPeriod] = useState("");
  const periods = [...new Set(invoices.map((i) => i.periodo))].sort().reverse();

  const list = invoices.filter((i) => {
    if (i.status === "borrador" && state !== "borrador") return false;
    if (client && i.clienteId !== client) return false;
    if (period && i.periodo !== period) return false;
    const st = invoiceState(i);
    if (state === "abiertas" && !(i.kind === "factura" && i.status === "emitida" && i.saldo > 0)) return false;
    if (state === "sin_fiscal" && !(i.status === "emitida" && i.kind === "factura" && !i.fiscalNumero && !i.legado)) return false;
    if (!["todas", "abiertas", "sin_fiscal"].includes(state) && st !== state) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![i.numero, i.fiscalNumero, clientName(byClient.get(i.clienteId))].some((x) => (x || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => (b.fechaEmision || "9999").localeCompare(a.fechaEmision || "9999") || (b.numero || "").localeCompare(a.numero || ""));

  function exportXlsx() {
    const rows = list.map((i) => ({
      Número: i.numero || "Borrador", Tipo: i.kind === "factura" ? "Factura" : "Nota de crédito", Cliente: clientName(byClient.get(i.clienteId)),
      RUC: byClient.get(i.clienteId)?.rucCnpj || "", Contrato: i.contratoId ? byContract.get(i.contratoId)?.numero : "", Período: periodLabel(i.periodo),
      Emisión: formatDate(i.fechaEmision), Vencimiento: formatDate(i.fechaVencimiento), Total: i.total, "IVA incluido": Math.round(i.total / 11 * 100) / 100,
      Pagado: i.pagado, Saldo: i.saldo, Estado: invoiceState(i), "Factura fiscal": i.fiscalNumero, CDC: i.fiscalCdc,
    }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturas"); XLSX.writeFile(wb, `facturas_${todayLocal()}.xlsx`);
  }

  return (
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-52"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Número, número fiscal o cliente" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={state} onValueChange={setState}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abiertas">Con saldo</SelectItem><SelectItem value="vencida">Vencidas</SelectItem><SelectItem value="pagada">Pagadas</SelectItem>
            <SelectItem value="sin_fiscal">Sin número fiscal</SelectItem><SelectItem value="acreditada">Notas de crédito</SelectItem><SelectItem value="anulada">Anuladas</SelectItem>
            <SelectItem value="borrador">Borradores</SelectItem><SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={client || "_all"} onValueChange={(v) => setClient(v === "_all" ? "" : v)}><SelectTrigger className="w-48"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent><SelectItem value="_all">Todos los clientes</SelectItem>{[...byClient.values()].map((c) => <SelectItem key={c.id} value={c.id}>{clientName(c)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={period || "_all"} onValueChange={(v) => setPeriod(v === "_all" ? "" : v)}><SelectTrigger className="w-40"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent><SelectItem value="_all">Todos los meses</SelectItem>{periods.map((p) => <SelectItem key={p} value={p}>{periodLabel(p, true)}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={exportXlsx}><FileDown className="h-4 w-4 mr-1" />Excel</Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>Período</TableHead><TableHead>Vence</TableHead>
            <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Estado</TableHead><TableHead>Fiscal</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay facturas con estos filtros.</TableCell></TableRow>}
            {list.slice(0, 300).map((i) => (
              <TableRow key={i.id} className="cursor-pointer" onClick={() => onOpen(i.id)}>
                <TableCell className="font-mono text-xs">{i.numero || "Borrador"}</TableCell>
                <TableCell>{clientName(byClient.get(i.clienteId))}</TableCell>
                <TableCell>{periodLabel(i.periodo, true)}</TableCell>
                <TableCell className={i.estadoPago === "vencida" ? "text-destructive" : ""}>{i.kind === "factura" ? formatDate(i.fechaVencimiento) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(i.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{i.kind === "factura" && i.status === "emitida" ? formatMoney(i.saldo) : "—"}</TableCell>
                <TableCell><StatusBadge status={invoiceState(i)} /></TableCell>
                <TableCell className="text-xs">{i.fiscalNumero ? <span className="font-mono">{i.fiscalNumero}</span> : i.status === "emitida" && !i.legado ? <span className="text-warning">pendiente</span> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {list.length > 0 && <TableFooter><TableRow>
            <TableCell colSpan={4}>{list.length} documentos{list.length > 300 ? " (mostrando 300)" : ""}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(list.reduce((s, i) => s + i.total, 0))}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(list.reduce((s, i) => s + (i.kind === "factura" ? i.saldo : 0), 0))}</TableCell>
            <TableCell colSpan={2} />
          </TableRow></TableFooter>}
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{payments.filter((p) => !p.anulado && !p.invoiceId).length > 0 && "Hay pagos a cuenta sin imputar: véalos en Cobranzas."}</p>
    </div>
  );
}

// ======================================================================= Ficha de la factura
function InvoiceSheet({ invoiceId, onClose, invoices, payments, byClient, byContract, onChanged, onPay, onOpen }: {
  invoiceId: string | null; onClose: () => void; invoices: Invoice[]; payments: Payment[]; byClient: Map<string, Client>;
  byContract: Map<string, import("@/data/types").Contract>; onChanged: () => void; onPay: (invoiceId: string) => void; onOpen: (id: string) => void;
}) {
  const inv = invoices.find((i) => i.id === invoiceId);
  const qc = useQueryClient();
  const linesQ = useQuery({ queryKey: ["billing", "lines", "one", invoiceId], queryFn: () => fetchInvoiceLines([invoiceId!]), enabled: !!invoiceId });
  const [dlg, setDlg] = useState<"ajuste" | "nc" | "anular" | "fiscal" | null>(null);
  const lines = linesQ.data || [];
  const ncs = invoices.filter((n) => n.facturaOrigenId === invoiceId);
  const origin = inv?.facturaOrigenId ? invoices.find((i) => i.id === inv.facturaOrigenId) : undefined;
  const client = inv ? byClient.get(inv.clienteId) : undefined;
  const contract = inv?.contratoId ? byContract.get(inv.contratoId) : undefined;
  const changed = () => { qc.invalidateQueries({ queryKey: ["billing"] }); onChanged(); };

  async function removeLine(l: InvoiceLine) {
    try { await deleteLine(l.id); toast.success("Ajuste quitado"); changed(); } catch (e) { toast.error((e as Error).message); }
  }

  function copyText() {
    if (!inv) return;
    const s = summarize(lines).map((x) => `• ${x.label}: ${formatMoney(x.importe)}`).join("\n");
    const txt = `Hola ${client?.contato || clientName(client)}, le enviamos la factura ${inv.numero} de ${periodLabel(inv.periodo)}:\n${s}\nTotal: ${formatMoney(inv.total)} (IVA incluido)\nVence: ${formatDate(inv.fechaVencimiento)}${inv.saldo > 0 && inv.saldo < inv.total ? `\nSaldo pendiente: ${formatMoney(inv.saldo)}` : ""}\nEl detalle completo está en su portal StockFlex. ¡Gracias!`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Texto copiado para correo o WhatsApp"), () => toast.error("No se pudo copiar"));
  }

  return (
    <Sheet open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle>{client ? clientName(client) : "Factura"}</SheetTitle></SheetHeader>
        {!inv ? <div className="py-10 text-center text-muted-foreground">Factura no encontrada.</div> : (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => printInvoices([{ invoice: inv, lines, payments, client, contract, origin }])}><Printer className="h-4 w-4 mr-1" />PDF</Button>
              {inv.status === "emitida" && inv.kind === "factura" && <Button size="sm" variant="outline" onClick={copyText}><Copy className="h-4 w-4 mr-1" />Copiar resumen</Button>}
              {inv.status === "borrador" && <Button size="sm" variant="outline" onClick={() => setDlg("ajuste")}><Plus className="h-4 w-4 mr-1" />Ajuste / descuento</Button>}
              {inv.status === "borrador" && <Button size="sm" onClick={async () => { try { const r = await issueInvoices([inv.id]); toast.success(`Emitida ${r.numeros[0]}`); changed(); } catch (e) { toast.error((e as Error).message); } }}><Send className="h-4 w-4 mr-1" />Emitir</Button>}
              {inv.status === "emitida" && inv.kind === "factura" && inv.saldo > 0 && <Button size="sm" onClick={() => onPay(inv.id)}><DollarSign className="h-4 w-4 mr-1" />Registrar pago</Button>}
              {inv.status === "emitida" && inv.kind === "factura" && <Button size="sm" variant="outline" onClick={() => setDlg("fiscal")}><FileCheck2 className="h-4 w-4 mr-1" />{inv.fiscalNumero ? "Nº fiscal" : "Cargar Nº fiscal"}</Button>}
              {inv.status === "emitida" && inv.kind === "factura" && <Button size="sm" variant="outline" onClick={() => setDlg("nc")}><Receipt className="h-4 w-4 mr-1" />Nota de crédito</Button>}
              {inv.status !== "anulada" && inv.kind === "factura" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDlg("anular")}><Ban className="h-4 w-4 mr-1" />{inv.status === "borrador" ? "Descartar" : "Anular"}</Button>}
            </div>
            {linesQ.isLoading ? <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
              <InvoiceDetail invoice={inv} lines={lines} payments={payments} creditNotes={ncs} client={client} contract={contract} onDeleteLine={removeLine} compact />
            )}
            {origin && <Button variant="link" className="px-0" onClick={() => onOpen(origin.id)}>Ver factura original {origin.numero}</Button>}
          </div>
        )}

        <ReasonDialog open={dlg === "ajuste"} onOpenChange={(o) => !o && setDlg(null)} title="Ajuste en el borrador"
          description="Use un importe negativo para descuentos (ej.: −10,00) y positivo para cargos."
          withDescription={{ label: "Descripción en la factura", placeholder: "Descuento comercial" }}
          withAmount={{ label: "Importe (US$)", allowNegative: true }} confirmLabel="Agregar"
          onSubmit={async (v) => { await addAdjustment(inv!.id, v.description, v.amount, v.reason); toast.success("Ajuste agregado"); changed(); }} />
        <ReasonDialog open={dlg === "nc"} onOpenChange={(o) => !o && setDlg(null)} title={`Nota de crédito sobre ${inv?.numero}`}
          description="La factura emitida no se modifica: la nota de crédito reduce el saldo y queda en la cuenta del cliente. Emita también la nota de crédito electrónica en SIFEN."
          withAmount={{ label: "Importe a acreditar (US$)", max: inv ? inv.total + inv.creditos : undefined, hint: inv ? `Máximo ${formatMoney(inv.total + inv.creditos)}` : "" }} confirmLabel="Emitir nota de crédito"
          onSubmit={async (v) => { const r = await creditNote(inv!.id, v.amount, v.reason); toast.success(`Nota de crédito ${r.numero}`); changed(); }} />
        <ReasonDialog open={dlg === "anular"} onOpenChange={(o) => !o && setDlg(null)} destructive
          title={inv?.status === "borrador" ? "Descartar borrador" : `Anular ${inv?.numero}`}
          description={inv?.status === "borrador" ? "Se elimina el borrador. Puede volver a calcularlo en Cierre del mes." : "Solo para facturas sin pagos ni número fiscal. Si ya se informó al cliente o a SIFEN, use una nota de crédito."}
          reasonRequired={inv?.status !== "borrador"} confirmLabel={inv?.status === "borrador" ? "Descartar" : "Anular"}
          onSubmit={async (v) => { await cancelInvoice(inv!.id, v.reason || "Descartado"); toast.success(inv?.status === "borrador" ? "Borrador descartado" : "Factura anulada"); changed(); if (inv?.status === "borrador") onClose(); }} />
        <FiscalDialog open={dlg === "fiscal"} onOpenChange={(o) => !o && setDlg(null)} invoice={inv}
          onSave={async (n, c) => { await setFiscal(inv!.id, n, c); toast.success("Datos fiscales guardados"); changed(); }} />
      </SheetContent>
    </Sheet>
  );
}

// ======================================================================= Cobranzas
function Collections({ invoices, payments, clients, byContract, onPay, onChanged }: {
  invoices: Invoice[]; payments: Payment[]; clients: Client[]; byContract: Map<string, import("@/data/types").Contract>; onPay: (clientId: string) => void; onChanged: () => void;
}) {
  const open = invoices.filter((i) => i.kind === "factura" && i.status === "emitida" && i.saldo > 0);
  const rows = clients.map((c) => {
    const inv = open.filter((i) => i.clienteId === c.id);
    const b: Record<AgingBucket, number> = { al_dia: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
    for (const i of inv) b[agingBucket(i)] += i.saldo;
    const credit = payments.filter((p) => p.clienteId === c.id && !p.anulado && !p.invoiceId).reduce((s, p) => s + p.importe, 0);
    return { c, inv, b, total: inv.reduce((s, i) => s + i.saldo, 0), credit, maxDays: Math.max(0, ...inv.map((i) => i.diasVencida)) };
  }).filter((r) => r.total > 0 || r.credit > 0).sort((a, b) => b.maxDays - a.maxDays || b.total - a.total);

  // Recordatorios sugeridos hoy: vence en 3 días o vencida hace 1, 7, 15, 30+ días
  const today = todayLocal();
  const daysTo = (d: string | null) => d ? Math.round((new Date(`${d}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000) : 0;
  const reminders = open.filter((i) => { const t = daysTo(i.fechaVencimiento); return t === 3 || [-1, -7, -15].includes(t) || (t <= -30 && (-t) % 15 === 0); });

  function waLink(c: Client, inv: Invoice[]) {
    const lines = inv.map((i) => `• ${i.numero} (${periodLabel(i.periodo)}): ${formatMoney(i.saldo)} — vence ${formatDate(i.fechaVencimiento)}`).join("\n");
    const txt = `Hola ${c.contato || clientName(c)}, le recordamos los saldos pendientes con StockFlex:\n${lines}\nTotal: ${formatMoney(inv.reduce((s, i) => s + i.saldo, 0))}.\nSi ya pagó, por favor envíenos el comprobante. ¡Gracias!`;
    const phone = (c.telefone || "").replace(/\D/g, "");
    return `https://wa.me/${phone}?text=${encodeURIComponent(txt)}`;
  }

  async function statement(c: Client) {
    const ci = invoices.filter((i) => i.clienteId === c.id);
    const cp = payments.filter((p) => p.clienteId === c.id);
    await printStatement(c, buildStatement(ci, cp));
  }

  return (
    <div className="space-y-5 mt-4">
      {reminders.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold text-sm mb-2">Recordatorios sugeridos hoy</h3>
          <div className="divide-y text-sm">
            {reminders.map((i) => {
              const c = clients.find((x) => x.id === i.clienteId)!;
              const t = daysTo(i.fechaVencimiento);
              return (
                <div key={i.id} className="py-2 flex flex-wrap items-center gap-2 justify-between">
                  <span>{clientName(c)} · <span className="font-mono text-xs">{i.numero}</span> · {formatMoney(i.saldo)} · {t > 0 ? `vence en ${t} días` : `vencida hace ${-t} días`}</span>
                  {c?.telefone ? <a href={waLink(c, [i])} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" />WhatsApp</a> : <span className="text-xs text-muted-foreground">sin teléfono</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Cliente</TableHead>
            {(Object.keys(AGING_LABEL) as AgingBucket[]).map((b) => <TableHead key={b} className="text-right">{AGING_LABEL[b]}</TableHead>)}
            <TableHead className="text-right">Total</TableHead><TableHead className="text-right">A favor</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin saldos pendientes.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.c.id}>
                <TableCell><div className="font-medium">{clientName(r.c)}</div><div className="text-xs text-muted-foreground">{r.inv.length} facturas{r.maxDays > 0 ? ` · atraso máx. ${r.maxDays} d` : ""}</div></TableCell>
                {(Object.keys(AGING_LABEL) as AgingBucket[]).map((b) => <TableCell key={b} className={`text-right tabular-nums ${r.b[b] && b !== "al_dia" ? "text-destructive" : ""}`}>{r.b[b] ? formatMoney(r.b[b]) : "—"}</TableCell>)}
                <TableCell className="text-right tabular-nums font-semibold">{formatMoney(r.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.credit ? formatMoney(r.credit) : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-right space-x-1">
                  {r.credit > 0 && r.total > 0 && <Button size="sm" variant="outline" onClick={async () => { try { const x = await applyCredit(r.c.id); toast.success(`Saldo a favor aplicado (${x.imputaciones})`); onChanged(); } catch (e) { toast.error((e as Error).message); } }}>Aplicar a favor</Button>}
                  <Button size="sm" variant="outline" onClick={() => statement(r.c)}><FileText className="h-4 w-4 mr-1" />Estado de cuenta</Button>
                  {r.c.telefone && r.total > 0 && <Button size="sm" variant="outline" asChild><a href={waLink(r.c, r.inv)} target="_blank" rel="noopener"><MessageCircle className="h-4 w-4" /></a></Button>}
                  <Button size="sm" onClick={() => onPay(r.c.id)}>Pago</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Contratos: {byContract.size}. “A favor” son pagos sin factura asignada; se aplican con “Aplicar a favor” cuando hay facturas abiertas.</p>
    </div>
  );
}

// ======================================================================= Pagos
function PaymentsList({ payments, invoices, byClient, onChanged }: { payments: Payment[]; invoices: Invoice[]; byClient: Map<string, Client>; onChanged: () => void }) {
  const [month, setMonth] = useState(monthLocal());
  const [voiding, setVoiding] = useState<string | null>(null);
  const numById = new Map(invoices.map((i) => [i.id, i.numero]));
  const groups = new Map<string, Payment[]>();
  for (const p of payments) if (!month || p.fecha.startsWith(month)) groups.set(p.recibo, [...(groups.get(p.recibo) || []), p]);
  const rows = [...groups.entries()].map(([recibo, ps]) => ({ recibo, ps, p: ps[0], total: ps.reduce((s, x) => s + x.importe, 0), anulado: ps.every((x) => x.anulado) }))
    .sort((a, b) => b.p.fecha.localeCompare(a.p.fecha) || b.recibo.localeCompare(a.recibo));
  const total = rows.filter((r) => !r.anulado).reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border">
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftPeriod(month || monthLocal(), -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="px-3 text-sm font-semibold min-w-36 text-center">{month ? periodLabel(month, true) : "Todos"}</div>
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftPeriod(month || monthLocal(), 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMonth(month ? "" : monthLocal())}>{month ? "Ver todos" : "Solo este mes"}</Button>
        <div className="ml-auto text-sm">Cobrado: <b>{formatMoney(total)}</b></div>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Recibo</TableHead><TableHead>Cliente</TableHead><TableHead>Medio</TableHead><TableHead>Aplicado a</TableHead><TableHead className="text-right">Importe</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin pagos en este período.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.recibo} className={r.anulado ? "opacity-50 line-through" : ""}>
                <TableCell>{formatDate(r.p.fecha)}</TableCell>
                <TableCell className="font-mono text-xs">{r.recibo}</TableCell>
                <TableCell>{clientName(byClient.get(r.p.clienteId))}</TableCell>
                <TableCell>{METHOD_LABEL[r.p.metodo] || r.p.metodo}{r.p.referencia ? <div className="text-xs text-muted-foreground">{r.p.referencia}</div> : null}</TableCell>
                <TableCell className="text-xs">{r.ps.map((x) => x.invoiceId ? numById.get(x.invoiceId) : "a cuenta").join(", ")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(r.total)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {r.p.comprobante && <Button variant="ghost" size="sm" onClick={() => openStorageFile(r.p.comprobante!).catch((e) => toast.error(e.message))}>Comprobante</Button>}
                  {!r.anulado && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setVoiding(r.recibo)}>Anular</Button>}
                  {r.anulado && <span className="text-xs no-underline">{r.p.anuladoMotivo}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ReasonDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} destructive title={`Anular pago ${voiding}`}
        description="Use solo si el pago fue registrado por error (ej.: transferencia rechazada). Las facturas vuelven a tener saldo." confirmLabel="Anular pago"
        onSubmit={async (v) => { await voidPayment(voiding!, v.reason); toast.success("Pago anulado"); onChanged(); }} />
    </div>
  );
}

