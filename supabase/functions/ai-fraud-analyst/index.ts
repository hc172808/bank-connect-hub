import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  getLovableAiGatewayResponseHeaders,
} from "../_shared/run-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};

const json = (body: unknown, status = 200, extra?: Headers) => {
  const headers = new Headers(extra);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
};

const SYSTEM = `You are a fraud and AML analyst for a digital wallet / mobile banking platform.
An administrator gives you transaction and account activity details. Analyse them and reply in Markdown with these sections:
## Risk level  (one of Low / Medium / High / Critical, plus a one-sentence reason)
## Suspicious patterns  (bullets; cite the specific amounts, times, or accounts that support each)
## Recommended investigation steps  (numbered, concrete actions an admin can take in the app: review KYC, check device sessions, contact user, temporarily disable account, request reversal, file a report)
## Benign explanations to rule out
## Missing information  (what data would sharpen the assessment)
Be factual. Never invent data not present in the input. You are advisory only: do not claim to have taken any action, and never recommend adjusting balances without human reconciliation. Keep the whole answer under 500 words.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured for this project." }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const details = typeof body?.details === "string" ? body.details.trim() : "";
    if (details.length < 10) return json({ error: "Please provide some activity details." }, 400);
    if (details.length > 30000) return json({ error: "Details are too long (max 30,000 characters)." }, 400);

    const gateway = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
    const upstream = await gateway.fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Activity details:\n\n${details}` },
        ],
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    const aigHeaders = getLovableAiGatewayResponseHeaders(upstream.headers);

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      let message = "AI analysis failed.";
      try { message = JSON.parse(text)?.error?.message ?? JSON.parse(text)?.message ?? message; } catch { /* keep */ }
      if (upstream.status === 429) message = "AI is busy right now. Please try again in a minute.";
      if (upstream.status === 402) message = message || "AI credits are exhausted. Add credits in workspace billing.";
      return json({ error: message }, upstream.status, aigHeaders);
    }

    // Read the SSE stream server-side and collect the final text.
    const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let text = "";
    let streamError = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "response.output_text.delta") text += evt.delta ?? "";
          else if (evt.type === "error" || evt.type === "response.failed")
            streamError = evt.error?.message ?? evt.response?.error?.message ?? "AI analysis failed.";
        } catch { /* ignore partial */ }
      }
    }

    if (streamError) return json({ error: streamError }, 502, aigHeaders);
    if (!text.trim()) return json({ error: "The AI returned no analysis. Please try again with more detail." }, 502, aigHeaders);

    await userClient.rpc("log_audit_event", {
      _action: "ai_fraud_analysis",
      _entity_type: "ai",
      _metadata: { input_chars: details.length },
    });

    return json({ analysis: text }, 200, aigHeaders);
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
