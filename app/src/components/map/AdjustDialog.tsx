import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { dbInsertExtraCost, dbInsertMovement } from "@/data/dbMutations";
import { EXTRA_COST_CATEGORIES, positionCode, type ExtraCostCategory } from "@/data/types";
import { cancelMovement, confirmMovement } from "@/data/operations";
import { parseDecimal } from "@/lib/formatters";
import { monthLocal, todayLocal } from "@/lib/dates";
import { parseDbError } from "@/lib/errorMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

// ---------------------------------------------------------------- Ajuste / avería
export default function AdjustDialog({ kind, onClose, pallet, positionId, autorizados, moeda, user, onDone }: {
  kind: "ajuste" | "avaria" | null;
  onClose: () => void;
  pallet: import("@/data/types").Pallet;
  positionId: string;
  autorizados: import("@/data/types").AuthorizedContact[];
  moeda: string;
  user: ReturnType<typeof useAuth>["user"];
  onDone: (movementId: string, labels: boolean) => Promise<void>;
}) {
  const [peso, setPeso] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [autorizadoId, setAutorizadoId] = useState("");
  const [interna, setInterna] = useState(false);
  const [withCost, setWithCost] = useState(false);
  const [cat, setCat] = useState<ExtraCostCategory>("outros");
  const [costDesc, setCostDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const isAvaria = kind === "avaria";

  // reinicia os campos a cada abertura
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (kind && openedFor !== `${kind}:${pallet.id}`) {
    setOpenedFor(`${kind}:${pallet.id}`);
    setPeso(String(pallet.peso).replace(".", ",")); setValor(String(pallet.valorDeclarado || 0).replace(".", ","));
    setMotivo(""); setAutorizadoId(""); setInterna(false); setWithCost(kind === "avaria"); setCat("outros"); setCostDesc("");
  }
  if (!kind && openedFor) setOpenedFor(null);

  async function submit() {
    const newPeso = parseDecimal(peso);
    const newValor = parseDecimal(valor);
    if (!isAvaria && (isNaN(newPeso) || newPeso <= 0)) return toast.error("Peso inválido");
    if (!isAvaria && (isNaN(newValor) || newValor < 0)) return toast.error("Valor declarado inválido");
    if (motivo.trim().length < 3) return toast.error("Describa el motivo (mín. 3 caracteres)");
    if ((withCost || isAvaria) && costDesc.trim().length < 3) return toast.error("Describa el costo extra");
    setBusy(true);
    const movId = crypto.randomUUID();
    try {
      await dbInsertMovement({
        id: movId, tipo: isAvaria ? "avaria" : "ajuste", dataHora: new Date().toISOString(), operador: user?.nome || "Operador",
        clienteId: pallet.clienteId, contratoId: pallet.contratoId, palletId: pallet.id, origemLocal: positionId, destinoLocal: positionId,
        motivo: motivo.trim(), status: "solicitada", pesoInicial: pallet.peso, pesoFinal: isAvaria ? pallet.peso : newPeso,
        interna: interna || undefined, novoValorDeclarado: isAvaria ? undefined : newValor, operadorId: user?.id, autorizadoId: autorizadoId || undefined,
      } as never);
      if (withCost || isAvaria) {
        await dbInsertExtraCost({
          clienteId: pallet.clienteId, contratoId: pallet.contratoId, competencia: monthLocal(), categoria: cat, descricao: costDesc.trim(),
          quantidade: 1, valorUnitario: 0, valorTotal: 0, moeda, dataCriacao: todayLocal(), origem: "operador", statusAprovacao: "pendente", movimentacaoId: movId,
        });
      }
      try {
        await confirmMovement({ movementId: movId, operador: user?.nome, operadorId: user?.id });
      } catch (err) {
        await cancelMovement(movId, "Error al efectivar").catch(() => undefined);
        throw err;
      }
      toast.success(isAvaria ? "Avería registrada" : "Ajuste registrado", { description: withCost || isAvaria ? "El costo extra queda pendiente de valor y aprobación en Finanzas." : undefined });
      onClose();
      await onDone(movId, !isAvaria && newPeso !== pallet.peso);
    } catch (err) {
      toast.error(parseDbError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isAvaria ? "Avería" : "Ajuste"} — {pallet.sku} · {positionCode(positionId)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!isAvaria && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nuevo peso (kg)</Label><Input inputMode="decimal" value={peso} onChange={(ev) => setPeso(ev.target.value)} /></div>
              <div><Label>Valor declarado (US$)</Label><Input inputMode="decimal" value={valor} onChange={(ev) => setValor(ev.target.value)} /></div>
            </div>
          )}
          <div><Label>{isAvaria ? "Qué pasó *" : "Motivo *"}</Label><Textarea rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={isAvaria ? "Ej.: film roto, caja aplastada" : "Ej.: repaletizado, conteo"} /></div>
          {autorizados.length > 0 && (
            <div><Label>Autorizado del cliente presente</Label>
              <Select value={autorizadoId || "_none"} onValueChange={(v) => setAutorizadoId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="_none">Ninguno</SelectItem>{autorizados.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome} — {a.tipoDocumento} {a.documento}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {!isAvaria && <label className="flex items-center gap-2 text-sm"><Checkbox checked={interna} onCheckedChange={(v) => setInterna(!!v)} />Operación interna de StockFlex (no se cobra)</label>}
          {!isAvaria && <label className="flex items-center gap-2 text-sm"><Checkbox checked={withCost} onCheckedChange={(v) => setWithCost(!!v)} />Generar costo extra para el cliente</label>}
          {(withCost || isAvaria) && (
            <div className="grid gap-2 rounded-md border p-3">
              <Select value={cat} onValueChange={(v) => setCat(v as ExtraCostCategory)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EXTRA_COST_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="Descripción del costo" value={costDesc} onChange={(ev) => setCostDesc(ev.target.value)} />
              <p className="text-xs text-muted-foreground">El valor lo define Finanzas antes de facturar.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>{isAvaria ? "Registrar avería" : "Confirmar ajuste"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
