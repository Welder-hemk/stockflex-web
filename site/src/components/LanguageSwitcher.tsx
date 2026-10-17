import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { SUPPORTED_LANGS, type Lang } from "@/i18n";
import { PAGES, pageKeyFromSlug } from "@/lib/routes";

// Inline SVG flags for crisp rendering at any size
const FlagPY = () => (
  <svg viewBox="0 0 9 6" className="w-6 h-4 rounded-sm shadow-sm" aria-hidden="true">
    <rect width="9" height="2" y="0" fill="#D52B1E" />
    <rect width="9" height="2" y="2" fill="#FFFFFF" />
    <rect width="9" height="2" y="4" fill="#0038A8" />
    <circle cx="4.5" cy="3" r="0.6" fill="#FEDF00" stroke="#0038A8" strokeWidth="0.08" />
  </svg>
);

const FlagBR = () => (
  <svg viewBox="0 0 14 10" className="w-6 h-4 rounded-sm shadow-sm" aria-hidden="true">
    <rect width="14" height="10" fill="#009C3B" />
    <polygon points="7,1.2 12.8,5 7,8.8 1.2,5" fill="#FEDF00" />
    <circle cx="7" cy="5" r="1.8" fill="#002776" />
  </svg>
);

const LANG_META: Record<Lang, { label: string; Flag: React.FC; activeClass: string }> = {
  es: {
    label: "ES",
    Flag: FlagPY,
    // Paraguay: red + white
    activeClass: "bg-[#D52B1E] text-white",
  },
  pt: {
    label: "PT",
    Flag: FlagBR,
    // Brazil: green + yellow
    activeClass: "bg-[#009C3B] text-[#FEDF00]",
  },
};

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const current = (i18n.language?.split("-")[0] as Lang) || "es";

  const change = (lang: Lang) => {
    if (lang === current) return;
    i18n.changeLanguage(lang);
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
    const parts = location.pathname.split("/").filter(Boolean);
    if ((SUPPORTED_LANGS as readonly string[]).includes(parts[0])) {
      parts[0] = lang;
    } else {
      parts.unshift(lang);
    }
    // Página interna: troca também o endereço para o do outro idioma
    const key = pageKeyFromSlug(parts[1]);
    if (key) parts[1] = PAGES[key][lang];
    navigate("/" + parts.join("/") + location.search + location.hash, { replace: true });
  };

  return (
    <div
      role="group"
      aria-label="Language selector"
      className="fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md shadow-xl border border-gray-200 px-2 py-1.5 text-sm font-bold"
    >
      {SUPPORTED_LANGS.map((lang) => {
        const { label, Flag, activeClass } = LANG_META[lang];
        const isActive = current === lang;
        return (
          <button
            key={lang}
            onClick={() => change(lang)}
            aria-label={`Switch to ${label}`}
            aria-pressed={isActive}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${
              isActive ? `${activeClass} shadow-md scale-105` : "text-text-gray hover:bg-gray-100"
            }`}
          >
            <Flag />
            <span className="leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
