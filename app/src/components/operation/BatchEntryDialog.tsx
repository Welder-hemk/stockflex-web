// Ingreso de varios pallets de una vez: planilla con una fila por pallet, posiciones sugeridas
// automáticamente y, al final, comprobante único + todas las etiquetas impresas en lote.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ClipboardPaste, Copy, Loader2, PackagePlus, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStockData } from "@/contexts/StockDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { rpcRegisterPalletEntry } from "@/data/dbMutations";
import { printMovements, resolvePositionId } from "@/data/operations";
import { isGroundPosition, positionCode, positionLabel, type WarehousePosition } from "@/data/types";
import { parseDbError } from "@/lib/errorMessages";
import { formatNumber, parseDecimal } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Row {
  key: number;
  descricao: string;
  lote: string;
  quantidade: string;
  peso: string;
  valor: string;
  posicao: string; // id completo (CDE1:A-01-1-1)
  manual: boolean; // la posición fue escrita a mano
  done?: { sku: string; movementId: string };
  error?: string;
}

const HEAVY = 1200;
let seq = 1;
const num = (v: string) => { const n = parseDecimal(v); return isNaN(n) ? 0 : n; };
const sortPos = (a: WarehousePosition, b: WarehousePosition) =>
  a.rua.localeCompare(b.rua, "es", { numeric: true }) || a.bloco - b.bloco || a.nivel - b.nivel || a.posicao - b.posicao;

