import { formatNumber } from "@/lib/formatters";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Plus, FileText, Paperclip, Printer, AlertTriangle, CheckCircle, Loader2, FileDown, XCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import MovementReceipt from "@/components/MovementReceipt";
import { cancelMovement, confirmMovement, isPositionCode, printMovements, resolvePositionId } from "@/data/operations";
import { statusLabels } from "@/components/shared/StatusBadge";
import { parseDecimal } from "@/lib/formatters";
import { formatDateTime, monthLocal, todayLocal } from "@/lib/dates";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStockData } from "@/contexts/StockDataContext";
import { dbInsertMovement, dbUpdateMovement, dbInsertExtraCost, dbDeleteExtraCost, dbUpdatePallet, dbUpdateWarehousePosition, dbInsertSystemAlert, dbUpdateClientRequest } from "@/data/dbMutations";
import type { Movement, ExtraCostCategory } from "@/data/types";
import { uploadFile } from "@/data/storageHelpers";
import { EXTRA_COST_CATEGORIES, isGroundPosition, positionLabel } from "@/data/types";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { parseDbError } from "@/lib/errorMessages";
import { Badge } from "@/components/ui/badge";
import { usePaginatedQuery, useDebounce, type PaginationFilter, type TextSearch } from "@/hooks/use-paginated-query";
import { mapMovement } from "@/data/supabaseData";
import TablePagination from "@/components/shared/TablePagination";
import FilePreview from "@/components/shared/FilePreview";
import TableSkeleton from "@/components/shared/TableSkeleton";

const tipoLabels: Record<string, string> = {
  entrada: '↓ Ingreso', saida: '↑ Salida', transferencia: '↔ Transferencia',
  ajuste: '⟳ Ajuste', avaria: '⚠ Avería', bloqueio: '🔒 Bloqueo',
};

