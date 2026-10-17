// Google Analytics 4 — carregado apenas quando VITE_GA_MEASUREMENT_ID está definido
// (ex.: VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX no .env ou nas variáveis da hospedagem).

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
let initialized = false;

export function initAnalytics() {
  if (initialized || !GA_ID || typeof window === "undefined") return;
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  // page_view é enviado manualmente a cada troca de rota (SPA)
  window.gtag("config", GA_ID, { send_page_view: false });

  // Cliques em WhatsApp e no portal do cliente, sem precisar alterar cada botão
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link) return;
    if (link.href.includes("wa.me") || link.href.includes("whatsapp.com")) trackEvent("whatsapp_click");
    else if (link.href.includes("stockflex-pallets")) trackEvent("portal_click");
    else if (link.href.startsWith("mailto:")) trackEvent("email_click");
    else if (link.href.includes("maps.app.goo.gl")) trackEvent("map_click");
  });
}

export function trackPageView(path: string) {
  if (!GA_ID || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (!GA_ID || !window.gtag) return;
  window.gtag("event", name, params);
}
