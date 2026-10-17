import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, parseDecimal } from "@/lib/formatters";
import { formatDate, todayLocal } from "@/lib/dates";
import { METHOD_LABEL, periodLabel, registerPayment, uploadPaymentProof, type Invoice } from "@/data/billing";
import type { Client } from "@/data/types";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// ---------------------------------------------------------------- Registrar pago
interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clients: Client[];
  invoices: Invoice[]; // todas las emitidas con saldo (se filtran por cliente)
  initialClientId?: string;
  initialInvoiceId?: string;
  onDone: () => void;
}

export function PaymentDialog({ open, onOpenChange, clients, invoices, initialClientId, initialInvoiceId, onDone }: PaymentDialogProps) {
  const [clienteId, setClienteId] = useState("");
  const [invoiceId, setInvoiceId] = useState<string>("auto");
  const [fecha, setFecha] = useState(todayLocal());
  const [importe, setImporte] = useState("");
  const [metodo, setMetodo] = useState("transferencia");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const open_ = useMemo(
    () => invoices.filter((i) => i.clienteId === clienteId && i.kind === "factura" && i.status === "emitida" && i.saldo > 0)
      .sort((a, b) => (a.fechaVencimiento || "").localeCompare(b.fechaVencimiento || "")),
    [invoices, clienteId],
  );
  const deuda = open_.reduce((s, i) => s + i.saldo, 0);

  useEffect(() => {
    if (!open) return;
    const inv = initialInvoiceId ? invoices.find((i) => i.id === initialInvoiceId) : undefined;
    setClienteId(inv?.clienteId || initialClientId || "");
    setInvoiceId(inv ? inv.id : "auto");
    setImporte(inv ? inv.saldo.toFixed(2).replace(".", ",") : "");
    setFecha(todayLocal()); setMetodo("transferencia"); setReferencia(""); setNotas(""); setFile(null);
  }, [open, initialClientId, initialInvoiceId, invoices]);

  const amount = parseDecimal(importe);
  const selected = open_.find((i) => i.id === invoiceId);
  const preview = useMemo(() => {
    if (isNaN(amount) || amount <= 0) return [];
    let rest = amount;
    const out: { label: string; v: number }[] = [];
    const queue = selected ? [selected, ...open_.filter((i) => i.id !== selected.id)] : open_;
    for (const i of queue) {
      if (rest <= 0) break;
      const v = Math.min(rest, i.saldo);
      out.push({ label: `${i.numero} (${periodLabel(i.periodo)})`, v });
      rest = Math.round((rest - v) * 100) / 100;
    }
    if (rest > 0) out.push({ label: "Saldo a favor (a cuenta)", v: rest });
    return out;
  }, [amount, open_, selected]);

  async function submit() {
    if (!clienteId) return toast.error("Seleccione el cliente");
    if (isNaN(amount) || amount <= 0) return toast.error("Indique el importe (ej.: 1.250,00)");
    if (!fecha) return toast.error("Indique la fecha");
    if (fecha > todayLocal()) return toast.error("La fecha del pago no puede ser futura");
    if (metodo !== "efectivo" && !referencia.trim()) return toast.error("Indique la referencia (n.º de transferencia, cheque…)");
    setSaving(true);
    try {
      const comprobante = file ? await uploadPaymentProof(clienteId, file) : null;
      const r = await registerPayment({ clienteId, fecha, importe: amount, metodo, referencia: referencia.trim(), invoiceId: invoiceId === "auto" ? null : invoiceId, comprobante, notas });
      toast.success(`Pago registrado · ${r.recibo}`, {
        description: r.aplicado.map((a) => `${a.numero || "a cuenta"}: ${formatMoney(a.importe)}`).join(" · "),
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago recibido</DialogTitle>
          <DialogDescription>Si no elige una factura, el pago se aplica a las más antiguas; lo que sobre queda a favor del cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Cliente *</Label>
            <Select value={clienteId} onValueChange={(v) => { setClienteId(v); setInvoiceId("auto"); }}>
              <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
              <SelectContent>{[...clients].sort((a, b) => (a.nomeFantasia || a.razaoSocial).localeCompare(b.nomeFantasia || b.razaoSocial)).map((c) => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</SelectItem>)}</SelectContent>
            </Select>
            {clienteId && <p className="text-xs text-muted-foreground mt-1">{open_.length ? `${open_.length} facturas abiertas · saldo ${formatMoney(deuda)}` : "Sin facturas abiertas: el pago quedará a cuenta."}</p>}
          </div>
          {open_.length > 0 && (
            <div>
              <Label>Aplicar a</Label>
              <Select value={invoiceId} onValueChange={(v) => { setInvoiceId(v); const inv = open_.find((i) => i.id === v); if (inv) setImporte(inv.saldo.toFixed(2).replace(".", ",")); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (más antiguas primero)</SelectItem>
                  {open_.map((i) => <SelectItem key={i.id} value={i.id}>{i.numero} · {periodLabel(i.periodo)} · saldo {formatMoney(i.saldo)} · vence {formatDate(i.fechaVencimiento)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="f862-1">Fecha *</Label><Input id="f862-1" type="date" value={fecha} max={todayLocal()} onChange={(e) => setFecha(e.target.value)} /></div>
            <div><Label htmlFor="f862-2">Importe (US$) *</Label><Input id="f862-2" inputMode="decimal" placeholder="0,00" value={importe} onChange={(e) => setImporte(e.target.value)} />
              {open_.length > 0 && <button type="button" className="text-xs text-primary mt-0.5" onClick={() => setImporte(deuda.toFixed(2).replace(".", ","))}>Saldo total {formatMoney(deuda)}</button>}
            </div>
            <div><Label>Medio *</Label>
              <Select value={metodo} onValueChange={setMetodo}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(METHOD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="f862-3">Referencia {metodo !== "efectivo" && "*"}</Label><Input id="f862-3" placeholder="N.º de operación" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></div>
          </div>
          <div><Label htmlFor="f862-4">Comprobante (PDF o imagen)</Label><Input id="f862-4" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
          <div><Label htmlFor="f862-5">Notas</Label><Textarea id="f862-5" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          {preview.length > 0 && (
            <div className="rounded-md bg-muted/60 p-3 text-sm">
              <div className="font-medium mb-1">Se aplicará así:</div>
              {preview.map((p) => <div key={p.label} className="flex justify-between"><span>{p.label}</span><span className="tabular-nums">{formatMoney(p.v)}</span></div>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Registrar pago</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Diálogo genérico (motivo / importe / descripción)
interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  withAmount?: { label: string; hint?: string; allowNegative?: boolean; max?: number; initial?: string };
  withDescription?: { label: string; placeholder?: string };
  reasonLabel?: string;
  reasonRequired?: boolean;
  onSubmit: (v: { amount: number; description: string; reason: string }) => Promise<void>;
}

export function ReasonDialog(p: ReasonDialogProps) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (p.open) { setAmount(p.withAmount?.initial || ""); setDesc(""); setReason(""); } }, [p.open, p.withAmount?.initial]);

  async function go() {
    const n = parseDecimal(amount);
    if (p.withAmount) {
      if (isNaN(n) || n === 0) return toast.error("Indique un importe válido (ej.: 25,00)");
      if (!p.withAmount.allowNegative && n < 0) return toast.error("El importe debe ser positivo");
      if (p.withAmount.max !== undefined && n > p.withAmount.max + 0.001) return toast.error(`Máximo ${formatMoney(p.withAmount.max)}`);
    }
    if (p.withDescription && !desc.trim()) return toast.error(`Complete: ${p.withDescription.label}`);
    if ((p.reasonRequired ?? true) && !reason.trim()) return toast.error("Indique el motivo");
    setBusy(true);
    try {
      await p.onSubmit({ amount: n, description: desc.trim(), reason: reason.trim() });
      p.onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{p.title}</DialogTitle>
          {p.description && <DialogDescription>{p.description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          {p.withDescription && <div><Label htmlFor="f862-6">{p.withDescription.label} *</Label><Input id="f862-6" placeholder={p.withDescription.placeholder} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>}
          {p.withAmount && <div><Label htmlFor="f862-7">{p.withAmount.label} *</Label><Input id="f862-7" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            {p.withAmount.hint && <p className="text-xs text-muted-foreground mt-1">{p.withAmount.hint}</p>}</div>}
          <div><Label htmlFor="f862-8">{p.reasonLabel || "Motivo"}{(p.reasonRequired ?? true) ? " *" : ""}</Label><Textarea id="f862-8" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => p.onOpenChange(false)}>Volver</Button>
          <Button variant={p.destructive ? "destructive" : "default"} onClick={go} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{p.confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Número fiscal (SIFEN)
export function FiscalDialog({ open, onOpenChange, invoice, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; invoice?: Invoice; onSave: (numero: string, cdc: string) => Promise<void> }) {
  const [numero, setNumero] = useState("");
  const [cdc, setCdc] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setNumero(invoice?.fiscalNumero || ""); setCdc(invoice?.fiscalCdc || ""); } }, [open, invoice]);
  // Acepta "1-1-123" y completa con ceros
  const normalize = (v: string) => {
    const m = v.trim().match(/^(\d{1,3})-(\d{1,3})-(\d{1,7})$/);
    return m ? `${m[1].padStart(3, "0")}-${m[2].padStart(3, "0")}-${m[3].padStart(7, "0")}` : v.trim();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Factura electrónica de {invoice?.numero}</DialogTitle>
          <DialogDescription>Copie el número y el CDC de la factura emitida en el sistema de facturación (SIFEN).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="f862-9">Número de factura</Label><Input id="f862-9" placeholder="001-001-0000123" value={numero} onChange={(e) => setNumero(e.target.value)} onBlur={() => setNumero(normalize(numero))} /></div>
          <div><Label htmlFor="f862-10">CDC (44 dígitos)</Label><Input id="f862-10" placeholder="0180..." value={cdc} onChange={(e) => setCdc(e.target.value.replace(/[^\d]/g, ""))} />
            <p className="text-xs text-muted-foreground mt-1">{cdc.length}/44</p></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await onSave(normalize(numero), cdc); onOpenChange(false); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
