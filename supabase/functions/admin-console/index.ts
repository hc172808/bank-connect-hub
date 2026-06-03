import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const { command } = await req.json();
    if (typeof command !== "string") return json({ error: "command required" }, 400);
    const [cmd, ...args] = command.trim().split(/\s+/);

    // Audit log
    await admin.from("audit_logs").insert({
      actor_id: userData.user.id,
      actor_role: "admin",
      action: "console_command",
      entity_type: "console",
      metadata: { command },
    });

    let result: unknown;

    switch (cmd) {
      case "process-reversals": {
        const { data, error } = await admin.rpc("process_pending_reversals");
        if (error) throw error;
        result = data;
        break;
      }
      case "recalc-balances": {
        const { data: wallets } = await admin.from("wallets").select("user_id");
        let updated = 0;
        for (const w of wallets ?? []) {
          const { data: txs } = await admin
            .from("transactions")
            .select("amount, fee, sender_id, receiver_id, status")
            .or(`sender_id.eq.${w.user_id},receiver_id.eq.${w.user_id}`)
            .eq("status", "completed");
          let bal = 0;
          for (const t of txs ?? []) {
            if (t.receiver_id === w.user_id) bal += Number(t.amount);
            if (t.sender_id === w.user_id) bal -= Number(t.amount) + Number(t.fee ?? 0);
          }
          await admin.from("wallets").update({ balance: bal }).eq("user_id", w.user_id);
          updated++;
        }
        result = { wallets_recomputed: updated };
        break;
      }
      case "clear-stale-sessions": {
        const cutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
        const { data } = await admin
          .from("device_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .lt("last_active_at", cutoff)
          .is("revoked_at", null)
          .select("id");
        result = { sessions_revoked: data?.length ?? 0 };
        break;
      }
      case "kyc-stats": {
        const { data } = await admin.from("kyc_submissions").select("status");
        const counts: Record<string, number> = {};
        for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
        result = counts;
        break;
      }
      case "tx-stats": {
        const now = Date.now();
        const day = new Date(now - 86400_000).toISOString();
        const week = new Date(now - 7 * 86400_000).toISOString();
        const month = new Date(now - 30 * 86400_000).toISOString();
        const { data: rows } = await admin
          .from("transactions")
          .select("amount, created_at, status")
          .eq("status", "completed")
          .gte("created_at", month);
        const sum = (arr: { amount: number }[]) =>
          arr.reduce((s, r) => s + Number(r.amount), 0);
        result = {
          last_24h: { count: rows?.filter((r) => r.created_at >= day).length ?? 0, total: sum(rows?.filter((r) => r.created_at >= day) ?? []) },
          last_7d: { count: rows?.filter((r) => r.created_at >= week).length ?? 0, total: sum(rows?.filter((r) => r.created_at >= week) ?? []) },
          last_30d: { count: rows?.length ?? 0, total: sum(rows ?? []) },
        };
        break;
      }
      case "flag-large-tx": {
        const threshold = Number(args[0] ?? 10000);
        const { data } = await admin
          .from("transactions")
          .select("id, amount, sender_id, receiver_id, created_at")
          .gte("amount", threshold)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(50);
        result = { threshold, transactions: data ?? [] };
        break;
      }
      case "alerts-open": {
        const { data } = await admin
          .from("suspicious_activity_alerts")
          .select("id, alert_type, severity, description, created_at, user_id")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(50);
        result = { open_alerts: data ?? [] };
        break;
      }
      default:
        return json({ error: `Unknown command: ${cmd}. Type 'help' for the list.` }, 400);
    }

    return json(result);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});