export default function Movements() {
  const { user } = useAuth();
  const { clients, pallets, contracts, warehousePositions, authorizedContacts, extraCosts, clientRequests, suggestPosition, findContiguousPosition, refresh, currentWarehouse, multiWarehouse } = useStockData();
  const [search, setSearch] = useState("");
  const [filterCliente, setFilterCliente] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [receiptMovement, setReceiptMovement] = useState<Movement | null>(null);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [attachTarget, setAttachTarget] = useState<Movement | null>(null);
  const [extraCostDialogOpen, setExtraCostDialogOpen] = useState(false);
  const [extraCostTarget, setExtraCostTarget] = useState<Movement | null>(null);
  const [extraCostCategoria, setExtraCostCategoria] = useState<ExtraCostCategory | ''>('');
  const [extraCostDescricao, setExtraCostDescricao] = useState('');
  const [newMovDialogOpen, setNewMovDialogOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Movement | null>(null);
  const [weightWarningOpen, setWeightWarningOpen] = useState(false);
  const [weightWarningMsg, setWeightWarningMsg] = useState('');
  const [weightWarningCallback, setWeightWarningCallback] = useState<(() => void) | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Movement | null>(null);
  const [editMov, setEditMov] = useState({ origemLocal: '', destinoLocal: '', pesoInicial: '', pesoFinal: '', motivo: '', operador: '', novoValorDeclarado: '', autorizadoId: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [newMov, setNewMov] = useState({
    tipo: '' as string, clienteId: '' as string, contratoId: '' as string, palletId: '' as string,
    origemLocal: '', destinoLocal: '', pesoInicial: '', pesoFinal: '', motivo: '', operador: user?.nome || '',
    hasCustoExtra: false, custoCategoria: '' as string, custoDescricao: '', isInternal: false,
    novoValorDeclarado: '', autorizadoId: '',
  });

  function resetNewMov() {
    setNewMov({ tipo: '', clienteId: '', contratoId: '', palletId: '', origemLocal: '', destinoLocal: '', pesoInicial: '', pesoFinal: '', motivo: '', operador: user?.nome || '', hasCustoExtra: false, custoCategoria: '', custoDescricao: '', isInternal: false, novoValorDeclarado: '', autorizadoId: '' });
  }

  const printCtx = { clients, pallets, contracts, authorizedContacts };
  const skuOf = (id: string) => pallets.find(p => p.id === id)?.sku || (id || '').slice(0, 8).toUpperCase();
  const loc = (v: string) => (v && v.includes(':') ? positionLabel(v, multiWarehouse) : v || '—');
  // Posição digitada curta (A-01-1-1) vira id completo do depósito atual; textos como "Exterior" ficam como estão
  const posOrText = (v: string) => { const t = (v || '').trim().toUpperCase(); return isPositionCode(t) ? resolvePositionId(t, currentWarehouse?.code) : (v || '').trim(); };
  const newMovAutorizados = authorizedContacts.filter(ac => ac.clienteId === newMov.clienteId && ac.ativo);
  const newMovContracts = contracts.filter(c => c.clienteId === newMov.clienteId);
  const newMovPallets = pallets.filter(p => p.clienteId === newMov.clienteId);

  function checkWeightAndProceed(peso: number, posId: string, clienteId: string, onProceed: () => void) {
    if (peso > 1200 && !isGroundPosition(posId)) {
      const client = clients.find(c => c.id === clienteId);
      setWeightWarningMsg(`El pallet pesa ${formatNumber(peso)} kg y será ubicado en posición elevada ${posId}. Límite recomendado: 1.200 kg. ¿Continuar?`);
      setWeightWarningCallback(() => async () => {
        await dbInsertSystemAlert({ tipo: 'operacion', mensaje: `Pallet con ${formatNumber(peso)} kg en posición elevada ${posId}. Cliente: ${client?.nomeFantasia || ''}`, fecha: todayLocal(), clienteId, resuelto: false });
        onProceed();
      });
      setWeightWarningOpen(true);
      return;
    }
    onProceed();
  }

  async function handleCreateMovement() {
    if (!newMov.tipo || !newMov.clienteId || !newMov.palletId || !newMov.origemLocal || !newMov.destinoLocal) { toast.error('Complete los campos obligatorios.'); return; }
    if (newMov.tipo === 'avaria' && !newMov.motivo.trim()) { toast.error('El motivo es obligatorio para averías.'); return; }
    if (newMov.hasCustoExtra && (!newMov.custoCategoria || !newMov.custoDescricao.trim())) { toast.error('Complete categoría y descripción del costo extra.'); return; }

    const pesoFinal = parseDecimal(newMov.pesoFinal) || 0;
    const destNorm = posOrText(newMov.destinoLocal);
    const origNorm = posOrText(newMov.origemLocal);
    const shouldCheckWeight = (newMov.tipo === 'entrada' || newMov.tipo === 'transferencia') && pesoFinal > 0;

    // Destino precisa ser uma posição real do mapa (antes era texto livre)
    const needsFreeDest = newMov.tipo === 'entrada' || newMov.tipo === 'transferencia';
    if (needsFreeDest) {
      const dp = warehousePositions.find(p => p.id === destNorm);
      if (!dp) { toast.error(`La posición de destino ${newMov.destinoLocal} no existe.`); return; }
      if (dp.status !== 'free') { toast.error(`La posición ${loc(dp.id)} no está libre.`); return; }
    }
    if (newMov.tipo === 'bloqueio') {
      const bp = warehousePositions.find(p => p.id === (destNorm || origNorm));
      if (!bp) { toast.error('Indique una posición válida para bloquear/liberar.'); return; }
      if (bp.status === 'occupied') { toast.error(`La posición ${bp.id} está ocupada.`); return; }
    }

    const doCreate = async () => {
      try {
        let operador = user?.nome || newMov.operador || 'Operador';
        if (newMov.tipo === 'saida' && newMov.autorizadoId) {
          const aut = authorizedContacts.find(a => a.id === newMov.autorizadoId);
          operador = aut ? `${user?.nome || 'Operador'} — Aut: ${aut.nome} (${aut.tipoDocumento} ${aut.documento})` : operador;
        }

        const custoExtra = newMov.hasCustoExtra ? { categoria: newMov.custoCategoria as ExtraCostCategory, descricao: newMov.custoDescricao.trim() } : undefined;
        const contratoId = newMov.contratoId || pallets.find(p => p.id === newMov.palletId)?.contratoId || newMovContracts[0]?.id || '';

        const movementId = await dbInsertMovement({
          tipo: newMov.tipo as Movement['tipo'], operador,
          clienteId: newMov.clienteId, contratoId,
          palletId: newMov.palletId,
          origemLocal: origNorm, destinoLocal: destNorm,
          motivo: newMov.motivo, status: 'solicitada',
          pesoInicial: parseDecimal(newMov.pesoInicial) || 0, pesoFinal,
          custoExtra, interna: newMov.isInternal || undefined,
          novoValorDeclarado: newMov.tipo === 'ajuste' && newMov.novoValorDeclarado ? parseDecimal(newMov.novoValorDeclarado) : undefined,
          autorizadoId: newMov.autorizadoId || undefined,
          operadorId: user?.id || undefined,
        });

        if (custoExtra) {
          const contract = contracts.find(c => c.id === contratoId);
          await dbInsertExtraCost({
            clienteId: newMov.clienteId, contratoId,
            competencia: monthLocal(), categoria: custoExtra.categoria, descricao: custoExtra.descricao,
            quantidade: 1, valorUnitario: 0, valorTotal: 0, moeda: contract?.moeda || 'USD',
            dataCriacao: todayLocal(), origem: 'operador', statusAprovacao: 'pendente',
            movimentacaoId: movementId,
          });
        }

        await refresh();
        refreshMov();
        toast.success('Movimiento creado. Confírmelo para efectivarlo.');
        resetNewMov(); setNewMovDialogOpen(false);

        if (newMov.tipo === 'ajuste' || newMov.tipo === 'avaria') {
          printMovements([movementId], printCtx).catch(() => { /* impressão opcional */ });
        }
      } catch (e: unknown) { toast.error(parseDbError(e)); }
    };

    if (shouldCheckWeight) { checkWeightAndProceed(pesoFinal, destNorm, newMov.clienteId, doCreate); }
    else { doCreate(); }
  }

  // Debounced search for server-side
  const debouncedSearch = useDebounce(search, 400);

  // Server-side paginated query for movements
  const serverFilters = useMemo(() => {
    const f: PaginationFilter[] = [];
    if (filterCliente !== 'all') f.push({ column: 'cliente_id', operator: 'eq', value: filterCliente });
    if (dateFrom) f.push({ column: 'data_hora', operator: 'gte', value: dateFrom.toISOString() });
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      f.push({ column: 'data_hora', operator: 'lte', value: endOfDay.toISOString() });
    }
    return f;
  }, [filterCliente, dateFrom, dateTo]);

  const serverSearch: TextSearch | undefined = useMemo(() => {
    if (!debouncedSearch.trim()) return undefined;
    return { term: debouncedSearch, columns: ['operador', 'motivo', 'origem_local', 'destino_local'] };
  }, [debouncedSearch]);

  const { data: rawMovements, totalCount, totalPages, page, pageSize, setPage, setPageSize, loading: movLoading, refresh: refreshMov } = usePaginatedQuery(
    'movements', serverFilters, { column: 'data_hora', ascending: false }, 25, serverSearch
  );

  const filtered = useMemo(() => rawMovements.map(mapMovement), [rawMovements]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, m) => ({ pesoInicial: acc.pesoInicial + m.pesoInicial, pesoFinal: acc.pesoFinal + m.pesoFinal, delta: acc.delta + (m.pesoFinal - m.pesoInicial) }), { pesoInicial: 0, pesoFinal: 0, delta: 0 });
  }, [filtered]);

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16); doc.text('Reporte de Movimientos', 14, 15);
    doc.setFontSize(9);
    const filterDesc = [filterCliente !== 'all' ? `Cliente: ${clients.find(c => c.id === filterCliente)?.nomeFantasia}` : '', dateFrom ? `Desde: ${format(dateFrom, 'dd/MM/yyyy')}` : '', dateTo ? `Hasta: ${format(dateTo, 'dd/MM/yyyy')}` : ''].filter(Boolean).join(' | ') || 'Sin filtros';
    doc.text(filterDesc, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Tipo', 'Fecha', 'Pallet', 'Cliente', 'Peso Ini.', 'Peso Fin.', 'Origen', 'Destino', 'Operador', 'Estado']],
      body: filtered.map(m => {
        const client = clients.find(c => c.id === m.clienteId);
        return [tipoLabels[m.tipo] || m.tipo, formatDateTime(m.dataHora), skuOf(m.palletId), client?.nomeFantasia || '', formatNumber(m.pesoInicial), formatNumber(m.pesoFinal), loc(m.origemLocal), loc(m.destinoLocal), m.operador, statusLabels[m.status] || m.status];
      }),
      styles: { fontSize: 7 },
    });
    doc.save(`movimientos_${todayLocal()}.pdf`);
    toast.success('PDF generado');
  };

  const exportExcel = () => {
    const data = filtered.map(m => {
      const client = clients.find(c => c.id === m.clienteId);
      return { Tipo: tipoLabels[m.tipo] || m.tipo, Fecha: formatDateTime(m.dataHora), Pallet: skuOf(m.palletId), Cliente: client?.nomeFantasia || '', 'Peso Inicial': m.pesoInicial, 'Peso Final': m.pesoFinal, 'Δ Peso': m.pesoFinal - m.pesoInicial, Origen: loc(m.origemLocal), Destino: loc(m.destinoLocal), Operador: m.operador, Motivo: m.motivo, Estado: statusLabels[m.status] || m.status };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    XLSX.writeFile(wb, `movimientos_${todayLocal()}.xlsx`);
    toast.success('Excel generado');
  };

  function handleAttach(m: Movement) { setAttachTarget(m); setAttachDialogOpen(true); }

  const [attachUploading, setAttachUploading] = useState(false);
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !attachTarget) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Archivo demasiado grande (máx. 10MB)"); return; }
    setAttachUploading(true);
    try {
      const url = await uploadFile('documents', file, attachTarget.clienteId, `comprovante_${attachTarget.id}`, true);
      await dbUpdateMovement(attachTarget.id, { comprovanteAssinado: url, comprovanteData: new Date().toISOString() });
      await refresh();
      toast.success(`Comprobante "${file.name}" adjuntado`);
      setAttachDialogOpen(false);
    } catch (err: any) {
      toast.error(parseDbError(err));
    } finally {
      setAttachUploading(false);
    }
  }

  function openExtraCostDialog(m: Movement) {
    setExtraCostTarget(m); setExtraCostCategoria(m.custoExtra?.categoria || ''); setExtraCostDescricao(m.custoExtra?.descricao || ''); setExtraCostDialogOpen(true);
  }

  async function handleSaveExtraCost() {
    if (!extraCostTarget || !extraCostCategoria || !extraCostDescricao.trim()) { toast.error('Complete la categoría y la descripción del costo extra.'); return; }
    try {
      const month = monthLocal(new Date(extraCostTarget.dataHora));
      const contract = contracts.find(c => c.id === extraCostTarget.contratoId);
      await dbInsertExtraCost({
        clienteId: extraCostTarget.clienteId, contratoId: extraCostTarget.contratoId,
        competencia: month, categoria: extraCostCategoria as ExtraCostCategory, descricao: extraCostDescricao.trim(),
        quantidade: 1, valorUnitario: 0, valorTotal: 0, moeda: contract?.moeda || 'USD',
        dataCriacao: todayLocal(), origem: 'operador', statusAprovacao: 'pendente',
        movimentacaoId: extraCostTarget.id,
      });
      await refresh();
      toast.success(`Costo extra registrado. Pendiente de aprobación en el cierre.`);
      setExtraCostDialogOpen(false); setExtraCostTarget(null);
    } catch (e: any) { toast.error(parseDbError(e)); }
  }

  async function handleRemoveExtraCost(m: Movement) {
    const ec = extraCosts.find(e => e.movimentacaoId === m.id && e.origem === 'operador');
    if (ec) { try { await dbDeleteExtraCost(ec.id); await refresh(); } catch {} }
    toast.success(`Costo extra eliminado del movimiento ${m.id}`);
  }

  function handlePrint() {
    const clientName = filterCliente !== 'all' ? clients.find(c => c.id === filterCliente)?.nomeFantasia : 'Todos';
    const fromStr = dateFrom ? format(dateFrom, 'dd/MM/yyyy') : '—';
    const toStr = dateTo ? format(dateTo, 'dd/MM/yyyy') : '—';
    const printWindow = window.open('', '_blank'); if (!printWindow) return;
    const rows = filtered.map(m => {
      const client = clients.find(c => c.id === m.clienteId);
      const delta = m.pesoFinal - m.pesoInicial;
      return `<tr><td>${m.id.slice(0, 8).toUpperCase()}</td><td>${tipoLabels[m.tipo] || m.tipo}</td><td>${formatDateTime(m.dataHora)}</td><td>${skuOf(m.palletId)}</td><td>${client?.nomeFantasia || ''}</td><td style="text-align:right">${formatNumber(m.pesoInicial)} kg</td><td style="text-align:right">${formatNumber(m.pesoFinal)} kg</td><td style="text-align:right;color:${delta < 0 ? 'red' : delta > 0 ? 'green' : 'gray'}">${delta > 0 ? '+' : ''}${formatNumber(delta)} kg</td><td>${loc(m.origemLocal)}</td><td>${loc(m.destinoLocal)}</td><td>${m.operador}</td><td>${statusLabels[m.status] || m.status}</td><td>${m.custoExtra ? EXTRA_COST_CATEGORIES[m.custoExtra.categoria] : '—'}</td></tr>`;
    }).join('');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Reporte de Movimientos</title><style>body{font-family:Arial;font-size:11px;padding:20px}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:4px 6px}th{background:#f5f5f5}@media print{body{padding:0}}</style></head><body><h1>Reporte de Movimientos — StockFlex</h1><div style="color:#666;margin-bottom:16px">Cliente: ${clientName} · Período: ${fromStr} a ${toStr} · ${filtered.length} movimientos</div><table><thead><tr><th>ID</th><th>Tipo</th><th>Fecha</th><th>Pallet</th><th>Cliente</th><th>Peso Ini</th><th>Peso Fin</th><th>Δ</th><th>Origen</th><th>Destino</th><th>Operador</th><th>Estado</th><th>Costo Extra</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    printWindow.document.close(); printWindow.print();
  }

  function handleRowClick(m: Movement) {
    if (m.status !== 'solicitada') return;
    setEditTarget(m);
    setEditMov({
      origemLocal: m.origemLocal, destinoLocal: m.destinoLocal,
      pesoInicial: String(m.pesoInicial), pesoFinal: String(m.pesoFinal),
      motivo: m.motivo, operador: m.operador,
      novoValorDeclarado: m.novoValorDeclarado ? String(m.novoValorDeclarado) : '',
      autorizadoId: m.autorizadoId || '',
    });
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const updates: any = {};
      const eo = posOrText(editMov.origemLocal), ed = posOrText(editMov.destinoLocal);
      if (eo !== editTarget.origemLocal) updates.origemLocal = eo;
      if (ed !== editTarget.destinoLocal) updates.destinoLocal = ed;
      const pi = parseDecimal(editMov.pesoInicial) || 0;
      const pf = parseDecimal(editMov.pesoFinal) || 0;
      if (pi !== editTarget.pesoInicial) updates.pesoInicial = pi;
      if (pf !== editTarget.pesoFinal) updates.pesoFinal = pf;
      if (editMov.motivo !== editTarget.motivo) updates.motivo = editMov.motivo;
      if (editMov.operador !== editTarget.operador) updates.operador = editMov.operador;
      const nvd = editMov.novoValorDeclarado ? parseDecimal(editMov.novoValorDeclarado) : undefined;
      if (nvd !== editTarget.novoValorDeclarado) updates.novoValorDeclarado = nvd ?? null;
      if (editMov.autorizadoId !== (editTarget.autorizadoId || '')) updates.autorizadoId = editMov.autorizadoId || null;

      if (Object.keys(updates).length === 0) { toast.info('Sin cambios.'); setEditDialogOpen(false); setEditSaving(false); return; }
      await dbUpdateMovement(editTarget.id, updates);
      await refresh();
      refreshMov();
      toast.success('Movimiento actualizado.');
      setEditDialogOpen(false);
    } catch (e: any) { toast.error(parseDbError(e)); }
    setEditSaving(false);
  }

  // Confirmação em uma única transação no banco: ou tudo muda, ou nada muda
  async function handleConfirmMovement() {
    if (!confirmTarget) return;
    const mov = confirmTarget;
    try {
      await confirmMovement({ movementId: mov.id, operador: user?.nome, operadorId: user?.id });
      await refresh();
      refreshMov();
      toast.success(`Movimiento ${mov.id.slice(0, 8).toUpperCase()} efectivado.`);
      const withLabel = mov.tipo === 'entrada' || mov.tipo === 'transferencia';
      printMovements([mov.id], printCtx, { labels: withLabel }).catch((e) => toast.error('No se pudo imprimir', { description: parseDbError(e) }));
    } catch (e: unknown) { toast.error(parseDbError(e)); }
    setConfirmTarget(null);
  }

  async function handleCancelMovement(m: Movement) {
    const motivo = window.prompt('Motivo de la cancelación (opcional):');
    if (motivo === null) return;
    try {
      await cancelMovement(m.id, motivo);
      await refresh();
      refreshMov();
      toast.success('Movimiento cancelado.');
    } catch (e: unknown) { toast.error(parseDbError(e)); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-bold text-foreground">Movimientos</h1><p className="text-sm text-muted-foreground">{totalCount} movimientos registrados</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1"><FileDown className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1"><FileDown className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={handlePrint} className="gap-1"><Printer className="h-4 w-4" /> Generar Reporte</Button>
          <Button onClick={() => setNewMovDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nuevo Movimiento</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs">
          {search !== debouncedSearch || movLoading ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          )}
          <Input placeholder="Buscar ID, pallet, operador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterCliente} onValueChange={setFilterCliente}><SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Cliente" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Clientes</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}</SelectContent></Select>
        <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("h-9 text-sm gap-1 w-36 justify-start", !dateFrom && "text-muted-foreground")}><CalendarIcon className="h-3.5 w-3.5" />{dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Fecha inicio'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" /></PopoverContent></Popover>
        <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("h-9 text-sm gap-1 w-36 justify-start", !dateTo && "text-muted-foreground")}><CalendarIcon className="h-3.5 w-3.5" />{dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Fecha fin'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" /></PopoverContent></Popover>
        {(filterCliente !== 'all' || dateFrom || dateTo) && (<Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setFilterCliente('all'); setDateFrom(undefined); setDateTo(undefined); }}>Limpiar filtros</Button>)}
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>ID</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha/Hora</TableHead><TableHead>Pallet</TableHead><TableHead>Cliente</TableHead>
            <TableHead>Peso Inicial</TableHead><TableHead>Peso Final</TableHead><TableHead>Δ Peso</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead>
            <TableHead>Operador</TableHead><TableHead>Estado</TableHead><TableHead>Costo Extra</TableHead><TableHead className="w-20"></TableHead>
          </TableRow></TableHeader>
          {movLoading ? <TableSkeleton columns={14} rows={pageSize > 10 ? 10 : pageSize} /> : (
          <TableBody>
            {filtered.map(m => {
              const client = clients.find(c => c.id === m.clienteId);
              const delta = m.pesoFinal - m.pesoInicial;
              return (
                <TableRow key={m.id} className={m.status === 'solicitada' ? 'cursor-pointer hover:bg-accent/50' : ''} onClick={() => handleRowClick(m)}>
                  <TableCell className="font-mono text-sm" title={m.id}>{m.id.substring(0, 8)}</TableCell>
                  <TableCell className="text-sm font-medium">{tipoLabels[m.tipo] || m.tipo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(m.dataHora)}</TableCell>
                  <TableCell className="font-mono text-sm">{pallets.find(p => p.id === m.palletId)?.sku || m.palletId}</TableCell>
                  <TableCell className="text-sm">{client?.nomeFantasia}</TableCell>
                  <TableCell className="font-mono text-sm">{formatNumber(m.pesoInicial)} kg</TableCell>
                  <TableCell className="font-mono text-sm">{formatNumber(m.pesoFinal)} kg</TableCell>
                  <TableCell><span className={`font-mono text-sm font-medium ${delta < 0 ? 'text-destructive' : delta > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{delta > 0 ? '+' : ''}{formatNumber(delta)} kg</span></TableCell>
                  <TableCell className="font-mono text-xs">{loc(m.origemLocal)}</TableCell>
                  <TableCell className="font-mono text-xs">{loc(m.destinoLocal)}</TableCell>
                  <TableCell className="text-sm">{m.operador}</TableCell>
                  <TableCell><StatusBadge status={m.status} /></TableCell>
                  <TableCell>{m.custoExtra ? (<Badge variant="outline" className="text-xs border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 cursor-pointer" onClick={() => openExtraCostDialog(m)}><AlertTriangle className="h-3 w-3 mr-1" />{EXTRA_COST_CATEGORIES[m.custoExtra.categoria]}</Badge>) : (<span className="text-xs text-muted-foreground">—</span>)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {m.status === 'solicitada' && (<Button size="icon" variant="ghost" title="Efectivar" onClick={(e) => { e.stopPropagation(); setConfirmTarget(m); }} className="text-green-600 hover:text-green-700 hover:bg-green-50"><CheckCircle className="h-4 w-4" /></Button>)}
                      {m.status === 'solicitada' && (<Button size="icon" variant="ghost" title="Cancelar" onClick={(e) => { e.stopPropagation(); handleCancelMovement(m); }} className="text-destructive hover:bg-destructive/10"><XCircle className="h-4 w-4" /></Button>)}
                      <Button size="icon" variant="ghost" title="Costo extra" onClick={() => openExtraCostDialog(m)}><AlertTriangle className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Imprimir comprobante" onClick={(e) => { e.stopPropagation(); printMovements([m.id], printCtx, { labels: m.status === 'executada' && (m.tipo === 'entrada' || m.tipo === 'transferencia') }).catch((err) => toast.error(parseDbError(err))); }}><FileText className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Adjuntar" onClick={() => handleAttach(m)}><Paperclip className={`h-4 w-4 ${m.comprovanteAssinado ? 'text-primary' : ''}`} /></Button>
                      {m.comprovanteAssinado && <FilePreview url={m.comprovanteAssinado} label="Ver" />}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          )}
          <TableFooter><TableRow>
            <TableCell colSpan={5} className="text-right font-semibold text-sm">TOTALES ({filtered.length} mov.)</TableCell>
            <TableCell className="font-mono text-sm font-semibold">{formatNumber(totals.pesoInicial)} kg</TableCell>
            <TableCell className="font-mono text-sm font-semibold">{formatNumber(totals.pesoFinal)} kg</TableCell>
            <TableCell><span className={`font-mono text-sm font-bold ${totals.delta < 0 ? 'text-destructive' : totals.delta > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{totals.delta > 0 ? '+' : ''}{formatNumber(totals.delta)} kg</span></TableCell>
            <TableCell colSpan={6} />
          </TableRow></TableFooter>
        </Table>
      </div>
      <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} loading={movLoading} />

      {receiptMovement && <MovementReceipt movement={receiptMovement} onClose={() => setReceiptMovement(null)} clients={clients} pallets={pallets} contracts={contracts} authorizedContacts={authorizedContacts} />}

      <Dialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Adjuntar Comprobante Firmado</DialogTitle></DialogHeader>
          <div className="space-y-4"><p className="text-sm text-muted-foreground">Digitalice el comprobante firmado y adjúntelo aquí.</p><div className="space-y-2"><Label>Archivo (imagen o PDF, máx. 10MB)</Label><Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setAttachDialogOpen(false)}>Cancelar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extraCostDialogOpen} onOpenChange={setExtraCostDialogOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{extraCostTarget?.custoExtra ? 'Costo Extra Registrado' : 'Registrar Costo Extra'}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1"><Label>Categoría *</Label><Select value={extraCostCategoria} onValueChange={v => setExtraCostCategoria(v as ExtraCostCategory)}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{Object.entries(EXTRA_COST_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Descripción *</Label><Textarea value={extraCostDescricao} onChange={e => setExtraCostDescricao(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter className="gap-2">
            {extraCostTarget?.custoExtra && <Button variant="destructive" size="sm" onClick={() => { handleRemoveExtraCost(extraCostTarget); setExtraCostDialogOpen(false); }}>Eliminar</Button>}
            <Button variant="outline" onClick={() => setExtraCostDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveExtraCost}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newMovDialogOpen} onOpenChange={(o) => { setNewMovDialogOpen(o); if (!o) resetNewMov(); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Movimiento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1"><Label>Tipo *</Label><Select value={newMov.tipo} onValueChange={v => {
              const sp = pallets.find(p => p.id === newMov.palletId);
              let origem = newMov.origemLocal, destino = newMov.destinoLocal;
              if (v === 'entrada') { origem = 'Doca Ingreso'; destino = ''; }
              else if (v === 'saida') { origem = sp?.localizacao || ''; destino = 'Doca Salida'; }
              else if ((v === 'transferencia' || v === 'ajuste') && sp) { origem = sp.localizacao; destino = ''; }
              else if (v === 'avaria' && sp) { origem = sp.localizacao; destino = sp.localizacao; }
              setNewMov(p => ({ ...p, tipo: v, origemLocal: origem, destinoLocal: destino, hasCustoExtra: v === 'avaria' || p.hasCustoExtra }));
            }}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{Object.entries(tipoLabels).filter(([k]) => k !== 'entrada').map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Cliente *</Label><Select value={newMov.clienteId} onValueChange={v => setNewMov(p => ({ ...p, clienteId: v, contratoId: '', palletId: '', origemLocal: '', destinoLocal: '' }))}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Contrato</Label><Select value={newMov.contratoId} onValueChange={v => setNewMov(p => ({ ...p, contratoId: v }))} disabled={!newMov.clienteId}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{newMovContracts.map(c => <SelectItem key={c.id} value={c.id}>{c.numero}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Pallet *</Label><Select value={newMov.palletId} onValueChange={v => {
              const pl = pallets.find(p => p.id === v);
              let o = newMov.origemLocal, d = newMov.destinoLocal;
              if (['transferencia','ajuste','saida'].includes(newMov.tipo)) o = pl?.localizacao || '';
              if (['transferencia','ajuste'].includes(newMov.tipo) && newMov.clienteId) { const s = suggestPosition(newMov.clienteId); if (s) d = s.id; }
              setNewMov(p => ({ ...p, palletId: v, origemLocal: o, destinoLocal: d, pesoInicial: pl ? String(pl.peso) : '' }));
            }} disabled={!newMov.clienteId}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{newMovPallets.map(p => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.descricao}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Origen *</Label>{['transferencia','ajuste','saida'].includes(newMov.tipo) ? (<Input value={newMov.origemLocal} readOnly className="bg-muted" />) : (<Input value={newMov.origemLocal} onChange={e => setNewMov(p => ({ ...p, origemLocal: e.target.value }))} />)}</div>
            <div className="space-y-1"><Label>Destino *</Label>{['transferencia','ajuste','entrada'].includes(newMov.tipo) ? (<Select value={newMov.destinoLocal} onValueChange={v => setNewMov(p => ({ ...p, destinoLocal: v }))}><SelectTrigger><SelectValue placeholder="Posición libre" /></SelectTrigger><SelectContent className="max-h-60">{warehousePositions.filter(p => p.status === 'free').map(p => <SelectItem key={p.id} value={p.id}>{p.id}</SelectItem>)}</SelectContent></Select>) : (<Input value={newMov.destinoLocal} onChange={e => setNewMov(p => ({ ...p, destinoLocal: e.target.value }))} />)}</div>
            <div className="space-y-1"><Label>Peso Inicial (kg)</Label><Input type="number" value={newMov.pesoInicial} onChange={e => setNewMov(p => ({ ...p, pesoInicial: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Peso Final (kg)</Label><Input type="number" value={newMov.pesoFinal} onChange={e => setNewMov(p => ({ ...p, pesoFinal: e.target.value }))} /></div>
            <div className="col-span-2 space-y-1"><Label>Motivo {newMov.tipo === 'avaria' ? '*' : ''}</Label><Input value={newMov.motivo} onChange={e => setNewMov(p => ({ ...p, motivo: e.target.value }))} /></div>
            {newMov.tipo === 'ajuste' && (<div className="col-span-2 space-y-1"><Label>Nuevo Valor Declarado (USD)</Label><Input type="number" step="0.01" value={newMov.novoValorDeclarado} onChange={e => setNewMov(p => ({ ...p, novoValorDeclarado: e.target.value }))} /></div>)}
            {newMov.tipo === 'saida' && (<div className="col-span-2 space-y-1"><Label>Autorizado *</Label><Select value={newMov.autorizadoId} onValueChange={v => setNewMov(p => ({ ...p, autorizadoId: v }))}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{newMovAutorizados.map(a => <SelectItem key={a.id} value={a.id}>{a.nome} — {a.tipoDocumento} {a.documento}</SelectItem>)}</SelectContent></Select></div>)}
            {newMov.tipo !== 'saida' && newMov.tipo !== 'transferencia' && (<div className="col-span-2 space-y-1"><Label>Operador</Label><Input value={newMov.operador} readOnly className="bg-muted" /></div>)}
            {['transferencia','ajuste'].includes(newMov.tipo) && (<div className="col-span-2 border-t pt-3"><div className="flex items-center gap-2"><Checkbox id="isInternal" checked={newMov.isInternal} onCheckedChange={(c) => setNewMov(p => ({ ...p, isInternal: !!c }))} /><Label htmlFor="isInternal" className="cursor-pointer text-sm">Movimiento interno (sin cobro)</Label></div></div>)}
            <div className="col-span-2 border-t pt-4 space-y-3">
              <div className="flex items-center gap-2"><Checkbox id="hasCE" checked={newMov.hasCustoExtra} onCheckedChange={(c) => setNewMov(p => ({ ...p, hasCustoExtra: !!c }))} /><Label htmlFor="hasCE" className="cursor-pointer text-sm"><AlertTriangle className="h-3.5 w-3.5 inline mr-1 text-orange-500" />Registrar costo extra</Label></div>
              {newMov.hasCustoExtra && (<div className="grid grid-cols-2 gap-4 pl-6">
                <div className="space-y-1"><Label>Categoría *</Label><Select value={newMov.custoCategoria} onValueChange={v => setNewMov(p => ({ ...p, custoCategoria: v }))}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{Object.entries(EXTRA_COST_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
                <div className="col-span-2 space-y-1"><Label>Descripción *</Label><Textarea value={newMov.custoDescricao} onChange={e => setNewMov(p => ({ ...p, custoDescricao: e.target.value }))} rows={2} /></div>
              </div>)}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setNewMovDialogOpen(false); resetNewMov(); }}>Cancelar</Button><Button onClick={handleCreateMovement}>Crear Movimiento</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Efectivar Movimiento</AlertDialogTitle><AlertDialogDescription>¿Confirma que desea efectivar el movimiento <span className="font-mono font-semibold">{confirmTarget?.id}</span>?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmMovement}>Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={weightWarningOpen} onOpenChange={setWeightWarningOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>⚠ Peso Excesivo</AlertDialogTitle><AlertDialogDescription>{weightWarningMsg}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => { setWeightWarningOpen(false); setWeightWarningCallback(null); }}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { setWeightWarningOpen(false); weightWarningCallback?.(); setWeightWarningCallback(null); }}>Continuar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={editDialogOpen} onOpenChange={(o) => { setEditDialogOpen(o); if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Movimiento Solicitado</DialogTitle><DialogDescription>Modifique los parámetros del movimiento antes de efectivarlo.</DialogDescription></DialogHeader>
          {editTarget && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="col-span-2 flex gap-4 text-sm text-muted-foreground">
                <span>ID: <span className="font-mono">{editTarget.id.slice(0, 8)}</span></span>
                <span>Tipo: <span className="font-semibold">{tipoLabels[editTarget.tipo] || editTarget.tipo}</span></span>
              </div>
              <div className="space-y-1"><Label>Origen</Label><Input value={editMov.origemLocal} onChange={e => setEditMov(p => ({ ...p, origemLocal: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Destino</Label>
                <Select value={editMov.destinoLocal} onValueChange={v => setEditMov(p => ({ ...p, destinoLocal: v }))}>
                  <SelectTrigger><SelectValue placeholder="Posición" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {editMov.destinoLocal && !warehousePositions.find(p => p.id === editMov.destinoLocal && p.status === 'free') && (
                      <SelectItem value={editMov.destinoLocal}>{editMov.destinoLocal} (actual)</SelectItem>
                    )}
                    {warehousePositions.filter(p => p.status === 'free').map(p => <SelectItem key={p.id} value={p.id}>{p.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Peso Inicial (kg)</Label><Input type="number" value={editMov.pesoInicial} onChange={e => setEditMov(p => ({ ...p, pesoInicial: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Peso Final (kg)</Label><Input type="number" value={editMov.pesoFinal} onChange={e => setEditMov(p => ({ ...p, pesoFinal: e.target.value }))} /></div>
              <div className="col-span-2 space-y-1"><Label>Motivo</Label><Input value={editMov.motivo} onChange={e => setEditMov(p => ({ ...p, motivo: e.target.value }))} /></div>
              <div className="col-span-2 space-y-1"><Label>Operador</Label><Input value={editMov.operador} readOnly className="bg-muted" /></div>
              {editTarget.tipo === 'ajuste' && (<div className="col-span-2 space-y-1"><Label>Nuevo Valor Declarado (USD)</Label><Input type="number" step="0.01" value={editMov.novoValorDeclarado} onChange={e => setEditMov(p => ({ ...p, novoValorDeclarado: e.target.value }))} /></div>)}
              {editTarget.tipo === 'saida' && (
                <div className="col-span-2 space-y-1"><Label>Autorizado</Label>
                  <Select value={editMov.autorizadoId} onValueChange={v => setEditMov(p => ({ ...p, autorizadoId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                    <SelectContent>{authorizedContacts.filter(a => a.clienteId === editTarget.clienteId && a.ativo).map(a => <SelectItem key={a.id} value={a.id}>{a.nome} — {a.tipoDocumento} {a.documento}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>{editSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar Cambios'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
