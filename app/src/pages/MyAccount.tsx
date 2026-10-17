import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import PasswordStrengthBar from "@/components/shared/PasswordStrengthBar";
import { isPasswordValid, getPasswordErrors } from "@/lib/passwordValidation";
import { User, Lock, History, Loader2, Save, Shield } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operador: "Operador",
  financeiro: "Financiero",
  cliente: "Cliente",
};

export default function MyAccount() {
  const { user, sessionLogs } = useAuth();
  const [nome, setNome] = useState(user?.nome || "");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) setNome(user.nome);
  }, [user]);

  const handleSaveName = async () => {
    if (!nome.trim()) {
      toast({ title: "Error", description: "El nombre no puede estar vacío", variant: "destructive" });
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ nome: nome.trim() })
        .eq("id", user!.id);
      if (error) throw error;
      toast({ title: "Nombre actualizado correctamente" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast({ title: "Error", description: "Ingrese su contraseña actual", variant: "destructive" });
      return;
    }
    if (!isPasswordValid(newPassword)) {
      const errors = getPasswordErrors(newPassword);
      toast({ title: "Contraseña insegura", description: errors.join(", "), variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }

    setSavingPassword(true);
    try {
      // Verify current password by trying to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user!.email,
        password: currentPassword,
      });
      if (signInError) {
        toast({ title: "Error", description: "Contraseña actual incorrecta", variant: "destructive" });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({ title: "Contraseña actualizada correctamente" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const myLogs = sessionLogs
    .filter((l) => l.userId === user?.id)
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi Cuenta</h1>
        <p className="text-muted-foreground text-sm">Gestione su información personal y seguridad</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" /> Información Personal
            </CardTitle>
            <CardDescription>Actualice su nombre de usuario</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Correo Electrónico</Label>
              <Input value={user?.email || ""} disabled className="bg-muted" />
              <p className="text-[11px] text-muted-foreground">El correo no puede ser modificado. Contacte al administrador.</p>
            </div>
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Su nombre" />
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1">
                <Shield className="h-3 w-3" />
                {ROLE_LABELS[user?.role || "operador"]}
              </Badge>
            </div>
            <Separator />
            <Button onClick={handleSaveName} disabled={savingName} className="gap-2">
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Nombre
            </Button>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5" /> Cambiar Contraseña
            </CardTitle>
            <CardDescription>Actualice su contraseña de acceso</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Contraseña Actual</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>Nueva Contraseña</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
              <PasswordStrengthBar password={newPassword} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar Nueva Contraseña</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
              )}
            </div>
            <Separator />
            <Button onClick={handleChangePassword} disabled={savingPassword} className="gap-2">
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Actualizar Contraseña
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" /> Historial de Sesiones
          </CardTitle>
          <CardDescription>Últimas 20 sesiones de su cuenta</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha y Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myLogs.map((log, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant={log.tipo === "login" ? "default" : "secondary"}>
                        {log.tipo === "login" ? "Inicio de sesión" : "Cierre de sesión"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.dataHora}</TableCell>
                  </TableRow>
                ))}
                {myLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-6 text-muted-foreground">
                      No hay registros de sesiones
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
