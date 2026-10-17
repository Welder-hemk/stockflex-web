import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type UserRole = "admin" | "operador" | "cliente" | "financeiro";

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
  clienteId?: string;
  ativo: boolean;
}

export interface ManagedUser {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
  clienteId?: string;
  ativo: boolean;
}

export interface SessionLog {
  userId: string;
  tipo: 'login' | 'logout';
  dataHora: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  users: ManagedUser[];
  addUser: (u: { nome: string; email: string; password: string; role: UserRole; clienteId?: string; ativo: boolean }) => Promise<void>;
  updateUser: (id: string, data: { nome?: string; email?: string; password?: string; role?: UserRole; clienteId?: string; ativo?: boolean }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  sessionLogs: SessionLog[];
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const AUTH_OP_TIMEOUT_MS = 10000;
const AUTH_INIT_TIMEOUT_MS = 12000;

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promiseLike)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function fetchProfile(userId: string): Promise<AuthUser | null> {
  try {
    const profileResponse = await withTimeout(
      (async () =>
        supabase
          .from("profiles")
          .select("id, email, nome, ativo, cliente_id")
          .eq("id", userId)
          .maybeSingle())(),
      AUTH_OP_TIMEOUT_MS,
      "Tempo de carregamento do perfil excedido"
    );

    const { data: profile, error: profileError } = profileResponse;

    if (profileError) {
      console.error("Failed to fetch profile:", profileError);
      return null;
    }

    if (!profile) return null;

    const roleResponse = await withTimeout(
      (async () =>
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle())(),
      AUTH_OP_TIMEOUT_MS,
      "Tempo de carregamento do papel do usuário excedido"
    );

    const { data: roleData, error: roleError } = roleResponse;

    if (roleError) {
      console.error("Failed to fetch user role:", roleError);
    }
    // Sem papel atribuído não entra (antes caía como "operador" e via a operação inteira)
    if (!roleData?.role) {
      console.warn("Usuário sem papel atribuído — acesso negado");
      return null;
    }

    return {
      id: profile.id,
      email: profile.email,
      nome: profile.nome,
      role: roleData.role as UserRole,
      clienteId: profile.cliente_id || undefined,
      ativo: profile.ativo,
    };
  } catch (error) {
    console.error("Unexpected auth profile error:", error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);

  const loadUser = useCallback(async (session: Session | null) => {
    try {
      if (!session?.user) {
        setUser(null);
        return;
      }

      // Retry once to avoid transient race right after login token exchange
      let profile = await fetchProfile(session.user.id);
      if (!profile) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        profile = await fetchProfile(session.user.id);
      }

      setUser(profile);
    } catch (error) {
      console.error("Failed to load authenticated user:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadingRef = useRef(true);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    let mounted = true;

    // Só age se a autenticação ainda estiver carregando (antes logava erro sempre)
    const releaseLoadingFallback = setTimeout(() => {
      if (mounted && loadingRef.current) {
        console.error("Auth initialization timeout reached; releasing loading state");
        setLoading(false);
      }
    }, AUTH_INIT_TIMEOUT_MS);

    // Avoid async/await inside auth callback to prevent potential auth deadlocks
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void Promise.resolve().then(() => loadUser(session));
    });

    // Then get initial session
    void withTimeout(
      (async () => supabase.auth.getSession())(),
      AUTH_OP_TIMEOUT_MS,
      "Tempo de verificação de sessão excedido"
    )
      .then(({ data: { session } }) => {
        void loadUser(session);
      })
      .catch((error) => {
        console.error("Failed to initialize auth session:", error);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(releaseLoadingFallback);
      subscription.unsubscribe();
    };
  }, [loadUser]);

  // Session inactivity timeout (8 hours)
  useEffect(() => {
    if (!user) return;

    const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;
    let inactivityTimer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        console.warn("Session expired due to inactivity");
        void supabase.auth.signOut();
        setUser(null);
      }, SESSION_TIMEOUT_MS);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const { data, error } = await withTimeout(
      (async () => supabase.auth.signInWithPassword({ email, password }))(),
      AUTH_OP_TIMEOUT_MS,
      "Tempo de login excedido. Tente novamente."
    );

    if (error) return { success: false, error: error.message };

    // Check if user is active before allowing login
    const signedInUserId = data.user?.id;
    if (signedInUserId) {
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("ativo")
        .eq("id", signedInUserId)
        .maybeSingle();
      if (profErr) {
        await supabase.auth.signOut();
        return { success: false, error: "No se pudo cargar su perfil. Verifique su conexión e intente de nuevo." };
      }
      if (profile && !profile.ativo) {
        await supabase.auth.signOut();
        return { success: false, error: "Su cuenta ha sido desactivada. Contacte al administrador." };
      }
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", signedInUserId).maybeSingle();
      if (!roleRow?.role) {
        await supabase.auth.signOut();
        return { success: false, error: "Su usuario todavía no tiene un perfil asignado. Contacte al administrador." };
      }
    }

    // Non-blocking session log
    if (signedInUserId) {
      void supabase.from("session_logs").insert({
        user_id: signedInUserId,
        tipo: "login",
      }).then(({ error: logError }) => {
        if (logError) console.error("Failed to write session log:", logError);
      });
    }

    return { success: true };
  };

  const logout = async () => {
    if (user) {
      await supabase.from("session_logs").insert({
        user_id: user.id,
        tipo: "logout",
      });
    }
    await supabase.auth.signOut();
    setUser(null);
  };

  const invokeManageUsers = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("manage-users", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const refreshUsers = useCallback(async () => {
    try {
      const data = await invokeManageUsers({ action: "list" });
      setUsers(data.users || []);
    } catch (e) {
      console.error("Failed to load users:", e);
    }
  }, []);

  const addUser = async (u: { nome: string; email: string; password: string; role: UserRole; clienteId?: string; ativo: boolean }) => {
    await invokeManageUsers({
      action: "create",
      email: u.email,
      password: u.password,
      nome: u.nome,
      role: u.role,
      clienteId: u.clienteId,
      ativo: u.ativo,
    });
    await refreshUsers();
  };

  const updateUser = async (id: string, data: { nome?: string; email?: string; password?: string; role?: UserRole; clienteId?: string; ativo?: boolean }) => {
    await invokeManageUsers({
      action: "update",
      userId: id,
      ...data,
    });
    await refreshUsers();
    // Refresh current user if updating self
    if (user && user.id === id) {
      const profile = await fetchProfile(id);
      setUser(profile);
    }
  };

  const deleteUser = async (id: string) => {
    await invokeManageUsers({ action: "delete", userId: id });
    await refreshUsers();
  };

  // Load session logs for current user
  useEffect(() => {
    if (!user) {
      setSessionLogs([]);
      return;
    }

    const loadLogs = async () => {
      const { data } = await supabase
        .from("session_logs")
        .select("user_id, tipo, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (data) {
        setSessionLogs(
          data.map((s) => ({
            userId: s.user_id,
            tipo: s.tipo as "login" | "logout",
            dataHora: new Date(s.created_at).toISOString().replace("T", " ").slice(0, 19),
          }))
        );
      }
    };

    loadLogs();
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        users,
        addUser,
        updateUser,
        deleteUser,
        refreshUsers,
        sessionLogs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
