import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, UserCircle, ChevronLeft, ShieldCheck, KeyRound, LogOut, DollarSign, Stethoscope, ScanLine, Warehouse, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "operador", "financeiro"] },
  { to: "/operacao", icon: ScanLine, label: "Operación", roles: ["admin", "operador"] },
  { to: "/deposito", icon: Warehouse, label: "Depósito", roles: ["admin", "operador"] },
  { to: "/comercial", icon: Users, label: "Comercial", roles: ["admin", "financeiro"] },
  { to: "/autorizados", icon: ShieldCheck, label: "Autorizados", roles: ["admin"] },
  { to: "/finanzas", icon: DollarSign, label: "Finanzas", roles: ["admin", "financeiro"] },
  { to: "/portal-cliente", icon: UserCircle, label: "Portal del cliente", roles: ["admin", "cliente"] },
  { to: "/configuraciones", icon: Settings, label: "Configuraciones", roles: ["admin"] },
  { to: "/usuarios", icon: KeyRound, label: "Usuarios", roles: ["admin"] },
  { to: "/diagnostico", icon: Stethoscope, label: "Diagnóstico", roles: ["admin"] },
  { to: "/mi-cuenta", icon: UserCircle, label: "Mi Cuenta", roles: ["admin", "operador", "financeiro", "cliente"] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  operador: "Operador",
  financeiro: "Financiero",
  cliente: "Cliente",
};

interface AppSidebarProps {
  onNavigate?: () => void;
  forceMobileExpanded?: boolean;
}

export default function AppSidebar({ onNavigate, forceMobileExpanded }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(new Date());
  const location = useLocation();
  const { user, logout } = useAuth();

  const isExpanded = forceMobileExpanded ? true : !collapsed;

  const visibleItems = navItems.filter(item => user && item.roles.includes(user.role));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = now.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = now.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <aside
      className={cn(
        "h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
        forceMobileExpanded ? "w-60" : (collapsed ? "w-16" : "w-60"),
        !forceMobileExpanded && "fixed left-0 top-0 z-50"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-16 border-b border-sidebar-border shrink-0">
        {isExpanded ? (
          <img src={`${import.meta.env.BASE_URL}logo-stockflex-white.webp`} alt="StockFlex — Almacenaje bajo demanda" className="h-9 w-auto" width="129" height="37" />
        ) : (
          <span className="mx-auto text-lg font-extrabold tracking-tight"><span className="text-white">S</span><span className="text-brand-orange">F</span></span>
        )}
      </div>

      {/* Date/Time */}
      <div className="border-b border-sidebar-border px-3 py-2 text-center">
        {!isExpanded ? (
          <p className="text-[10px] text-sidebar-foreground font-mono leading-tight">{timeStr.slice(0, 5)}</p>
        ) : (
          <>
            <p className="text-xs text-sidebar-accent-foreground font-medium">{dateStr}</p>
            <p className="text-lg font-mono text-sidebar-accent-foreground leading-tight">{timeStr}</p>
          </>
        )}
      </div>

      {/* Operating Hours - only for client role */}
      {user?.role === 'cliente' && isExpanded && (
        <div className="border-b border-sidebar-border px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground opacity-60 mb-1">Horario de Operaciones</p>
          <p className="text-[11px] text-sidebar-accent-foreground">Lun a Vie: 07:00 – 17:00</p>
          <p className="text-[11px] text-sidebar-accent-foreground">Sábados: 07:00 – 12:00</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {isExpanded && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User info + Logout */}
      <div className="border-t border-sidebar-border">
        {user && isExpanded && (
          <div className="px-4 py-2.5">
            <p className="text-xs font-medium text-sidebar-accent-foreground truncate">{user.nome}</p>
            <p className="text-[10px] text-sidebar-foreground opacity-60">{ROLE_LABELS[user.role]}</p>
          </div>
        )}
        <div className="flex">
          <button
            onClick={() => { logout(); onNavigate?.(); }}
            className="flex-1 flex items-center justify-center gap-2 h-11 text-sidebar-foreground hover:text-destructive transition-colors text-sm"
          >
            <LogOut className="h-4 w-4" />
            {isExpanded && <span>Salir</span>}
          </button>
          {!forceMobileExpanded && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center w-11 h-11 text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors border-l border-sidebar-border"
            >
              <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
