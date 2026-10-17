import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, HandCoins, Loader2, Pencil, Plus, UserPlus, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import KpiCard from "@/components/shared/KpiCard";
import { ReasonDialog } from "@/components/finance/FinanceDialogs";
import { useStockData } from "@/contexts/StockDataContext";
import { dbUpdateClient } from "@/data/dbMutations";
import {
  cancelCommission, COMMISSION_STATE_LABEL, fetchAgents, fetchCacExpenses, fetchCommissions, payCommission, saveAgent,
  type Agent, type Commission,
} from "@/data/commissions";
import { METHOD_LABEL, periodLabel, shiftPeriod } from "@/data/billing";
import { formatMoney } from "@/lib/formatters";
import { formatDate, monthLocal, todayLocal } from "@/lib/dates";
import { toast } from "sonner";

const STATE_CLASS: Record<string, string> = {
  prevista: "bg-muted text-muted-foreground",
  liberada: "bg-[#FFF4E8] text-[#9A4A05]",
  pagada: "bg-success/15 text-success",
  anulada: "bg-muted text-muted-foreground line-through",
};

export default function Commissions() {
  const qc = useQueryClient();
  const { clients, contracts, refresh } = useStockData();
  const agentsQ = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });
  const comQ = useQuery({ queryKey: ["commissions"], queryFn: fetchCommissions });
  const cacQ = useQuery({ queryKey: ["cac-expenses"], queryFn: fetchCacExpenses });
  const reload = () => { qc.invalidateQueries({ queryKey: ["agents"] }); qc.invalidateQueries({ queryKey: ["commissions"] }); qc.invalidateQueries({ queryKey: ["cac-expenses"] }); };

  const agents = agentsQ.data || [];
  const coms = comQ.data || [];
  const [agentEdit, setAgentEdit] = useState<Partial<Agent> | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [payFor, setPayFor] = useState<Commission | null>(null);
  const [cancelFor, setCancelFor] = useState<Commission | null>(null);

  // CAC: comisiones pagadas ÷ clientes nuevos (primer contrato) del período
  const year = todayLocal().slice(0, 4);
  const cacYear = (cacQ.data || []).filter((x) => x.competencia.startsWith(year)).reduce((s, x) => s + x.valor, 0);
  const firstContractByClient = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of [...contracts].filter((c) => c.status !== "rascunho").sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))) if (!m.has(c.clienteId)) m.set(c.clienteId, c.dataInicio);
    return m;
  }, [contracts]);
  const newClientsYear = [...firstContractByClient.values()].filter((d) => d.startsWith(year)).length;
  const toPay = coms.filter((c) => c.estado === "liberada");
  const waiting = coms.filter((c) => c.estado === "prevista");
  const months = Array.from({ length: 6 }, (_, i) => shiftPeriod(monthLocal(), i - 5));
  const cacByMonth = months.map((m) => ({
    m,
    cac: (cacQ.data || []).filter((x) => x.competencia === m).reduce((s, x) => s + x.valor, 0),
    nuevos: [...firstContractByClient.values()].filter((d) => d.startsWith(m)).length,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agentes y comisiones</h1>
          <p className="text-sm text-muted-foreground">Comisión = 1 mes de alquiler de las posiciones contratadas (proporcional si el contrato es menor a 12 meses), solo sobre el primer contrato del cliente. Al pagarla entra en Gastos como CAC.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAssignOpen(true)}><UserPlus className="h-4 w-4 mr-1" />Cliente indicado</Button>
          <Button onClick={() => setAgentEdit({ activo: true })}><Plus className="h-4 w-4 mr-1" />Nuevo agente</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Para pagar" value={formatMoney(toPay.reduce((s, c) => s + c.importe, 0))} subtitle={`${toPay.length} comisiones liberadas`} icon={HandCoins} color="warning" />
        <KpiCard title="Previstas" value={formatMoney(waiting.reduce((s, c) => s + c.importe, 0))} subtitle="esperan el 1.er pago del cliente" icon={BadgeDollarSign} />
        <KpiCard title={`CAC pagado ${year}`} value={formatMoney(cacYear)} subtitle={`${newClientsYear} clientes nuevos`} icon={Users} />
        <KpiCard title="CAC medio por cliente" value={newClientsYear ? formatMoney(cacYear / newClientsYear) : "—"} subtitle="comisiones ÷ clientes nuevos del año" icon={Users} color="success" />
      </div>

      <Tabs defaultValue="comisiones">
        <TabsList>
          <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
          <TabsTrigger value="agentes">Agentes ({agents.length})</TabsTrigger>
          <TabsTrigger value="cac">CAC por mes</TabsTrigger>
        </TabsList>

        <TabsContent value="comisiones" className="mt-4">
          {comQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Cliente / contrato</TableHead><TableHead>Agente</TableHead><TableHead>Cálculo</TableHead>
                  <TableHead className="text-right">Comisión</TableHead><TableHead>Estado</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {coms.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin comisiones. Marque qué agente indicó a cada cliente con "Cliente indicado".</TableCell></TableRow>}
                  {coms.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><div className="font-medium">{c.clienteNombre}</div><div className="text-xs text-muted-foreground">{c.contratoNumero} · {formatDate(c.dataInicio)} a {formatDate(c.dataTermino)}</div></TableCell>
                      <TableCell>{c.agenteNombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{c.posiciones} pos. × {formatMoney(c.precio)}{c.meses < 12 ? ` × ${c.meses}/12 meses` : ""}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatMoney(c.importe)}</TableCell>
                      <TableCell>
                        <span className={`text-xs rounded-full px-2 py-0.5 ${STATE_CLASS[c.estado]}`}>{COMMISSION_STATE_LABEL[c.estado]}</span>
                        {c.estado === "pagada" && <div className="text-xs text-muted-foreground mt-1">{formatDate(c.fechaPago)} · {METHOD_LABEL[c.metodo] || c.metodo} {c.referencia}</div>}
                        {c.estado === "anulada" && c.motivo && <div className="text-xs text-muted-foreground mt-1">{c.motivo}</div>}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {(c.estado === "liberada" || c.estado === "prevista") && <Button size="sm" variant={c.estado === "liberada" ? "default" : "outline"} onClick={() => setPayFor(c)}>Pagar</Button>}
                        {c.estado === "prevista" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelFor(c)}>Anular</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {coms.length > 0 && <TableFooter><TableRow><TableCell colSpan={3}>Total (sin anuladas)</TableCell><TableCell className="text-right tabular-nums">{formatMoney(coms.filter((c) => c.estado !== "anulada").reduce((s, c) => s + c.importe, 0))}</TableCell><TableCell colSpan={2} /></TableRow></TableFooter>}
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="agentes" className="mt-4">
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Agente</TableHead><TableHead>Contacto</TableHead><TableHead>Cuenta para pago</TableHead><TableHead className="text-right">Clientes</TableHead><TableHead className="text-right">Pagado</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {agents.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin agentes registrados.</TableCell></TableRow>}
                {agents.map((a) => {
                  const mine = coms.filter((c) => c.agenteId === a.id && c.estado !== "anulada");
                  return (
                    <TableRow key={a.id} className={a.activo ? "" : "opacity-60"}>
                      <TableCell><div className="font-medium">{a.nombre}</div><div className="text-xs text-muted-foreground">{a.documento}{a.activo ? "" : " · inactivo"}</div></TableCell>
                      <TableCell className="text-sm">{a.telefono}<div className="text-xs text-muted-foreground">{a.email}</div></TableCell>
                      <TableCell className="text-sm">{a.cuentaPago || "—"}</TableCell>
                      <TableCell className="text-right">{clients.filter((c) => c.agenteId === a.id).length}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(mine.filter((c) => c.estado === "pagada").reduce((s, c) => s + c.importe, 0))}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="ghost" aria-label="Editar" onClick={() => setAgentEdit(a)}><Pencil className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="cac" className="mt-4">
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Mes</TableHead><TableHead className="text-right">Comisiones pagadas (CAC)</TableHead><TableHead className="text-right">Clientes nuevos</TableHead><TableHead className="text-right">CAC por cliente nuevo</TableHead></TableRow></TableHeader>
              <TableBody>
                {cacByMonth.map((r) => (
                  <TableRow key={r.m}>
                    <TableCell>{periodLabel(r.m, true)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.cac)}</TableCell>
                    <TableCell className="text-right">{r.nuevos}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.nuevos ? formatMoney(r.cac / r.nuevos) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">El CAC aparece también en Gastos (categoría "Comisión de captación"). La comisión se registra en el mes en que se paga; el cliente nuevo cuenta en el mes de inicio de su primer contrato.</p>
        </TabsContent>
      </Tabs>

      <AgentDialog agent={agentEdit} onClose={() => setAgentEdit(null)} onSaved={reload} />
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} agents={agents.filter((a) => a.activo)} clients={clients}
        onSaved={async () => { await refresh(); reload(); }} hasCommission={(cid) => coms.some((c) => c.clienteId === cid && c.estado === "pagada")} />
      <PayDialog com={payFor} onClose={() => setPayFor(null)} onPaid={reload} />
      <ReasonDialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)} destructive title={`Anular comisión de ${cancelFor?.clienteNombre}`}
        description="Use si el cliente desistió o la indicación no corresponde. No se podrá generar otra comisión para este cliente automáticamente." confirmLabel="Anular"
        onSubmit={async (v) => { await cancelCommission(cancelFor!.id, v.reason); toast.success("Comisión anulada"); reload(); }} />
    </div>
  );
}

function AgentDialog({ agent, onClose, onSaved }: { agent: Partial<Agent> | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Partial<Agent>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<Partial<Agent> | null>(null);
  if (agent !== loaded) { setLoaded(agent); setV(agent || {}); }
  const f = (k: keyof Agent, label: string, ph = "") => (
    <div className="grid gap-1.5"><Label htmlFor={`ag-${k}`}>{label}</Label><Input id={`ag-${k}`} placeholder={ph} value={(v[k] as string) || ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{v.id ? "Editar agente" : "Nuevo agente"}</DialogTitle><DialogDescription>Persona o empresa que indica clientes a StockFlex.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          {f("nombre", "Nombre *")}
          <div className="grid grid-cols-2 gap-3">{f("documento", "CI / RUC")}{f("telefono", "Teléfono / WhatsApp")}</div>
          {f("email", "Correo")}
          {f("cuentaPago", "Cuenta para pago", "Banco, cuenta o alias")}
          <div className="grid gap-1.5"><Label htmlFor="ag-notas">Notas</Label><Textarea id="ag-notas" rows={2} value={v.notas || ""} onChange={(e) => setV({ ...v, notas: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={v.activo ?? true} onCheckedChange={(x) => setV({ ...v, activo: x })} />Activo</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await saveAgent(v as Agent); toast.success("Agente guardado"); onSaved(); onClose(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onOpenChange, agents, clients, onSaved, hasCommission }: {
  open: boolean; onOpenChange: (o: boolean) => void; agents: Agent[]; clients: import("@/data/types").Client[]; onSaved: () => Promise<void>; hasCommission: (cid: string) => boolean;
}) {
  const [cid, setCid] = useState("");
  const [aid, setAid] = useState("");
  const [busy, setBusy] = useState(false);
  const client = clients.find((c) => c.id === cid);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setCid(""); setAid(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cliente indicado por un agente</DialogTitle>
          <DialogDescription>La comisión se calcula sobre el primer contrato del cliente y se libera cuando él paga su primera factura.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Cliente</Label>
            <Select value={cid} onValueChange={(x) => { setCid(x); setAid(clients.find((c) => c.id === x)?.agenteId || ""); }}>
              <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
              <SelectContent>{[...clients].sort((a, b) => (a.nomeFantasia || "").localeCompare(b.nomeFantasia || "")).map((c) => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Agente</Label>
            <Select value={aid || "_none"} onValueChange={(x) => setAid(x === "_none" ? "" : x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="_none">Sin agente (cliente directo)</SelectItem>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {client && hasCommission(client.id) && <p className="text-xs text-warning">La comisión de este cliente ya fue pagada: cambiar el agente no genera otra.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!cid || busy} onClick={async () => { setBusy(true); try { await dbUpdateClient(cid, { agenteId: aid || null }); await onSaved(); toast.success(aid ? "Agente asignado: comisión calculada" : "Cliente sin agente"); onOpenChange(false); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ com, onClose, onPaid }: { com: Commission | null; onClose: () => void; onPaid: () => void }) {
  const [fecha, setFecha] = useState(todayLocal());
  const [metodo, setMetodo] = useState("transferencia");
  const [ref, setRef] = useState("");
  const [forzar, setForzar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const early = com?.estado === "prevista";
  return (
    <Dialog open={!!com} onOpenChange={(o) => { if (!o) { onClose(); setRef(""); setForzar(false); setMotivo(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pagar comisión · {formatMoney(com?.importe)}</DialogTitle>
          <DialogDescription>{com?.agenteNombre} por {com?.clienteNombre} ({com?.contratoNumero}). Se registra en Gastos como CAC.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="cp-f">Fecha</Label><Input id="cp-f" type="date" max={todayLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Medio</Label>
              <Select value={metodo} onValueChange={setMetodo}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(METHOD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="cp-r">Referencia</Label><Input id="cp-r" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N.º de transferencia" /></div>
          {early && (
            <div className="rounded-md border border-warning/50 bg-warning/5 p-3 space-y-2">
              <p className="text-sm">El cliente todavía no pagó su primera factura.</p>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={forzar} onCheckedChange={(x) => setForzar(!!x)} />Pagar igualmente</label>
              {forzar && <Input placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy || (early && !forzar)} onClick={async () => { setBusy(true); try { await payCommission(com!.id, fecha, metodo, ref, forzar, motivo); toast.success("Comisión pagada y registrada en Gastos (CAC)"); onPaid(); onClose(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Registrar pago</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
