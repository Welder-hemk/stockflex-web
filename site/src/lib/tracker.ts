// Registro do que o visitante faz no site, guardado SÓ no navegador dele.
// Nada é enviado enquanto a pessoa não preenche os dados básicos num formulário;
// aí o resumo vai junto com o contato e alimenta a pontuação (lead score).

const KEY = "sf-engagement";

export interface Engagement {
  visitorId: string;
  firstVisit: string;
  lastVisit: string;
  visits: number;
  activeSeconds: number;
  sections: string[];
  simulatorEdits: number;
  maxPositions: number;
  whatsappClicks: number;
  portalClicks: number;
  proposalsGenerated: number;
  source: string; // primeira origem: utm ou site de onde veio
  lastSource: string;
  landingPage: string;
  device: "mobile" | "desktop";
}

const SESSION_GAP_MS = 30 * 60 * 1000;

function read(): Engagement | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Engagement) : null;
  } catch {
    return null;
  }
}

let state: Engagement | null = null;

function save() {
  if (!state) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* navegador sem armazenamento: segue só em memória */
  }
}

function currentSource(): string {
  try {
    const u = new URL(window.location.href);
    const utm = ["utm_source", "utm_medium", "utm_campaign"].map((k) => u.searchParams.get(k)).filter(Boolean);
    if (utm.length) return utm.join(" / ").slice(0, 300);
    const ref = document.referrer ? new URL(document.referrer).hostname : "";
    if (ref && ref !== window.location.hostname) return ref.slice(0, 300);
  } catch {
    /* ignora */
  }
  return "directo";
}

export function initTracker() {
  if (typeof window === "undefined" || state) return;
  const now = new Date();
  const prev = read();
  const source = currentSource();
  if (prev) {
    const newSession = now.getTime() - new Date(prev.lastVisit).getTime() > SESSION_GAP_MS;
    state = { ...prev, visits: prev.visits + (newSession ? 1 : 0), lastVisit: now.toISOString(), lastSource: source !== "directo" ? source : prev.lastSource };
  } else {
    state = {
      visitorId: (crypto.randomUUID?.() || String(Math.random()).slice(2)).slice(0, 64),
      firstVisit: now.toISOString(),
      lastVisit: now.toISOString(),
      visits: 1,
      activeSeconds: 0,
      sections: [],
      simulatorEdits: 0,
      maxPositions: 0,
      whatsappClicks: 0,
      portalClicks: 0,
      proposalsGenerated: 0,
      source,
      lastSource: source,
      landingPage: window.location.pathname,
      device: window.matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop",
    };
  }
  save();

  // Tempo ativo: conta só com a aba visível
  window.setInterval(() => {
    if (document.visibilityState === "visible" && state) {
      state.activeSeconds += 5;
      state.lastVisit = new Date().toISOString();
      save();
    }
  }, 5000);

  // Seções vistas (metade da seção na tela)
  const seen = new Set(state.sections);
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.target.id && !seen.has(e.target.id)) {
          seen.add(e.target.id);
          if (state) {
            state.sections = [...seen];
            save();
          }
        }
      });
    },
    { threshold: 0.4 },
  );
  const watch = () => document.querySelectorAll("section[id], [data-track]").forEach((el) => io.observe(el));
  watch();
  // Seções carregadas depois (lazy) também entram — verificação agrupada para não pesar
  let pending: number | undefined;
  new MutationObserver(() => {
    if (pending) return;
    pending = window.setTimeout(() => {
      pending = undefined;
      watch();
    }, 800);
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !state) return;
    if (a.href.includes("whatsapp.com") || a.href.includes("wa.me")) state.whatsappClicks += 1;
    else if (a.href.includes("stockflex-pallets") || a.href.includes("app.stockflex")) state.portalClicks += 1;
    save();
  });
}

export function trackSimulator(positions: number) {
  if (!state) return;
  state.simulatorEdits += 1;
  state.maxPositions = Math.max(state.maxPositions, positions);
  save();
}

export function trackProposal() {
  if (!state) return;
  state.proposalsGenerated += 1;
  save();
}

export function trackWhatsApp() {
  if (!state) return;
  state.whatsappClicks += 1;
  save();
}

export function getEngagement(): Engagement | null {
  return state ? { ...state, sections: [...state.sections] } : read();
}
