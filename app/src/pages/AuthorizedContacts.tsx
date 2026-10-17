import { useStockData } from "@/contexts/StockDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Plus, ShieldCheck, ShieldX, Pencil, Paperclip } from "lucide-react";
import { dbUpdateAuthorizedContact } from "@/data/dbMutations";
import type { AuthorizedContact } from "@/data/types";
import { openStorageFile } from "@/data/billing";
import { formatDate, todayLocal } from "@/lib/dates";
import { parseDbError } from "@/lib/errorMessages";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import FilePreview from "@/components/shared/FilePreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AuthorizedContactForm from "@/components/forms/AuthorizedContactForm";
import SortableHeader from "@/components/shared/SortableHeader";
import { useSortableTable } from "@/hooks/use-sortable-table";

export default function AuthorizedContacts() {
  const { authorizedContacts, clients, refresh } = useStockData();
  const [edit, setEdit] = useState<AuthorizedContact | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isPending = (a: AuthorizedContact) => !a.ativo && !!a.solicitadoPorCliente && !(a.observacoes || "").includes("Baja") && !(a.observacoes || "").includes("Rechazado");
  const pending = authorizedContacts.filter(isPending);

  async function setActive(a: AuthorizedContact, ativo: boolean, note?: string) {
    setBusy(a.id);
    try {
      await dbUpdateAuthorizedContact(a.id, { ativo, ...(note ? { observacoes: `${a.observacoes || ""} [${note} ${formatDate(todayLocal())}]`.trim() } : {}) });
      await refresh();
      toast.success(ativo ? `${a.nome} habilitado` : note === "Rechazado" ? "Solicitud rechazada" : `${a.nome} deshabilitado`);
    } catch (e) { toast.error(parseDbError(e)); } finally { setBusy(null); }
  }
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { sortField, sortDirection, toggleSort } = useSortableTable([], 'nome');

  const filtered = useMemo(() => {
    return authorizedContacts.filter(ac => {
      const s = search.toLowerCase();
      return ac.nome.toLowerCase().includes(s) || ac.documento.includes(s) || ac.email.toLowerCase().includes(s);
    });
  }, [authorizedContacts, search]);

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal = '', bVal = '';
      switch (sortField) {
        case 'nome': aVal = a.nome; bVal = b.nome; break;
        case 'cliente': aVal = clients.find(c => c.id === a.clienteId)?.nomeFantasia || ''; bVal = clients.find(c => c.id === b.clienteId)?.nomeFantasia || ''; break;
        case 'documento': aVal = a.documento; bVal = b.documento; break;
        default: return 0;
      }
      const cmp = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDirection, clients]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Personas autorizadas</h1>
          <p className="text-sm text-muted-foreground">{authorizedContacts.length} contactos registrados</p>
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nueva persona</Button>
      </div>
      {pending.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/5 p-4 space-y-2">
          <h2 className="font-semibold text-sm">Solicitudes de clientes por validar ({pending.length})</h2>
          <p className="text-xs text-muted-foreground">Verifique el documento antes de habilitar: la persona podrá retirar mercadería en nombre del cliente.</p>
          <div className="divide-y">
            {pending.map((a) => (
              <div key={a.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <div className="flex-1 min-w-56"><b>{a.nome}</b> · {a.tipoDocumento} {a.documento} · {clients.find((c) => c.id === a.clienteId)?.nomeFantasia}<div className="text-xs text-muted-foreground">{a.cargo} {a.telefone} {a.email}</div></div>
                {a.fotoDocumentoUrl && !a.fotoDocumentoUrl.startsWith("http") && <Button size="sm" variant="outline" onClick={() => openStorageFile(a.fotoDocumentoUrl!).catch((e) => toast.error(e.message))}><Paperclip className="h-4 w-4 mr-1" />Documento</Button>}
                <Button size="sm" disabled={busy === a.id} onClick={() => setActive(a, true, "Validado")}>Habilitar</Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === a.id} onClick={() => setActive(a, false, "Rechazado")}>Rechazar</Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre, documento o email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="nome" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Nombre</SortableHeader>
              <SortableHeader field="cliente" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Cliente</SortableHeader>
              <SortableHeader field="documento" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Documento</SortableHeader>
              <SortableHeader field="cargo" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Cargo</SortableHeader>
              <SortableHeader field="estado" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Estado</SortableHeader>
              <SortableHeader field="foto" currentField={sortField} direction={sortDirection} onToggle={toggleSort}>Foto</SortableHeader>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(ac => {
              const client = clients.find(c => c.id === ac.clienteId);
              return (
                <TableRow key={ac.id}>
                  <TableCell className="font-medium">{ac.nome}</TableCell>
                  <TableCell className="text-sm">{client?.nomeFantasia}</TableCell>
                  <TableCell className="font-mono text-sm">{ac.tipoDocumento} {ac.documento}</TableCell>
                  <TableCell className="text-sm">{ac.cargo}</TableCell>
                  <TableCell>
                    {ac.ativo ? (
                      <Badge variant="outline" className="border-green-500 text-green-700"><ShieldCheck className="h-3 w-3 mr-1" />Activo</Badge>
                    ) : isPending(ac) ? (
                      <Badge variant="outline" className="border-warning text-warning">Por validar</Badge>
                    ) : (
                      <Badge variant="outline" className="border-destructive text-destructive"><ShieldX className="h-3 w-3 mr-1" />Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {ac.fotoAutorizadoUrl && <FilePreview url={ac.fotoAutorizadoUrl} label="Foto" size="sm" />}
                      {ac.fotoDocumentoUrl ? (ac.fotoDocumentoUrl.startsWith("http") ? <FilePreview url={ac.fotoDocumentoUrl} label="Doc" size="sm" /> :
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openStorageFile(ac.fotoDocumentoUrl!).catch((e) => toast.error(e.message))}><Paperclip className="h-4 w-4" /></Button>) : '—'}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Editar" onClick={() => setEdit(ac)}><Pencil className="h-4 w-4" /></Button>
                    {!isPending(ac) && <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy === ac.id} onClick={() => setActive(ac, !ac.ativo, ac.ativo ? "Deshabilitado por StockFlex" : "Habilitado")}>{ac.ativo ? "Deshabilitar" : "Habilitar"}</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <AuthorizedContactForm open={formOpen} onOpenChange={setFormOpen} />
      <EditContact contact={edit} onClose={() => setEdit(null)} onSaved={refresh} />
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Documento</DialogTitle></DialogHeader>
          {previewImage && <img src={previewImage} alt="Documento" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function EditContact({ contact, onClose, onSaved }: { contact: AuthorizedContact | null; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [v, setV] = useState({ nome: "", cargo: "", telefone: "", email: "", observacoes: "" });
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (contact && loadedFor !== contact.id) {
    setLoadedFor(contact.id);
    setV({ nome: contact.nome, cargo: contact.cargo || "", telefone: contact.telefone || "", email: contact.email || "", observacoes: contact.observacoes || "" });
  }
  if (!contact && loadedFor) setLoadedFor(null);
  async function save() {
    if (!contact) return;
    if (v.nome.trim().length < 3) return toast.error("Nombre inválido");
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return toast.error("Correo inválido");
    setSaving(true);
    try {
      await dbUpdateAuthorizedContact(contact.id, { nome: v.nome.trim(), cargo: v.cargo.trim(), telefone: v.telefone.trim(), email: v.email.trim(), observacoes: v.observacoes.trim() });
      await onSaved();
      toast.success("Datos actualizados");
      onClose();
    } catch (e) { toast.error(parseDbError(e)); } finally { setSaving(false); }
  }
  return (
    <Dialog open={!!contact} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar {contact?.nome}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">El documento ({contact?.tipoDocumento} {contact?.documento}) no se modifica: si cambió, registre a la persona de nuevo.</p>
        <div className="space-y-2">
          {(["nome", "cargo", "telefone", "email", "observacoes"] as const).map((k) => (
            <div key={k}><Label htmlFor="f162-15">{{ nome: "Nombre", cargo: "Cargo", telefone: "Teléfono", email: "Correo", observacoes: "Observaciones" }[k]}</Label>
              <Input id="f162-15" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} /></div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving}>Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
