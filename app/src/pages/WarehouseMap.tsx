// Mapa do depósito: PLANTA (vista de cima, todas as calles) + FRENTE da calle escolhida (rack técnico claro),
// com "Modo TV" (frente realista em tela cheia, fundo escuro). A planta sai das posições cadastradas.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronLeft, ChevronRight, Lightbulb, Lock, Monitor, Printer, Settings, Tag, Unlock,
  Warehouse as WarehouseIcon, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStockData } from "@/contexts/StockDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { mapMovement } from "@/data/supabaseData";
import { rpcSetPositionsBlocked } from "@/data/dbMutations";
import { positionLabel, type Movement, type Pallet, type WarehousePosition } from "@/data/types";
import { printMovements } from "@/data/operations";
import { printPositionLabels } from "@/lib/print/positionLabels";
import { printPages, escapeHtml as e } from "@/lib/print/printer";
import { formatNumber } from "@/lib/formatters";
import { formatDate, todayLocal } from "@/lib/dates";
import { parseDbError } from "@/lib/errorMessages";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdjustDialog from "@/components/map/AdjustDialog";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = { free: "Libre", occupied: "Ocupada", blocked: "Bloqueada", reserved: "Reservada" };
const TIPO_LABEL: Record<string, string> = { selectivo: "Selectivo", "drive-in": "Drive-in", piso: "Piso" };
// Cores dos clientes: tons distintos também em luminosidade (não só matiz)
const PALETTE = ["#5B9BD5", "#3FA372", "#9B72E0", "#0E9AA7", "#C2185B", "#7C8B2A", "#6D4C41", "#2B4C7E"];
const tint = (hex: string, k = 0.72) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};
const BAYS_PER_PAGE = 8;

type State = "free" | "occ" | "res" | "inb" | "blk";
interface SlotView { pos: WarehousePosition; state: State; pallet?: Pallet; wide: boolean; skip: boolean }

