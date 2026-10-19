// Agrupa varias pantallas en una sección con pestañas (ej.: DEPÓSITO = Pallets · Movimientos · Mapa).
// La pestaña activa queda en la dirección (?vista=…) para poder compartir el enlace o volver con el navegador.
import { Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth, type UserRole } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export interface HubTab {
  key: string;
  label: string;
  icon?: React.ElementType;
  roles?: UserRole[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
}

export default function SectionHub({ title, tabs }: { title: string; tabs: HubTab[] }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = tabs.filter((t) => !t.roles || (user && t.roles.includes(user.role)));
  const current = visible.find((t) => t.key === params.get("vista")) || visible[0];
  if (!current) return null;
  const Comp = current.component;

  const go = (key: string) =>
    // cambiar de pestaña limpia los filtros de la anterior
    setParams(new URLSearchParams({ vista: key }), { replace: false });

  return (
    <div className="space-y-4">
      <SectionTabsBar title={title} tabs={visible} current={current.key} onChange={go} />
      <Suspense fallback={<div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}>
        <Comp key={current.key} />
      </Suspense>
    </div>
  );
}

/** Barra de sección con pestañas (mismo estilo en Depósito, Comercial, Finanzas, Operación, Portal…) */
export function SectionTabsBar({ title, tabs, current, onChange }: {
  title: string;
  tabs: { key: string; label: React.ReactNode; icon?: React.ElementType }[];
  current: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mr-1">{title}</span>
      <div role="tablist" className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === current}
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              t.key === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
