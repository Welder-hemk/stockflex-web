import { useState, useMemo } from "react";
import { useStockData } from "@/contexts/StockDataContext";
import { dbInsertExpense, dbUpdateExpense, dbDeleteExpense } from "@/data/dbMutations";
import type { Expense, ExpenseCategory, ExpenseStatus } from "@/data/types";
import { EXPENSE_CATEGORIES } from "@/data/types";
import StatusBadge from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, DollarSign, CalendarIcon, FileDown } from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import SortableHeader from "@/components/shared/SortableHeader";
import { useSortableTable } from "@/hooks/use-sortable-table";

function getMonthOptions(expenses: Expense[]): { value: string; label: string }[] {
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const months = new Set<string>();
  const now = new Date();
  for (let i = -3; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  expenses.forEach(e => months.add(e.competencia));
  return [...months].sort().reverse().map(v => {
    const [y, m] = v.split('-');
    return { value: v, label: `${monthNames[parseInt(m) - 1]} ${y}` };
  });
}

export default function Expenses() {
  const { expenses, refresh } = useStockData();

  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showDialog, setShowDialog] = useState(false);
  const [newExp, setNewExp] = useState({ categoria: '' as string, descricao: '', valor: 0, moeda: 'USD', observacoes: '', cambioDia: 0 });
  const [newExpDate, setNewExpDate] = useState<Date>(new Date());
  const [newExpVencimiento, setNewExpVencimiento] = useState<Date>(new Date());
  const [reportFrom, setReportFrom] = useState<Date | undefined>(undefined);
  const [reportTo, setReportTo] = useState<Date | undefined>(undefined);

  const monthOptions = getMonthOptions(expenses);
  const monthLabel = filterMonth === 'all' ? 'Todos los meses' : (monthOptions.find(m => m.value === filterMonth)?.label || filterMonth);

  const { sortField: expSortField, sortDirection: expSortDirection, toggleSort: expToggleSort } = useSortableTable([], 'dataCriacao', 'desc');

  const filtered = useMemo(() => {
    let result = expenses;
    if (reportFrom || reportTo) {
      if (reportFrom) result = result.filter(e => new Date(e.dataCriacao) >= reportFrom);
      if (reportTo) result = result.filter(e => new Date(e.dataCriacao) <= reportTo);
    } else if (filterMonth !== 'all') {
      result = result.filter(e => e.competencia === filterMonth);
    }
    if (filterStatus !== 'all') result = result.filter(e => e.status === filterStatus);
    return result;
  }, [expenses, filterMonth, reportFrom, reportTo, filterStatus]);

  const sorted = useMemo(() => {
    if (!expSortField) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal: string | number = '', bVal: string | number = '';
      switch (expSortField) {
        case 'categoria': aVal = EXPENSE_CATEGORIES[a.categoria] || ''; bVal = EXPENSE_CATEGORIES[b.categoria] || ''; break;
        case 'descricao': aVal = a.descricao; bVal = b.descricao; break;
        case 'valor': aVal = a.valor; bVal = b.valor; break;
        case 'valorUSD': aVal = a.valorUSD; bVal = b.valorUSD; break;
        case 'moeda': aVal = a.moeda; bVal = b.moeda; break;
        case 'dataCriacao': aVal = a.dataCriacao; bVal = b.dataCriacao; break;
        case 'dataVencimento': aVal = a.dataVencimento || ''; bVal = b.dataVencimento || ''; break;
        case 'status': aVal = a.status; bVal = b.status; break;
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') return expSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      const cmp = String(aVal).localeCompare(String(bVal));
      return expSortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, expSortField, expSortDirection]);

  const totalUSD = useMemo(() => filtered.reduce((sum, e) => sum + e.valorUSD, 0), [filtered]);

  const needsCambio = newExp.moeda !== 'USD';
  const calculatedUSD = needsCambio && newExp.cambioDia > 0 ? newExp.valor / newExp.cambioDia : newExp.valor;

  const handleAdd = async () => {
    if (!newExp.categoria || !newExp.descricao.trim() || newExp.valor <= 0) { toast.error('Complete todos los campos obligatorios.'); return; }
    if (needsCambio && (!newExp.cambioDia || newExp.cambioDia <= 0)) { toast.error('Informe el cambio del día para convertir a USD.'); return; }
    const valorUSD = needsCambio ? newExp.valor / newExp.cambioDia : newExp.valor;
    const competencia = `${newExpDate.getFullYear()}-${String(newExpDate.getMonth() + 1).padStart(2, '0')}`;
    try {
      await dbInsertExpense({
        competencia, categoria: newExp.categoria as ExpenseCategory, descricao: newExp.descricao.trim(),
        valor: newExp.valor, moeda: newExp.moeda, valorUSD, cambioDia: needsCambio ? newExp.cambioDia : undefined,
        dataCriacao: format(newExpDate, 'yyyy-MM-dd'), dataVencimento: format(newExpVencimiento, 'yyyy-MM-dd'),
        status: 'pendente', observacoes: newExp.observacoes || undefined,
      });
      await refresh();
      setNewExp({ categoria: '', descricao: '', valor: 0, moeda: 'USD', observacoes: '', cambioDia: 0 });
      setNewExpDate(new Date()); setNewExpVencimiento(new Date());
      setShowDialog(false);
      toast.success('Gasto registrado con éxito.');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggleStatus = async (id: string) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;
    const ns = exp.status === 'pago' ? 'pendente' : 'pago';
    try {
      await dbUpdateExpense(id, { status: ns as ExpenseStatus });
      await refresh();
      toast.success(ns === 'pago' ? 'Marcado como Pagado' : 'Marcado como Pendiente');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbDeleteExpense(id);
      await refresh();
      toast.success('Gasto eliminado.');
    } catch (e: any) { toast.error(e.message); }
  };

  const periodLabel = () => {
    let lbl = monthLabel;
    if (reportFrom || reportTo) {
      lbl += ' | ';
      if (reportFrom) lbl += format(reportFrom, 'dd/MM/yyyy');
      lbl += ' → ';
      if (reportTo) lbl += format(reportTo, 'dd/MM/yyyy');
    }
    return lbl;
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Reporte de Gastos Operacionales', 14, 18);
    doc.setFontSize(10); doc.text(`Período: ${periodLabel()}`, 14, 26);
    doc.text(`Total USD: ${formatCurrency(totalUSD)}`, 14, 32);
    autoTable(doc, {
      startY: 38,
      head: [['Categoría', 'Descripción', 'Valor Original', 'Moneda', 'Valor USD', 'Cambio', 'Fecha']],
      body: filtered.map(e => [EXPENSE_CATEGORIES[e.categoria], e.descricao, e.valor.toFixed(2), e.moeda, e.valorUSD.toFixed(2), e.cambioDia ? String(e.cambioDia) : '—', e.dataCriacao]),
      foot: [['', '', '', '', totalUSD.toFixed(2), '', '']],
    });
    doc.save(`gastos_${filterMonth}.pdf`);
    toast.success('PDF generado');
  };

  const exportExcel = () => {
    const data = filtered.map(e => ({ Categoría: EXPENSE_CATEGORIES[e.categoria], Descripción: e.descricao, 'Valor Original': e.valor, Moneda: e.moeda, 'Valor USD': e.valorUSD, Cambio: e.cambioDia || '', Fecha: e.dataCriacao, Observaciones: e.observacoes || '' }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
    XLSX.writeFile(wb, `gastos_${filterMonth}.xlsx`);
    toast.success('Excel generado');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gastos Operacionales</h1>
          <p className="text-sm text-muted-foreground">Registro de costos fijos y variables del depósito</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
          <Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4 mr-2" /> Nuevo Gasto</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Competencia" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los meses</SelectItem>
            {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" size="sm" className={cn("text-xs", !reportFrom && "text-muted-foreground")}><CalendarIcon className="h-3.5 w-3.5 mr-1" />{reportFrom ? format(reportFrom, 'dd/MM/yyyy') : 'Desde'}</Button></PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={reportFrom} onSelect={setReportFrom} className="p-3 pointer-events-auto" /></PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" size="sm" className={cn("text-xs", !reportTo && "text-muted-foreground")}><CalendarIcon className="h-3.5 w-3.5 mr-1" />{reportTo ? format(reportTo, 'dd/MM/yyyy') : 'Hasta'}</Button></PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={reportTo} onSelect={setReportTo} className="p-3 pointer-events-auto" /></PopoverContent>
        </Popover>
        {(reportFrom || reportTo) && (<Button variant="ghost" size="sm" className="text-xs" onClick={() => { setReportFrom(undefined); setReportTo(undefined); }}>Limpiar fechas</Button>)}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendiente</SelectItem>
            <SelectItem value="pago">Pagado</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-destructive" /></div>
          <div><p className="text-sm text-muted-foreground">Total Gastos (USD) — {monthLabel}</p><p className="text-xl font-bold text-foreground">{formatCurrency(totalUSD)}</p></div>
        </div>
        <div className="bg-card rounded-lg border p-4"><p className="text-sm text-muted-foreground">Registros del mes</p><p className="text-xl font-bold text-foreground">{filtered.length}</p></div>
        <div className="bg-card rounded-lg border p-4"><p className="text-sm text-muted-foreground">Categorías distintas</p><p className="text-xl font-bold text-foreground">{new Set(filtered.map(e => e.categoria)).size}</p></div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="categoria" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort}>Categoría</SortableHeader>
              <SortableHeader field="descricao" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort}>Descripción</SortableHeader>
              <SortableHeader field="valor" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort} className="text-right">Valor Original</SortableHeader>
              <SortableHeader field="moeda" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort}>Moneda</SortableHeader>
              <SortableHeader field="valorUSD" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort} className="text-right">Valor USD</SortableHeader>
              <SortableHeader field="dataVencimento" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort}>Vencimiento</SortableHeader>
              <SortableHeader field="status" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort}>Estado</SortableHeader>
              <SortableHeader field="dataCriacao" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort}>Fecha</SortableHeader>
              <SortableHeader field="" currentField={expSortField} direction={expSortDirection} onToggle={expToggleSort} className="w-24">Acciones</SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(e => (
              <TableRow key={e.id} className={e.status === 'vencido' ? 'bg-destructive/5' : ''}>
                <TableCell><span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">{EXPENSE_CATEGORIES[e.categoria]}</span></TableCell>
                <TableCell>{e.descricao}</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatCurrency(e.valor, e.moeda)}</TableCell>
                <TableCell>{e.moeda}</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatCurrency(e.valorUSD)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.dataVencimento}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.dataCriacao}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={e.status === 'pago' ? 'Marcar Pendiente' : 'Marcar Pagado'} onClick={() => handleToggleStatus(e.id)}>
                      <DollarSign className={cn("h-3.5 w-3.5", e.status === 'pago' ? 'text-success' : 'text-muted-foreground')} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (<TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No hay gastos registrados para este período.</TableCell></TableRow>)}
          </TableBody>
          {filtered.length > 0 && (
            <TableFooter><TableRow><TableCell colSpan={4} className="text-right font-bold">TOTAL USD</TableCell><TableCell className="text-right font-bold">{formatCurrency(totalUSD)}</TableCell><TableCell colSpan={5}></TableCell></TableRow></TableFooter>
          )}
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo Gasto</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1"><Label>Fecha del gasto *</Label>
              <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newExpDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{newExpDate ? format(newExpDate, 'dd/MM/yyyy') : 'Seleccionar fecha'}</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={newExpDate} onSelect={(d) => d && setNewExpDate(d)} initialFocus className="p-3 pointer-events-auto" /></PopoverContent></Popover>
            </div>
            <div className="space-y-1"><Label>Fecha de vencimiento *</Label>
              <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newExpVencimiento && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{newExpVencimiento ? format(newExpVencimiento, 'dd/MM/yyyy') : 'Seleccionar fecha'}</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={newExpVencimiento} onSelect={(d) => d && setNewExpVencimiento(d)} initialFocus className="p-3 pointer-events-auto" /></PopoverContent></Popover>
            </div>
            <div className="space-y-1"><Label>Categoría *</Label>
              <Select value={newExp.categoria} onValueChange={v => setNewExp(p => ({ ...p, categoria: v }))}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1"><Label>Descripción *</Label><Input value={newExp.descricao} onChange={e => setNewExp(p => ({ ...p, descricao: e.target.value }))} placeholder="Detalle del gasto" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Valor *</Label><Input type="number" min={0} step={0.01} value={newExp.valor} onChange={e => setNewExp(p => ({ ...p, valor: Math.max(0, Number(e.target.value)) }))} /></div>
              <div className="space-y-1"><Label>Moneda</Label>
                <Select value={newExp.moeda} onValueChange={v => setNewExp(p => ({ ...p, moeda: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="PYG">PYG</SelectItem></SelectContent></Select>
              </div>
            </div>
            {needsCambio && (
              <div className="space-y-1"><Label>Cambio del día (1 USD = ? {newExp.moeda}) *</Label>
                <Input type="number" min={0} step={1} value={newExp.cambioDia || ''} onChange={e => setNewExp(p => ({ ...p, cambioDia: Math.max(0, Number(e.target.value)) }))} placeholder="Ej: 7500" />
                {newExp.valor > 0 && newExp.cambioDia > 0 && (<p className="text-xs text-muted-foreground mt-1">Equivalente: <span className="font-semibold text-foreground">{formatCurrency(calculatedUSD)}</span> USD</p>)}
              </div>
            )}
            <div className="space-y-1"><Label>Observaciones</Label><Textarea value={newExp.observacoes} onChange={e => setNewExp(p => ({ ...p, observacoes: e.target.value }))} rows={2} placeholder="Opcional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
