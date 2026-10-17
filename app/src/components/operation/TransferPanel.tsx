import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, MoveRight, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStockData } from "@/contexts/StockDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { rpcTransferPallet } from "@/data/dbMutations";
import { findPalletByCode, findPalletByPosition, isPositionCode, normalizeScan, printMovements, resolvePositionId } from "@/data/operations";
import { positionCode, positionLabel } from "@/data/types";
import { statusLabels } from "@/components/shared/StatusBadge";
import type { Pallet } from "@/data/types";
import { parseDbError } from "@/lib/errorMessages";
import { formatNumber } from "@/lib/formatters";
import { beep } from "@/lib/beep";
import ScanField, { type ScanFieldHandle } from "./ScanField";

export default function TransferPanel({ autoPrint, initialCode }: { autoPrint: boolean; initialCode?: string }) {
  const { user } = useAuth();
  const { clients, contracts, authorizedContacts, warehousePositions, currentWarehouse, multiWarehouse, findContiguousPosition, refresh } = useStockData();
  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("Reubicación");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const scanRef = useRef<ScanFieldHandle>(null);

  const client = clients.find((c) => c.id === pallet?.clienteId);
  const destPos = warehousePositions.find((p) => p.id === destino);
  const dest2 = pallet?.palletDuplo && destino ? findContiguousPosition(destino) : null;
  const destError = !destino
    ? null
    : !destPos
      ? "Posición inexistente"
      : destino === pallet?.localizacao
        ? "Es la posición actual"
        : destPos.status !== "free"
          ? `Posición ${positionLabel(destino, multiWarehouse)} no está libre`
          : (pallet?.peso || 0) > (destPos.capacidadeKg || 0)
            ? `La posición soporta hasta ${destPos.capacidadeKg} kg (pallet ${pallet?.peso} kg)`
          : pallet?.palletDuplo && !dest2
            ? `La posición contigua a ${positionLabel(destino, multiWarehouse)} no está libre`
            : null;

  // Um único campo de leitura: primeiro o pallet, depois a posição de destino
  // Vindo do mapa (?pallet=PL-000123): já carrega o pallet
  const initialDone = useRef(false);
  useEffect(() => {
    if (initialCode && !initialDone.current) { initialDone.current = true; void onScan(initialCode); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function onScan(raw: string) {
    const code = normalizeScan(raw);
    if (pallet && isPositionCode(code)) {
      const full = resolvePositionId(code, currentWarehouse?.code);
      setDestino(full);
      const pos = warehousePositions.find((p) => p.id === full);
      beep(pos && pos.status === "free" ? "ok" : "error");
      return;
    }
    setBusy(true);
    try {
      const p = isPositionCode(code) ? await findPalletByPosition(resolvePositionId(code, currentWarehouse?.code)) : await findPalletByCode(code);
      if (!p) {
        beep("error");
        toast.error(isPositionCode(code) ? `La posición ${positionLabel(resolvePositionId(code, currentWarehouse?.code), multiWarehouse)} está vacía` : `Pallet ${code} no encontrado`);
        return;
      }
      if (p.status !== "armazenado") {
        beep("error");
        toast.error(`${p.sku} no está almacenado (${statusLabels[p.status] || p.status})`);
        return;
      }
      beep("ok");
      setPallet(p);
      setDestino("");
    } catch (e) {
      beep("error");
      toast.error(parseDbError(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!pallet || !destino || destError || saving) return;
    setSaving(true);
    try {
      const res = await rpcTransferPallet({
        palletId: pallet.id,
        newPositionId: destino,
        newPosition2Id: dest2?.id,
        motivo: motivo.trim(),
        operador: user?.nome || "Operador",
        operadorId: user?.id,
      });
      beep("ok");
      toast.success(`${pallet.sku} → ${[res.new_location, res.new_location2].filter(Boolean).join(" / ")}`);
      await refresh();
      if (autoPrint) {
        printMovements([res.movement_id], { clients, contracts, authorizedContacts }, { labels: true }).catch((e) =>
          toast.error("No se pudo imprimir", { description: parseDbError(e) }),
        );
      }
      setPallet(null);
      setDestino("");
    } catch (e) {
      beep("error");
      toast.error(parseDbError(e));
    } finally {
      setSaving(false);
      scanRef.current?.focus();
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MoveRight className="h-5 w-5 text-primary" /> Transferencia interna
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ScanField
          ref={scanRef}
          placeholder={pallet ? "Escanee la posición de destino" : "Escanee el pallet a mover"}
          onScan={onScan}
          busy={busy}
        />

        {pallet && (
          <div className="rounded-lg border p-3 grid gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-lg font-bold">{pallet.sku}</div>
                <div className="text-sm text-muted-foreground">{client?.nomeFantasia} · {pallet.descricao || "—"} · {formatNumber(pallet.peso)} kg</div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Cancelar" onClick={() => { setPallet(null); setDestino(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="font-mono text-lg rounded bg-muted px-3 py-2">{[pallet.localizacao, pallet.localizacao2].filter(Boolean).map((x) => positionLabel(x, true)).join(" / ")}</div>
              <ArrowRight className="h-5 w-5" />
              <Input
                className="h-11 w-44 font-mono text-lg uppercase"
                value={destino.startsWith(`${currentWarehouse?.code}:`) ? positionCode(destino) : destino}
                onChange={(e) => setDestino(e.target.value ? resolvePositionId(e.target.value, currentWarehouse?.code) : "")}
                placeholder="Destino"
              />
              {dest2 && <span className="font-mono text-muted-foreground">+ {positionLabel(dest2.id, multiWarehouse)}</span>}
            </div>
            {destError && <p className="text-sm text-destructive">{destError}</p>}
            <div className="grid gap-1.5 max-w-sm">
              <Label>Motivo</Label>
              <Input className="h-11" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <Button variant="cta" size="lg" className="h-14 text-lg" onClick={save} disabled={!destino || !!destError || saving}>
              {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <MoveRight className="h-5 w-5 mr-2" />}
              Confirmar transferencia{autoPrint ? " e imprimir etiqueta" : ""}
            </Button>
          </div>
        )}
        {!pallet && <p className="text-sm text-muted-foreground">Escanee el pallet y luego la etiqueta de la posición de destino.</p>}
      </CardContent>
    </Card>
  );
}
