import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { StockDataProvider } from "@/contexts/StockDataContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Cada tela é carregada só quando é aberta: o app abre bem mais rápido no celular
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Operation = lazy(() => import("@/pages/Operation"));
const AuthorizedContacts = lazy(() => import("@/pages/AuthorizedContacts"));
const DepositoHub = lazy(() => import("@/pages/Hubs").then((m) => ({ default: m.DepositoHub })));
const ComercialHub = lazy(() => import("@/pages/Hubs").then((m) => ({ default: m.ComercialHub })));
const ConfigHub = lazy(() => import("@/pages/Hubs").then((m) => ({ default: m.ConfigHub })));
const Finance = lazy(() => import("@/pages/Finance"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const UserDetail = lazy(() => import("@/pages/UserDetail"));
const MyAccount = lazy(() => import("@/pages/MyAccount"));
const SystemDiagnostic = lazy(() => import("@/pages/SystemDiagnostic"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// Direcciones antiguas: llevan a la sección nueva conservando los filtros
function To({ path, tab, param = "vista" }: { path: string; tab: string; param?: string }) {
  const { search } = useLocation();
  const q = new URLSearchParams(search);
  q.set(param, tab);
  return <Navigate to={`${path}?${q.toString()}`} replace />;
}

const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <StockDataProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<ProtectedRoute allowedRoles={["admin", "operador", "financeiro"]}><Dashboard /></ProtectedRoute>} />
                <Route path="/operacao" element={<ProtectedRoute allowedRoles={["admin", "operador"]}><Operation /></ProtectedRoute>} />
                <Route path="/deposito" element={<ProtectedRoute allowedRoles={["admin", "operador"]}><DepositoHub /></ProtectedRoute>} />
                <Route path="/comercial" element={<ProtectedRoute allowedRoles={["admin", "financeiro"]}><ComercialHub /></ProtectedRoute>} />
                <Route path="/configuraciones" element={<ProtectedRoute allowedRoles={["admin"]}><ConfigHub /></ProtectedRoute>} />
                <Route path="/pallets" element={<To path="/deposito" tab="pallets" />} />
                <Route path="/movimentacoes" element={<To path="/deposito" tab="movimientos" />} />
                <Route path="/mapa" element={<To path="/deposito" tab="mapa" />} />
                <Route path="/clientes" element={<To path="/comercial" tab="clientes" />} />
                <Route path="/prospectos" element={<To path="/comercial" tab="prospectos" />} />
                <Route path="/depositos" element={<To path="/configuraciones" tab="depositos" />} />
                <Route path="/modelo-contrato" element={<To path="/configuraciones" tab="contrato" />} />
                <Route path="/gastos" element={<To path="/finanzas" tab="gastos" param="tab" />} />
                <Route path="/comisiones" element={<To path="/finanzas" tab="comisiones" param="tab" />} />
                <Route path="/proyeccion" element={<To path="/finanzas" tab="proyeccion" param="tab" />} />
                <Route path="/autorizados" element={<ProtectedRoute allowedRoles={["admin"]}><AuthorizedContacts /></ProtectedRoute>} />
                <Route path="/finanzas" element={<ProtectedRoute allowedRoles={["admin", "financeiro"]}><Finance /></ProtectedRoute>} />
                <Route path="/fechamento" element={<Navigate to="/finanzas?tab=cierre" replace />} />
                <Route path="/pagamentos" element={<Navigate to="/finanzas?tab=cobranzas" replace />} />
                <Route path="/portal-cliente" element={<ProtectedRoute allowedRoles={["admin", "cliente"]}><ClientPortal /></ProtectedRoute>} />
                <Route path="/usuarios" element={<ProtectedRoute allowedRoles={["admin"]}><UserManagement /></ProtectedRoute>} />
                <Route path="/usuarios/:userId" element={<ProtectedRoute allowedRoles={["admin"]}><UserDetail /></ProtectedRoute>} />
                <Route path="/mi-cuenta" element={<ProtectedRoute allowedRoles={["admin", "operador", "financeiro", "cliente"]}><MyAccount /></ProtectedRoute>} />
                <Route path="/diagnostico" element={<ProtectedRoute allowedRoles={["admin"]}><SystemDiagnostic /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </StockDataProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
