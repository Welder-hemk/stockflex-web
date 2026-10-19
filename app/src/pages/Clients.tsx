import { formatDate } from "@/lib/dates";
import { supabase } from "@/integrations/supabase/client";
import { useStockData } from "@/contexts/StockDataContext";
import { dbUpdateClient } from "@/data/dbMutations";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Plus, FileSignature, FilePlus2, Pencil, XCircle, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import StatusBadge from "@/components/shared/StatusBadge";
import SortableHeader from "@/components/shared/SortableHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import ClientForm from "@/components/forms/ClientForm";
import ContractForm from "@/components/forms/ContractForm";
import ContractDocDialog from "@/components/contracts/ContractDocDialog";
import AmendmentDialog from "@/components/contracts/AmendmentDialog";
import { amendmentCounts } from "@/data/amendments";
import { todayLocal } from "@/lib/dates";
import { DocStateBadge } from "@/components/contracts/ContractFiles";
import { formatMoney } from "@/lib/formatters";
import { toast } from "sonner";
import { parseDbError } from "@/lib/errorMessages";
import { contractTotalPositions, type Client, type Contract } from "@/data/types";
import { useSortableTable } from "@/hooks/use-sortable-table";

export default function Clients() {
  const { clients, contracts, amendments, pallets, refresh } = useStockData();
  const [searchClients, setSearchClients] = useState("");
  const [searchContracts, setSearchContracts] = useState("");
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [editContract, setEditContract] = useState<Contract | undefined>(undefined);
  const [editAlertOpen, setEditAlertOpen] = useState(false);
  const [pendingEditContract, setPendingEditContract] = useState<Contract | null>(null);
  const [closeAlertOpen, setCloseAlertOpen] = useState(false);
  const [pendingCloseContract, setPendingCloseContract] = useState<Contract | null>(null);
  const [toggleClient, setToggleClient] = useState<Client | null>(null);
  const [editClient, setEditClient] = useState<Client | undefined>(undefined);
  const [showInactive, setShowInactive] = useState(false);
  const [docContract, setDocContract] = useState<Contract | null>(null);
  const [amendContract, setAmendContract] = useState<Contract | null>(null);

  const clientSort = useSortableTable([], 'nomeFantasia');
  const contractSort = useSortableTable([], 'numero');

  const filteredClients = clients.filter(c => (showInactive || c.ativo !== false) && (
    c.razaoSocial.toLowerCase().includes(searchClients.toLowerCase()) ||
    c.nomeFantasia.toLowerCase().includes(searchClients.toLowerCase()) ||
    (c.codigo || '').toLowerCase().includes(searchClients.toLowerCase()) ||
    c.rucCnpj.includes(searchClients)
  ));

  const sortedClients = useMemo(() => {
    if (!clientSort.sortField) return filteredClients;
    return [...filteredClients].sort((a, b) => {
      let aVal = '', bVal = '';
      switch (clientSort.sortField) {
        case 'nomeFantasia': aVal = a.nomeFantasia; bVal = b.nomeFantasia; break;
        case 'razaoSocial': aVal = a.razaoSocial; bVal = b.razaoSocial; break;
        case 'rucCnpj': aVal = a.rucCnpj; bVal = b.rucCnpj; break;
        case 'contato': aVal = a.contato; bVal = b.contato; break;
        default: return 0;
      }
      const cmp = aVal.localeCompare(bVal);
      return clientSort.sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredClients, clientSort.sortField, clientSort.sortDirection]);

  const filteredContracts = contracts.filter(c => {
    const client = clients.find(cl => cl.id === c.clienteId);
    return c.numero.toLowerCase().includes(searchContracts.toLowerCase()) ||
      (client?.nomeFantasia || '').toLowerCase().includes(searchContracts.toLowerCase());
  });

  const sortedContracts = useMemo(() => {
    if (!contractSort.sortField) return filteredContracts;
    return [...filteredContracts].sort((a, b) => {
      let aVal: string | number = '', bVal: string | number = '';
      switch (contractSort.sortField) {
        case 'numero': aVal = a.numero; bVal = b.numero; break;
        case 'cliente': aVal = clients.find(c => c.id === a.clienteId)?.nomeFantasia || ''; bVal = clients.find(c => c.id === b.clienteId)?.nomeFantasia || ''; break;
        case 'status': aVal = a.status; bVal = b.status; break;
        case 'dataTermino': aVal = a.dataTermino; bVal = b.dataTermino; break;
        case 'posicoes': aVal = contractTotalPositions(a); bVal = contractTotalPositions(b); break;
        case 'valor': aVal = a.posicoesContratadas * a.precoPorPosicao; bVal = b.posicoesContratadas * b.precoPorPosicao; break;
        case 'contrato_firmado': { const o = ['borrador', 'para_firma', 'aceptado', 'firmado']; aVal = o.indexOf(a.docEstado || 'borrador'); bVal = o.indexOf(b.docEstado || 'borrador'); break; }
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') return contractSort.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      const cmp = String(aVal).localeCompare(String(bVal));
      return contractSort.sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredContracts, contractSort.sortField, contractSort.sortDirection, clients]);

  async function handleCloseContract() {
    if (!pendingCloseContract) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("close_contract", { p_contract_id: pendingCloseContract.id, p_fecha: null });
      if (error) throw new Error(error.message);
      await refresh();
      toast.success(`Contrato ${pendingCloseContract.numero} cerrado`, { description: `Término ${formatDate(data.fecha)}. El último mes se factura proporcional.` });
    } catch (err) {
      toast.error(parseDbError(err));
    }
    setCloseAlertOpen(false);
    setPendingCloseContract(null);
  }

  async function handleToggleClient() {
    if (!toggleClient) return;
    const deactivating = toggleClient.ativo !== false;
    if (deactivating && contracts.some((c) => c.clienteId === toggleClient.id && c.status === "ativo")) {
      toast.error("El cliente tiene contratos activos. Ciérrelos antes de desactivarlo.");
      setToggleClient(null);
      return;
    }
    try {
      await dbUpdateClient(toggleClient.id, { ativo: !deactivating });
      await refresh();
      toast.success(deactivating ? "Cliente desactivado: se conserva su historial" : "Cliente reactivado");
    } catch (err) {
      toast.error(parseDbError(err));
    }
    setToggleClient(null);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-sm text-muted-foreground">{clients.filter((c) => c.ativo !== false).length} clientes activos · {contracts.filter((c) => c.status === "ativo").length} contratos activos</p>
      </div>

      <Tabs defaultValue="clientes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nombre, fantasía o RUC..." value={searchClients} onChange={e => setSearchClients(e.target.value)} className="pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver inactivos</label>
            <Button onClick={() => { setEditClient(undefined); setClientFormOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nuevo cliente</Button>
          </div>

          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader field="nomeFantasia" currentField={clientSort.sortField} direction={clientSort.sortDirection} onToggle={clientSort.toggleSort}>Nombre Fantasía</SortableHeader>
                  <SortableHeader field="razaoSocial" currentField={clientSort.sortField} direction={clientSort.sortDirection} onToggle={clientSort.toggleSort}>Razón Social</SortableHeader>
                  <SortableHeader field="rucCnpj" currentField={clientSort.sortField} direction={clientSort.sortDirection} onToggle={clientSort.toggleSort}>RUC/CNPJ</SortableHeader>
                  <SortableHeader field="contato" currentField={clientSort.sortField} direction={clientSort.sortDirection} onToggle={clientSort.toggleSort}>Contacto</SortableHeader>
                  <SortableHeader field="contratos" currentField={clientSort.sortField} direction={clientSort.sortDirection} onToggle={clientSort.toggleSort}>Contratos</SortableHeader>
                  <SortableHeader field="categoria" currentField={clientSort.sortField} direction={clientSort.sortDirection} onToggle={clientSort.toggleSort}>Categoría</SortableHeader>
                  <SortableHeader field="acciones" currentField={clientSort.sortField} direction={clientSort.sortDirection} onToggle={clientSort.toggleSort} className="w-16">Acciones</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClients.map(c => (
                  <TableRow key={c.id} className={c.ativo === false ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{c.nomeFantasia}<div className="text-xs text-muted-foreground font-mono">{c.codigo}{c.ativo === false ? " · inactivo" : ""}</div></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.razaoSocial}</TableCell>
                    <TableCell className="font-mono text-sm">{c.rucCnpj}</TableCell>
                    <TableCell>
                      <div className="text-sm">{c.contato}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </TableCell>
                    <TableCell>{contracts.filter(ct => ct.clienteId === c.id).length}</TableCell>
                    <TableCell className="text-sm">{c.categoriaMercadoria}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" title="Editar cliente" onClick={() => { setEditClient(c); setClientFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className={`h-7 px-2 ${c.ativo === false ? "" : "text-destructive hover:text-destructive"}`} title={c.ativo === false ? "Reactivar" : "Desactivar"} onClick={() => setToggleClient(c)}>
                          {c.ativo === false ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="contratos" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por número o cliente..." value={searchContracts} onChange={e => setSearchContracts(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => setContractFormOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nuevo contrato</Button>
          </div>

          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader field="numero" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Contrato</SortableHeader>
                  <SortableHeader field="cliente" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Cliente</SortableHeader>
                  <SortableHeader field="status" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Estado</SortableHeader>
                  <SortableHeader field="dataTermino" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Período</SortableHeader>
                  <SortableHeader field="posicoes" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Posiciones</SortableHeader>
                  <SortableHeader field="valor" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Utilización</SortableHeader>
                  <SortableHeader field="valor" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Valor/Mes</SortableHeader>
                  <SortableHeader field="contrato_firmado" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort}>Documento</SortableHeader>
                  <SortableHeader field="acciones" currentField={contractSort.sortField} direction={contractSort.sortDirection} onToggle={contractSort.toggleSort} className="w-16">Acciones</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContracts.map(c => {
                  const client = clients.find(cl => cl.id === c.clienteId);
                  const usage = contractTotalPositions(c) > 0 ? Math.round((c.posicoesOcupadas / contractTotalPositions(c)) * 100) : 0;
                  const valorMes = c.posicoesContratadas * (c.precoPorPosicao + (c.recargoPorPosicao ?? 0)) + (c.valorAdicional || 0);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium text-sm">{c.numero}</TableCell>
                      <TableCell>{client?.nomeFantasia}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(c.dataInicio)} → {formatDate(c.dataTermino)}</TableCell>
                      <TableCell>
                        <span className="font-medium">{c.posicoesOcupadas}</span>
                        <span className="text-muted-foreground">/{contractTotalPositions(c)}</span>{c.posicoesAdicionais ? <span className="ml-1 text-[11px] text-primary" title="Posiciones por adenda">(+{c.posicoesAdicionais} adenda)</span> : null}
                        {amendments.filter((a) => a.contratoId === c.id && amendmentCounts(a) && a.fechaInicio > todayLocal()).map((a) => (
                          <div key={a.id} className="text-[11px] text-primary">+{a.posiciones} desde {formatDate(a.fechaInicio)}</div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={usage} className="h-2 w-20" />
                          <span className="text-xs text-muted-foreground">{usage}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{formatMoney(valorMes, c.moeda)}</TableCell>
                      <TableCell>
<button onClick={() => setDocContract(c)} title="Abrir documento del contrato"><DocStateBadge estado={c.docEstado} /></button>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="Editar contrato" onClick={() => { setPendingEditContract(c); setEditAlertOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="Documento, firma y anexos" onClick={() => setDocContract(c)}><FileSignature className="h-4 w-4" /></Button>
                          {c.status === 'ativo' && <Button size="sm" variant="ghost" className="h-7 px-2" title="Adenda: agregar posiciones" onClick={() => setAmendContract(c)}><FilePlus2 className="h-4 w-4" /></Button>}
                          {c.status === 'ativo' && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" title="Cerrar contrato" onClick={() => { setPendingCloseContract(c); setCloseAlertOpen(true); }}><XCircle className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <ClientForm open={clientFormOpen} onOpenChange={(o) => { setClientFormOpen(o); if (!o) setEditClient(undefined); }} editClient={editClient} />
      <ContractForm open={contractFormOpen} onOpenChange={(o) => { setContractFormOpen(o); if (!o) setEditContract(undefined); }} editContract={editContract} />

      <AlertDialog open={editAlertOpen} onOpenChange={setEditAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar Contrato</AlertDialogTitle>
            <AlertDialogDescription>¿Desea modificar el contrato {pendingEditContract?.numero}? Los cambios generarán una adenda contractual para firma.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setEditAlertOpen(false); setPendingEditContract(null); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setEditAlertOpen(false); if (pendingEditContract) { setEditContract(pendingEditContract); setContractFormOpen(true); } setPendingEditContract(null); }}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={closeAlertOpen} onOpenChange={setCloseAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cerrar contrato</AlertDialogTitle>
            {(() => {
              const linkedPallets = pendingCloseContract ? pallets.filter(p => p.contratoId === pendingCloseContract.id && p.status !== 'expedido') : [];
              const hasLinkedPallets = linkedPallets.length > 0;
              return hasLinkedPallets ? (
                <AlertDialogDescription className="text-destructive font-medium">
                  No es posible cerrar el contrato <strong>{pendingCloseContract?.numero}</strong>. Existen {linkedPallets.length} pallet(s) vinculados con estado activo. Retire los pallets antes de proceder.
                </AlertDialogDescription>
              ) : (
                <AlertDialogDescription>¿Cerrar el contrato <strong>{pendingCloseContract?.numero}</strong> hoy? El término pasa a la fecha de hoy y el último mes se factura proporcional a los días. Los borradores de meses siguientes se eliminan.</AlertDialogDescription>
              );
            })()}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCloseAlertOpen(false); setPendingCloseContract(null); }}>Cancelar</AlertDialogCancel>
            {(() => {
              const linkedPallets = pendingCloseContract ? pallets.filter(p => p.contratoId === pendingCloseContract.id && p.status !== 'expedido') : [];
              return linkedPallets.length === 0 && (
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCloseContract}>Cerrar contrato</AlertDialogAction>
              );
            })()}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AmendmentDialog open={!!amendContract} onOpenChange={(o) => !o && setAmendContract(null)} contract={amendContract ? contracts.find((x) => x.id === amendContract.id) || amendContract : null} client={clients.find((x) => x.id === amendContract?.clienteId)} />
      <ContractDocDialog open={!!docContract} onOpenChange={(o) => !o && setDocContract(null)} contract={docContract} client={clients.find((x) => x.id === docContract?.clienteId)} />

      <AlertDialog open={!!toggleClient} onOpenChange={(o) => !o && setToggleClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleClient?.ativo === false ? "Reactivar cliente" : "Desactivar cliente"}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggleClient?.ativo === false ? `${toggleClient?.nomeFantasia} vuelve a aparecer para nuevos contratos e ingresos.` :
                `${toggleClient?.nomeFantasia} deja de aparecer para nuevos contratos e ingresos. Su historial (contratos, movimientos y facturas) se conserva.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleClient}>{toggleClient?.ativo === false ? "Reactivar" : "Desactivar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
