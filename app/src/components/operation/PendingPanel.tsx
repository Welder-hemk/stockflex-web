import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { positionLabel } from "@/data/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, ClipboardList, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useStockData } from "@/contexts/StockDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { mapMovement } from "@/data/supabaseData";
import { cancelMovement, confirmMovement, fetchPallets, normalizeScan, printMovements, resolvePositionId } from "@/data/operations";
import type { Movement, Pallet } from "@/data/types";
import { parseDbError } from "@/lib/errorMessages";
import { formatDateTime } from "@/lib/dates";
import { formatNumber } from "@/lib/formatters";
import { beep } from "@/lib/beep";

const TIPO: Record<Movement["tipo"], string> = {
  entrada: "Ingreso",
  saida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
  avaria: "Avería",
  bloqueio: "Bloqueo",
};

export const PENDING_KEY = ["pending-movements"];

export function usePendingMovements() {
  return useQuery({
    queryKey: PENDING_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("*")
        .in("status", ["solicitada", "aprovada"])
        .order("data_hora", { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      const movements = (data || []).map(mapMovement);
      const pallets = await fetchPallets([...new Set(movements.map((m) => m.palletId))]);
      return { movements, pallets: new Map(pallets.map((p) => [p.id, p])) as Map<string, Pallet> };
    },
    refetchInterval: 60_000,
  });
}

export default function PendingPanel({ autoPrint }: { autoPrint: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { clients, contracts, authorizedContacts, warehousePositions, currentWarehouse, multiWarehouse, refresh } = useStockData();
  const { data, isLoading } = usePendingMovements();
  const [dest, setDest] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  const needsDest = (m: Movement) => m.tipo === "entrada" || m.tipo === "transferencia";

  async function confirm(m: Movement) {
    const raw = needsDest(m) ? (dest[m.id] ?? m.destinoLocal) : undefined;
    const d = raw ? resolvePositionId(raw, currentWarehouse?.code) : undefined;
    if (needsDest(m)) {
      const pos = warehousePositions.find((p) => p.id === d);
      if (!pos) return toast.error("Indique una posición de destino válida");
      if (pos.status !== "free") return toast.error(`Posición ${positionLabel(d!, multiWarehouse)} no está libre`);
    }
    setWorking(m.id);
    try {
      await confirmMovement({ movementId: m.id, destino: d, operador: user?.nome, operadorId: user?.id });
      beep("ok");
      toast.success(`${TIPO[m.tipo]} confirmado`);
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: PENDING_KEY })]);
      if (autoPrint) {
        printMovements([m.id], { clients, contracts, authorizedContacts }, { labels: m.tipo === "entrada" || m.tipo === "transferencia" }).catch((e) =>
          toast.error("No se pudo imprimir", { description: parseDbError(e) }),
        );
      }
    } catch (e) {
      beep("error");
      toast.error(parseDbError(e));
    } finally {
      setWorking(null);
    }
  }

  async function cancel(m: Movement) {
    const motivo = window.prompt("Motivo de la cancelación (opcional):") ?? null;
    if (motivo === null) return;
    setWorking(m.id);
    try {
      await cancelMovement(m.id, motivo);
      toast.success("Movimiento cancelado");
      await qc.invalidateQueries({ queryKey: PENDING_KEY });
    } catch (e) {
      toast.error(parseDbError(e));
    } finally {
      setWorking(null);
    }
  }

  const all = data?.movements || [];
  const [fTipo, setFTipo] = useState("all");
  const [fCli, setFCli] = useState("all");
  const movements = all.filter((m) => (fTipo === "all" || m.tipo === fTipo) && (fCli === "all" || m.clienteId === fCli));
  const tipos = [...new Set(all.map((m) => m.tipo))];
  const clis = [...new Set(all.map((m) => m.clienteId))];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" /> Movimientos pendientes ({all.length})
        </CardTitle>
        {all.length > 5 && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Select value={fTipo} onValueChange={setFTipo}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos los tipos</SelectItem>{tipos.map((t) => <SelectItem key={t} value={t}>{TIPO[t]} ({all.filter((m) => m.tipo === t).length})</SelectItem>)}</SelectContent></Select>
            <Select value={fCli} onValueChange={setFCli}><SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos los clientes</SelectItem>{clis.map((c) => <SelectItem key={c} value={c}>{clients.find((x) => x.id === c)?.nomeFantasia || "—"}</SelectItem>)}</SelectContent></Select>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-2">
        {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        {!isLoading && movements.length === 0 && <p className="text-sm text-muted-foreground">No hay movimientos esperando confirmación.</p>}
        {movements.map((m) => {
          const p = data?.pallets.get(m.palletId);
          const c = clients.find((x) => x.id === m.clienteId);
          return (
            <div key={m.id} className="rounded border p-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{TIPO[m.tipo]}</Badge>
                  <span className="font-mono font-semibold">{p?.sku || m.palletId.slice(0, 8)}</span>
                  <span className="text-sm text-muted-foreground">{c?.nomeFantasia}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Solicitado {formatDateTime(m.dataHora)} · {p ? `${formatNumber(p.peso)} kg` : ""} {m.origemLocal ? `· de ${positionLabel(m.origemLocal, multiWarehouse)}` : ""} {m.motivo ? `· ${m.motivo}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {needsDest(m) && (
                  <Input
                    className="h-10 w-36 font-mono uppercase"
                    value={dest[m.id] ?? (m.destinoLocal && m.destinoLocal.startsWith(`${currentWarehouse?.code}:`) ? positionLabel(m.destinoLocal, false) : m.destinoLocal === "Exterior" ? "" : m.destinoLocal)}
                    onChange={(e) => setDest((d) => ({ ...d, [m.id]: normalizeScan(e.target.value) }))}
                    placeholder="Destino" aria-label={`Destino de ${p?.sku || "pallet"}`}
                  />
                )}
                <Button size="sm" className="h-10" onClick={() => confirm(m)} disabled={working === m.id}>
                  {working === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Confirmar
                </Button>
                <Button size="sm" variant="ghost" className="h-10" onClick={() => cancel(m)} disabled={working === m.id} aria-label="Cancelar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
