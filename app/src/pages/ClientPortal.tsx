import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeftRight, Clock, Download, FileText, KeyRound, MapPin, Package, Plus, Search, ShoppingCart, Truck, UserCheck, UserX, Wallet } from "lucide-react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { useStockData } from "@/contexts/StockDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTableQuery } from "@/hooks/use-table-query";
import { mapMovement } from "@/data/supabaseData";
import { dbInsertClientRequest, dbUpdateClientRequest } from "@/data/dbMutations";
import { positionLabel, type ClientRequest, type Movement } from "@/data/types";
import { fetchInvoices } from "@/data/billing";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatNumber } from "@/lib/formatters";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import KpiCard from "@/components/shared/KpiCard";
import StatusBadge, { statusLabels } from "@/components/shared/StatusBadge";
import ClientAuthorizedForm from "@/components/forms/ClientAuthorizedForm";
import ClientBilling from "@/components/portal/ClientBilling";
import ClientContracts from "@/components/portal/ClientContracts";
import { toast } from "sonner";

const TIPO_MOV: Record<string, string> = { entrada: "Ingreso", saida: "Salida", transferencia: "Transferencia", ajuste: "Ajuste", avaria: "Avería", bloqueio: "Bloqueo" };
const TIPO_REQ: Record<string, string> = { coleta: "Retiro", acesso: "Acceso", ingreso: "Envío al depósito" };
const REQ_STATUS: Record<string, string> = { pendente: "Recibida", separado: "En preparación", executado: "Realizada", cancelado: "Cancelada" };
const TABS = ["resumen", "mercaderia", "movimientos", "cuenta", "solicitudes", "contrato", "autorizados"] as const;

// Horario de atención: lun–vie 07–17 h, sáb 07–12 h
function inOperatingHours(date: string, time: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  const [h, m] = time.split(":").map(Number);
  const mins = h * 60 + m;
  if (day === 0) return false;
  if (day === 6) return mins >= 420 && mins < 720;
  return mins >= 420 && mins < 1020;
}

