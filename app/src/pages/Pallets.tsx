import { formatDate, todayLocal } from "@/lib/dates";
import { useStockData } from "@/contexts/StockDataContext";
import { Checkbox } from "@/components/ui/checkbox";
import { formatNumber } from "@/lib/formatters";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Plus, FileDown, Printer, Loader2 } from "lucide-react";
import TableSkeleton from "@/components/shared/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge, { statusLabels } from "@/components/shared/StatusBadge";
import SortableHeader from "@/components/shared/SortableHeader";
import TablePagination from "@/components/shared/TablePagination";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import PalletForm from "@/components/forms/PalletForm";
import { labelFor } from "@/data/operations";
import { printLabels } from "@/lib/print/documents";
import { usePaginatedQuery, type PaginationFilter } from "@/hooks/use-paginated-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { positionLabel } from "@/data/types";

export default function Pallets() {
  const { clients, contracts, authorizedContacts, warehouses, multiWarehouse } = useStockData();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filterCliente, setFilterCliente] = useState("");
  const [filterDeposito, setFilterDeposito] = useState("");

  const { sortField, sortDirection, toggleSort } = useSortableTable([], 'dataEntrada', 'desc');

  // Build server-side filters
  const filters = useMemo(() => {
    const f: PaginationFilter[] = [];
    if (filterCliente) f.push({ column: 'cliente_id', operator: 'eq', value: filterCliente });
    if (search) f.push({ column: 'descricao', operator: 'ilike', value: `%${search}%` });
    // Filtro por depósito no banco (antes era só na página carregada)
    if (filterDeposito) f.push({ column: 'localizacao', operator: 'like', value: `${filterDeposito}:%` });
    return f;
  }, [filterCliente, search, filterDeposito]);

  // Map sort fields to DB columns
  const orderColumn = useMemo(() => {
    const map: Record<string, string> = {
      id: 'id', descricao: 'descricao', peso: 'peso', localizacao: 'localizacao',
      status: 'status', dataEntrada: 'data_entrada', seguro: 'seguro',
    };
    return map[sortField || 'dataEntrada'] || 'data_entrada';
  }, [sortField]);

  const { data: rawPallets, totalCount, totalPages, page, pageSize, loading, setPage, setPageSize, refresh: refreshPallets } = usePaginatedQuery(
    'pallets',
    filters,
    { column: orderColumn, ascending: sortDirection === 'asc' },
    25
  );

  // Map DB rows to frontend shape
  const pallets = useMemo(() => rawPallets.map((p: any) => ({
    id: p.id, clienteId: p.cliente_id, contratoId: p.contrato_id, sku: p.sku,
    descricao: p.descricao, lote: p.lote, quantidade: p.quantidade, peso: p.peso,
    valorDeclarado: p.valor_declarado, status: p.status, localizacao: p.localizacao,
    localizacao2: p.localizacao2, dataEntrada: p.data_entrada, ultimaMovimentacao: p.ultima_movimentacao,
    largo: p.largo, ancho: p.ancho, alto: p.alto, seguro: p.seguro, palletDuplo: p.pallet_duplo,
  })), [rawPallets]);

  const filtered = pallets;

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16); doc.text("Reporte de Pallets", 14, 15);
    doc.setFontSize(9);
    const filtersArr: string[] = [];
    if (filterCliente) { const c = clients.find(cl => cl.id === filterCliente); filtersArr.push(`Cliente: ${c?.nomeFantasia}`); }
    if (filterDeposito) { const w = warehouses.find(x => x.id === filterDeposito); filtersArr.push(`Depósito: ${w?.name || ''}`); }
    if (search) filtersArr.push(`Búsqueda: ${search}`);
    doc.text(filtersArr.length ? filtersArr.join(' | ') : 'Sin filtros', 14, 22);
    doc.text(`Total: ${filtered.length} pallets (página ${page}) — Generado: ${new Date().toLocaleDateString('es-PY')}`, 14, 28);
    autoTable(doc, {
      startY: 33,
      head: [['Código', 'Cliente', 'Descripción', 'Peso (kg)', 'Tamaño (cm)', 'Ubicación', 'Estado', 'Ingreso']],
      body: filtered.map((p: any) => {
        const client = clients.find(c => c.id === p.clienteId);
        return [p.sku || p.id.slice(0, 8), client?.nomeFantasia || '', p.descricao, formatNumber(p.peso), `${p.largo || '-'}×${p.ancho || '-'}×${p.alto || '-'}`, positionLabel(p.localizacao, multiWarehouse), statusLabels[p.status] || p.status, formatDate(p.dataEntrada)];
      }),
      styles: { fontSize: 8 }, headStyles: { fillColor: [41, 128, 185] },
    });
    doc.save(`pallets_${todayLocal()}.pdf`);
  };

  const exportExcel = () => {
    const data = filtered.map((p: any) => {
      const client = clients.find(c => c.id === p.clienteId);
      return { Código: p.sku, Cliente: client?.nomeFantasia || '', Descripción: p.descricao, 'Peso (kg)': p.peso, 'Largo (cm)': p.largo || '', 'Ancho (cm)': p.ancho || '', 'Alto (cm)': p.alto || '', Ubicación: positionLabel(p.localizacao, true), Estado: statusLabels[p.status] || p.status, Ingreso: formatDate(p.dataEntrada) };
    });
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pallets"); XLSX.writeFile(wb, `pallets_${todayLocal()}.xlsx`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pallets</h1>
          <p className="text-sm text-muted-foreground">{totalCount} pallets registrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={filtered.length === 0}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={filtered.length === 0}><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
          <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nuevo Pallet</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descripción..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterCliente} onValueChange={v => setFilterCliente(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todos los clientes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos los clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}
          </SelectContent>
        </Select>
        {multiWarehouse && (
          <Select value={filterDeposito || '_all'} onValueChange={v => setFilterDeposito(v === '_all' ? '' : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todos los depósitos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos los depósitos</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={w.code}>{w.code} · {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="id" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>ID</SortableHeader>
              <SortableHeader field="cliente" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Cliente</SortableHeader>
              <SortableHeader field="descricao" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Descripción</SortableHeader>
              <SortableHeader field="peso" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Peso (kg)</SortableHeader>
              <SortableHeader field="localizacao" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Ubicación</SortableHeader>
              <SortableHeader field="status" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Estado</SortableHeader>
              <SortableHeader field="seguro" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Seguro</SortableHeader>
              <SortableHeader field="dataEntrada" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Ingreso</SortableHeader>
              <SortableHeader field="" currentField={sortField} direction={sortDirection} onToggle={toggleSort} className="w-12">{""}</SortableHeader>
            </TableRow>
          </TableHeader>
          {loading ? <TableSkeleton columns={9} rows={pageSize > 10 ? 10 : pageSize} /> : (
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No se encontraron pallets.</TableCell></TableRow>
            )}
            {filtered.map((p: any) => {
              const client = clients.find(c => c.id === p.clienteId);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-mono font-medium text-sm">{p.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm">{client?.nomeFantasia}</TableCell>
                  <TableCell className="text-sm">{p.descricao}</TableCell>
                  <TableCell>{formatNumber(p.peso)}</TableCell>
                  <TableCell className="font-mono text-sm">{positionLabel(p.localizacao, multiWarehouse)}{p.localizacao2 ? ` / ${positionLabel(p.localizacao2, false)}` : ""}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell><Checkbox checked={p.seguro} disabled /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.dataEntrada}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" title="Imprimir etiqueta" onClick={() => printLabels([labelFor(p, { clients, contracts, authorizedContacts })])} disabled={p.status === 'expedido'}><Printer className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          )}
        </Table>
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
      <PalletForm open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) refreshPallets(); }} />
    </motion.div>
  );
}
