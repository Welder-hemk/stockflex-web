import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays, addMonths, differenceInCalendarMonths, format, subDays } from "date-fns";
import { CalendarIcon, Info, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useStockData } from "@/contexts/StockDataContext";
import { dbInsertContract, dbUpdateContract } from "@/data/dbMutations";
import type { Contract } from "@/data/types";
import { toast } from "sonner";
import { formatMoney, parseDecimal, toInputDecimal } from "@/lib/formatters";
import { formatDate, toDate } from "@/lib/dates";
import { printPages, escapeHtml as e } from "@/lib/print/printer";

const DURATION_OPTIONS = Array.from({ length: 36 }, (_, i) => i + 1);

// Tabela comercial vigente (mesma do simulador do site)
export function listPrice(positions: number) {
  if (positions > 100) return 7;
  if (positions >= 80) return 7.5;
  return 8;
}
export function suggestedSurcharge(months: number, positions: number) {
  let s = 0;
  const parts: string[] = [];
  if (months < 3) { s += 1.5; parts.push("plazo 1–2 meses"); }
  else if (months < 6) { s += 1; parts.push("plazo 3–5 meses"); }
  else if (months < 12) { s += 0.5; parts.push("plazo 6–11 meses"); }
  if (positions < 10) { s += 1; parts.push("menos de 10 posiciones"); }
  return { value: s, label: parts.length ? `Recargo por ${parts.join(" y ")}` : "" };
}

const decimal = (msg: string, min = 0, max = Infinity) =>
  z.string().refine((v) => { const n = parseDecimal(v); return !isNaN(n) && n >= min && n <= max; }, msg);

