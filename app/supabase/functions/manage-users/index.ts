import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chaves do projeto: aceita as chaves novas (sb_secret_…) e as antigas (service_role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const pickKey = (jsonVar: string, legacyVar: string) => {
      try {
        const keys = JSON.parse(Deno.env.get(jsonVar) || "{}");
        const first = keys.default || Object.values(keys)[0];
        if (first) return first as string;
      } catch { /* ignora */ }
      return Deno.env.get(legacyVar) || "";
    };
    const supabaseServiceKey = pickKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Função sem chave secreta do projeto" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Quem está chamando? (valida o token da sessão no próprio Supabase)
    const { data: callerData, error: callerErr } = await adminClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida: entre novamente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = callerData.user.id;

    // Somente administradores
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, password, nome, role, clienteId, ativo } = body;
      if (!email || !password || !nome || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome },
      });

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile (trigger already created it)
      await adminClient
        .from("profiles")
        .update({ nome, ativo: ativo !== false, cliente_id: clienteId || null })
        .eq("id", newUser.user.id);

      // Add role
      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id,
        role,
      });

      return new Response(JSON.stringify({ user: newUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { userId, email, password, nome, role, clienteId, ativo } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update auth user if email or password changed
      const updateData: any = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;
      if (Object.keys(updateData).length > 0) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, updateData);
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update profile
      const profileUpdate: any = {};
      if (nome !== undefined) profileUpdate.nome = nome;
      if (email !== undefined) profileUpdate.email = email;
      if (ativo !== undefined) profileUpdate.ativo = ativo;
      if (clienteId !== undefined) profileUpdate.cliente_id = clienteId || null;
      if (Object.keys(profileUpdate).length > 0) {
        await adminClient.from("profiles").update(profileUpdate).eq("id", userId);
      }

      // Update role if changed
      if (role) {
        await adminClient.from("user_roles").delete().eq("user_id", userId);
        await adminClient.from("user_roles").insert({ user_id: userId, role });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr && !delErr.message?.includes("not found")) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      // List all profiles + roles
      const { data: profiles, error: pErr } = await adminClient
        .from("profiles")
        .select("id, email, nome, ativo, cliente_id, created_at");
      const { data: roles, error: rErr } = await adminClient
        .from("user_roles")
        .select("user_id, role");
      if (pErr || rErr) {
        return new Response(JSON.stringify({ error: `Erro ao ler usuários: ${(pErr || rErr)!.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const users = (profiles || []).map((p) => {
        const userRole = roles?.find((r) => r.user_id === p.id);
        return {
          id: p.id,
          email: p.email,
          nome: p.nome,
          role: userRole?.role || "operador",
          clienteId: p.cliente_id,
          ativo: p.ativo,
        };
      });

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-users error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
