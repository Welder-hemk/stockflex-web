import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LogIn, ShieldCheck, Briefcase, Wrench, Crown, ChevronDown, ExternalLink } from "lucide-react";

// Sistema (app) publicado no mesmo domínio
export const PORTAL_URL = "/app/";

type RoleKey = "client" | "authorized" | "operator" | "admin";

const ROLE_ICONS: Record<RoleKey, React.ComponentType<{ className?: string }>> = {
  client: Briefcase,
  authorized: ShieldCheck,
  operator: Wrench,
  admin: Crown,
};

const ROLE_LABELS_PT: Record<RoleKey, string> = {
  client: "Cliente",
  authorized: "Autorizado",
  operator: "Operador",
  admin: "Administrador",
};

const ROLE_LABELS_ES: Record<RoleKey, string> = {
  client: "Cliente",
  authorized: "Autorizado",
  operator: "Operador",
  admin: "Administrador",
};

type Props = {
  /** "floating" = fixed top button, "inline" = inline button (e.g. inside Hero) */
  variant?: "floating" | "inline";
};

const PortalAccess = ({ variant = "floating" }: Props) => {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] || "pt";
  const isPt = lang === "pt";
  const labels = isPt ? ROLE_LABELS_PT : ROLE_LABELS_ES;

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const title = isPt ? "Acesso ao Sistema" : "Acceso al Sistema";
  const subtitle = isPt
    ? "Gestão de movimentação de estoque"
    : "Gestión de movimiento de stock";
  const buttonLabel = isPt ? "Área do Cliente" : "Área del Cliente";
  const ctaLabel = isPt ? "Acessar Sistema" : "Acceder al Sistema";
  const tagline = isPt
    ? "Diferencial StockFlex: acompanhe seu estoque em tempo real."
    : "Diferencial StockFlex: monitoree su stock en tiempo real.";

  const roles: RoleKey[] = ["client", "authorized", "operator", "admin"];

  // Container & trigger styles per variant
  const wrapperClass =
    variant === "floating"
      ? "fixed top-3 left-3 sm:top-auto sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:left-5 z-50"
      : "relative inline-block";

  const triggerClass =
    variant === "floating"
      ? "group flex items-center gap-2 rounded-full bg-industrial-orange hover:bg-industrial-orange/90 text-white pl-3 pr-4 py-2 sm:pl-4 sm:pr-5 sm:py-3.5 text-sm sm:text-base font-bold shadow-2xl border-2 border-white transition-transform hover:scale-105 animate-pulse-soft"
      : "inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[52px] px-6 sm:px-8 py-4 text-base sm:text-lg font-semibold rounded-md bg-white text-primary hover:bg-white/90 shadow-hero border-2 border-white transition-transform hover:scale-105";

  return (
    <div ref={wrapRef} className={wrapperClass}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={buttonLabel}
        className={triggerClass}
      >
        <LogIn className="w-5 h-5" />
        <span className="leading-none">{buttonLabel}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""} ${variant === "floating" ? "hidden sm:block" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute w-[300px] rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden animate-fade-in z-50 ${
            variant === "floating" ? "top-full mt-3 sm:top-auto sm:mt-0 sm:bottom-full sm:mb-3 left-0" : "right-0 mt-3"
          }`}
        >
          <div className="bg-gradient-hero text-white p-4">
            <div className="text-sm font-bold">{title}</div>
            <div className="text-xs text-blue-100 mt-0.5">{subtitle}</div>
          </div>

          <ul className="py-2">
            {roles.map((role) => {
              const Icon = ROLE_ICONS[role];
              return (
                <li key={role}>
                  <a
                    href={PORTAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group"
                    onClick={() => setOpen(false)}
                  >
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 flex-1">{labels[role]}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary" />
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-gray-100 p-3 bg-gray-50">
            <a
              href={PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-industrial-orange hover:bg-industrial-orange/90 text-white text-sm font-semibold rounded-md py-2.5 transition-colors"
              onClick={() => setOpen(false)}
            >
              <LogIn className="w-4 h-4" />
              {ctaLabel}
            </a>
            <p className="text-[11px] text-gray-500 text-center mt-2 leading-snug">{tagline}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalAccess;