const schema = z.object({
  clienteId: z.string().min(1, "Seleccione un cliente"),
  dataInicio: z.date({ required_error: "Fecha obligatoria" }),
  durationMonths: z.coerce.number().int().min(1).max(36),
  posicoesContratadas: z.coerce.number({ invalid_type_error: "Indique un número" }).int("Use un número entero").min(1, "Mínimo 1 posición").max(5000, "Revise la cantidad"),
  precoPorPosicao: decimal("Precio inválido (ej.: 8,00)", 0.01, 1000),
  recargoPorPosicao: decimal("Recargo inválido (ej.: 0,50)", 0, 100),
  recargoDescricao: z.string().max(80),
  precoMovExtra: decimal("Precio inválido (ej.: 4,00)", 0, 1000),
  percentualSeguro: decimal("Porcentaje inválido: use por ejemplo 0,03 (máximo 5%)", 0, 5),
  diaVencimento: z.coerce.number().int().min(1, "Entre 1 y 28").max(28, "Entre 1 y 28"),
  cobrarSobremedida: z.boolean(),
  moeda: z.string().min(1),
  observacoes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editContract?: Contract;
}

const emptyValues = (): FormValues => ({
  clienteId: "", dataInicio: undefined as unknown as Date, durationMonths: 12, posicoesContratadas: 10,
  precoPorPosicao: "8,00", recargoPorPosicao: "0", recargoDescricao: "", precoMovExtra: "4,00",
  percentualSeguro: "0,03", diaVencimento: 10, cobrarSobremedida: false, moeda: "USD", observacoes: "",
});

export default function ContractForm({ open, onOpenChange, editContract }: Props) {
  const { clients, contracts, warehousePositions, totalCapacity, refresh } = useStockData();
  const [capacityWarning, setCapacityWarning] = useState<{ available: number; data: FormValues } | null>(null);
  const [saving, setSaving] = useState(false);
  const isEditing = !!editContract;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues() });

  useEffect(() => {
    if (!open) return;
    if (editContract) {
      const start = toDate(editContract.dataInicio)!;
      const end = toDate(editContract.dataTermino)!;
      const months = Math.max(1, differenceInCalendarMonths(addDays(end, 1), start));
      form.reset({
        clienteId: editContract.clienteId, dataInicio: start, durationMonths: Math.min(36, months),
        posicoesContratadas: editContract.posicoesContratadas,
        precoPorPosicao: toInputDecimal(editContract.precoPorPosicao),
        recargoPorPosicao: toInputDecimal(editContract.recargoPorPosicao ?? 0),
        recargoDescricao: editContract.recargoDescricao ?? "",
        precoMovExtra: toInputDecimal(editContract.precoMovExtra),
        percentualSeguro: toInputDecimal(editContract.percentualSeguro),
        diaVencimento: editContract.diaVencimento ?? 10,
        cobrarSobremedida: !!editContract.cobrarSobremedida,
        moeda: editContract.moeda || "USD", observacoes: editContract.observacoes || "",
      });
    } else {
      form.reset(emptyValues());
    }
  }, [open, editContract, form]);

  const w = form.watch();
  const endDate = w.dataInicio ? subDays(addMonths(w.dataInicio, Number(w.durationMonths) || 1), 1) : null;
  const qty = Number(w.posicoesContratadas) || 0;
  const price = parseDecimal(w.precoPorPosicao);
  const surcharge = parseDecimal(w.recargoPorPosicao) || 0;
  const monthly = qty * ((isNaN(price) ? 0 : price) + surcharge);
  const suggestion = suggestedSurcharge(Number(w.durationMonths) || 12, qty);
  const suggestedPrice = listPrice(qty);
  const differsFromTable = !isNaN(price) && (Math.abs(price - suggestedPrice) > 0.001 || Math.abs(surcharge - suggestion.value) > 0.001);

  const activeClients = useMemo(
    () => clients.filter((c) => c.ativo !== false || c.id === editContract?.clienteId).sort((a, b) => (a.nomeFantasia || a.razaoSocial).localeCompare(b.nomeFantasia || b.razaoSocial)),
    [clients, editContract],
  );

  function applyTable() {
    form.setValue("precoPorPosicao", suggestedPrice.toFixed(2).replace(".", ","), { shouldValidate: true });
    form.setValue("recargoPorPosicao", suggestion.value.toFixed(2).replace(".", ","), { shouldValidate: true });
    form.setValue("recargoDescricao", suggestion.label);
  }

  function onSubmit(data: FormValues) {
    if (!isEditing || data.posicoesContratadas > (editContract?.posicoesContratadas ?? 0)) {
      const blocked = warehousePositions.filter((p) => p.status === "blocked").length;
      const reserved = contracts
        .filter((c) => c.status === "ativo" && c.id !== editContract?.id)
        .reduce((s, c) => s + c.posicoesContratadas, 0);
      const available = totalCapacity - blocked - reserved;
      if (data.posicoesContratadas > available) { setCapacityWarning({ available, data }); return; }
    }
    void doSave(data);
  }

  async function doSave(data: FormValues) {
    setSaving(true);
    const end = subDays(addMonths(data.dataInicio, data.durationMonths), 1);
    const payload = {
      dataInicio: format(data.dataInicio, "yyyy-MM-dd"),
      dataTermino: format(end, "yyyy-MM-dd"),
      posicoesContratadas: data.posicoesContratadas,
      precoPorPosicao: parseDecimal(data.precoPorPosicao),
      recargoPorPosicao: parseDecimal(data.recargoPorPosicao) || 0,
      recargoDescricao: data.recargoDescricao.trim(),
      movimentacoesInclusas: data.posicoesContratadas, // regla: 1 por posición/mes
      precoMovExtra: parseDecimal(data.precoMovExtra),
      percentualSeguro: parseDecimal(data.percentualSeguro),
      diaVencimento: data.diaVencimento,
      cobrarSobremedida: data.cobrarSobremedida,
      moeda: data.moeda,
      observacoes: data.observacoes || "",
    };
    try {
      if (editContract) {
        await dbUpdateContract(editContract.id, payload);
        await printAmendment(editContract, { ...editContract, ...payload });
        toast.success("Contrato actualizado", { description: `${editContract.numero} · los cambios se aplican desde la próxima factura en borrador` });
      } else {
        await dbInsertContract({ ...payload, clienteId: data.clienteId, numero: "", status: "ativo", posicoesOcupadas: 0 });
        toast.success("Contrato registrado", { description: "El número se asignó automáticamente. La facturación se genera en Finanzas › Cierre del mes." });
      }
      await refresh();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function printAmendment(oldC: Contract, newC: Contract) {
    const client = clients.find((c) => c.id === newC.clienteId);
    const money = (v?: number) => formatMoney(v ?? 0, newC.moeda);
    const rows: [string, string, string][] = [];
    const add = (label: string, a: string, b: string) => { if (a !== b) rows.push([label, a, b]); };
    add("Posiciones contratadas", String(oldC.posicoesContratadas), String(newC.posicoesContratadas));
    add("Precio por posición/mes", money(oldC.precoPorPosicao), money(newC.precoPorPosicao));
    add("Recargo por posición/mes", money(oldC.recargoPorPosicao), money(newC.recargoPorPosicao));
    add("Movimiento extra", money(oldC.precoMovExtra), money(newC.precoMovExtra));
    add("Seguro (% del valor declarado)", `${toInputDecimal(oldC.percentualSeguro)}%`, `${toInputDecimal(newC.percentualSeguro)}%`);
    add("Inicio", formatDate(oldC.dataInicio), formatDate(newC.dataInicio));
    add("Término", formatDate(oldC.dataTermino), formatDate(newC.dataTermino));
    add("Día de vencimiento", String(oldC.diaVencimento ?? 10), String(newC.diaVencimento ?? 10));
    if (rows.length === 0) return;
    const html = `<div style="padding:18mm;font-size:13px">
      <h1 style="font-size:20px;text-align:center;margin:0 0 4mm">ADENDA CONTRACTUAL</h1>
      <p>Contrato <b>${e(newC.numero)}</b> — Cliente: <b>${e(client?.razaoSocial || "")}</b> ${client?.rucCnpj ? `(RUC ${e(client.rucCnpj)})` : ""}</p>
      <p>Las partes acuerdan modificar las siguientes condiciones, vigentes a partir de la próxima facturación:</p>
      <table style="width:100%;border-collapse:collapse;margin:6mm 0">
        <thead><tr>${["Condición", "Anterior", "Nueva"].map((h) => `<th style="border:1px solid #ccc;padding:6px;background:#f2f2f2;text-align:left">${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr><td style="border:1px solid #ccc;padding:6px">${e(r[0])}</td><td style="border:1px solid #ccc;padding:6px">${e(r[1])}</td><td style="border:1px solid #ccc;padding:6px"><b>${e(r[2])}</b></td></tr>`).join("")}</tbody>
      </table>
      <p>Las demás cláusulas permanecen sin cambios. Precios con IVA incluido.</p>
      <div style="display:flex;justify-content:space-between;margin-top:30mm">
        <div style="border-top:1px solid #000;width:70mm;text-align:center;padding-top:2mm">StockFlex</div>
        <div style="border-top:1px solid #000;width:70mm;text-align:center;padding-top:2mm">${e(client?.razaoSocial || "Cliente")}</div>
      </div>
      <p style="margin-top:10mm;color:#666;font-size:11px">Ciudad del Este, ${formatDate(new Date())}</p>
    </div>`;
    await printPages([html], "@page { size: A4; margin: 0; }", `Adenda ${newC.numero}`);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? `Editar contrato ${editContract?.numero}` : "Nuevo contrato"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Los cambios valen para las próximas facturas; las ya emitidas no cambian." : "El número del contrato se asigna automáticamente al guardar."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="clienteId" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Cliente *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isEditing}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccione el cliente..." /></SelectTrigger></FormControl>
                      <SelectContent>{activeClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}{c.codigo ? ` · ${c.codigo}` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                    {isEditing && <FormDescription>El cliente de un contrato no se cambia. Para otro cliente, cree un contrato nuevo.</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dataInicio" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Inicio *</FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl>
                      <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "dd/MM/yyyy") : "Seleccionar fecha"}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button></FormControl></PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="durationMonths" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Plazo *</FormLabel>
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-60">{DURATION_OPTIONS.map((m) => <SelectItem key={m} value={String(m)}>{m} {m === 1 ? "mes" : "meses"}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormDescription>{endDate ? `Término: ${format(endDate, "dd/MM/yyyy")}` : "Elija la fecha de inicio"}</FormDescription>
                  </FormItem>
                )} />
              </section>

              <section className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">Precio (IVA incluido)</h3>
                  <Button type="button" size="sm" variant="outline" onClick={applyTable} disabled={!differsFromTable}>
                    <Wand2 className="h-3.5 w-3.5 mr-1" /> Aplicar tabla vigente
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="posicoesContratadas" render={({ field }) => (
                    <FormItem><FormLabel>Posiciones contratadas *</FormLabel><FormControl><Input type="number" inputMode="numeric" min={1} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="precoPorPosicao" render={({ field }) => (
                    <FormItem><FormLabel>Precio por posición/mes *</FormLabel><FormControl><Input inputMode="decimal" placeholder="8,00" {...field} /></FormControl>
                      <FormDescription>Tabla: {formatMoney(suggestedPrice)}</FormDescription><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="recargoPorPosicao" render={({ field }) => (
                    <FormItem><FormLabel>Recargo por posición/mes</FormLabel><FormControl><Input inputMode="decimal" placeholder="0,00" {...field} /></FormControl>
                      <FormDescription>Tabla: {formatMoney(suggestion.value)}</FormDescription><FormMessage /></FormItem>
                  )} />
                </div>
                {surcharge > 0 && (
                  <FormField control={form.control} name="recargoDescricao" render={({ field }) => (
                    <FormItem><FormLabel>Cómo aparece el recargo en la factura</FormLabel><FormControl><Input placeholder="Recargo por plazo 6–11 meses" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
                <div className="rounded-md bg-muted/60 px-3 py-2 text-sm flex flex-wrap justify-between gap-2">
                  <span>{qty} × ({formatMoney(isNaN(price) ? 0 : price)}{surcharge > 0 ? ` + ${formatMoney(surcharge)}` : ""})</span>
                  <span className="font-semibold">Mensual: {formatMoney(monthly)}</span>
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="precoMovExtra" render={({ field }) => (
                  <FormItem><FormLabel>Movimiento extra *</FormLabel><FormControl><Input inputMode="decimal" {...field} /></FormControl>
                    <FormDescription>1 incluido por posición/mes</FormDescription><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="percentualSeguro" render={({ field }) => (
                  <FormItem><FormLabel>Seguro (% mensual) *</FormLabel><FormControl><Input inputMode="decimal" placeholder="0,03" {...field} /></FormControl>
                    <FormDescription>Sobre el valor declarado</FormDescription><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="diaVencimento" render={({ field }) => (
                  <FormItem><FormLabel>Día de vencimiento *</FormLabel><FormControl><Input type="number" min={1} max={28} {...field} /></FormControl>
                    <FormDescription>Del mes facturado</FormDescription><FormMessage /></FormItem>
                )} />
              </section>

              <FormField control={form.control} name="cobrarSobremedida" render={({ field }) => (
                <FormItem className="flex items-start gap-3 rounded-lg border p-3">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div className="space-y-0.5">
                    <FormLabel>Cobrar adicional por pallets sobremedida</FormLabel>
                    <FormDescription>Pallets mayores a 1,2 m³ (1,2 × 1,0 × 1,0 m): proporcional al volumen + US$ 1,00/mes. Desactívelo si el precio acordado ya lo incluye.</FormDescription>
                  </div>
                </FormItem>
              )} />

              <FormField control={form.control} name="observacoes" render={({ field }) => (
                <FormItem><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Condiciones especiales, SLA..." rows={2} {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {!isEditing && (
                <p className="text-xs text-muted-foreground flex gap-1.5"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Facturación: almacenamiento por adelantado (proporcional en el primer y último mes) y extras del mes anterior.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear contrato"}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!capacityWarning} onOpenChange={(o) => !o && setCapacityWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Capacidad insuficiente</AlertDialogTitle>
            <AlertDialogDescription>
              Hay {Math.max(0, capacityWarning?.available ?? 0)} posiciones libres sin contrato y está contratando {capacityWarning?.data.posicoesContratadas}. ¿Desea continuar igualmente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const d = capacityWarning?.data; setCapacityWarning(null); if (d) void doSave(d); }}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
