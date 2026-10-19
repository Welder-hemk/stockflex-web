// Ingreso de varios pallets de una vez. Planilla: cada fila es un pallet; la fila de abajo ya viene
// precargada con los datos de la anterior y se confirma con Enter. Pallet doble y seguro se marcan por fila.
// Al registrar: comprobante único + todas las etiquetas.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ClipboardPaste, CornerDownLeft, Loader2, PackagePlus, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
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
import { printMovements } from "@/data/operations";
import PositionPicker from "./PositionPicker";
import { contractTotalPositions, isGroundPosition, positionCode, positionLabel, type WarehousePosition } from "@/data/types";
import { parseDbError } from "@/lib/errorMessages";
import { formatNumber, parseDecimal } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Fields {
  descricao: string;
  lote: string;
  quantidade: string;
  peso: string;
  valor: string;
  duplo: boolean;
  seguro: boolean;
}
interface Row extends Fields {
  key: number;
  posicao: string; // id completo (CDE1:A-01-1-1)
  posicao2: string; // vecina, cuando es pallet doble
  manual: boolean; // la posición fue escrita a mano
  done?: { sku: string; movementId: string };
  error?: string;
}

const HEAVY = 1200;
const EMPTY: Fields = { descricao: "", lote: "", quantidade: "", peso: "", valor: "", duplo: false, seguro: false };
const COLS: (keyof Fields)[] = ["descricao", "lote", "quantidade", "peso", "valor"];
let seq = 1;
const num = (v: string) => { const n = parseDecimal(v); return isNaN(n) ? 0 : n; };
const yes = (v?: string) => /^(s|si|sí|x|1|true|y|yes)$/i.test((v || "").trim());
const sortPos = (a: WarehousePosition, b: WarehousePosition) =>
  a.rua.localeCompare(b.rua, "es", { numeric: true }) || a.bloco - b.bloco || a.nivel - b.nivel || a.posicao - b.posicao;
const pickFields = (r: Fields): Fields => ({ descricao: r.descricao, lote: r.lote, quantidade: r.quantidade, peso: r.peso, valor: r.valor, duplo: r.duplo, seguro: r.seguro });

