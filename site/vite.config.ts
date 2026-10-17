import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { PAGES } from "./src/lib/routes";
import { STRUCTURES_SEO } from "./src/lib/structuresText";

const SITE_URL = "https://stockflex.com.py";
const LANGS = ["es", "pt"] as const;
const DEFAULT_LANG = "es";

const escapeAttr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type L = (typeof LANGS)[number];
type PageSeo = { title: string; description: string; ogTitle: string; ogDescription: string; image: string };

function homeSeo(lang: L): PageSeo {
  const seo = JSON.parse(fs.readFileSync(path.resolve(__dirname, `src/i18n/locales/${lang}.json`), "utf-8")).seo;
  return { title: seo.title, description: seo.description, ogTitle: seo.ogTitle, ogDescription: seo.ogDescription, image: `${SITE_URL}/img/og-estructura-seletivo.jpg` };
}

// Páginas internas: título e descrição próprios, para aparecerem bem no Google e no WhatsApp
const INNER_PAGES: { key: keyof typeof PAGES; seo: (lang: L) => PageSeo }[] = [
  {
    key: "structures",
    seo: (lang) => ({ ...STRUCTURES_SEO[lang], ogTitle: STRUCTURES_SEO[lang].title, ogDescription: STRUCTURES_SEO[lang].description, image: `${SITE_URL}/img/og-estructura-drive-in.jpg` }),
  },
];

function renderSeo(html: string, lang: L, seo: PageSeo, paths: Record<L, string>) {
  const values: Record<string, string> = {
    __HTML_LANG__: lang,
    __TITLE__: seo.title,
    __DESC__: seo.description,
    __OG_TITLE__: seo.ogTitle,
    __OG_DESC__: seo.ogDescription,
    __OG_IMAGE__: seo.image,
    __OG_LOCALE__: lang === "es" ? "es_PY" : "pt_BR",
    __OG_LOCALE_ALT__: lang === "es" ? "pt_BR" : "es_PY",
    __CANONICAL__: `${SITE_URL}${paths[lang]}`,
    __HREF_ES__: `${SITE_URL}${paths.es}`,
    __HREF_PT__: `${SITE_URL}${paths.pt}`,
  };
  return html.replace(/__[A-Z_]+__/g, (token) => (token in values ? escapeAttr(values[token]) : token));
}

const homePaths = { es: "/es", pt: "/pt" } as Record<L, string>;

/**
 * Gera uma página HTML por idioma (dist/es/index.html, dist/pt/index.html) com título,
 * descrição e prévias de redes sociais já no idioma certo — WhatsApp, Facebook e LinkedIn
 * não executam JavaScript, então dependem destas tags estáticas.
 */
function seoPages(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "stockflex-seo-pages",
    configResolved(c) {
      config = c;
    },
    transformIndexHtml(html, ctx) {
      // No modo de desenvolvimento, mostra a versão em espanhol; no build, mantém o modelo
      return ctx.server ? renderSeo(html, DEFAULT_LANG, homeSeo(DEFAULT_LANG), homePaths) : html;
    },
    closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const indexPath = path.join(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const template = fs.readFileSync(indexPath, "utf-8");
      const sitemap: string[] = [];
      const write = (paths: Record<L, string>, seo: (l: L) => PageSeo, priority: string) => {
        for (const lang of LANGS) {
          const dir = path.join(outDir, paths[lang]);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "index.html"), renderSeo(template, lang, seo(lang), paths));
          sitemap.push(`  <url>
    <loc>${SITE_URL}${paths[lang]}</loc>
    <xhtml:link rel="alternate" hreflang="es" href="${SITE_URL}${paths.es}"/>
    <xhtml:link rel="alternate" hreflang="pt" href="${SITE_URL}${paths.pt}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${paths.es}"/>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
    <priority>${priority}</priority>
  </url>`);
        }
      };
      write(homePaths, homeSeo, "1.0");
      for (const p of INNER_PAGES) {
        write({ es: `/es/${PAGES[p.key].es}`, pt: `/pt/${PAGES[p.key].pt}` }, p.seo, "0.8");
      }
      fs.writeFileSync(indexPath, renderSeo(template, DEFAULT_LANG, homeSeo(DEFAULT_LANG), homePaths));
      // Sitemap gerado no build: toda página nova entra sozinha
      fs.writeFileSync(
        path.join(outDir, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemap.join("\n")}\n</urlset>\n`,
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), seoPages()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