export default function BatchEntryDialog({ open, onOpenChange, initialClienteId }: { open: boolean; onOpenChange: (o: boolean) => void; initialClienteId?: string }) {
  const { user } = useAuth();
  const { clients, contracts, authorizedContacts, currentPositions, currentWarehouse, multiWarehouse, refresh } = useStockData();

  const [clienteId, setClienteId] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [base, setBase] = useState({ descricao: "", lote: "", quantidade: "", peso: "", valor: "" });
  const [seguro, setSeguro] = useState(false);
  const [count, setCount] = useState("10");
  const [rows, setRows] = useState<Row[]>([]);
  const [paste, setPaste] = useState<string | null>(null);
  const [heavyOk, setHeavyOk] = useState(false);
  const [printLabels, setPrintLabels] = useState(true);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    setClienteId(initialClienteId || ""); setContratoId(""); setRows([]); setBase({ descricao: "", lote: "", quantidade: "", peso: "", valor: "" });
    setSeguro(false); setHeavyOk(false); setProgress(0); setPaste(null);
  }, [open, initialClienteId]);

  const clientList = useMemo(
    () => clients.filter((c) => contracts.some((ct) => ct.clienteId === c.id && ct.status === "ativo")).sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia)),
    [clients, contracts],
  );
  const activeContracts = useMemo(() => contracts.filter((c) => c.clienteId === clienteId && c.status === "ativo"), [contracts, clienteId]);
  useEffect(() => {
    if (activeContracts.length === 1) setContratoId(activeContracts[0].id);
    else if (!activeContracts.some((c) => c.id === contratoId)) setContratoId("");
  }, [activeContracts, contratoId]);

  // Reparte posiciones libres sin repetir: primero las calles del cliente, pesados al nivel del suelo
  const allocate = (list: Row[]): Row[] => {
    const taken = new Set(list.filter((r) => r.manual || r.done).map((r) => r.posicao));
    const clientRuas = new Set(currentPositions.filter((p) => p.clienteId === clienteId).map((p) => p.rua));
    const free = currentPositions.filter((p) => p.status === "free").sort((a, b) => {
      const ca = clientRuas.has(a.rua) ? 0 : 1, cb = clientRuas.has(b.rua) ? 0 : 1;
      return ca - cb || sortPos(a, b);
    });
    return list.map((r) => {
      if (r.manual || r.done) return r;
      const peso = num(r.peso);
      const fits = (p: WarehousePosition) => !taken.has(p.id) && (p.capacidadeKg || 0) >= peso;
      const pick = (peso > 1000 ? free.find((p) => p.nivel === 1 && fits(p)) : undefined) || free.find(fits);
      if (pick) taken.add(pick.id);
      return { ...r, posicao: pick?.id || "" };
    });
  };

  const setAndAllocate = (next: Row[]) => setRows(allocate(next));
  // al cambiar de cliente se vuelven a sugerir posiciones cerca de su mercadería
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRows((r) => allocate(r)); }, [clienteId, currentPositions]);

  const newRow = (over: Partial<Row> = {}): Row => ({ key: seq++, ...base, posicao: "", manual: false, ...over });

  function addRows() {
    const n = Math.min(Math.max(parseInt(count, 10) || 0, 1), 200);
    setAndAllocate([...rows, ...Array.from({ length: n }, () => newRow())]);
  }

  // Pegar desde Excel: columnas Descripción, Lote, Cantidad, Peso, Valor (las que falten toman el valor común)
  function applyPaste() {
    const lines = (paste || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed = lines
      .map((l) => l.split("\t").map((x) => x.trim()))
      .filter((c) => !/peso|descrip/i.test(c.join(" "))) // ignora la fila de títulos
      .map(([descricao, lote, quantidade, peso, valor]) => newRow({
        descricao: descricao ?? base.descricao, lote: lote ?? base.lote, quantidade: (quantidade ?? base.quantidade).replace(/\D/g, ""),
        peso: peso ?? base.peso, valor: valor ?? base.valor,
      }));
    if (!parsed.length) { toast.error("No se encontraron filas para pegar"); return; }
    setAndAllocate([...rows, ...parsed]);
    setPaste(null);
    toast.success(`${parsed.length} fila(s) agregadas`);
  }

  const update = (key: number, patch: Partial<Row>) => {
    const next = rows.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r));
    // si cambia el peso de una fila automática, se vuelve a repartir (un pallet pesado puede necesitar otra posición)
    setRows("peso" in patch || "manual" in patch ? allocate(next) : next);
  };
  const remove = (key: number) => setAndAllocate(rows.filter((r) => r.key !== key));
  const duplicate = (r: Row) => { const i = rows.indexOf(r); const copy = newRow({ ...r, key: seq++, posicao: "", manual: false, done: undefined, error: undefined }); setAndAllocate([...rows.slice(0, i + 1), copy, ...rows.slice(i + 1)]); };
  const applyBaseToAll = () => setAndAllocate(rows.map((r) => (r.done ? r : { ...r, ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== "")) })));

  // Validación de cada fila
  const posById = useMemo(() => new Map(currentPositions.map((p) => [p.id, p])), [currentPositions]);
  const rowIssue = (r: Row): string | null => {
    if (r.done) return null;
    const peso = num(r.peso);
    if (peso <= 0) return "Peso";
    if (!r.posicao) return "Sin posición libre";
    const p = posById.get(r.posicao);
    if (!p) return "Posición inexistente";
    if (p.status !== "free") return "Posición ocupada";
    if (peso > (p.capacidadeKg || 0)) return `Máx. ${formatNumber(p.capacidadeKg)} kg`;
    if (rows.some((o) => o.key !== r.key && !o.done && o.posicao === r.posicao)) return "Posición repetida";
    return null;
  };
  const pending = rows.filter((r) => !r.done);
  const issues = pending.map(rowIssue).filter(Boolean).length;
  const heavyHigh = pending.filter((r) => num(r.peso) > HEAVY && r.posicao && !isGroundPosition(r.posicao)).length;
  const totalPeso = pending.reduce((s, r) => s + num(r.peso), 0);
  const contract = contracts.find((c) => c.id === contratoId);
  const over = contract ? contract.posicoesOcupadas + pending.length - contract.posicoesContratadas : 0;
  const canSave = !!clienteId && !!contratoId && pending.length > 0 && issues === 0 && (heavyHigh === 0 || heavyOk) && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true); setProgress(0);
    const ok: { key: number; sku: string; movementId: string }[] = [];
    let failed = false;
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      try {
        const res = await rpcRegisterPalletEntry({
          clienteId, contratoId, sku: "",
          descricao: r.descricao.trim(), lote: r.lote.trim() || undefined,
          quantidade: r.quantidade ? parseInt(r.quantidade, 10) : undefined,
          peso: num(r.peso), valorDeclarado: num(r.valor), seguro, palletDuplo: false,
          positionId: r.posicao, operador: user?.nome || "Operador", operadorId: user?.id,
        });
        ok.push({ key: r.key, sku: res.sku, movementId: res.movement_id });
      } catch (e) {
        setRows((all) => all.map((x) => (x.key === r.key ? { ...x, error: parseDbError(e) } : x)));
        failed = true;
        break; // se detiene en la primera fila con problema; las anteriores ya quedaron registradas
      }
      setProgress(Math.round(((i + 1) / pending.length) * 100));
    }
    setRows((all) => all.map((x) => { const d = ok.find((o) => o.key === x.key); return d ? { ...x, done: { sku: d.sku, movementId: d.movementId } } : x; }));
    await refresh();
    setSaving(false);

    if (ok.length) {
      toast.success(`${ok.length} pallet(s) ingresados`, { description: failed ? "Se detuvo en una fila con error: corríjala y vuelva a registrar las restantes." : undefined });
      if (printReceipt || printLabels) await doPrint(ok.map((o) => o.movementId));
    }
  }

  async function doPrint(ids: string[], what: { receipt?: boolean; labels?: boolean } = { receipt: printReceipt, labels: printLabels }) {
    try {
      if (what.receipt) await printMovements(ids, { clients, contracts, authorizedContacts }, { labels: !!what.labels });
      else if (what.labels) await printMovements(ids, { clients, contracts, authorizedContacts }, { labels: true, receipt: false });
    } catch (e) { toast.error("No se pudo imprimir", { description: parseDbError(e) }); }
  }

  const doneIds = rows.filter((r) => r.done).map((r) => r.done!.movementId);
  const allDone = rows.length > 0 && pending.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-6xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-primary" />Ingreso de pallets en lote</DialogTitle>
          <DialogDescription>
            Una fila por pallet. Las posiciones se sugieren solas (puede escribir otra). Al registrar se imprime un comprobante único y todas las etiquetas.
            {multiWarehouse && currentWarehouse ? ` Depósito: ${currentWarehouse.name}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Cliente *</Label>
            <Select value={clienteId} onValueChange={(v) => { setClienteId(v); setRows((r) => r.map((x) => (x.done ? x : { ...x, manual: false }))); }} disabled={doneIds.length > 0}>
              <SelectTrigger><SelectValue placeholder="Seleccione el cliente" /></SelectTrigger>
              <SelectContent>{clientList.map((c) => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Contrato *</Label>
            <Select value={contratoId} onValueChange={setContratoId} disabled={!clienteId || doneIds.length > 0}>
              <SelectTrigger><SelectValue placeholder={clienteId && !activeContracts.length ? "Sin contrato activo" : "Contrato"} /></SelectTrigger>
              <SelectContent>{activeContracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero} · {c.posicoesOcupadas}/{c.posicoesContratadas} pos.</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Valores comunes: llenan las filas nuevas */}
        <div className="rounded-lg border p-3 grid gap-3">
          <div className="text-sm font-semibold">Datos comunes <span className="font-normal text-muted-foreground">(se copian a cada fila nueva; después puede cambiar fila por fila)</span></div>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div className="grid gap-1 col-span-2 md:col-span-1"><Label className="text-xs">Descripción</Label><Input value={base.descricao} onChange={(e) => setBase({ ...base, descricao: e.target.value })} placeholder="Ej.: Motores eléctricos" /></div>
            <div className="grid gap-1"><Label className="text-xs">Lote</Label><Input value={base.lote} onChange={(e) => setBase({ ...base, lote: e.target.value })} /></div>
            <div className="grid gap-1"><Label className="text-xs">Cantidad</Label><Input inputMode="numeric" value={base.quantidade} onChange={(e) => setBase({ ...base, quantidade: e.target.value.replace(/\D/g, "") })} /></div>
            <div className="grid gap-1"><Label className="text-xs">Peso (kg)</Label><Input inputMode="decimal" value={base.peso} onChange={(e) => setBase({ ...base, peso: e.target.value })} /></div>
            <div className="grid gap-1"><Label className="text-xs">Valor decl. (US$)</Label><Input inputMode="decimal" value={base.valor} onChange={(e) => setBase({ ...base, valor: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-20" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} aria-label="Cantidad de filas" />
            <Button variant="outline" onClick={addRows} disabled={!clienteId}><Plus className="h-4 w-4 mr-1" />Agregar filas</Button>
            <Button variant="outline" onClick={() => setPaste("")} disabled={!clienteId}><ClipboardPaste className="h-4 w-4 mr-1" />Pegar desde Excel</Button>
            {rows.length > 0 && <Button variant="ghost" onClick={applyBaseToAll}>Aplicar datos comunes a todas</Button>}
            <label className="ml-auto flex items-center gap-2 text-sm"><Switch checked={seguro} onCheckedChange={setSeguro} /> Con seguro</label>
          </div>
          {paste !== null && (
            <div className="grid gap-2">
              <Textarea rows={5} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Copie de Excel y pegue aquí. Columnas en este orden:\nDescripción	Lote	Cantidad	Peso	Valor"} className="font-mono text-xs" />
              <div className="flex gap-2"><Button size="sm" onClick={applyPaste}>Agregar filas pegadas</Button><Button size="sm" variant="ghost" onClick={() => setPaste(null)}>Cancelar</Button></div>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <th className="p-2 text-left w-8">#</th><th className="p-2 text-left min-w-[180px]">Descripción</th><th className="p-2 text-left w-24">Lote</th>
                  <th className="p-2 text-left w-20">Cant.</th><th className="p-2 text-left w-24">Peso kg *</th><th className="p-2 text-left w-24">Valor US$</th>
                  <th className="p-2 text-left w-32">Posición</th><th className="p-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const issue = rowIssue(r);
                  const heavy = num(r.peso) > HEAVY && r.posicao && !isGroundPosition(r.posicao);
                  if (r.done) return (
                    <tr key={r.key} className="border-t bg-success/5">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2" colSpan={5}><span className="font-mono font-semibold">{r.done.sku}</span> · {r.descricao || "—"} · {formatNumber(num(r.peso))} kg</td>
                      <td className="p-2 font-mono">{positionLabel(r.posicao, multiWarehouse)}</td>
                      <td className="p-2 text-xs text-success font-medium">Registrado</td>
                    </tr>
                  );
                  return (
                    <tr key={r.key} className={cn("border-t align-top", (issue || r.error) && "bg-destructive/5")}>
                      <td className="p-1.5 pt-3 text-muted-foreground">{i + 1}</td>
                      <td className="p-1.5"><Input className="h-8" value={r.descricao} onChange={(e) => update(r.key, { descricao: e.target.value })} /></td>
                      <td className="p-1.5"><Input className="h-8" value={r.lote} onChange={(e) => update(r.key, { lote: e.target.value })} /></td>
                      <td className="p-1.5"><Input className="h-8" inputMode="numeric" value={r.quantidade} onChange={(e) => update(r.key, { quantidade: e.target.value.replace(/\D/g, "") })} /></td>
                      <td className="p-1.5"><Input className={cn("h-8", issue === "Peso" && "border-destructive")} inputMode="decimal" value={r.peso} onChange={(e) => update(r.key, { peso: e.target.value })} /></td>
                      <td className="p-1.5"><Input className="h-8" inputMode="decimal" value={r.valor} onChange={(e) => update(r.key, { valor: e.target.value })} /></td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          <Input
                            className={cn("h-8 font-mono uppercase", issue && issue !== "Peso" && "border-destructive")}
                            value={r.posicao.startsWith(`${currentWarehouse?.code}:`) ? positionCode(r.posicao) : r.posicao}
                            onChange={(e) => update(r.key, { posicao: e.target.value ? resolvePositionId(e.target.value, currentWarehouse?.code) : "", manual: true })}
                          />
                          {r.manual && <button type="button" title="Volver a la sugerida" onClick={() => update(r.key, { manual: false })}><RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /></button>}
                        </div>
                        {(issue && issue !== "Peso") && <div className="text-[11px] text-destructive mt-0.5">{issue}</div>}
                        {heavy && <div className="text-[11px] text-amber-700 mt-0.5">Pesado en nivel alto</div>}
                        {r.error && <div className="text-[11px] text-destructive mt-0.5">{r.error}</div>}
                      </td>
                      <td className="p-1.5 whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplicar fila" onClick={() => duplicate(r)}><Copy className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Quitar fila" onClick={() => remove(r.key)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="grid gap-2 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span><strong>{pending.length}</strong> pallet(s) por registrar · {formatNumber(totalPeso)} kg</span>
              {doneIds.length > 0 && <span className="text-success">{doneIds.length} ya registrados</span>}
              {issues > 0 && <span className="text-destructive">{issues} fila(s) con problemas</span>}
            </div>
            {over > 0 && <p className="text-amber-700"><AlertTriangle className="inline h-4 w-4 mr-1" />Con este ingreso el cliente supera en {over} las posiciones contratadas ({contract?.posicoesContratadas}). Se cobrará como excedente.</p>}
            {heavyHigh > 0 && (
              <label className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                <input type="checkbox" className="mt-0.5" checked={heavyOk} onChange={(e) => setHeavyOk(e.target.checked)} />
                <span>{heavyHigh} pallet(s) de más de {formatNumber(HEAVY)} kg quedarían en nivel elevado. Confirmo las ubicaciones.</span>
              </label>
            )}
            {saving && <Progress value={progress} className="h-2" />}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-4 text-sm items-center">
            <label className="flex items-center gap-2"><Switch checked={printReceipt} onCheckedChange={setPrintReceipt} /> Comprobante</label>
            <label className="flex items-center gap-2"><Switch checked={printLabels} onCheckedChange={setPrintLabels} /> Etiquetas</label>
            {doneIds.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => doPrint(doneIds, { receipt: true })}><Printer className="h-4 w-4 mr-1" />Reimprimir comprobante</Button>
                <Button variant="outline" size="sm" onClick={() => doPrint(doneIds, { labels: true })}><Printer className="h-4 w-4 mr-1" />Reimprimir etiquetas</Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{allDone ? "Cerrar" : "Cancelar"}</Button>
            {!allDone && (
              <Button onClick={save} disabled={!canSave}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-1" />}
                Registrar {pending.length || ""} pallet(s)
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
