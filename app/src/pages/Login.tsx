import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { motion } from "framer-motion";
import { LogIn, AlertCircle, Loader2, ArrowLeft, Mail } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Cada perfil entra direto na sua tela inicial (o cliente vai ao portal)
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === "cliente" ? "/portal-cliente" : "/", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || "Error al iniciar sesión");
      }
    } catch {
      setError("Error al iniciar sesión");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setForgotSent(true);
      }
    } catch {
      setError("Error al enviar el correo de recuperación");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Mesmo fundo azul do topo do site: o cliente que vem de stockflex.com.py sente que continua no mesmo lugar
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-[linear-gradient(135deg,hsl(var(--brand-navy-deep)),hsl(var(--brand-navy)))]">
      <a href="https://stockflex.com.py" className="mb-6" aria-label="Ir al sitio StockFlex">
        <img src={`${import.meta.env.BASE_URL}logo-stockflex-white.webp`} alt="StockFlex — Almacenaje bajo demanda" className="h-14 w-auto" width="193" height="56" />
      </a>
      <motion.div
        initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <Card className="shadow-xl border-0">
          <CardHeader className="items-center pb-2 pt-7">
            <h1 className="text-lg font-semibold text-foreground">Área del Cliente y Operación</h1>
            <p className="text-sm text-muted-foreground">Ingrese con su correo y contraseña</p>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            {forgotMode ? (
              forgotSent ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Mail className="h-10 w-10 text-primary" />
                  <p className="text-sm text-muted-foreground text-center">
                    Se envió un enlace de recuperación a <strong>{forgotEmail}</strong>. Revise su bandeja de entrada.
                  </p>
                  <Button variant="outline" onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); }}>
                    Volver al login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgotEmail">Correo electrónico</Label>
                    <Input
                      id="forgotEmail"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="su@email.com"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {isLoading ? "Enviando..." : "Enviar enlace de recuperación"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => { setForgotMode(false); setError(""); }}>
                    <ArrowLeft className="h-4 w-4" />
                    Volver al login
                  </Button>
                </form>
              )
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo electrónico</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="su@email.com"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button type="submit" variant="cta" size="lg" className="w-full active:scale-[0.97]" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    {isLoading ? "Ingresando..." : "Ingresar"}
                  </Button>
                </form>
                <div className="text-center">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                    onClick={() => { setForgotMode(true); setError(""); }}
                  >
                    ¿Olvidó su contraseña?
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
      <p className="mt-6 text-xs text-white/70">
        ¿Aún no es cliente? <a href="https://stockflex.com.py/es#contato" className="underline text-white">Solicite una cotización</a>
      </p>
    </div>
  );
}