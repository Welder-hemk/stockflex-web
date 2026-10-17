import { useParams, useNavigate } from "react-router-dom";
import { useAuth, UserRole, SessionLog } from "@/contexts/AuthContext";
import { useStockData } from "@/contexts/StockDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, LogIn, LogOut, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  operador: "Operador",
  financeiro: "Financiero",
  cliente: "Cliente",
};

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { users, sessionLogs, refreshUsers } = useAuth();
  const { clients } = useStockData();
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const targetUser = users.find(u => u.id === userId);
  const clientName = targetUser?.clienteId ? clients.find(c => c.id === targetUser.clienteId)?.nomeFantasia : null;

  const userSessions = useMemo(() => {
    if (!userId) return [];
    let logs = sessionLogs.filter(s => s.userId === userId);
    if (dateFrom) {
      const fromStr = format(dateFrom, 'yyyy-MM-dd');
      logs = logs.filter(s => s.dataHora.slice(0, 10) >= fromStr);
    }
    if (dateTo) {
      const toStr = format(dateTo, 'yyyy-MM-dd');
      logs = logs.filter(s => s.dataHora.slice(0, 10) <= toStr);
    }
    return logs;
  }, [sessionLogs, userId, dateFrom, dateTo]);

  const sessionPairs = useMemo(() => {
    const pairs: { login: string; logout: string | null; duration: string }[] = [];
    const sorted = [...userSessions].sort((a, b) => a.dataHora.localeCompare(b.dataHora));
    
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry.tipo === 'login') {
        const nextLogout = sorted.slice(i + 1).find(s => s.tipo === 'logout');
        let duration = '—';
        if (nextLogout) {
          const loginDate = new Date(entry.dataHora.replace(' ', 'T'));
          const logoutDate = new Date(nextLogout.dataHora.replace(' ', 'T'));
          const diffMin = Math.round((logoutDate.getTime() - loginDate.getTime()) / 60000);
          if (diffMin < 60) duration = `${diffMin} min`;
          else duration = `${Math.floor(diffMin / 60)}h ${diffMin % 60}min`;
        }
        pairs.push({ login: entry.dataHora, logout: nextLogout?.dataHora || null, duration });
      }
    }
    return pairs.reverse();
  }, [userSessions]);

  const lastLogin = userSessions.find(s => s.tipo === 'login')?.dataHora || '—';
  const totalLogins = userSessions.filter(s => s.tipo === 'login').length;

  if (!targetUser) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/usuarios")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Volver</Button>
        <p className="text-muted-foreground">Usuario no encontrado.</p>
      </div>
    );
  }

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Historial de Sesiones — ${targetUser.nome}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Correo: ${targetUser.email} · Perfil: ${ROLE_LABELS[targetUser.role]}`, 14, 26);
    doc.text(`Período: ${dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Inicio'} — ${dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Hoy'}`, 14, 32);
    doc.text(`Total de inicios: ${totalLogins}`, 14, 38);

    autoTable(doc, {
      startY: 44,
      head: [['Inicio de Sesión', 'Fin de Sesión', 'Duración']],
      body: sessionPairs.map(p => [p.login, p.logout || 'Activa', p.duration]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 64, 100] },
    });

    doc.save(`sesiones_${targetUser.nome.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/usuarios")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Usuarios
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-3">
            {targetUser.nome}
            <Badge variant={targetUser.role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[targetUser.role]}</Badge>
            <Badge variant={targetUser.ativo ? "outline" : "destructive"}>{targetUser.ativo ? "Activo" : "Inactivo"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Correo:</span> <span className="font-medium">{targetUser.email}</span></div>
            {clientName && <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{clientName}</span></div>}
            <div><span className="text-muted-foreground">Último login:</span> <span className="font-medium">{lastLogin}</span></div>
            <div><span className="text-muted-foreground">Total logins:</span> <span className="font-medium">{totalLogins}</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10"><LogIn className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold text-foreground">{totalLogins}</p><p className="text-xs text-muted-foreground">Inicios de sesión</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-muted"><LogOut className="h-5 w-5 text-muted-foreground" /></div>
            <div><p className="text-2xl font-bold text-foreground">{userSessions.filter(s => s.tipo === 'logout').length}</p><p className="text-xs text-muted-foreground">Cierres de sesión</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-muted"><Clock className="h-5 w-5 text-muted-foreground" /></div>
            <div><p className="text-2xl font-bold text-foreground">{sessionPairs.length}</p><p className="text-xs text-muted-foreground">Sesiones registradas</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1", dateFrom && "text-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" /> {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Desde"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} /></PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1", dateTo && "text-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" /> {dateTo ? format(dateTo, "dd/MM/yyyy") : "Hasta"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} /></PopoverContent>
        </Popover>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>Limpiar</Button>
        )}
        <Button variant="outline" size="sm" className="h-9 text-xs gap-1 ml-auto" onClick={exportPDF}>
          <FileDown className="h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial de Sesiones ({sessionPairs.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inicio de Sesión</TableHead>
                <TableHead>Fin de Sesión</TableHead>
                <TableHead>Duración</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionPairs.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No hay sesiones registradas para este período.</TableCell></TableRow>
              ) : sessionPairs.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{p.login}</TableCell>
                  <TableCell className="font-mono text-sm">{p.logout || <Badge variant="outline" className="text-xs">Activa</Badge>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.duration}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Log Detallado ({userSessions.length} eventos)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha y Hora</TableHead>
                <TableHead>Tipo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userSessions.slice(0, 100).map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{s.dataHora}</TableCell>
                  <TableCell>
                    <Badge variant={s.tipo === 'login' ? 'default' : 'secondary'} className="text-xs gap-1">
                      {s.tipo === 'login' ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                      {s.tipo === 'login' ? 'Login' : 'Logout'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
