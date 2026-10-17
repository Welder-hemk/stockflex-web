import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import pt from "./locales/pt.json";
import es from "./locales/es.json";

export const SUPPORTED_LANGS = ["es", "pt"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "es";

export function detectInitialLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  // 1) URL prefix wins
  const urlLang = window.location.pathname.split("/")[1];
  if ((SUPPORTED_LANGS as readonly string[]).includes(urlLang)) return urlLang as Lang;
  // 2) localStorage
  const stored = localStorage.getItem("lang");
  if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) return stored as Lang;
  // 3) Browser
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("pt")) return "pt";
  return DEFAULT_LANG;
}

i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    es: { translation: es },
  },
  lng: detectInitialLang(),
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export default i18n;
