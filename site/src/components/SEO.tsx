import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PAGES, pageKeyFromSlug } from "@/lib/routes";
import { STRUCTURES_SEO } from "@/lib/structuresText";

// Domínio oficial: canonical sempre aponta para cá,
// mesmo que o site também esteja acessível por outro endereço (ex.: endereço provisório da hospedagem).
export const SITE_URL = "https://stockflex.com.py";
const DEFAULT_IMAGE = `${SITE_URL}/img/og-estructura-seletivo.jpg`;

const setAttr = (selector: string, attr: string, value: string) => {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
};

/**
 * As tags de SEO já vêm prontas no HTML de cada página e idioma (gerado no build).
 * Este componente só as atualiza quando o visitante navega ou troca de idioma sem recarregar.
 */
const SEO = () => {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const lang = i18n.language?.split("-")[0] === "pt" ? "pt" : "es";

  useEffect(() => {
    const slug = pathname.split("/").filter(Boolean)[1];
    const key = pageKeyFromSlug(slug);
    const pathFor = (l: "es" | "pt") => (key ? `/${l}/${PAGES[key][l]}` : `/${l}`);
    const canonical = `${SITE_URL}${pathFor(lang)}`;

    const title = key === "structures" ? STRUCTURES_SEO[lang].title : (t("seo.title") as string);
    const description = key === "structures" ? STRUCTURES_SEO[lang].description : (t("seo.description") as string);
    const ogTitle = key === "structures" ? title : (t("seo.ogTitle") as string);
    const ogDescription = key === "structures" ? description : (t("seo.ogDescription") as string);
    const image = key === "structures" ? `${SITE_URL}/img/og-estructura-drive-in.jpg` : DEFAULT_IMAGE;

    document.documentElement.lang = lang;
    document.title = title;
    setAttr('meta[name="description"]', "content", description);
    setAttr('link[rel="canonical"]', "href", canonical);
    setAttr('link[rel="alternate"][hreflang="es"]', "href", `${SITE_URL}${pathFor("es")}`);
    setAttr('link[rel="alternate"][hreflang="pt"]', "href", `${SITE_URL}${pathFor("pt")}`);
    setAttr('meta[property="og:url"]', "content", canonical);
    setAttr('meta[property="og:title"]', "content", ogTitle);
    setAttr('meta[property="og:description"]', "content", ogDescription);
    setAttr('meta[property="og:image"]', "content", image);
    setAttr('meta[property="og:locale"]', "content", lang === "es" ? "es_PY" : "pt_BR");
    setAttr('meta[property="og:locale:alternate"]', "content", lang === "es" ? "pt_BR" : "es_PY");
    setAttr('meta[name="twitter:title"]', "content", ogTitle);
    setAttr('meta[name="twitter:description"]', "content", ogDescription);
    setAttr('meta[name="twitter:image"]', "content", image);
  }, [lang, t, pathname]);

  return null;
};

export default SEO;
