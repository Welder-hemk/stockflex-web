// Páginas internas do site, com endereço próprio em cada idioma (bom para SEO).
// O mesmo mapa é usado pelo seletor de idioma e pelo gerador de páginas no build.

export const PAGES = {
  structures: { es: "alquiler-de-estructuras", pt: "aluguel-de-estruturas" },
} as const;

export type PageKey = keyof typeof PAGES;

export function pageKeyFromSlug(slug: string | undefined): PageKey | null {
  if (!slug) return null;
  for (const [key, slugs] of Object.entries(PAGES)) {
    if (Object.values(slugs).includes(slug as never)) return key as PageKey;
  }
  return null;
}

export const pagePath = (key: PageKey, lang: string) => `/${lang}/${PAGES[key][lang === "pt" ? "pt" : "es"]}`;
