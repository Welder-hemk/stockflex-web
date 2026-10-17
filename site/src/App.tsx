import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SEO from "@/components/SEO";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import PortalAccess from "@/components/PortalAccess";
import { SUPPORTED_LANGS, DEFAULT_LANG, detectInitialLang, type Lang } from "@/i18n";
import "@/i18n";
import { trackPageView } from "@/lib/analytics";

const NotFound = lazy(() => import("./pages/NotFound"));
const Structures = lazy(() => import("./pages/Structures"));
import { PAGES, pageKeyFromSlug } from "@/lib/routes";

const queryClient = new QueryClient();

const LangLayout = ({ children }: { children: React.ReactNode }) => {
  const { lang } = useParams();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (lang && (SUPPORTED_LANGS as readonly string[]).includes(lang) && i18n.language !== lang) {
      i18n.changeLanguage(lang);
      localStorage.setItem("lang", lang);
      document.documentElement.lang = lang;
    }
  }, [lang, i18n]);

  if (!lang || !(SUPPORTED_LANGS as readonly string[]).includes(lang)) {
    return <Navigate to={`/${DEFAULT_LANG}`} replace />;
  }
  return <>{children}</>;
};

// Páginas internas: o endereço muda por idioma; um endereço do outro idioma é corrigido
const PageBySlug = () => {
  const { lang, slug } = useParams();
  const key = pageKeyFromSlug(slug);
  if (!key) {
    return (
      <Suspense fallback={null}>
        <NotFound />
      </Suspense>
    );
  }
  const expected = PAGES[key][lang === "pt" ? "pt" : "es"];
  if (slug !== expected) return <Navigate to={`/${lang}/${expected}`} replace />;
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Structures />
    </Suspense>
  );
};

const RouteTracker = () => {
  const location = useLocation();
  useEffect(() => {
    // pequeno atraso para o título da página (Helmet) já estar atualizado
    const id = window.setTimeout(() => trackPageView(location.pathname), 50);
    return () => window.clearTimeout(id);
  }, [location.pathname]);
  return null;
};

const RootRedirect = () => <Navigate to={`/${detectInitialLang()}`} replace />;

const App = () => {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RouteTracker />
            <SEO />
            <LanguageSwitcher />
            <PortalAccess />
            <WhatsAppFloat />
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route
                path="/:lang"
                element={
                  <LangLayout>
                    <Index />
                  </LangLayout>
                }
              />
              <Route
                path="/:lang/:slug"
                element={
                  <LangLayout>
                    <PageBySlug />
                  </LangLayout>
                }
              />
              <Route
                path="*"
                element={
                  <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
                    <NotFound />
                  </Suspense>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