export default function BatchEntryDialog({ open, onOpenChange, initialClienteId }: { open: boolean; onOpenChange: (o: boolean) => void; initialClienteId?: string }) {
  const { user } = useAuth();
  const { clients, contracts, authorizedContacts, currentPositions, currentWarehouse, multiWarehouse, refresh } = useStockData();

  const [clienteId, setClienteId] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Fields>(EMPTY);
  const [count, setCount] = useState("10");
  const [paste, setPaste] = useState<string | null>(null);
  const [heavyOk, setHeavyOk] = useState(false);
  const [printLabels, setPrintLabels] = useState(true);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    if (!open) return;
    setClienteId(initialClienteId || ""); setContratoId(""); setRows([]); setDraft(EMPTY);
    setHeavyOk(false); setProgress(0); setPaste(null);
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

  const posById = useMemo(() => new Map(currentPositions.map((p) => [p.id, p])), [currentPositions]);
  const neighborOf = (p: WarehousePosition) =>
    currentPositions.find((o) => o.rua === p.rua && o.bloco === p.bloco && o.nivel === p.nivel && o.posicao === (p.posicao === 1 ? 2 : 1));

  // Reparte posiciones libres sin repetir: calles del cliente primero, pesados al nivel del suelo,
  // y para pallet doble, dos posiciones vecinas libres en el mismo nivel.
  const allocate = (list: Row[]): Row[] => {
    const taken = new Set<string>();
    for (const r of list) if (r.manual || r.done) { if (r.posicao) taken.add(r.posicao); if (r.posicao2) taken.add(r.posicao2); }
    const clientRuas = new Set(currentPositions.filter((p) => p.clienteId === clienteId).map((p) => p.rua));
    const free = currentPositions.filter((p) => p.status === "free").sort((a, b) => (clientRuas.has(a.rua) ? 0 : 1) - (clientRuas.has(b.rua) ? 0 : 1) || sortPos(a, b));
    return list.map((r) => {
      if (r.done) return r;
      const peso = num(r.peso);
      if (r.manual) {
        const p = posById.get(r.posicao);
        const n = r.duplo && p ? neighborOf(p) : undefined;
        if (n) taken.add(n.id);
        return { ...r, posicao2: n && n.status === "free" ? n.id : "" };
      }
      const ok = (p?: WarehousePosition) => !!p && p.status === "free" && !taken.has(p.id) && (p.capacidadeKg || 0) >= peso;
      const fits = (p: WarehousePosition) => ok(p) && (!r.duplo || ok(neighborOf(p)));
      const pick = (peso > 1000 ? free.find((p) => p.nivel === 1 && fits(p)) : undefined) || free.find(fits);
      const pair = pick && r.duplo ? neighborOf(pick) : undefined;
      if (pick) taken.add(pick.id);
      if (pair) taken.add(pair.id);
      return { ...r, posicao: pick?.id || "", posicao2: pair?.id || "" };
    });
  };

  // al cambiar de cliente (o de ocupación) se vuelven a sugerir posiciones
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRows((r) => allocate(r)); }, [clienteId, currentPositions]);

  const commit = (next: Row[]) => setRows(allocate(next));
  const make = (f: Fields): Row => ({ key: seq++, ...f, posicao: "", posicao2: "", manual: false });

  const focusDesc = (index: number) =>
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${index}"][data-col="descricao"]`)?.select());

  // Enter en la fila precargada la agrega y prepara la siguiente con los mismos datos
  function confirmDraft() {
    if (num(draft.peso) <= 0) { toast.error("Indique el peso del pallet"); return; }
    commit([...rows, make(draft)]);
    focusDesc(rows.length + 1);
  }

  function addCopies() {
    const n = Math.min(Math.max(parseInt(count, 10) || 0, 1), 200);
    const base = rows.filter((r) => !r.done).at(-1) || (num(draft.peso) > 0 ? draft : null);
    if (!base) { toast.error("Complete la primera fila (al menos el peso) para copiarla"); return; }
    commit([...rows, ...Array.from({ length: n }, () => make(pickFields(base)))]);
  }

  // Pegar desde Excel: Descripción, Lote, Cantidad, Peso, Valor, Doble (sí/no), Seguro (sí/no)
  function applyPaste() {
    const parsed = (paste || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .map((l) => l.split("\t").map((x) => x.trim()))
      .filter((c) => !/peso|descrip/i.test(c.join(" ")))
      .map(([descricao = "", lote = "", quantidade = "", peso = "", valor = "", duplo, seguro]) =>
        make({ descricao, lote, quantidade: quantidade.replace(/\D/g, ""), peso, valor, duplo: yes(duplo), seguro: yes(seguro) }));
    if (!parsed.length) { toast.error("No se encontraron filas para pegar"); return; }
    commit([...rows, ...parsed]);
    setDraft(pickFields(parsed[parsed.length - 1]));
    setPaste(null);
    toast.success(`${parsed.length} fila(s) agregadas`);
  }

  const update = (key: number, patch: Partial<Row>) => {
    const next = rows.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r));
    // peso, doble o posición cambian el reparto
    setRows("peso" in patch || "duplo" in patch || "manual" in patch || "posicao" in patch ? allocate(next) : next);
  };
  const remove = (key: number) => commit(rows.filter((r) => r.key !== key));

  // el último confirmado alimenta la fila precargada
  const lastKey = rows.filter((r) => !r.done).at(-1)?.key;
  useEffect(() => {
    const last = rows.find((r) => r.key === lastKey);
    if (last) setDraft(pickFields(last));
    // solo cuando cambia la última fila confirmada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey]);

  const rowIssue = (r: Row): string | null => {
    if (r.done) return null;
    const peso = num(r.peso);
    if (peso <= 0) return "Peso";
    if (!r.posicao) return r.duplo ? "Sin dos posiciones vecinas libres" : "Sin posición libre";
    const p = posById.get(r.posicao);
    if (!p) return "Posición inexistente";
    if (p.status !== "free") return "Posición ocupada";
    if (peso > (p.capacidadeKg || 0)) return `Máx. ${formatNumber(p.capacidadeKg)} kg`;
    if (r.duplo && !r.posicao2) return "La vecina no está libre";
    const others = rows.filter((o) => o.key !== r.key && !o.done).flatMap((o) => [o.posicao, o.posicao2]);
    if (others.includes(r.posicao) || (r.posicao2 && others.includes(r.posicao2))) return "Posición repetida";
    return null;
  };

  const pending = rows.filter((r) => !r.done);
  const issues = pending.map(rowIssue).filter(Boolean).length;
  const heavyHigh = pending.filter((r) => num(r.peso) > HEAVY && r.posicao && !isGroundPosition(r.posicao)).length;
  const totalPeso = pending.reduce((s, r) => s + num(r.peso), 0);
  const totalPos = pending.reduce((s, r) => s + (r.duplo ? 2 : 1), 0);
  const contract = contracts.find((c) => c.id === contratoId);
  const over = contract ? contract.posicoesOcupadas + totalPos - contractTotalPositions(contract) : 0;
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
          peso: num(r.peso), valorDeclarado: num(r.valor), seguro: r.seguro, palletDuplo: r.duplo,
          positionId: r.posicao, position2Id: r.duplo ? r.posicao2 : undefined,
          operador: user?.nome || "Operador", operadorId: user?.id,
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
      await printMovements(ids, { clients, contracts, authorizedContacts }, { labels: !!what.labels, receipt: !!what.receipt });
    } catch (e) { toast.error("No se pudo imprimir", { description: parseDbError(e) }); }
  }

  const doneIds = rows.filter((r) => r.done).map((r) => r.done!.movementId);
  const allDone = rows.length > 0 && pending.length === 0;
  const posText = (id: string) => (id.startsWith(`${currentWarehouse?.code}:`) ? positionCode(id) : id);

  // Enter: en una fila confirmada pasa a la siguiente; en la precargada la agrega
  const onKey = (index: number, isDraft: boolean) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isDraft) confirmDraft();
    else focusDesc(index + 1);
  };

  const cellInput = (index: number, col: keyof Fields, value: string, onChange: (v: string) => void, opts: { isDraft?: boolean; numeric?: boolean; invalid?: boolean; placeholder?: string } = {}) => (
    <Input
      data-row={index}
      data-col={col}
      className={cn("h-9", opts.isDraft && "bg-muted/40 text-muted-foreground focus:text-foreground", opts.invalid && "border-destructive")}
      inputMode={opts.numeric ? "decimal" : undefined}
      value={value}
      placeholder={opts.placeholder}
      onChange={(e) => onChange(col === "quantidade" ? e.target.value.replace(/\D/g, "") : e.target.value)}
      onKeyDown={onKey(index, !!opts.isDraft)}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-6xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-primary" />Ingreso de pallets en lote</DialogTitle>
          <DialogDescription>
            Complete la primera fila y presione <strong>Enter</strong>: la fila de abajo ya viene con los mismos datos, ajuste lo que cambie y Enter otra vez.
            Las posiciones se sugieren solas.{multiWarehouse && currentWarehouse ? ` Depósito: ${currentWarehouse.name}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Cliente *</Label>
            <Select value={clienteId} onValueChange={(v) => { setClienteId(v); setRows((r) => r.map((x) => (x.done ? x : { ...x, manual: false }))); focusDesc(0); }} disabled={doneIds.length > 0}>
              <SelectTrigger><SelectValue placeholder="Seleccione el cliente" /></SelectTrigger>
              <SelectContent>{clientList.map((c) => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Contrato *</Label>
            <Select value={contratoId} onValueChange={setContratoId} disabled={!clienteId || doneIds.length > 0}>
              <SelectTrigger><SelectValue placeholder={clienteId && !activeContracts.length ? "Sin contrato activo" : "Contrato"} /></SelectTrigger>
              <SelectContent>{activeContracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero} · {c.posicoesOcupadas}/{contractTotalPositions(c)} pos.</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table ref={tableRef} className="w-full text-sm">
            <thead className="bg-muted/60 text-xs">
              <tr>
                <th className="p-2 text-left w-8">#</th>
                <th className="p-2 text-left min-w-[200px]">Descripción</th>
                <th className="p-2 text-left w-28">Lote</th>
                <th className="p-2 text-left w-20">Cantidad</th>
                <th className="p-2 text-left w-24">Peso (kg) *</th>
                <th className="p-2 text-left w-28">Valor decl. (US$)</th>
                <th className="p-2 text-center w-20">Pallet doble</th>
                <th className="p-2 text-center w-20">Con seguro</th>
                <th className="p-2 text-left w-44">Posición</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const issue = rowIssue(r);
                const heavy = num(r.peso) > HEAVY && r.posicao && !isGroundPosition(r.posicao);
                if (r.done) return (
                  <tr key={r.key} className="border-t bg-success/5">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2" colSpan={7}><span className="font-mono font-semibold">{r.done.sku}</span> · {r.descricao || "—"} · {formatNumber(num(r.peso))} kg{r.duplo ? " · doble" : ""}{r.seguro ? " · con seguro" : ""}</td>
                    <td className="p-2 font-mono">{[r.posicao, r.posicao2].filter(Boolean).map((x) => positionLabel(x, multiWarehouse)).join(" + ")}</td>
                    <td className="p-2 text-xs text-success font-medium">OK</td>
                  </tr>
                );
                return (
                  <tr key={r.key} className={cn("border-t align-top", (issue || r.error) && "bg-destructive/5")}>
                    <td className="p-1.5 pt-3.5 text-muted-foreground">{i + 1}</td>
                    {COLS.map((c) => (
                      <td key={c} className="p-1.5">
                        {cellInput(i, c, r[c] as string, (v) => update(r.key, { [c]: v } as Partial<Row>), { numeric: c === "peso" || c === "valor" || c === "quantidade", invalid: c === "peso" && issue === "Peso" })}
                      </td>
                    ))}
                    <td className="p-1.5 pt-3 text-center"><Switch checked={r.duplo} onCheckedChange={(v) => update(r.key, { duplo: v })} aria-label="Pallet doble" /></td>
                    <td className="p-1.5 pt-3 text-center"><Switch checked={r.seguro} onCheckedChange={(v) => update(r.key, { seguro: v })} aria-label="Con seguro" /></td>
                    <td className="p-1.5">
                      <div className="flex items-center gap-1">
                        <PositionPicker
                          compact
                          value={r.posicao}
                          peso={num(r.peso)}
                          needPair={r.duplo}
                          exclude={new Set(rows.filter((o) => o.key !== r.key && !o.done).flatMap((o) => [o.posicao, o.posicao2]).filter(Boolean))}
                          inputClassName={cn(issue && issue !== "Peso" && "border-destructive")}
                          onChange={(v) => update(r.key, { posicao: v, manual: true })}
                          onKeyDown={onKey(i, false)}
                        />
                        {r.manual && <button type="button" title="Volver a la sugerida" onClick={() => update(r.key, { manual: false })}><RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /></button>}
                      </div>
                      {r.duplo && r.posicao2 && <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">+ {posText(r.posicao2)}</div>}
                      {issue && issue !== "Peso" && <div className="text-[11px] text-destructive mt-0.5">{issue}</div>}
                      {heavy && <div className="text-[11px] text-amber-700 mt-0.5">Pesado en nivel alto</div>}
                      {r.error && <div className="text-[11px] text-destructive mt-0.5">{r.error}</div>}
                    </td>
                    <td className="p-1.5"><Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" title="Quitar fila" onClick={() => remove(r.key)}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                );
              })}

              {/* Fila precargada: espera Enter */}
              {!allDone && (
                <tr className="border-t border-dashed align-top">
                  <td className="p-1.5 pt-3.5 text-muted-foreground">{rows.length + 1}</td>
                  {COLS.map((c) => (
                    <td key={c} className="p-1.5">
                      {cellInput(rows.length, c, draft[c] as string, (v) => setDraft({ ...draft, [c]: v }), { isDraft: true, numeric: c === "peso" || c === "valor" || c === "quantidade", placeholder: c === "descricao" ? "Ej.: Motores eléctricos" : undefined })}
                    </td>
                  ))}
                  <td className="p-1.5 pt-3 text-center"><Switch checked={draft.duplo} onCheckedChange={(v) => setDraft({ ...draft, duplo: v })} aria-label="Pallet doble (nueva fila)" /></td>
                  <td className="p-1.5 pt-3 text-center"><Switch checked={draft.seguro} onCheckedChange={(v) => setDraft({ ...draft, seguro: v })} aria-label="Con seguro (nueva fila)" /></td>
                  <td className="p-1.5" colSpan={2}>
                    <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={confirmDraft} disabled={!clienteId}>
                      <CornerDownLeft className="h-4 w-4 mr-1" />Enter para agregar
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-20" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} aria-label="Cantidad de filas" />
          <Button variant="outline" onClick={addCopies} disabled={!clienteId || allDone}><Plus className="h-4 w-4 mr-1" />Agregar filas iguales a la última</Button>
          <Button variant="outline" onClick={() => setPaste("")} disabled={!clienteId || allDone}><ClipboardPaste className="h-4 w-4 mr-1" />Pegar desde Excel</Button>
        </div>
        {paste !== null && (
          <div className="grid gap-2">
            <Textarea rows={5} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Copie de Excel y pegue aquí. Columnas en este orden:\nDescripción	Lote	Cantidad	Peso	Valor	Doble (sí/no)	Seguro (sí/no)"} className="font-mono text-xs" />
            <div className="flex gap-2"><Button size="sm" onClick={applyPaste}>Agregar filas pegadas</Button><Button size="sm" variant="ghost" onClick={() => setPaste(null)}>Cancelar</Button></div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="grid gap-2 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span><strong>{pending.length}</strong> pallet(s) por registrar · {totalPos} posiciones · {formatNumber(totalPeso)} kg</span>
              {doneIds.length > 0 && <span className="text-success">{doneIds.length} ya registrados</span>}
              {issues > 0 && <span className="text-destructive">{issues} fila(s) con problemas</span>}
            </div>
            {over > 0 && <p className="text-amber-700"><AlertTriangle className="inline h-4 w-4 mr-1" />Con este ingreso el cliente supera en {over} las posiciones contratadas ({contract ? contractTotalPositions(contract) : 0}). Se cobrará como excedente.</p>}
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