export default function ClientPortal() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") || "") ? params.get("tab")! : "resumen";
  const setTab = (t: string) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });

  const { clients, contracts, pallets, authorizedContacts, clientRequests, multiWarehouse, refresh } = useStockData();
  const { data: allMovements = [] } = useTableQuery("movements", mapMovement, true);
  const isAdmin = user?.role === "admin";
  const [adminClientId, setAdminClientId] = useState<string>("");
  const clienteId = isAdmin ? (adminClientId || clients[0]?.id || "") : (user?.clienteId || "");
  const client = clients.find((c) => c.id === clienteId);

  const cContracts = contracts.filter((c) => c.clienteId === clienteId);
  const active = cContracts.filter((c) => c.status === "ativo");
  const cPallets = pallets.filter((p) => p.clienteId === clienteId && p.status !== "expedido");
  const cMovs = (allMovements as Movement[]).filter((m) => m.clienteId === clienteId && m.status !== "cancelada").sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  const cReqs = clientRequests.filter((r) => r.clienteId === clienteId).sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao));
  const cContacts = authorizedContacts.filter((a) => a.clienteId === clienteId);
  const palletById = useMemo(() => new Map(pallets.map((p) => [p.id, p])), [pallets]);

  const contratadas = active.reduce((s, c) => s + c.posicoesContratadas, 0);
  const ocupadas = cPallets.filter((p) => p.status === "armazenado" || p.status === "reservado_saida").reduce((s, p) => s + (p.palletDuplo ? 2 : 1), 0);
  const programadas = cReqs.filter((r) => r.tipo === "ingreso" && r.status === "pendente").reduce((s, r) => s + (r.quantidade || 0), 0);
  const month = todayLocal().slice(0, 7);
  const movMes = cMovs.filter((m) => m.status === "executada" && m.dataHora && formatDate(m.dataHora).slice(3) === `${month.slice(5)}/${month.slice(0, 4)}` && ["entrada", "saida", "transferencia"].includes(m.tipo) && !m.interna).length;

  const invQ = useQuery({ queryKey: ["billing", "invoices", "client", clienteId], queryFn: () => fetchInvoices({ clienteId }), enabled: !!clienteId });
  const openInv = (invQ.data || []).filter((i) => i.kind === "factura" && i.status === "emitida" && i.saldo > 0);
  const saldo = openInv.reduce((s, i) => s + i.saldo, 0);
  const vencido = openInv.filter((i) => i.estadoPago === "vencida").reduce((s, i) => s + i.saldo, 0);

  // ---------- Selección de pallets y solicitudes
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reqDlg, setReqDlg] = useState<null | "coleta" | "acesso" | "ingreso">(null);
  const [reqDate, setReqDate] = useState(todayLocal());
  const [reqTime, setReqTime] = useState("");
  const [reqMargin, setReqMargin] = useState("60");
  const [reqQty, setReqQty] = useState("1");
  const [reqNote, setReqNote] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelReq, setCancelReq] = useState<ClientRequest | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [deactivate, setDeactivate] = useState<string | null>(null);

  const inPending = new Set(cReqs.filter((r) => r.status === "pendente" || r.status === "separado").flatMap((r) => r.palletIds));
  const listed = cPallets.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [p.sku, p.descricao, p.lote].some((x) => (x || "").toLowerCase().includes(q));
  });
  const selectable = listed.filter((p) => p.status === "armazenado" && !inPending.has(p.id));

  function openReq(kind: "coleta" | "acesso" | "ingreso") {
    setReqDlg(kind); setReqDate(todayLocal()); setReqTime(""); setReqMargin("60"); setReqQty("1"); setReqNote("");
  }

  async function sendRequest() {
    if (!reqDlg) return;
    if (!reqDate || reqDate < todayLocal()) return toast.error("Elija una fecha de hoy en adelante");
    if (!reqTime) return toast.error("Indique el horario aproximado");
    if (!inOperatingHours(reqDate, reqTime)) return toast.error("Fuera del horario de atención", { description: "Lunes a viernes 07:00–17:00 · sábados 07:00–12:00" });
    if (reqDate === todayLocal()) {
      const now = new Date(); const [h, m] = reqTime.split(":").map(Number);
      if (h * 60 + m < now.getHours() * 60 + now.getMinutes() + 30) return toast.error("Para hoy, programe con al menos 30 minutos de anticipación");
    }
    const qty = parseInt(reqQty, 10);
    if (reqDlg === "ingreso" && (!qty || qty < 1 || qty > 500)) return toast.error("Indique la cantidad de pallets (1 a 500)");
    if (reqDlg !== "ingreso" && selected.length === 0) return toast.error("Seleccione al menos un pallet");
    setSending(true);
    try {
      await dbInsertClientRequest({
        clienteId, palletIds: reqDlg === "ingreso" ? [] : selected, tipo: reqDlg, horarioEstimado: reqTime, dataEstimada: reqDate,
        margemTempo: parseInt(reqMargin, 10), dataCriacao: new Date().toISOString(), status: "pendente",
        quantidade: reqDlg === "ingreso" ? qty : selected.length, observacoes: reqNote.trim() || undefined,
      });
      await refresh();
      toast.success("Solicitud enviada", { description: `${TIPO_REQ[reqDlg]} para el ${formatDate(reqDate)} a las ${reqTime}. Le avisaremos cuando esté lista.` });
      setReqDlg(null); setSelected([]); setTab("solicitudes");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSending(false); }
  }

  function exportPallets() {
    const ws = XLSX.utils.json_to_sheet(cPallets.map((p) => ({
      Código: p.sku, Descripción: p.descricao, Lote: p.lote || "", Cantidad: p.quantidade ?? "", "Peso (kg)": p.peso, "Valor declarado (US$)": p.valorDeclarado,
      Ubicación: [p.localizacao, p.localizacao2].filter(Boolean).map((x) => positionLabel(x, true)).join(" / "), Estado: statusLabels[p.status] || p.status, Ingreso: formatDate(p.dataEntrada),
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Pallets");
    XLSX.writeFile(wb, `stockflex_pallets_${todayLocal()}.xlsx`);
  }
  function exportMovs() {
    const ws = XLSX.utils.json_to_sheet(cMovs.map((m) => ({
      Fecha: formatDateTime(m.dataHora), Tipo: TIPO_MOV[m.tipo] || m.tipo, Pallet: palletById.get(m.palletId)?.sku || "", Desde: m.origemLocal ? positionLabel(m.origemLocal, true) : "",
      Hacia: m.destinoLocal ? positionLabel(m.destinoLocal, true) : "", "Peso (kg)": m.pesoFinal || m.pesoInicial, Estado: statusLabels[m.status] || m.status, Motivo: m.motivo || "",
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `stockflex_movimientos_${todayLocal()}.xlsx`);
  }

  if (!clienteId || !client) {
    return <div className="rounded-lg border p-8 text-center text-muted-foreground">{isAdmin ? "No hay clientes." : "Su usuario todavía no está vinculado a una empresa. Escríbanos a contacto@stockflex.com.py."}</div>;
  }

  const nearEnd = active.filter((c) => { const d = (new Date(`${c.dataTermino}T12:00:00`).getTime() - Date.now()) / 86400000; return d >= 0 && d <= 30; });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{client.nomeFantasia || client.razaoSocial}</h1>
          <p className="text-sm text-muted-foreground">Portal del cliente StockFlex{client.codigo ? ` · ${client.codigo}` : ""}</p>
        </div>
        {isAdmin && (
          <Select value={clienteId} onValueChange={(v) => { setAdminClientId(v); setSelected([]); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Ver como cliente…" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Pallets en depósito" value={cPallets.filter((p) => p.status !== "aguardando_entrada").length} subtitle={programadas ? `+${programadas} programados` : undefined} icon={Package} color="primary" />
        <KpiCard title="Posiciones" value={contratadas ? `${ocupadas} / ${contratadas}` : ocupadas} subtitle={contratadas ? `${Math.round((ocupadas / contratadas) * 100)}% de lo contratado` : "Sin contrato activo"} icon={MapPin} color={ocupadas > contratadas && contratadas > 0 ? "warning" : "primary"} />
        <KpiCard title="Movimientos este mes" value={movMes} subtitle={contratadas ? `${contratadas} incluidos (1 por posición)` : undefined} icon={ArrowLeftRight} color="primary" />
        <button className="text-left" onClick={() => setTab("cuenta")}>
          <KpiCard title="Saldo de su cuenta" value={formatMoney(saldo)} subtitle={vencido > 0 ? `${formatMoney(vencido)} vencido` : saldo > 0 ? "Al día" : "Sin saldo pendiente"} icon={Wallet} color={vencido > 0 ? "destructive" : "success"} />
        </button>
      </div>

      {contratadas > 0 && ocupadas + programadas > contratadas && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>Está usando {ocupadas}{programadas ? ` (+${programadas} programados)` : ""} posiciones con {contratadas} contratadas. Las posiciones por encima de lo contratado se cobran como excedente según el pico del mes. ¿Necesita ampliar? <a className="text-primary underline" href={`https://wa.me/595983110207?text=${encodeURIComponent(`Hola, soy de ${client.nomeFantasia}. Quiero ampliar mis posiciones contratadas.`)}`} target="_blank" rel="noopener">Escríbanos</a>.</span>
        </div>
      )}
      {nearEnd.map((c) => (
        <div key={c.id} className="rounded-lg border p-3 text-sm flex gap-2"><Clock className="h-4 w-4 shrink-0 mt-0.5" />El contrato {c.numero} termina el {formatDate(c.dataTermino)}. Para renovarlo, contáctenos.</div>
      ))}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="mercaderia">Mi mercadería</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="cuenta">Mi cuenta</TabsTrigger>
          <TabsTrigger value="solicitudes">Solicitudes{cReqs.filter((r) => r.status === "pendente" || r.status === "separado").length ? ` (${cReqs.filter((r) => r.status === "pendente" || r.status === "separado").length})` : ""}</TabsTrigger>
          <TabsTrigger value="contrato">Contrato{cContracts.filter((c) => c.docEstado === "para_firma").length ? ` (${cContracts.filter((c) => c.docEstado === "para_firma").length})` : ""}</TabsTrigger>
          <TabsTrigger value="autorizados">Autorizados</TabsTrigger>
        </TabsList>

        {/* RESUMEN */}
        <TabsContent value="resumen" className="space-y-5 mt-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <ActionCard icon={Truck} title="Enviar pallets" text="Avise cuándo llega su carga para preparar la recepción." onClick={() => openReq("ingreso")} />
            <ActionCard icon={ShoppingCart} title="Retirar pallets" text="Elija los pallets y el horario; los dejamos listos." onClick={() => setTab("mercaderia")} />
            <ActionCard icon={UserCheck} title="Autorizar a una persona" text="Quién puede retirar o entregar en su nombre." onClick={() => setAuthOpen(true)} />
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold mb-2">Últimos movimientos</h3>
              {cMovs.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p> : (
                <div className="divide-y text-sm">
                  {cMovs.slice(0, 6).map((m) => (
                    <div key={m.id} className="py-2 flex justify-between gap-2">
                      <span><b>{TIPO_MOV[m.tipo]}</b> · {palletById.get(m.palletId)?.sku || "—"}{palletById.get(m.palletId)?.descricao ? ` · ${palletById.get(m.palletId)?.descricao}` : ""}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(m.dataHora)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="link" className="px-0" onClick={() => setTab("movimientos")}>Ver todos</Button>
            </div>
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold mb-2">Solicitudes en curso</h3>
              {cReqs.filter((r) => r.status === "pendente" || r.status === "separado").length === 0 ? <p className="text-sm text-muted-foreground">No tiene solicitudes en curso.</p> : (
                <div className="divide-y text-sm">
                  {cReqs.filter((r) => r.status === "pendente" || r.status === "separado").map((r) => (
                    <div key={r.id} className="py-2 flex justify-between gap-2">
                      <span><b>{TIPO_REQ[r.tipo]}</b> · {r.tipo === "ingreso" ? `${r.quantidade} pallets` : `${r.palletIds.length} pallets`} · {formatDate(r.dataEstimada)} {r.horarioEstimado}</span>
                      <span className={r.status === "separado" ? "text-success font-medium" : "text-muted-foreground"}>{REQ_STATUS[r.status]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* MERCADERÍA */}
        <TabsContent value="mercaderia" className="space-y-3 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-52"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar por código, descripción o lote" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Button variant="outline" onClick={() => openReq("ingreso")}><Truck className="h-4 w-4 mr-1" />Programar envío</Button>
            <Button variant="outline" onClick={exportPallets}><Download className="h-4 w-4 mr-1" />Excel</Button>
          </div>
          {selected.length > 0 && (
            <div className="sticky top-2 z-10 rounded-lg border bg-card shadow-sm p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selected.length} pallets seleccionados</span>
              <Button size="sm" onClick={() => openReq("coleta")}><ShoppingCart className="h-4 w-4 mr-1" />Solicitar retiro</Button>
              <Button size="sm" variant="outline" onClick={() => openReq("acesso")}><KeyRound className="h-4 w-4 mr-1" />Solicitar acceso</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Quitar selección</Button>
            </div>
          )}
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"><Checkbox aria-label="Seleccionar todos" checked={selectable.length > 0 && selectable.every((p) => selected.includes(p.id))} onCheckedChange={(v) => setSelected(v ? selectable.map((p) => p.id) : [])} /></TableHead>
                <TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Ubicación</TableHead><TableHead className="text-right">Peso</TableHead><TableHead className="text-right">Valor declarado</TableHead><TableHead>Estado</TableHead><TableHead>Ingreso</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {listed.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{search ? "Sin resultados." : "No tiene pallets en depósito."}</TableCell></TableRow>}
                {listed.map((p) => {
                  const can = p.status === "armazenado" && !inPending.has(p.id);
                  return (
                    <TableRow key={p.id} className={selected.includes(p.id) ? "bg-primary/5" : ""}>
                      <TableCell>{can ? <Checkbox checked={selected.includes(p.id)} onCheckedChange={(v) => setSelected((s) => v ? [...s, p.id] : s.filter((x) => x !== p.id))} /> : null}</TableCell>
                      <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                      <TableCell>{p.descricao}{p.lote ? <div className="text-xs text-muted-foreground">Lote {p.lote}{p.quantidade ? ` · ${p.quantidade} u.` : ""}</div> : null}</TableCell>
                      <TableCell className="font-mono text-xs">{[p.localizacao, p.localizacao2].filter(Boolean).map((x) => positionLabel(x, multiWarehouse)).join(" / ") || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(p.peso)} kg</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.valorDeclarado)}{p.seguro ? "" : <div className="text-[10px] text-muted-foreground">sin seguro</div>}</TableCell>
                      <TableCell>{inPending.has(p.id) && p.status === "armazenado" ? <span className="text-xs text-warning">En solicitud</span> : <StatusBadge status={p.status} />}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(p.dataEntrada)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {cPallets.length > 0 && <TableFooter><TableRow>
                <TableCell colSpan={4}>{cPallets.length} pallets</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(cPallets.reduce((s, p) => s + p.peso, 0))} kg</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(cPallets.reduce((s, p) => s + p.valorDeclarado, 0))}</TableCell>
                <TableCell colSpan={2} />
              </TableRow></TableFooter>}
            </Table>
          </div>
        </TabsContent>

        {/* MOVIMIENTOS */}
        <TabsContent value="movimientos" className="space-y-3 mt-4">
          <div className="flex justify-between items-center gap-2">
            <p className="text-sm text-muted-foreground">Ingresos, salidas y movimientos de sus pallets. Los marcados “interno” no se cobran.</p>
            <Button variant="outline" onClick={exportMovs}><Download className="h-4 w-4 mr-1" />Excel</Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Pallet</TableHead><TableHead>Desde → hacia</TableHead><TableHead className="text-right">Peso</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
              <TableBody>
                {cMovs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin movimientos.</TableCell></TableRow>}
                {cMovs.slice(0, 500).map((m) => {
                  const p = palletById.get(m.palletId);
                  const from = m.origemLocal && m.tipo !== "entrada" ? positionLabel(m.origemLocal, multiWarehouse) : "";
                  const to = m.destinoLocal && m.tipo !== "saida" ? positionLabel(m.destinoLocal, multiWarehouse) : "";
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(m.dataHora)}</TableCell>
                      <TableCell>{TIPO_MOV[m.tipo]}{m.interna && <span className="ml-1 text-[10px] uppercase text-muted-foreground border rounded px-1">interno</span>}</TableCell>
                      <TableCell className="font-mono text-sm">{p?.sku || "—"}<div className="font-sans text-xs text-muted-foreground">{p?.descricao}</div></TableCell>
                      <TableCell className="font-mono text-xs">{m.tipo === "entrada" ? `Ingreso → ${to}` : m.tipo === "saida" ? `${from} → Retirado` : from && to && from !== to ? `${from} → ${to}` : from || to || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(m.pesoFinal || m.pesoInicial)} kg{m.pesoFinal && m.pesoInicial && m.pesoFinal !== m.pesoInicial ? <div className="text-[11px] text-muted-foreground">antes {formatNumber(m.pesoInicial)}</div> : null}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* MI CUENTA */}
        <TabsContent value="cuenta" className="mt-4"><ClientBilling client={client} contracts={cContracts} /></TabsContent>

        {/* SOLICITUDES */}
        <TabsContent value="solicitudes" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => openReq("ingreso")}><Truck className="h-4 w-4 mr-1" />Programar envío</Button>
            <Button onClick={() => setTab("mercaderia")}><ShoppingCart className="h-4 w-4 mr-1" />Nuevo retiro</Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Tipo</TableHead><TableHead>Pallets</TableHead><TableHead>Programado</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {cReqs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8"><Clock className="h-6 w-6 mx-auto mb-2 opacity-40" />Sin solicitudes. Programe un envío o elija pallets para retirar.</TableCell></TableRow>}
                {cReqs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(r.dataCriacao)}</TableCell>
                    <TableCell>{TIPO_REQ[r.tipo]}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[260px]">{r.tipo === "ingreso" ? `${r.quantidade || 0} pallets` : r.palletIds.map((id) => palletById.get(id)?.sku || "—").join(", ")}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(r.dataEstimada)} {r.horarioEstimado} <span className="text-muted-foreground">± {r.margemTempo} min</span></TableCell>
                    <TableCell><span className={r.status === "separado" ? "text-success font-medium" : r.status === "cancelado" ? "text-muted-foreground" : ""}>{REQ_STATUS[r.status]}</span>{r.observacoes ? <div className="text-xs text-muted-foreground">{r.observacoes}</div> : null}</TableCell>
                    <TableCell className="text-right">{r.status === "pendente" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelReq(r)}>Cancelar</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* AUTORIZADOS */}
        <TabsContent value="contrato" className="mt-4">
          <ClientContracts client={client} contracts={cContracts} />
        </TabsContent>

        <TabsContent value="autorizados" className="space-y-3 mt-4">
          <div className="flex justify-between items-center gap-2">
            <p className="text-sm text-muted-foreground">Personas que pueden retirar o entregar mercadería en nombre de su empresa. Las nuevas quedan activas cuando StockFlex las valida.</p>
            <Button onClick={() => setAuthOpen(true)}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Documento</TableHead><TableHead>Cargo</TableHead><TableHead>Contacto</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {cContacts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8"><UserCheck className="h-6 w-6 mx-auto mb-2 opacity-40" />Sin personas autorizadas.</TableCell></TableRow>}
                {cContacts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.nome}</TableCell>
                    <TableCell className="font-mono text-sm">{a.tipoDocumento} {a.documento}</TableCell>
                    <TableCell className="text-sm">{a.cargo || "—"}</TableCell>
                    <TableCell className="text-sm">{a.telefone}{a.email ? <div className="text-xs text-muted-foreground">{a.email}</div> : null}</TableCell>
                    <TableCell>{a.ativo ? <StatusBadge status="ativo" /> : (a.observacoes || "").includes("Baja") ? <StatusBadge status="inativo" /> : <span className="text-xs text-warning">Pendiente de validación</span>}</TableCell>
                    <TableCell className="text-right">{a.ativo && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeactivate(a.id)}><UserX className="h-4 w-4 mr-1" />Dar de baja</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Diálogo de solicitud */}
      <Dialog open={!!reqDlg} onOpenChange={(o) => !o && setReqDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reqDlg === "coleta" ? "Solicitar retiro" : reqDlg === "acesso" ? "Solicitar acceso a pallets" : "Programar envío al depósito"}</DialogTitle>
            <DialogDescription>
              {reqDlg === "coleta" ? "Dejaremos los pallets listos en el muelle. Quien retire debe ser una persona autorizada." :
               reqDlg === "acesso" ? "Para inspección o manipulación en el depósito." : "Así preparamos espacio y personal para la descarga."}
              {" "}Horario: lun–vie 07–17 h · sáb 07–12 h.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {reqDlg !== "ingreso" && (
              <div className="rounded-md bg-muted/50 p-2 text-xs font-mono flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {selected.map((id) => <span key={id} className="bg-background border rounded px-1.5">{palletById.get(id)?.sku}</span>)}
              </div>
            )}
            {reqDlg === "ingreso" && <div><Label htmlFor="f926-11">Cantidad de pallets *</Label><Input id="f926-11" type="number" min={1} max={500} value={reqQty} onChange={(e) => setReqQty(e.target.value)} /></div>}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1"><Label htmlFor="f926-12">Fecha *</Label><Input id="f926-12" type="date" min={todayLocal()} value={reqDate} onChange={(e) => setReqDate(e.target.value)} /></div>
              <div><Label htmlFor="f926-13">Hora *</Label><Input id="f926-13" type="time" min="07:00" max="17:00" step={900} value={reqTime} onChange={(e) => setReqTime(e.target.value)} /></div>
              <div><Label>Margen</Label>
                <Select value={reqMargin} onValueChange={setReqMargin}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="30">± 30 min</SelectItem><SelectItem value="60">± 1 h</SelectItem><SelectItem value="120">± 2 h</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div><Label htmlFor="f926-14">Observaciones</Label><Textarea id="f926-14" rows={2} placeholder={reqDlg === "ingreso" ? "Tipo de camión, chofer, mercadería…" : "Quién retira, vehículo…"} value={reqNote} onChange={(e) => setReqNote(e.target.value)} /></div>
            {reqDlg === "ingreso" && contratadas > 0 && ocupadas + programadas + (parseInt(reqQty, 10) || 0) > contratadas && (
              <p className="text-xs text-warning">Con este envío superaría las {contratadas} posiciones contratadas; el excedente se cobra según el pico del mes.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqDlg(null)}>Cancelar</Button>
            <Button onClick={sendRequest} disabled={sending}>Enviar solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelReq} onOpenChange={(o) => !o && setCancelReq(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Cancelar la solicitud?</AlertDialogTitle>
            <AlertDialogDescription>{cancelReq ? `${TIPO_REQ[cancelReq.tipo]} del ${formatDate(cancelReq.dataEstimada)} ${cancelReq.horarioEstimado}.` : ""}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { try { await dbUpdateClientRequest(cancelReq!.id, { status: "cancelado" }); await refresh(); toast.success("Solicitud cancelada"); } catch (e) { toast.error((e as Error).message); } setCancelReq(null); }}>Cancelar solicitud</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deactivate} onOpenChange={(o) => !o && setDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Dar de baja a esta persona?</AlertDialogTitle>
            <AlertDialogDescription>Ya no podrá retirar ni entregar mercadería en nombre de su empresa.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error } = await (supabase.rpc as any)("client_deactivate_contact", { p_contact_id: deactivate });
              if (error) toast.error(error.message); else { toast.success("Autorizado dado de baja"); await refresh(); }
              setDeactivate(null);
            }}>Dar de baja</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ClientAuthorizedForm open={authOpen} onOpenChange={setAuthOpen} clienteId={clienteId} existingDocs={cContacts.map((a) => a.documento)} onDone={refresh} />
    </motion.div>
  );
}

function ActionCard({ icon: Icon, title, text, onClick }: { icon: typeof FileText; title: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl border p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors">
      <Icon className="h-5 w-5 text-[#FC8711] mb-2" />
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">{text}</div>
    </button>
  );
}
