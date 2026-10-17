import { Warehouse, Package, FileText, AlertTriangle, Bell, ShoppingCart, KeyRound, CheckCircle, Clock, Truck } from "lucide-react";
import KpiCard from "@/components/shared/KpiCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { useStockData } from "@/contexts/StockDataContext";
import { useDashboardStats, useDashboardOccupancy, useDashboardFinancial } from "@/hooks/use-dashboard-stats";
import { supabase } from "@/integrations/supabase/client";
import { positionLabel } from "@/data/types";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { user } = useAuth();
  const {
    clients, contracts, pallets, warehousePositions,
    systemAlerts, clientRequests, multiWarehouse,
    refresh,
  } = useStockData();
  const { data: stats } = useDashboardStats();
  const { data: occupancyData = [] } = useDashboardOccupancy();

  const isOperador = user?.role === 'operador';
  const [finDateFrom, setFinDateFrom] = useState<Date | undefined>();
  const [finDateTo, setFinDateTo] = useState<Date | undefined>();

  const occupiedCount = stats?.occupied_count ?? 0;
  const blockedCount = stats?.blocked_count ?? 0;
  const totalCapacity = stats?.total_positions ?? 0;
  const storedPallets = stats?.stored_pallets ?? 0;
  const activeContractsCount = stats?.active_contracts ?? 0;
  const expiringContracts = stats?.expiring_contracts_30d ?? 0;
  const pendingMovements = stats?.pending_movements ?? 0;

  const activeContracts = contracts.filter(c => c.status === 'ativo');
  const reservedCount = activeContracts.reduce((s, c) => s + c.posicoesContratadas, 0);
  const freeForContract = Math.max(0, totalCapacity - blockedCount - reservedCount);
  const freePhysical = totalCapacity - occupiedCount - blockedCount;
  const occupancyRate = totalCapacity > 0 ? ((occupiedCount / totalCapacity) * 100).toFixed(2) : '0.00';

  const contractExpiry = useMemo(() => [
    { periodo: '< 30 días', cantidad: contracts.filter(c => { const d = new Date(c.dataTermino); const diff = (d.getTime() - Date.now()) / 86400000; return diff > 0 && diff <= 30; }).length },
    { periodo: '30-60 días', cantidad: contracts.filter(c => { const d = new Date(c.dataTermino); const diff = (d.getTime() - Date.now()) / 86400000; return diff > 30 && diff <= 60; }).length },
    { periodo: '60-90 días', cantidad: contracts.filter(c => { const d = new Date(c.dataTermino); const diff = (d.getTime() - Date.now()) / 86400000; return diff > 60 && diff <= 90; }).length },
    { periodo: '> 90 días', cantidad: contracts.filter(c => { const d = new Date(c.dataTermino); const diff = (d.getTime() - Date.now()) / 86400000; return diff > 90; }).length },
  ], [contracts]);

  const pieData = [
    { name: 'Ocupadas', value: occupiedCount, color: 'hsl(199, 89%, 28%)' },
    { name: 'Reservadas (contrato)', value: Math.max(0, reservedCount - occupiedCount), color: 'hsl(38, 92%, 50%)' },
    { name: 'Disponibles', value: freeForContract, color: 'hsl(152, 60%, 40%)' },
    { name: 'Bloqueadas', value: blockedCount, color: 'hsl(0, 72%, 51%)' },
  ];

  // Use server-side occupancy data
  const occupancyByClient = useMemo(() => {
    return occupancyData.map(d => ({
      name: d.client_name,
      contratadas: d.contratadas,
      ocupadas: d.ocupadas,
      programadas: d.programadas,
      excedente: d.excedente,
    }));
  }, [occupancyData]);

  const excessAlerts = useMemo(() => {
    return occupancyByClient.filter(c => c.excedente > 0);
  }, [occupancyByClient]);

  // Use server-side financial data
  const finDateFromStr = finDateFrom ? format(finDateFrom, 'yyyy-MM-dd') : undefined;
  const finDateToStr = finDateTo ? format(finDateTo, 'yyyy-MM-dd') : undefined;
  const { data: financialRaw = [] } = useDashboardFinancial(finDateFromStr, finDateToStr, !isOperador);

  const financialChartData = useMemo(() => {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return financialRaw.map(d => {
      const [y, m] = d.month.split('-');
      return {
        mes: `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`,
        Ingresos: d.ingresos,
        Gastos: d.gastos,
        Resultado: d.resultado,
      };
    });
  }, [financialRaw]);

  const pendingRequests = useMemo(() => clientRequests.filter(r => r.status === 'pendente'), [clientRequests]);

  const [cancelReqId, setCancelReqId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busyReq, setBusyReq] = useState<string | null>(null);

  // Tudo numa transação no banco: cria as saídas pendentes e reserva os pallets (ou fecha a solicitação)
  async function processRequest(reqId: string, action: 'procesar' | 'cancelar', motivo = '') {
    const req = clientRequests.find(r => r.id === reqId);
    if (!req) return;
    setBusyReq(reqId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('process_client_request', { p_request_id: reqId, p_action: action, p_motivo: motivo });
      if (error) throw new Error(error.message);
      await refresh();
      if (action === 'cancelar') toast({ title: "Solicitud cancelada", description: "El cliente verá el motivo en su portal." });
      else if (req.tipo === 'coleta') toast({ title: "Retiro en preparación", description: `${req.palletIds.length} pallet(s) reservados. Confirme la salida en Operación › Pendientes.` });
      else if (req.tipo === 'ingreso') toast({ title: "Envío confirmado", description: `Prepare la recepción de ${req.quantidade || 0} pallet(s).` });
      else toast({ title: "Acceso registrado" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyReq(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visión general de la operación StockFlex</p>
      </div>

      {(isOperador || user?.role === 'admin') && pendingRequests.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-destructive animate-pulse" />
            <h2 className="text-lg font-bold text-destructive">Requisiciones Pendientes ({pendingRequests.length})</h2>
          </div>
          {pendingRequests.map(req => {
            const client = clients.find(c => c.id === req.clienteId);
            const reqPallets = req.palletIds.map(id => pallets.find(p => p.id === id)).filter(Boolean);
            return (
              <div key={req.id} className="bg-destructive/5 border-2 border-destructive/30 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${req.tipo === 'coleta' ? 'bg-primary/15 text-primary' : req.tipo === 'ingreso' ? 'bg-green-500/15 text-green-700' : 'bg-accent text-accent-foreground'}`}>
                        {req.tipo === 'coleta' ? <ShoppingCart className="h-3 w-3" /> : req.tipo === 'ingreso' ? <Truck className="h-3 w-3" /> : <KeyRound className="h-3 w-3" />}
                        {req.tipo === 'coleta' ? 'COLECTA' : req.tipo === 'ingreso' ? 'ENVÍO' : 'ACCESO'}
                      </span>

                    </div>
                    <p className="text-sm font-medium">Cliente: <span className="text-foreground">{client?.nomeFantasia || req.clienteId}</span></p>
                    <p className="text-sm text-muted-foreground">Recibida {formatDateTime(req.dataCriacao)}{req.observacoes ? ` · ${req.observacoes}` : ''}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <Clock className="h-4 w-4 text-warning" />
                      <span>{formatDate(req.dataEstimada)} {req.horarioEstimado}</span>
                      <span className="text-xs text-muted-foreground font-normal">(±{req.margemTempo} min)</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {req.tipo === 'ingreso' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 border border-green-500/30 text-xs font-medium text-green-700">
                      <Truck className="h-3 w-3" /> {req.quantidade || 0} pallet(s) programados para ingreso
                    </span>
                  ) : reqPallets.map(p => p && (
                    <span key={p.id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-card border text-xs font-mono">
                      {p.sku} <span className="text-muted-foreground">· {positionLabel(p.localizacao, multiWarehouse)}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => processRequest(req.id, 'procesar')} disabled={busyReq === req.id} className="gap-1.5">
                    <CheckCircle className="h-4 w-4" /> {req.tipo === 'ingreso' ? 'Confirmar envío' : req.tipo === 'coleta' ? 'Preparar retiro' : 'Registrar acceso'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancelReqId(req.id); setCancelReason(''); }}>Rechazar</Button>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {excessAlerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          {excessAlerts.map(alert => (
            <div key={alert.name} className="bg-destructive/10 border-2 border-destructive/40 rounded-lg p-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="text-sm">
                <span className="font-bold text-destructive">EXCEDENTE — {alert.name}:</span>{' '}
                <span className="text-foreground">
                  {alert.ocupadas} ocupadas + {alert.programadas} programadas = {alert.ocupadas + alert.programadas} pallets
                  vs {alert.contratadas} contratadas ({alert.excedente} excedente{alert.excedente > 1 ? 's' : ''})
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Ocupación Total" value={`${occupancyRate}%`} subtitle={`${occupiedCount} de ${totalCapacity} posiciones`} icon={Warehouse} color="primary" />
        <KpiCard title="Disponibilidad" value={`${((freeForContract / Math.max(1, totalCapacity - blockedCount)) * 100).toFixed(1)}%`} subtitle={`${freeForContract} pos. disponibles de ${totalCapacity - blockedCount} virtuales`} icon={Warehouse} color={freeForContract > 0 ? 'success' : 'destructive'} />
        <KpiCard title="Pallets Almacenados" value={storedPallets} subtitle={`${stats?.total_pallets ?? pallets.length} total registrados`} icon={Package} color="success" />
        {!isOperador && <KpiCard title="Contratos Activos" value={activeContractsCount} subtitle={`Reservadas: ${reservedCount} · Disp: ${freeForContract}`} icon={FileText} color="primary" />}
        {!isOperador && <KpiCard title="Por Vencer (30d)" value={expiringContracts} subtitle="contratos próximos al vencimiento" icon={AlertTriangle} color={expiringContracts > 0 ? 'warning' : 'success'} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="kpi-card col-span-1">
          <h3 className="text-sm font-semibold text-card-foreground mb-4">Distribución de Posiciones ({totalCapacity} total)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name} ({d.value})
              </div>
            ))}
          </div>
        </motion.div>

        {(() => {
          const usable = totalCapacity - blockedCount;
          const reservedNotOccupied = Math.max(0, reservedCount - occupiedCount);
          const available = Math.max(0, usable - occupiedCount - reservedNotOccupied);
          const pieOcupables = [
            { name: 'Ocupadas', value: occupiedCount, color: 'hsl(199, 89%, 28%)' },
            { name: 'Reservadas', value: reservedNotOccupied, color: 'hsl(38, 92%, 50%)' },
            { name: 'Disponibles', value: available, color: 'hsl(152, 60%, 40%)' },
          ];
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="kpi-card col-span-1">
              <h3 className="text-sm font-semibold text-card-foreground mb-4">Distribución Ocupables ({usable} pos.)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieOcupables} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                    {pieOcupables.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-4 mt-2">
                {pieOcupables.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })()}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="kpi-card col-span-1 lg:col-span-2">
          <h3 className="text-sm font-semibold text-card-foreground mb-4">Ocupación por Cliente</h3>
            <ResponsiveContainer width="100%" height={250}>
            <BarChart data={occupancyByClient} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <Tooltip />
              <Legend />
              <Bar dataKey="contratadas" name="Contratadas" fill="hsl(220, 13%, 75%)" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="ocupadas" name="Ocupadas" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="programadas" name="Programadas" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="excedente" name="Excedente" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {!isOperador && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }} className="kpi-card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-card-foreground">Resultado Financiero Mensual</h3>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", finDateFrom && "text-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5" /> {finDateFrom ? format(finDateFrom, "MM/yyyy") : "Desde"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={finDateFrom} onSelect={setFinDateFrom} className={cn("p-3 pointer-events-auto")} /></PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", finDateTo && "text-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5" /> {finDateTo ? format(finDateTo, "MM/yyyy") : "Hasta"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={finDateTo} onSelect={setFinDateTo} className={cn("p-3 pointer-events-auto")} /></PopoverContent>
              </Popover>
              {(finDateFrom || finDateTo) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFinDateFrom(undefined); setFinDateTo(undefined); }}>Limpiar</Button>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={financialChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 88%)" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Line type="monotone" dataKey="Ingresos" stroke="hsl(199, 89%, 48%)" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Gastos" stroke="hsl(0, 72%, 51%)" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Resultado" stroke="hsl(45, 93%, 47%)" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!isOperador && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="kpi-card">
            <h3 className="text-sm font-semibold text-card-foreground mb-4">Vencimiento de Contratos</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={contractExpiry}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 88%)" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="cantidad" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="kpi-card">
          <h3 className="text-sm font-semibold text-card-foreground mb-4">Alertas del Sistema</h3>
          <div className="space-y-3 max-h-[250px] overflow-y-auto">
            {useMemo(() => {
              const alerts: { msg: string; type: string }[] = [];
              if (!isOperador) {
                contracts.filter(c => {
                  const diff = (new Date(c.dataTermino).getTime() - Date.now()) / 86400000;
                  return diff > 0 && diff <= 30 && c.status === 'ativo';
                }).forEach(c => {
                  const client = clients.find(cl => cl.id === c.clienteId);
                  const days = Math.ceil((new Date(c.dataTermino).getTime() - Date.now()) / 86400000);
                  alerts.push({ msg: `Contrato ${c.numero} (${client?.nomeFantasia}) vence en ${days} días`, type: 'warning' });
                });
              }
              systemAlerts.filter(a => !a.resuelto && (a.tipo === 'capacidad' || a.tipo === 'operacion')).forEach(a => {
                alerts.push({ msg: a.mensaje, type: a.tipo === 'operacion' ? 'warning' : 'destructive' });
              });
              if (pendingMovements > 0) {
                alerts.push({ msg: `${pendingMovements} movimiento(s) pendiente(s) de aprobación`, type: 'primary' });
              }
              if (blockedCount > 0) {
                alerts.push({ msg: `${blockedCount} posiciones bloqueadas para mantenimiento`, type: 'destructive' });
              }
              contracts.filter(c => c.status === 'ativo').forEach(c => {
                const contractPalletIds = pallets.filter(p => p.contratoId === c.id && p.status === 'armazenado').map(p => p.id);
                const contractOccupied = warehousePositions.filter(p => p.status === 'occupied' && p.palletId && contractPalletIds.includes(p.palletId)).length;
                if (contractOccupied > c.posicoesContratadas) {
                  const client = clients.find(cl => cl.id === c.clienteId);
                  alerts.push({ msg: `Contrato ${c.numero} (${client?.nomeFantasia}): ${contractOccupied}/${c.posicoesContratadas} posiciones — expansión contractual necesaria`, type: 'warning' });
                }
              });
              if (alerts.length === 0) {
                alerts.push({ msg: 'No hay alertas pendientes', type: 'primary' });
              }
              return alerts;
            }, [contracts, clients, systemAlerts, pallets, warehousePositions, blockedCount, isOperador, pendingMovements]).map((alert, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 text-${alert.type}`} />
                <span className="text-card-foreground">{alert.msg}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
      <AlertDialog open={!!cancelReqId} onOpenChange={(o) => !o && setCancelReqId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Rechazar solicitud</AlertDialogTitle>
            <AlertDialogDescription>Indique el motivo; el cliente lo verá en su portal.</AlertDialogDescription></AlertDialogHeader>
          <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ej.: horario no disponible, reprogramar para mañana" />
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={cancelReason.trim().length < 3} onClick={() => { const id = cancelReqId!; setCancelReqId(null); void processRequest(id, 'cancelar', cancelReason.trim()); }}>Rechazar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