export default function WarehouseMap() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const {
    clients, contracts, pallets, warehouses, currentWarehouse, currentWarehouseId, setCurrentWarehouseId, currentPositions, multiWarehouse,
    authorizedContacts, suggestPosition, refresh,
  } = useStockData();

  const { data: pending = [] } = useQuery({
    queryKey: ["movements", "pending-for-map"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("movements" as never) as any).select("*").eq("status", "solicitada");
      if (error) throw new Error(error.message);
      return (data || []).map(mapMovement) as Movement[];
    },
  });

  const positions = currentPositions;
  const palletById = useMemo(() => new Map(pallets.map((p) => [p.id, p])), [pallets]);
  const ruas = useMemo(() => [...new Set(positions.map((p) => p.rua))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })), [positions]);
  const outIds = useMemo(() => new Set(pending.filter((m) => m.tipo === "saida" && m.origemLocal).map((m) => m.origemLocal)), [pending]);
  const inIds = useMemo(() => new Set(pending.filter((m) => (m.tipo === "entrada" || m.tipo === "transferencia") && m.destinoLocal).map((m) => m.destinoLocal)), [pending]);

  const clientColor = useMemo(() => {
    const m = new Map<string, string>();
    const ids = [...new Set(positions.filter((p) => p.clienteId).map((p) => p.clienteId!))].sort();
    ids.forEach((id, i) => m.set(id, PALETTE[i % PALETTE.length]));
    return m;
  }, [positions]);

  const stateOf = (p: WarehousePosition): State => {
    if (p.status === "blocked") return "blk";
    if (p.status === "occupied") return outIds.has(p.id) ? "res" : "occ";
    if (inIds.has(p.id) || p.status === "reserved") return "inb";
    return "free";
  };

  const [calle, setCalle] = useState<string>("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCliente, setFilterCliente] = useState("all");
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dlg, setDlg] = useState<"ajuste" | "avaria" | null>(null);
  const [tv, setTv] = useState(false);

  useEffect(() => { if (!ruas.includes(calle)) { setCalle(ruas[0] || ""); setPage(0); } }, [ruas, calle]);

  // ---- planta
  // Pasillos: los configurados en Configuraciones › Depósitos; si no hay, uno entre cada calle
  const pasillos = useMemo(() => {
    const cfg = (currentWarehouse?.pasillos || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
    return new Set(cfg.length ? cfg : ruas.slice(0, -1));
  }, [currentWarehouse, ruas]);
  const aisleNo = useMemo(() => { const m = new Map<string, number>(); let n = 0; for (const r of ruas) if (pasillos.has(r)) m.set(r, ++n); return m; }, [ruas, pasillos]);
  const plan = useMemo(() => ruas.map((rua) => {
    const rp = positions.filter((p) => p.rua === rua);
    const blocos = [...new Set(rp.map((p) => p.bloco))].sort((a, b) => a - b);
    const nv = [...new Set(rp.map((p) => p.nivel))].sort((a, b) => b - a);
    const slots = [...new Set(rp.map((p) => p.posicao))].sort((a, b) => a - b);
    const bays = blocos.map((b) => ({
      b,
      cells: nv.flatMap((n) => slots.map((s) => rp.find((x) => x.bloco === b && x.nivel === n && x.posicao === s))),
    }));
    const occ = rp.filter((p) => p.status === "occupied").length;
    return { rua, bays, cols: slots.length, rows: nv.length, occ, total: rp.length, allBlocked: rp.length > 0 && rp.every((p) => p.status === "blocked") };
  }), [ruas, positions]);
  const maxBays = Math.max(1, ...plan.map((r) => r.bays.length));

  const cellStyle = (p?: WarehousePosition): React.CSSProperties => {
    if (!p) return { background: "transparent" };
    const st = stateOf(p);
    const dim = filterCliente !== "all" && st !== "free" && st !== "blk" && p.clienteId !== filterCliente;
    if (st === "blk") return { background: "repeating-linear-gradient(45deg,#D64550 0 2px,#F4C5CB 2px 4px)" };
    if (st === "free") return { background: "#E3E9F0" };
    if (st === "inb") return { background: "#fff", boxShadow: "inset 0 0 0 1.5px #FC8711" };
    if (st === "res") return { background: "#FC8711", opacity: dim ? 0.25 : 1 };
    return { background: clientColor.get(p.clienteId || "") || "#5B9BD5", opacity: dim ? 0.25 : 1 };
  };

  // ---- frente da calle
  const front = useMemo(() => {
    const rp = positions.filter((p) => p.rua === calle);
    const blocos = [...new Set(rp.map((p) => p.bloco))].sort((a, b) => a - b);
    const nv = [...new Set(rp.map((p) => p.nivel))].sort((a, b) => b - a);
    const slots = [...new Set(rp.map((p) => p.posicao))].sort((a, b) => a - b);
    return { rp, blocos, nv, slots };
  }, [positions, calle]);
  const pages = Math.max(1, Math.ceil(front.blocos.length / BAYS_PER_PAGE));
  const visibleBays = front.blocos.slice(page * BAYS_PER_PAGE, page * BAYS_PER_PAGE + BAYS_PER_PAGE);

  const levelSlots = (bloco: number, nivel: number): SlotView[] => {
    const list = front.slots.map((s) => front.rp.find((x) => x.bloco === bloco && x.nivel === nivel && x.posicao === s)).filter(Boolean) as WarehousePosition[];
    return list.map((pos, i) => {
      const pallet = pos.palletId ? palletById.get(pos.palletId) : undefined;
      const prev = i > 0 ? list[i - 1] : undefined;
      const next = list[i + 1];
      // pallet duplo: a primeira posição ocupa as duas, a segunda some
      const skip = !!(pallet?.palletDuplo && prev?.palletId && prev.palletId === pos.palletId);
      const wide = !!(pallet?.palletDuplo && next?.palletId === pos.palletId);
      return { pos, pallet, state: stateOf(pos), wide, skip };
    });
  };

  const selected = selectedId ? positions.find((p) => p.id === selectedId) || null : null;
  const selPallet = selected?.palletId ? palletById.get(selected.palletId) : undefined;
  const selClient = selPallet ? clients.find((c) => c.id === selPallet.clienteId) : undefined;

  function selectBay(rua: string, bloco: number) {
    setCalle(rua);
    const blocos = [...new Set(positions.filter((p) => p.rua === rua).map((p) => p.bloco))].sort((a, b) => a - b);
    setPage(Math.max(0, Math.floor(blocos.indexOf(bloco) / BAYS_PER_PAGE)));
    const first = positions.filter((p) => p.rua === rua && p.bloco === bloco).sort((a, b) => a.nivel - b.nivel || a.posicao - b.posicao);
    const pick = first.find((p) => p.status === "occupied") || first[0];
    if (pick) setSelectedId(pick.id);
  }

  function clickSlot(v: SlotView) {
    if (multi) {
      if (v.pos.status !== "free" && v.pos.status !== "blocked") return;
      setPicked((cur) => { const n = new Set(cur); if (n.has(v.pos.id)) n.delete(v.pos.id); else n.add(v.pos.id); return n; });
      return;
    }
    setSelectedId(v.pos.id);
  }

  async function setBlocked(ids: string[], blocked: boolean) {
    try {
      const r = await rpcSetPositionsBlocked(ids, blocked);
      toast.success(`${r.changed} posiciones ${blocked ? "bloqueadas" : "desbloqueadas"}`, { description: r.changed < ids.length ? "Las ocupadas o reservadas no se modifican." : undefined });
      await refresh();
    } catch (err) { toast.error(parseDbError(err)); }
  }

  function suggest() {
    const p = suggestPosition(filterCliente !== "all" ? filterCliente : "", 0);
    if (!p) return toast.warning("No hay posiciones libres en este depósito");
    selectBay(p.rua, p.bloco); setSelectedId(p.id);
    toast.info(`Sugerida: ${positionLabel(p.id, multiWarehouse)}`);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: positions.length, free: 0, occupied: 0, blocked: 0, reserved: 0 };
    for (const p of positions) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [positions]);
  const usable = counts.total - counts.blocked;
  const pct = usable > 0 ? (counts.occupied / usable) * 100 : 0;
  const pendCount = outIds.size + inIds.size;
  const clientsHere = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) if (p.status === "occupied" && p.clienteId) m.set(p.clienteId, (m.get(p.clienteId) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [positions]);

  const calleInfo = plan.find((r) => r.rua === calle);

  async function printMap() {
    const html = `<div style="padding:8mm;font-size:10px"><h1 style="font-size:16px;margin:0">Mapa — ${e(currentWarehouse?.name || "")}</h1>
      <p style="color:#555">${formatDate(todayLocal())} · ${counts.total} posiciones · ocupadas ${counts.occupied} · libres ${counts.free} · bloqueadas ${counts.blocked}</p>
      ${plan.map((r) => `<div style="display:flex;align-items:center;gap:3px;margin:3px 0"><b style="width:50px">Calle ${e(r.rua)}</b>${r.bays.map((b) => `<div style="display:grid;grid-template-columns:repeat(${r.cols},6px);gap:1px;padding:1px;background:#A9B6C6">${b.cells.map((p) => {
        const s = cellStyle(p); return `<div style="width:6px;height:5px;background:${String(s.background || "#fff")}"></div>`; }).join("")}</div>`).join("")}<span style="margin-left:6px">${r.occ}/${r.total}</span></div>${pasillos.has(r.rua) ? '<div style="height:6px;border-top:1px dashed #E9C46A;margin-left:50px"></div>' : ""}`).join("")}
      <h3 style="font-size:12px;margin-top:6mm">Posiciones ocupadas</h3>
      <table style="width:100%;border-collapse:collapse" border="1" cellpadding="3"><thead style="background:#f2f2f2"><tr><th>Posición</th><th>Pallet</th><th>Descripción</th><th>Cliente</th><th>Peso kg</th><th>Ingreso</th></tr></thead><tbody>
      ${positions.filter((p) => p.status === "occupied").sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true })).map((p) => {
        const pl = p.palletId ? palletById.get(p.palletId) : undefined; const cl = clients.find((c) => c.id === p.clienteId);
        return `<tr><td>${e(p.code)}</td><td>${e(pl?.sku || "")}</td><td>${e(pl?.descricao || "")}</td><td>${e(cl?.nomeFantasia || "")}</td><td style="text-align:right">${pl ? formatNumber(pl.peso) : ""}</td><td>${pl ? formatDate(pl.dataEntrada) : ""}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    await printPages([html], "@page { size: A4 landscape; margin: 0; }", `Mapa ${currentWarehouse?.code || ""}`);
  }

  // ---- frente (reutilizado no modo TV)
  const Front = ({ tvMode }: { tvMode?: boolean }) => (
    <div className={cn("rk flex flex-col items-start", tvMode && "tv")} style={{ minWidth: "max-content" }}>
      <div className="flex" style={{ paddingLeft: tvMode ? 46 : 36 }}>
        {visibleBays.map((b) => (
          <div key={b} style={{ width: tvMode ? 248 : 135 }} className={cn("text-center font-mono text-[11px]", tvMode ? "text-[#9FB3C8] text-sm" : "text-muted-foreground")}>{calle}-{String(b).padStart(2, "0")}</div>
        ))}
      </div>
      {front.nv.map((n) => (
        <div key={n} className="rk-row">
          <div className="rk-lv">N{n}</div>
          {visibleBays.map((b) => (
            <div key={b} className="contents">
              <div className="rk-up" />
              <div className={cn("rk-bay", selected && selected.rua === calle && selected.bloco === b && "hl")}>
                {levelSlots(b, n).filter((v) => !v.skip).map((v) => {
                  const cl = v.pos.clienteId ? clientColor.get(v.pos.clienteId) : undefined;
                  const dim = filterCliente !== "all" && (v.state === "occ" || v.state === "res") && v.pos.clienteId !== filterCliente;
                  const label = `${v.pos.code}: ${STATUS_LABEL[v.pos.status]}${v.pallet ? ` · ${v.pallet.sku}` : ""}`;
                  return (
                    <button
                      type="button"
                      key={v.pos.id}
                      aria-label={label}
                      title={label}
                      onClick={() => clickSlot(v)}
                      className={cn("rk-slot", `rk-${v.state}`, v.wide && "dbl", selectedId === v.pos.id && "rk-sel", picked.has(v.pos.id) && "rk-pick", dim && "rk-dim")}
                      style={cl ? ({ "--c": tint(cl), "--d": cl } as React.CSSProperties) : undefined}
                    >
                      <div className="rk-box">
                        {(v.state === "occ" || v.state === "res") && <><span className="rk-sku">{v.pallet?.sku || "—"}</span><span className="rk-cli">{clients.find((c) => c.id === v.pos.clienteId)?.nomeFantasia}</span></>}
                        {v.state === "free" && <span className="rk-code">{v.pos.code.split("-").slice(1).join("-")}</span>}
                        {v.state === "inb" && <ArrowDownToLine className="h-4 w-4 text-[#C25E05]" aria-hidden />}
                        {v.state === "blk" && <Lock className="h-4 w-4 text-[#B3263A]" aria-hidden />}
                        {v.state === "res" && <span className="rk-dot"><ArrowUpFromLine className="h-2.5 w-2.5 text-white" aria-hidden /></span>}
                      </div>
                      {(v.state === "occ" || v.state === "res") && <div className="rk-base" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="rk-up" />
        </div>
      ))}
    </div>
  );

  const detail = selected ? (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Posición seleccionada</div>
          <div className="font-mono text-lg font-bold">{selected.code}</div>
          <div className="text-xs text-muted-foreground">{TIPO_LABEL[selected.tipo] || selected.tipo} · hasta {formatNumber(selected.capacidadeKg)} kg</div>
        </div>
        <Badge variant={selected.status === "free" ? "outline" : selected.status === "blocked" ? "destructive" : "secondary"}>
          {outIds.has(selected.id) ? "Salida pendiente" : inIds.has(selected.id) ? "Entrada pendiente" : STATUS_LABEL[selected.status]}
        </Badge>
      </div>
      {selPallet && (
        <div className="text-sm space-y-0.5">
          <div className="font-mono font-semibold">{selPallet.sku}</div>
          <div>{selClient?.nomeFantasia}{selPallet.descricao ? ` · ${selPallet.descricao}` : ""}</div>
          <div className="text-muted-foreground">{formatNumber(selPallet.peso, 2)} kg · ingreso {formatDate(selPallet.dataEntrada)}{selPallet.palletDuplo ? " · pallet doble" : ""}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {selected.status === "free" && <Button className="col-span-2" onClick={() => navigate(`/operacao?tab=entrada&pos=${encodeURIComponent(selected.id)}`)}><ArrowDownToLine className="h-4 w-4 mr-1" />Ingresar aquí</Button>}
        {selected.status === "occupied" && selPallet && (
          <>
            <Button variant="destructive" onClick={() => navigate(`/operacao?tab=saida&pallet=${encodeURIComponent(selPallet.sku)}`)}><ArrowUpFromLine className="h-4 w-4 mr-1" />Salida</Button>
            <Button variant="outline" onClick={() => navigate(`/operacao?tab=transferencia&pallet=${encodeURIComponent(selPallet.sku)}`)}><ArrowLeftRight className="h-4 w-4 mr-1" />Transferir</Button>
            <Button variant="outline" onClick={() => setDlg("ajuste")}><Settings className="h-4 w-4 mr-1" />Ajuste</Button>
            <Button variant="outline" onClick={() => setDlg("avaria")}><AlertTriangle className="h-4 w-4 mr-1" />Avería</Button>
          </>
        )}
        {(selected.status === "free" || selected.status === "blocked") && (
          <Button variant="outline" className="col-span-2" onClick={() => setBlocked([selected.id], selected.status === "free")}>
            {selected.status === "blocked" ? <><Unlock className="h-4 w-4 mr-1" />Desbloquear</> : <><Lock className="h-4 w-4 mr-1" />Bloquear</>}
          </Button>
        )}
      </div>
      <Button variant="ghost" size="sm" className="px-0" onClick={() => printPositionLabels([selected], currentWarehouse?.name || "")}><Tag className="h-4 w-4 mr-1" />Imprimir etiqueta</Button>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Toque un vano en la planta o una posición en el frente para ver el detalle y las acciones.</p>
  );

  if (positions.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Mapa del depósito</h1>
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Este depósito no tiene posiciones cargadas. {user?.role === "admin" ? <Button variant="link" onClick={() => navigate("/configuraciones?vista=depositos")}>Configurar la planta en Configuraciones</Button> : "Pida a un administrador que configure la planta."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Mapa del depósito</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Toque una calle o un vano en la planta para ver su frente.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:gap-6">
          <div className="text-xs text-muted-foreground">Ocupación<div className="text-lg font-bold text-foreground">{pct.toFixed(0)}%</div></div>
          <div className="text-xs text-muted-foreground">Libres<div className="text-lg font-bold text-foreground">{counts.free}</div></div>
          <div className="text-xs text-muted-foreground">Pendientes<div className={cn("text-lg font-bold", pendCount ? "text-[#C25E05]" : "text-foreground")}>{pendCount}</div></div>
          {warehouses.filter((w) => w.active).length > 1 && (
            <Select value={currentWarehouseId || ""} onValueChange={(v) => { setCurrentWarehouseId(v); setSelectedId(null); setPicked(new Set()); }}>
              <SelectTrigger className="w-[230px]"><WarehouseIcon className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>{warehouses.filter((w) => w.active).map((w) => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {!isMobile && <Button variant="outline" onClick={() => setTv(true)}><Monitor className="h-4 w-4 mr-1" />Modo TV</Button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-xl border bg-card p-3 md:p-4 space-y-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="text-sm font-semibold">Planta · {currentWarehouse?.name}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {clientsHere.slice(0, 6).map(([id]) => (
                <button key={id} type="button" className={cn("flex items-center gap-1 hover:underline", filterCliente === id && "font-semibold text-foreground")} onClick={() => setFilterCliente(filterCliente === id ? "all" : id)}>
                  <span className="h-3 w-3 rounded-sm" style={{ background: clientColor.get(id) }} />{clients.find((c) => c.id === id)?.nomeFantasia}
                </button>
              ))}
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[#FC8711]" />Salida pend.</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-white" style={{ boxShadow: "inset 0 0 0 1.5px #FC8711" }} />Entrada pend.</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[#E3E9F0]" />Libre</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: "repeating-linear-gradient(45deg,#D64550 0 2px,#F4C5CB 2px 4px)" }} />Bloqueada</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: "max-content" }}>
              {plan.map((r) => (
                <div key={r.rua}>
                  <div className={cn("pl-calle", r.rua === calle && "on")} onClick={() => { setCalle(r.rua); setPage(0); }}>
                    <div className="w-[52px] shrink-0">
                      <div className="text-xs font-semibold">Calle {r.rua}</div>
                      <div className="text-[10px] text-muted-foreground">{r.allBlocked ? "bloqueada" : `${r.occ}/${r.total}`}</div>
                    </div>
                    {r.bays.map((b) => (
                      <button
                        type="button"
                        key={b.b}
                        aria-label={`Vano ${r.rua}-${String(b.b).padStart(2, "0")}`}
                        title={`Vano ${r.rua}-${String(b.b).padStart(2, "0")}`}
                        onClick={(ev) => { ev.stopPropagation(); selectBay(r.rua, b.b); }}
                        className={cn("pl-bay", selected && selected.rua === r.rua && selected.bloco === b.b && "on")}
                        style={{ gridTemplateColumns: `repeat(${r.cols}, ${isMobile ? 7 : 9}px)` }}
                      >
                        {b.cells.map((p, i) => <div key={i} className="pl-cell" style={{ ...cellStyle(p), height: isMobile ? 4 : 5 }} />)}
                      </button>
                    ))}
                    {Array.from({ length: maxBays - r.bays.length }).map((_, i) => <div key={`e${i}`} style={{ width: r.cols * (isMobile ? 8 : 10) + 4 }} />)}
                  </div>
                  {pasillos.has(r.rua) && (
                    <div className="pl-aisle" aria-label={`Pasillo ${aisleNo.get(r.rua)}`}>
                      <span>Pasillo {aisleNo.get(r.rua)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className={cn("rounded-xl border bg-card p-4", selected && "border-primary")}>{detail}</div>
          {calleInfo && (
            <div className="rounded-xl border bg-card p-4 text-sm space-y-1.5">
              <div className="font-semibold">Calle {calle}</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ocupadas</span><b>{calleInfo.occ} / {calleInfo.total}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Salidas pendientes</span><b>{front.rp.filter((p) => outIds.has(p.id)).length}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Entradas pendientes</span><b>{front.rp.filter((p) => inIds.has(p.id)).length}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><b>{TIPO_LABEL[front.rp[0]?.tipo] || "—"}</b></div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3 md:p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">Frente de la calle {calle}{pages > 1 ? ` · vanos ${visibleBays[0]}–${visibleBays[visibleBays.length - 1]}` : ""}</div>
          <div className="flex flex-wrap gap-2">
            <Button variant={multi ? "default" : "outline"} size="sm" onClick={() => { setMulti(!multi); setPicked(new Set()); }}><Lock className="h-4 w-4 mr-1" />{multi ? "Terminar selección" : "Bloquear varias"}</Button>
            {multi && picked.size > 0 && (
              <>
                <Button size="sm" variant="destructive" onClick={() => { void setBlocked([...picked], true); setPicked(new Set()); }}>Bloquear ({picked.size})</Button>
                <Button size="sm" variant="outline" onClick={() => { void setBlocked([...picked], false); setPicked(new Set()); }}>Desbloquear ({picked.size})</Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={suggest}><Lightbulb className="h-4 w-4 mr-1" />Sugerir libre</Button>
            <Button variant="outline" size="sm" onClick={printMap}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
            {pages > 1 && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" aria-label="Vanos anteriores" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" aria-label="Vanos siguientes" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </div>
        {multi && <p className="text-xs text-primary">Toque posiciones libres o bloqueadas para seleccionarlas.</p>}
        <div className="overflow-x-auto pb-1"><Front /></div>
      </div>

      {tv && (
        <div className="fixed inset-0 z-50 bg-[#132a46] text-white p-6 flex flex-col gap-4 overflow-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs tracking-[.12em] uppercase text-[#FC8711] font-semibold">{currentWarehouse?.name}</div>
              <div className="text-3xl font-bold">Calle {calle}</div>
            </div>
            <div className="flex items-center gap-6 text-sm text-[#9FB3C8]">
              <div>Ocupación<div className="text-2xl font-bold text-white">{pct.toFixed(0)}%</div></div>
              <div>Pendientes<div className="text-2xl font-bold text-[#FFB15C]">{pendCount}</div></div>
              <Button variant="outline" className="bg-transparent text-white border-white/30" aria-label="Calle anterior" onClick={() => { const i = ruas.indexOf(calle); setCalle(ruas[(i - 1 + ruas.length) % ruas.length]); setPage(0); }}><ChevronLeft className="h-5 w-5" /></Button>
              <Button variant="outline" className="bg-transparent text-white border-white/30" aria-label="Calle siguiente" onClick={() => { const i = ruas.indexOf(calle); setCalle(ruas[(i + 1) % ruas.length]); setPage(0); }}><ChevronRight className="h-5 w-5" /></Button>
              <Button variant="outline" className="bg-transparent text-white border-white/30" onClick={() => setTv(false)}><X className="h-4 w-4 mr-1" />Salir</Button>
            </div>
          </div>
          <div className="overflow-x-auto"><Front tvMode /></div>
          <div className="h-2 border-t-2 border-dashed border-[#E8B931]/70" />
        </div>
      )}

      {selPallet && selected && (
        <AdjustDialog
          kind={dlg}
          onClose={() => setDlg(null)}
          pallet={selPallet}
          positionId={selected.id}
          autorizados={authorizedContacts.filter((a) => a.clienteId === selPallet.clienteId && a.ativo)}
          moeda={contracts.find((c) => c.id === selPallet.contratoId)?.moeda || "USD"}
          user={user}
          onDone={async (movId, labels) => {
            await refresh();
            printMovements([movId], { clients, contracts, authorizedContacts }, { labels }).catch((err) => toast.error("No se pudo imprimir", { description: parseDbError(err) }));
          }}
        />
      )}
    </div>
  );
}
