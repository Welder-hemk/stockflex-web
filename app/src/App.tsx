import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
const Clients = lazy(() => import("@/pages/Clients"));
const Prospects = lazy(() => import("@/pages/Prospects"));
const Warehouses = lazy(() => import("@/pages/Warehouses"));
const AuthorizedContacts = lazy(() => import("@/pages/AuthorizedContacts"));
const Pallets = lazy(() => import("@/pages/Pallets"));
const WarehouseMap = lazy(() => import("@/pages/WarehouseMap"));
const Movements = lazy(() => import("@/pages/Movements"));
const Finance = lazy(() => import("@/pages/Finance"));
const Commissions = lazy(() => import("@/pages/Commissions"));
const ContractTemplatePage = lazy(() => import("@/pages/ContractTemplate"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const UserDetail = lazy(() => import("@/pages/UserDetail"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const MyAccount = lazy(() => import("@/pages/MyAccount"));
const SystemDiagnostic = lazy(() => import("@/pages/SystemDiagnostic"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const NotFound = lazy(() => import("@/pages/NotFound"));

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
                <Route path="/prospectos" element={<ProtectedRoute allowedRoles={["admin", "financeiro"]}><Prospects /></ProtectedRoute>} />
                <Route path="/clientes" element={<ProtectedRoute allowedRoles={["admin", "financeiro"]}><Clients /></ProtectedRoute>} />
                <Route path="/autorizados" element={<ProtectedRoute allowedRoles={["admin"]}><AuthorizedContacts /></ProtectedRoute>} />
                <Route path="/pallets" element={<ProtectedRoute allowedRoles={["admin", "operador"]}><Pallets /></ProtectedRoute>} />
                <Route path="/mapa" element={<ProtectedRoute allowedRoles={["admin", "operador"]}><WarehouseMap /></ProtectedRoute>} />
                <Route path="/movimentacoes" element={<ProtectedRoute allowedRoles={["admin", "operador"]}><Movements /></ProtectedRoute>} />
                <Route path="/comisiones" element={<ProtectedRoute allowedRoles={["admin", "financeiro"]}><Commissions /></ProtectedRoute>} />
                <Route path="/modelo-contrato" element={<ProtectedRoute allowedRoles={["admin"]}><ContractTemplatePage /></ProtectedRoute>} />
                <Route path="/finanzas" element={<ProtectedRoute allowedRoles={["admin", "financeiro"]}><Finance /></ProtectedRoute>} />
                <Route path="/fechamento" element={<Navigate to="/finanzas?tab=cierre" replace />} />
                <Route path="/pagamentos" element={<Navigate to="/finanzas?tab=cobranzas" replace />} />
                <Route path="/gastos" element={<ProtectedRoute allowedRoles={["admin", "financeiro"]}><Expenses /></ProtectedRoute>} />
                <Route path="/portal-cliente" element={<ProtectedRoute allowedRoles={["admin", "cliente"]}><ClientPortal /></ProtectedRoute>} />
                <Route path="/depositos" element={<ProtectedRoute allowedRoles={["admin"]}><Warehouses /></ProtectedRoute>} />
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
