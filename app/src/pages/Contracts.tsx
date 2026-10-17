import { useStockData } from "@/contexts/StockDataContext";
import { formatCurrency } from "@/lib/formatters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import StatusBadge from "@/components/shared/StatusBadge";
import { useState } from "react";
import { motion } from "framer-motion";
import ContractForm from "@/components/forms/ContractForm";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Contract } from "@/data/types";

export default function Contracts() {
  const { user } = useAuth();
  const { clients, contracts } = useStockData();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editContract, setEditContract] = useState<Contract | undefined>(undefined);
  const [alertContract, setAlertContract] = useState<Contract | null>(null);

  const filtered = contracts.filter(c => {
    const client = clients.find(cl => cl.id === c.clienteId);
    return c.numero.toLowerCase().includes(search.toLowerCase()) ||
      (client?.nomeFantasia || '').toLowerCase().includes(search.toLowerCase());
  });

  const handleEditClick = (c: Contract) => { setAlertContract(c); };
  const handleConfirmEdit = () => {
    if (alertContract) { setEditContract(alertContract); setAlertContract(null); setFormOpen(true); }
  };
  const handleFormClose = (open: boolean) => { setFormOpen(open); if (!open) setEditContract(undefined); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contratos</h1>
          <p className="text-sm text-muted-foreground">{contracts.length} contratos</p>
        </div>
        <Button onClick={() => { setEditContract(undefined); setFormOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nuevo Contrato</Button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por número o cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contrato</TableHead><TableHead>Cliente</TableHead><TableHead>Estado</TableHead>
              <TableHead>Período</TableHead><TableHead>Posiciones</TableHead><TableHead>Utilización</TableHead>
              <TableHead>Valor/Mes</TableHead>{isAdmin && <TableHead className="w-16"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => {
              const client = clients.find(cl => cl.id === c.clienteId);
              const usage = c.posicoesContratadas > 0 ? Math.round((c.posicoesOcupadas / c.posicoesContratadas) * 100) : 0;
              const valorMes = c.posicoesContratadas * c.precoPorPosicao;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium text-sm">{c.numero}</TableCell>
                  <TableCell>{client?.nomeFantasia}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.dataInicio} → {c.dataTermino}</TableCell>
                  <TableCell><span className="font-medium">{c.posicoesOcupadas}</span><span className="text-muted-foreground">/{c.posicoesContratadas}</span></TableCell>
                  <TableCell><div className="flex items-center gap-2"><Progress value={usage} className="h-2 w-20" /><span className="text-xs text-muted-foreground">{usage}%</span></div></TableCell>
                  <TableCell className="font-medium">{formatCurrency(valorMes, c.moeda)}</TableCell>
                  {isAdmin && (<TableCell><Button variant="ghost" size="icon" onClick={() => handleEditClick(c)} title="Editar contrato"><Pencil className="h-4 w-4" /></Button></TableCell>)}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ContractForm open={formOpen} onOpenChange={handleFormClose} editContract={editContract} />
      <AlertDialog open={!!alertContract} onOpenChange={(open) => { if (!open) setAlertContract(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Editar contrato activo?</AlertDialogTitle>
            <AlertDialogDescription>Editar un contrato activo puede afectar la facturación y los cálculos de cierre mensual. ¿Desea continuar?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEdit}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
