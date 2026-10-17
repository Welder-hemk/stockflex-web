import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useStockData } from "@/contexts/StockDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import PasswordStrengthBar from "@/components/shared/PasswordStrengthBar";
import { isPasswordValid, getPasswordErrors } from "@/lib/passwordValidation";
import { Plus, Pencil, Trash2, Shield, Users, UserCog, UserCircle, Eye, Loader2, KeyRound, Mail } from "lucide-react";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  operador: "Operador",
  financeiro: "Financiero",
  cliente: "Cliente",
};

const ROLE_ICONS: Record<UserRole, React.ElementType> = {
  admin: Shield,
  operador: UserCog,
  financeiro: Users,
  cliente: UserCircle,
};

type FormData = {
  nome: string;
  email: string;
  password: string;
  role: UserRole;
  clienteId: string;
  ativo: boolean;
};

const emptyForm: FormData = { nome: "", email: "", password: "", role: "operador", clienteId: "", ativo: true };

export default function UserManagement() {
  const { users, addUser, updateUser, deleteUser, refreshUsers, user: currentUser } = useAuth();
  const { clients } = useStockData();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (u: typeof users[0]) => {
    setEditingId(u.id);
    setForm({ nome: u.nome, email: u.email, password: "", role: u.role, clienteId: u.clienteId || "", ativo: u.ativo });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.email.trim()) {
      toast({ title: "Error", description: "Nombre y correo son obligatorios.", variant: "destructive" });
      return;
    }
    if (!editingId && !form.password.trim()) {
      toast({ title: "Error", description: "La contraseña es obligatoria para nuevos usuarios.", variant: "destructive" });
      return;
    }
    // Validate password strength when setting a password
    if (form.password.trim() && !isPasswordValid(form.password)) {
      const errors = getPasswordErrors(form.password);
      toast({ title: "Contraseña insegura", description: errors.join(", "), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const data: any = { nome: form.nome, email: form.email, role: form.role, ativo: form.ativo };
        if (form.role === "cliente") data.clienteId = form.clienteId || undefined;
        else data.clienteId = undefined;
        if (form.password.trim()) data.password = form.password;
        await updateUser(editingId, data);
        toast({ title: "Usuario actualizado" });
      } else {
        await addUser({
          nome: form.nome,
          email: form.email,
          password: form.password,
          role: form.role,
          clienteId: form.role === "cliente" ? form.clienteId || undefined : undefined,
          ativo: form.ativo,
        });
        toast({ title: "Usuario creado" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al guardar usuario", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (id === currentUser?.id) {
      toast({ title: "Error", description: "No puede eliminar su propio usuario.", variant: "destructive" });
      return;
    }
    try {
      await deleteUser(id);
      setDeleteConfirm(null);
      toast({ title: "Usuario eliminado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    if (id === currentUser?.id) {
      toast({ title: "Error", description: "No puede desactivar su propio usuario.", variant: "destructive" });
      return;
    }
    try {
      await updateUser(id, { ativo });
      toast({ title: ativo ? "Usuario activado" : "Usuario desactivado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleForceReset = async (userEmail: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
      });
      if (error) throw error;
      toast({ title: "Enlace enviado", description: `Se envió un enlace de recuperación a ${userEmail}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filtered = filterRole === "all" ? users : users.filter(u => u.role === filterRole);
  const countByRole = (role: UserRole) => users.filter(u => u.role === role).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
          <p className="text-muted-foreground text-sm">Control de accesos y permisos</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Usuario
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["admin", "operador", "financeiro", "cliente"] as UserRole[]).map(role => {
          const Icon = ROLE_ICONS[role];
          return (
            <Card key={role} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterRole(filterRole === role ? "all" : role)}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`p-2 rounded-lg ${filterRole === role ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{countByRole(role)}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}s</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los perfiles</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="operador">Operador</SelectItem>
            <SelectItem value="financeiro">Financiero</SelectItem>
            <SelectItem value="cliente">Cliente</SelectItem>
          </SelectContent>
        </Select>
        {filterRole !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilterRole("all")}>Limpiar filtro</Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usuarios ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Vínculo Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => {
                  const clientName = u.clienteId ? clients.find(c => c.id === u.clienteId)?.nomeFantasia : "—";
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <TableRow key={u.id} className={!u.ativo ? "opacity-50" : ""}>
                      <TableCell className="font-medium">
                        {u.nome}
                        {!u.ativo && <Badge variant="destructive" className="ml-2 text-[10px]">Bloqueado</Badge>}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>{clientName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.ativo}
                            onCheckedChange={(v) => handleToggleAtivo(u.id, v)}
                            disabled={isSelf}
                          />
                          <span className={`text-xs ${u.ativo ? "text-green-600" : "text-muted-foreground"}`}>
                            {u.ativo ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleForceReset(u.email)} title="Forzar reset de contraseña">
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/usuarios/${u.id}`)} title="Ver historial de sesiones">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!isSelf && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(u.id)} title="Eliminar" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No se encontraron usuarios
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nombre completo" />
            </div>
            <div>
              <Label>Correo Electrónico</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@ejemplo.com" />
            </div>
            <div>
              <Label>{editingId ? "Nueva Contraseña (dejar vacío para mantener)" : "Contraseña"}</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              <PasswordStrengthBar password={form.password} />
            </div>
            <div>
              <Label>Perfil de Acceso</Label>
              <Select value={form.role} onValueChange={(v: UserRole) => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="operador">Operador</SelectItem>
                  <SelectItem value="financeiro">Financiero</SelectItem>
                  <SelectItem value="cliente">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "cliente" && (
              <div>
                <Label>Vincular al Cliente</Label>
                <Select value={form.clienteId} onValueChange={v => setForm(f => ({ ...f, clienteId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione el cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} />
              <Label>Usuario activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingId ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">¿Está seguro que desea eliminar este usuario? Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
