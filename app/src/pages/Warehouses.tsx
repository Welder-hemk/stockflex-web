import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Loader2, Printer, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useStockData } from "@/contexts/StockDataContext";
import { fetchOccupancy, generateStreet, removeStreet, saveWarehouse, type StreetSpec } from "@/data/warehouses";
import type { PositionType, Warehouse } from "@/data/types";
import { printPositionLabels } from "@/lib/print/positionLabels";
import { parseDbError } from "@/lib/errorMessages";

const TIPO_LABEL: Record<PositionType, string> = { selectivo: "Selectivo", "drive-in": "Drive-in", piso: "Piso" };
const emptyWh = { code: "", name: "", city: "", address: "", notes: "", active: true, pasillos: "" };

export default function Warehouses() {
  const qc = useQueryClient();
  const { warehouses, warehousePositions, refresh } = useStockData();
  const { data: occ = [] } = useQuery({ queryKey: ["warehouse-occupancy"], queryFn: fetchOccupancy });
  const [edit, setEdit] = useState<(typeof emptyWh & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [street, setStreet] = useState<StreetSpec | null>(null);
  const [toRemove, setToRemove] = useState<{ wh: Warehouse; rua: string; count: number } | null>(null);

  const streetsByWh = useMemo(() => {
    const m = new Map<string, Map<string, { blocks: Set<number>; levels: number; slots: number; tipo: string; total: number; occupied: number }>>();
    for (const p of warehousePositions) {
      if (!m.has(p.warehouseId)) m.set(p.warehouseId, new Map());
      const ruas = m.get(p.warehouseId)!;
      if (!ruas.has(p.rua)) ruas.set(p.rua, { blocks: new Set(), levels: 0, slots: 0, tipo: p.tipo, total: 0, occupied: 0 });
      const r = ruas.get(p.rua)!;
      r.blocks.add(p.bloco);
      r.levels = Math.max(r.levels, p.nivel);
      r.slots = Math.max(r.slots, p.posicao);
      r.total += 1;
      if (p.status === "occupied") r.occupied += 1;
    }
    return m;
  }, [warehousePositions]);

  const reload = async () => {
    await refresh();
    qc.invalidateQueries({ queryKey: ["warehouse-occupancy"] });
  };

  async function submitWh() {
    if (!edit) return;
    setSaving(true);
    try {
      await saveWarehouse(edit);
      toast.success(edit.id ? "Depósito actualizado" : "Depósito creado. Ahora agregue las calles.");
      setEdit(null);
      await reload();
    } catch (e) {
      toast.error(parseDbError(e));
    } finally {
      setSaving(false);
    }
  }

  async function submitStreet() {
    if (!street) return;
    setSaving(true);
    try {
      const r = await generateStreet(street);
      if (r.created === 0) toast.info("No se creó ninguna posición: ya existían todas.");
      else toast.success(`${r.created} posiciones creadas${r.created < r.requested ? ` (${r.requested - r.created} ya existían)` : ""}`);
      setStreet(null);
      await reload();
    } catch (e) {
      toast.error(parseDbError(e));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    try {
      const r = await removeStreet(toRemove.wh.id, toRemove.rua);
      toast.success(`${r.removed} posiciones eliminadas de la calle ${toRemove.rua}`);
      await reload();
    } catch (e) {
      toast.error(parseDbError(e));
    } finally {
      setToRemove(null);
    }
  }

  const streetTotal = street ? street.blocks * street.levels * street.slots : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Depósitos</h1>
          <p className="text-sm text-muted-foreground">Cada depósito con su planta: calles, bloques, niveles y posiciones. Los pallets de un cliente pueden estar en varios depósitos.</p>
        </div>
        <Button variant="cta" onClick={() => setEdit({ ...emptyWh })}><Plus className="h-4 w-4 mr-1" />Nuevo depósito</Button>
      </div>

      {warehouses.length === 0 && <p className="text-muted-foreground">Ningún depósito registrado.</p>}

      <div className="grid gap-5">
        {warehouses.map((w) => {
          const o = occ.find((x) => x.id === w.id);
          const pct = o && o.total ? Math.round((o.occupied / o.total) * 100) : 0;
          const ruas = [...(streetsByWh.get(w.id)?.entries() || [])].sort((a, b) => a[0].localeCompare(b[0]));
          const positions = warehousePositions.filter((p) => p.warehouseId === w.id);
          return (
            <div key={w.id} className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-primary" /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{w.code}</span>
                      <span className="font-semibold">{w.name}</span>
                      {!w.active && <Badge variant="secondary">Inactivo</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">{[w.city, w.address].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEdit({ ...w, pasillos: w.pasillos || "" })}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                  <Button variant="outline" size="sm" disabled={positions.length === 0} onClick={() => printPositionLabels(positions, `${w.code} · ${w.name}`).catch((e) => toast.error(parseDbError(e)))}>
                    <Printer className="h-4 w-4 mr-1" />Etiquetas de posición ({positions.length})
                  </Button>
                  <Button size="sm" onClick={() => setStreet({ warehouseId: w.id, rua: "", blocks: 10, blockStart: 1, levels: 5, slots: 2, tipo: "selectivo", capacityKg: 1000, blocked: false })}>
                    <Layers className="h-4 w-4 mr-1" />Agregar calle
                  </Button>
                </div>
              </div>

              {o && o.total > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span>Ocupación {pct}%</span><span className="text-muted-foreground">{o.occupied} ocupadas · {o.free} libres · {o.blocked} bloqueadas · {o.total} total</span></div>
                  <Progress value={pct} className="h-2" />
                </div>
              )}

              {ruas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin calles. Use “Agregar calle” para crear la planta.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1 pr-3">Calle</th><th className="pr-3">Tipo</th><th className="pr-3">Bloques</th><th className="pr-3">Niveles</th><th className="pr-3">Pos./nivel</th><th className="pr-3">Posiciones</th><th className="pr-3">Ocupadas</th><th /></tr></thead>
                    <tbody>
                      {ruas.map(([rua, r]) => {
                        const bl = [...r.blocks].sort((a, b) => a - b);
                        return (
                          <tr key={rua} className="border-t">
                            <td className="py-1.5 pr-3 font-mono font-semibold">{rua}</td>
                            <td className="pr-3">{TIPO_LABEL[r.tipo as PositionType] || r.tipo}</td>
                            <td className="pr-3">{bl.length} ({String(bl[0]).padStart(2, "0")}–{String(bl.at(-1)).padStart(2, "0")})</td>
                            <td className="pr-3">{r.levels}</td>
                            <td className="pr-3">{r.slots}</td>
                            <td className="pr-3">{r.total}</td>
                            <td className="pr-3">{r.occupied}</td>
                            <td className="text-right">
                              <Button size="icon" variant="ghost" title="Eliminar calle" disabled={r.occupied > 0} onClick={() => setToRemove({ wh: w, rua, count: r.total })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Depósito: criar / editar */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar depósito" : "Nuevo depósito"}</DialogTitle>
            <DialogDescription>El código aparece en las posiciones y etiquetas (ej.: CDE2:A-01-1-1). No se puede repetir.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <div className="grid gap-1.5">
                  <Label>Código *</Label>
                  <Input value={edit.code} disabled={!!edit.id} maxLength={8} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="CDE2" className="font-mono" />
                </div>
                <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Depósito Ruta 7" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Ciudad</Label><Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Dirección</Label><Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label htmlFor="wh-pas">Pasillos (para dibujar la planta)</Label><Input id="wh-pas" value={edit.pasillos || ""} onChange={(e) => setEdit({ ...edit, pasillos: e.target.value.toUpperCase() })} placeholder="A,C,E" className="font-mono" /><p className="text-xs text-muted-foreground">Calles después de las cuales hay un pasillo. Ej.: "A,C,E" = A | pasillo | B C | pasillo | D E | pasillo…</p></div>
              <div className="grid gap-1.5"><Label>Notas</Label><Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className="min-h-[60px]" /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} />Activo (aparece en la operación)</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={submitWh} disabled={saving || !edit || edit.code.length < 2 || edit.name.trim().length < 2}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerador de rua */}
      <Dialog open={!!street} onOpenChange={(o) => !o && setStreet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar calle</DialogTitle>
            <DialogDescription>Las posiciones se crean como calle-bloque-nivel-posición (ej.: A-01-1-1). Si ya existen, no se duplican.</DialogDescription>
          </DialogHeader>
          {street && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Calle (letra) *</Label><Input value={street.rua} maxLength={2} className="font-mono uppercase" onChange={(e) => setStreet({ ...street, rua: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="A" /></div>
                <div className="grid gap-1.5">
                  <Label>Tipo de estructura</Label>
                  <Select value={street.tipo} onValueChange={(v) => setStreet({ ...street, tipo: v as PositionType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="grid gap-1.5"><Label>Bloques</Label><Input inputMode="numeric" value={street.blocks || ""} onChange={(e) => setStreet({ ...street, blocks: parseInt(e.target.value) || 0 })} /></div>
                <div className="grid gap-1.5"><Label>Desde bloque</Label><Input inputMode="numeric" value={street.blockStart || ""} onChange={(e) => setStreet({ ...street, blockStart: parseInt(e.target.value) || 0 })} /></div>
                <div className="grid gap-1.5"><Label>Niveles</Label><Input inputMode="numeric" value={street.levels || ""} onChange={(e) => setStreet({ ...street, levels: parseInt(e.target.value) || 0 })} /></div>
                <div className="grid gap-1.5"><Label>{street.tipo === "drive-in" ? "Prof. (pallets)" : "Pos./nivel"}</Label><Input inputMode="numeric" value={street.slots || ""} onChange={(e) => setStreet({ ...street, slots: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Capacidad por posición (kg)</Label><Input inputMode="numeric" value={street.capacityKg || ""} onChange={(e) => setStreet({ ...street, capacityKg: parseInt(e.target.value) || 0 })} /></div>
                <label className="flex items-center gap-2 text-sm mt-6"><Switch checked={street.blocked} onCheckedChange={(v) => setStreet({ ...street, blocked: v })} />Crear bloqueadas</label>
              </div>
              <div className="rounded-md bg-secondary p-3 text-sm">
                Se crearán <strong>{streetTotal}</strong> posiciones: {street.rua || "?"}-{String(street.blockStart || 1).padStart(2, "0")}-1-1 a {street.rua || "?"}-{String((street.blockStart || 1) + Math.max(0, street.blocks - 1)).padStart(2, "0")}-{street.levels || "?"}-{street.slots || "?"}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStreet(null)}>Cancelar</Button>
            <Button onClick={submitStreet} disabled={saving || !street || !street.rua || streetTotal <= 0 || streetTotal > 5000 || street.capacityKg <= 0}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Crear {streetTotal} posiciones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la calle {toRemove?.rua} de {toRemove?.wh.code}?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán {toRemove?.count} posiciones libres o bloqueadas. Si alguna tiene pallet, no se elimina nada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
