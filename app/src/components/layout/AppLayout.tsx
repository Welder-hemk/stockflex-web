import { Navigate, Outlet } from "react-router-dom";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import AppSidebar from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const { isAuthenticated, loading } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={cn(
        isMobile && "fixed inset-y-0 left-0 z-50 transition-transform duration-300",
        isMobile && !mobileOpen && "-translate-x-full"
      )}>
        <AppSidebar onNavigate={() => isMobile && setMobileOpen(false)} forceMobileExpanded={isMobile} />
      </div>

      {/* Main content */}
      <main className={cn(
        "flex-1 overflow-auto",
        isMobile ? "p-3 pt-14" : "ml-60 p-6"
      )}>
        {/* Mobile top bar */}
        {isMobile && (
          <div className="fixed top-0 left-0 right-0 z-30 h-12 bg-sidebar border-b border-sidebar-border flex items-center px-3 gap-3">
            <button onClick={() => setMobileOpen(true)} className="text-sidebar-foreground">
              <Menu className="h-5 w-5" />
            </button>
            <img src={`${import.meta.env.BASE_URL}logo-stockflex-white.webp`} alt="StockFlex" className="h-7 w-auto" width="100" height="29" />
          </div>
        )}
        <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
