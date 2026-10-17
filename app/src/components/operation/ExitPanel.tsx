import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, PackageMinus, Trash2, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStockData } from "@/contexts/StockDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { rpcExecutePalletExit } from "@/data/dbMutations";
import { findPalletByCode, findPalletByPosition, isPositionCode, normalizeScan, printMovements, resolvePositionId } from "@/data/operations";
import { positionLabel } from "@/data/types";
import { statusLabels } from "@/components/shared/StatusBadge";
import type { Pallet } from "@/data/types";
import { parseDbError } from "@/lib/errorMessages";
import { formatNumber } from "@/lib/formatters";
import { beep } from "@/lib/beep";
import ScanField, { type ScanFieldHandle } from "./ScanField";

const NO_AUT = "__sin__";

export default function ExitPanel({ autoPrint, initialCode }: { autoPrint: boolean; initialCode?: string }) {
  const { user } = useAuth();
  const { clients, contracts, authorizedContacts, currentWarehouse, multiWarehouse, refresh } = useStockData();
  const [items, setItems] = useState<Pallet[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [autorizadoId, setAutorizadoId] = useState("");
  const [retiradoPor, setRetiradoPor] = useState("");
  const [motivo, setMotivo] = useState("Retiro del cliente");
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const scanRef = useRef<ScanFieldHandle>(null);

  const clienteId = items[0]?.clienteId;
  const client = clients.find((c) => c.id === clienteId);
  const autorizados = useMemo(
    () => authorizedContacts.filter((a) => a.clienteId === clienteId && a.ativo),
    [authorizedContacts, clienteId],
  );
  const totalPeso = items.reduce((s, p) => s + p.peso, 0);

  function fail(msg: string) {
    beep("error");
    setLastError(msg);
    toast.error(msg);
  }

  // Vindo do mapa (?pallet=PL-000123): já carrega o pallet
  const initialDone = useRef(false);
  useEffect(() => {
    if (initialCode && !initialDone.current) { initialDone.current = true; void onScan(initialCode); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function onScan(raw: string) {
    const code = normalizeScan(raw);
    setLookupBusy(true);
    setLastError(null);
    try {
      const pallet = isPositionCode(code) ? await findPalletByPosition(resolvePositionId(code, currentWarehouse?.code)) : await findPalletByCode(code);
      if (!pallet) return fail(isPositionCode(code) ? `La posición ${positionLabel(resolvePositionId(code, currentWarehouse?.code), multiWarehouse)} está vacía` : `Pallet ${code} no encontrado`);
      if (items.some((i) => i.id === pallet.id)) return fail(`${pallet.sku} ya está en la lista`);
      if (pallet.status !== "armazenado" && pallet.status !== "reservado_saida")
        return fail(`${pallet.sku} no está en depósito (${statusLabels[pallet.status] || pallet.status})`);
      if (clienteId && pallet.clienteId !== clienteId) {
        const other = clients.find((c) => c.id === pallet.clienteId);
        return fail(`${pallet.sku} es de ${other?.nomeFantasia || "otro cliente"}. Una salida por cliente.`);
      }
      beep("ok");
      setItems((list) => [...list, pallet]);
    } catch (e) {
      fail(parseDbError(e));
    } finally {
      setLookupBusy(false);
    }
  }

  // Sempre fica registrado quem retirou: autorizado do cadastro ou nome e documento digitados
  const autOk = autorizados.length === 0 || autorizadoId === NO_AUT ? retiradoPor.trim().length > 2 : !!autorizadoId;
  const canSave = items.length > 0 && motivo.trim().length > 0 && autOk && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const done: string[] = [];
    const errors: string[] = [];
    const aut = autorizadoId && autorizadoId !== NO_AUT ? autorizadoId : undefined;
    const motivoFinal = [motivo.trim(), !aut && retiradoPor.trim() ? `Retirado por: ${retiradoPor.trim()}` : ""].filter(Boolean).join(" · ");
    for (const p of items) {
      try {
        const res = await rpcExecutePalletExit({
          palletId: p.id,
          motivo: motivoFinal,
          autorizadoId: aut,
          operador: user?.nome || "Operador",
          operadorId: user?.id,
          pesoFinal: p.peso,
        });
        done.push(res.movement_id);
      } catch (e) {
        errors.push(`${p.sku}: ${parseDbError(e)}`);
      }
    }
    setSaving(false);
    await refresh();

    if (done.length > 0) {
      beep("ok");
      toast.success(`Salida registrada: ${done.length} pallet(s)`);
      if (autoPrint) {
        printMovements(done, { clients, contracts, authorizedContacts }).catch((e) => toast.error("No se pudo imprimir", { description: parseDbError(e) }));
      }
    }
    if (errors.length > 0) {
      beep("error");
      setLastError(errors.join("\n"));
      // Ficam na lista só os que não saíram, para corrigir e tentar de novo
      const failedSkus = new Set(errors.map((x) => x.split(":")[0]));
      setItems((list) => list.filter((p) => failedSkus.has(p.sku)));
    } else {
      setItems([]);
      setAutorizadoId("");
      setRetiradoPor("");
    }
    scanRef.current?.focus();
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <PackageMinus className="h-5 w-5 text-primary" /> Salida de pallets
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ScanField ref={scanRef} placeholder="Escanee el pallet o la posición" onScan={onScan} busy={lookupBusy} />
        {lastError && <div className="whitespace-pre-line text-sm text-destructive bg-destructive/5 rounded p-2">{lastError}</div>}

        {items.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="font-semibold">{client?.nomeFantasia || client?.razaoSocial}</div>
              <div className="text-sm text-muted-foreground">{items.length} pallet(s) · {formatNumber(totalPeso, 2)} kg</div>
            </div>
            <div className="grid gap-1 max-h-[300px] overflow-auto">
              {items.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold">{p.sku} <span className="font-normal text-muted-foreground">· {[p.localizacao, p.localizacao2].filter(Boolean).map((x) => positionLabel(x, multiWarehouse)).join(" / ")}</span></div>
                    <div className="text-xs text-muted-foreground truncate">{p.descricao || "—"} · {formatNumber(p.peso)} kg</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => setItems((l) => l.filter((x) => x.id !== p.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-1"><UserCheck className="h-4 w-4" /> Retira</Label>
                {autorizados.length > 0 ? (
                  <Select value={autorizadoId} onValueChange={setAutorizadoId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Persona autorizada" /></SelectTrigger>
                    <SelectContent>
                      {autorizados.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.nome} · {a.tipoDocumento} {a.documento}</SelectItem>
                      ))}
                      <SelectItem value={NO_AUT}>Otra persona (no registrada)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">El cliente no tiene autorizados registrados.</p>
                )}
                {(autorizados.length === 0 || autorizadoId === NO_AUT) && (
                  <Input className="h-11" value={retiradoPor} onChange={(e) => setRetiradoPor(e.target.value)} placeholder="Nombre y documento de quien retira" />
                )}
              </div>
              <div className="grid gap-1.5">
                <Label>Motivo *</Label>
                <Input className="h-11" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
            </div>

            <Button variant="cta" size="lg" className="h-14 text-lg" onClick={save} disabled={!canSave}>
              {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <PackageMinus className="h-5 w-5 mr-2" />}
              Registrar salida de {items.length} pallet(s){autoPrint ? " e imprimir" : ""}
            </Button>
          </>
        )}
        {items.length === 0 && !lastError && (
          <p className="text-sm text-muted-foreground">Escanee los pallets que el cliente retira. Todos salen en un único comprobante con firma.</p>
        )}
      </CardContent>
    </Card>
  );
}
