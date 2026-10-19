import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, PackagePlus, Printer, MapPin, AlertTriangle, RotateCcw, Layers } from "lucide-react";
import BatchEntryDialog from "./BatchEntryDialog";
import PositionPicker from "./PositionPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStockData } from "@/contexts/StockDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { rpcRegisterPalletEntry } from "@/data/dbMutations";
import { isPositionCode, normalizeScan, printMovements, resolvePositionId } from "@/data/operations";
import { isGroundPosition } from "@/data/types";
import { parseDbError } from "@/lib/errorMessages";
import { formatNumber, parseDecimal } from "@/lib/formatters";
import { positionCode, positionLabel } from "@/data/types";
import { beep } from "@/lib/beep";

const parseNum = (v: string) => {
  const n = parseDecimal(v);
  return isNaN(n) ? undefined : n;
};

interface SessionEntry {
  movementId: string;
  palletId: string;
  sku: string;
  descricao: string;
  peso: number;
  local: string;
  clienteId: string;
}

export default function EntryPanel({ autoPrint, initialPosition }: { autoPrint: boolean; initialPosition?: string }) {
  const { user } = useAuth();
  const { clients, contracts, authorizedContacts, currentPositions: warehousePositions, currentWarehouse, multiWarehouse, suggestPosition, findContiguousPosition, refresh } = useStockData();

  const [clienteId, setClienteId] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [lote, setLote] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [peso, setPeso] = useState("");
  const [valor, setValor] = useState("");
  const [seguro, setSeguro] = useState(false);
  const [duplo, setDuplo] = useState(false);
  const [posicao, setPosicao] = useState(initialPosition || "");
  const [posTouched, setPosTouched] = useState(!!initialPosition);
  const [heavyOk, setHeavyOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<SessionEntry[]>([]);
  const pesoRef = useRef<HTMLInputElement>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const activeContracts = useMemo(
    () => contracts.filter((c) => c.clienteId === clienteId && c.status === "ativo"),
    [contracts, clienteId],
  );
  const clientList = useMemo(
    () => clients.filter((c) => contracts.some((ct) => ct.clienteId === c.id && ct.status === "ativo")).sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia)),
    [clients, contracts],
  );

  // Contrato ativo único é escolhido sozinho
  useEffect(() => {
    if (activeContracts.length === 1) setContratoId(activeContracts[0].id);
    else if (!activeContracts.some((c) => c.id === contratoId)) setContratoId("");
  }, [activeContracts, contratoId]);

  const pesoNum = parseNum(peso) ?? 0;

  // Sugestão de posição (pallet pesado vai ao nível do chão; duplo precisa de vizinha livre)
  const suggested = useMemo(() => {
    if (!clienteId) return "";
    if (duplo) {
      const free = warehousePositions
        .filter((p) => p.status === "free" && (p.capacidadeKg || 0) >= pesoNum)
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const p of free) if (findContiguousPosition(p.id)) return p.id;
      return "";
    }
    return suggestPosition(clienteId, pesoNum)?.id || "";
  }, [clienteId, duplo, pesoNum, warehousePositions, suggestPosition, findContiguousPosition]);

  useEffect(() => {
    if (!posTouched) setPosicao(suggested);
  }, [suggested, posTouched]);

  const pos = warehousePositions.find((p) => p.id === posicao);
  const pos2 = duplo && posicao ? findContiguousPosition(posicao) : null;
  const posError = !posicao
    ? (pesoNum > 0 ? `Ninguna posición libre soporta ${formatNumber(pesoNum)} kg en este depósito` : "Sin posición libre disponible")
    : !pos
      ? "Posición inexistente"
      : pos.status !== "free"
        ? `Posición ${positionLabel(posicao, multiWarehouse)} no está libre`
        : pesoNum > (pos.capacidadeKg || 0)
          ? `La posición soporta hasta ${formatNumber(pos.capacidadeKg)} kg`
        : duplo && !pos2
          ? `La posición contigua a ${positionLabel(posicao, multiWarehouse)} no está libre`
          : null;
  const heavyHigh = pesoNum > 1200 && !!posicao && !isGroundPosition(posicao);

  const contract = contracts.find((c) => c.id === contratoId);
  const overContract = contract ? contract.posicoesOcupadas + (duplo ? 2 : 1) > contract.posicoesContratadas : false;

  const canSave = !!clienteId && !!contratoId && pesoNum > 0 && !posError && (!heavyHigh || heavyOk) && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await rpcRegisterPalletEntry({
        clienteId,
        contratoId,
        sku: "",
        descricao: descricao.trim(),
        lote: lote.trim() || undefined,
        quantidade: quantidade ? parseInt(quantidade, 10) : undefined,
        peso: pesoNum,
        valorDeclarado: parseNum(valor) ?? 0,
        seguro,
        palletDuplo: duplo,
        positionId: posicao,
        position2Id: pos2?.id,
        operador: user?.nome || "Operador",
        operadorId: user?.id,
      });

      beep("ok");
      toast.success(`Ingreso registrado: ${res.sku}`, { description: `Ubicación ${[res.localizacao, res.localizacao2].filter(Boolean).map((x) => positionLabel(x, multiWarehouse)).join(" / ")}` });
      setSession((s) => [
        { movementId: res.movement_id, palletId: res.pallet_id, sku: res.sku, descricao: descricao.trim(), peso: pesoNum, local: [res.localizacao, res.localizacao2].filter(Boolean).map((x) => positionLabel(x, multiWarehouse)).join(" / "), clienteId },
        ...s,
      ]);
      // Mantém cliente, contrato, descrição e lote para o próximo pallet do mesmo caminhão
      setPeso("");
      setQuantidade("");
      setPosTouched(false);
      setHeavyOk(false);
      await refresh();
      pesoRef.current?.focus();
      if (autoPrint) {
        printMovements([res.movement_id], { clients, contracts, authorizedContacts }, { labels: true }).catch((e) =>
          toast.error("No se pudo imprimir", { description: parseDbError(e) }),
        );
      }
    } catch (e) {
      beep("error");
      toast.error(parseDbError(e));
    } finally {
      setSaving(false);
    }
  }

  const sameClientSession = session.filter((s) => s.clienteId === clienteId);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-primary" /> Ingreso de pallet
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setBatchOpen(true)}>
              <Layers className="h-4 w-4 mr-1" /> Ingreso en lote
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Cliente *</Label>
                <Select value={clienteId} onValueChange={(v) => { setClienteId(v); setPosTouched(false); }}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Seleccione el cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Contrato *</Label>
                <Select value={contratoId} onValueChange={setContratoId} disabled={!clienteId}>
                  <SelectTrigger className="h-11"><SelectValue placeholder={clienteId && activeContracts.length === 0 ? "Sin contrato activo" : "Contrato"} /></SelectTrigger>
                  <SelectContent>
                    {activeContracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.numero} · {c.posicoesOcupadas}/{c.posicoesContratadas} pos.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="in-desc">Descripción</Label>
                <Input id="in-desc" className="h-11" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ej.: Cajas de repuestos" />
              </div>
              <div className="grid gap-1.5">
                <Label>Lote</Label>
                <Input className="h-11" value={lote} onChange={(e) => setLote(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="in-peso">Peso (kg) *</Label>
                <Input id="in-peso" ref={pesoRef} className="h-11 text-lg" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <Label>Cantidad</Label>
                <Input className="h-11" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="grid gap-1.5 col-span-2 sm:col-span-1">
                <Label htmlFor="in-valor">Valor declarado (US$)</Label>
                <Input id="in-valor" className="h-11" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={seguro} onCheckedChange={setSeguro} /> Con seguro</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={duplo} onCheckedChange={(v) => { setDuplo(v); setPosTouched(false); }} /> Pallet doble (2 posiciones)</label>
            </div>

            <div className="rounded-lg border p-3 grid gap-2">
              <Label htmlFor="in-pos" className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Posición</Label>
              <div className="flex flex-wrap gap-2 items-center">
                <PositionPicker
                  id="in-pos"
                  value={posicao}
                  suggested={suggested}
                  peso={pesoNum}
                  needPair={duplo}
                  onChange={(v, manual) => { setPosicao(v); setPosTouched(manual); }}
                />
                {pos2 && <span className="font-mono text-muted-foreground">+ {positionLabel(pos2.id, multiWarehouse)}</span>}
                {posTouched && suggested && suggested !== posicao && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPosTouched(false)}>
                    <RotateCcw className="h-4 w-4 mr-1" /> Sugerida ({positionLabel(suggested, multiWarehouse)})
                  </Button>
                )}
              </div>
              {!posTouched && posicao && <p className="text-xs text-muted-foreground">Sugerida por el sistema{pesoNum > 1000 ? " (pallet pesado: nivel del suelo)" : ""}. Puede escribir, escanear o elegir otra.</p>}
              {clienteId && posError && <p className="text-sm text-destructive">{posError}</p>}
              {!posError && posicao && !isPositionCode(posicao) && <p className="text-xs text-muted-foreground">Formato esperado: calle-bloque-nivel-posición (A-01-1-1)</p>}
              {heavyHigh && (
                <label className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  <input type="checkbox" className="mt-0.5" checked={heavyOk} onChange={(e) => setHeavyOk(e.target.checked)} />
                  <span><AlertTriangle className="inline h-4 w-4 mr-1" />Pallet de {formatNumber(pesoNum)} kg en nivel elevado (recomendado hasta 1.200 kg). Confirmo la ubicación.</span>
                </label>
              )}
              {overContract && (
                <p className="text-sm text-amber-700"><AlertTriangle className="inline h-4 w-4 mr-1" />Supera las posiciones contratadas ({contract?.posicoesContratadas}). Se registrará como excedente.</p>
              )}
            </div>

            <Button type="submit" variant="cta" size="lg" className="h-14 text-lg" disabled={!canSave}>
              {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <PackagePlus className="h-5 w-5 mr-2" />}
              Registrar ingreso{autoPrint ? " e imprimir" : ""}
            </Button>
          </form>
        </CardContent>
      </Card>

      <BatchEntryDialog open={batchOpen} onOpenChange={setBatchOpen} initialClienteId={clienteId || undefined} />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ingresados en esta sesión ({session.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {session.length === 0 && <p className="text-sm text-muted-foreground">Los pallets registrados aparecen aquí para reimprimir.</p>}
          {sameClientSession.length > 1 && (
            <Button
              variant="outline"
              onClick={() =>
                printMovements(sameClientSession.map((s) => s.movementId).reverse(), { clients, contracts, authorizedContacts }).catch((e) => toast.error(parseDbError(e)))
              }
            >
              <Printer className="h-4 w-4 mr-2" /> Comprobante único ({sameClientSession.length} pallets)
            </Button>
          )}
          <div className="grid gap-1 max-h-[420px] overflow-auto">
            {session.map((s) => (
              <div key={s.movementId} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                <div className="min-w-0">
                  <div className="font-mono font-semibold">{s.sku} <span className="text-muted-foreground font-normal">→ {s.local}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{s.descricao || "—"} · {formatNumber(s.peso)} kg</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reimprimir"
                  onClick={() => printMovements([s.movementId], { clients, contracts, authorizedContacts }, { labels: true }).catch((e) => toast.error(parseDbError(e)))}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
