import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, initSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";

/**
 * TEMPORARY one-shot admin setup page.
 * Creates phone 6421651 / Zaq12wsx as admin via the server-side endpoint
 * so email confirmation is bypassed automatically.
 * Remove this file and route from App.tsx after use.
 */
export default function SetupAdminUser() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [lines, setLines] = useState<{ text: string; ok?: boolean }[]>([]);

  const log = (text: string, ok?: boolean) =>
    setLines((l) => [...l, { text, ok }]);

  useEffect(() => {
    (async () => {
      const PHONE    = "6421651";
      // Canonical email matches what the login page generates for GY (+592) + 6421651
      const EMAIL    = `592${PHONE}@vbank.com`;   // → 5926421651@vbank.com
      const PASSWORD = "Zaq12wsx";
      const METADATA = { full_name: "Admin", phone_number: PHONE, account_type: "admin" };
      // Legacy email (no country code) — migrate automatically if it exists
      const LEGACY   = [`${PHONE}@vbank.com`, `${PHONE}@virtualbank.app`];

      try {
        // ── Step 1: Create or confirm user via server (uses service role key) ──
        log("Creating / confirming admin user via server…");
        const res = await fetch("/api/auth/ensure-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: EMAIL, password: PASSWORD, metadata: METADATA, legacyEmails: LEGACY }),
        });
        const data = await res.json();

        if (!res.ok) {
          log("Server error: " + (data.error || res.status), false);
          setStatus("error");
          return;
        }

        log(`✅ User ready (ID: ${data.userId}) — email confirmed.`, true);

        // ── Step 2: Verify sign-in works ──────────────────────────────────────
        log("Verifying sign-in…");
        await initSupabase();
        const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
          email: EMAIL,
          password: PASSWORD,
        });

        if (signInErr) {
          log("Sign-in failed: " + signInErr.message, false);
          if (signInErr.message?.toLowerCase().includes("confirm")) {
            log("→ Go to Supabase Dashboard → Auth → Settings and disable 'Confirm email'.", false);
          }
          setStatus("error");
          return;
        }

        log(`✅ Sign-in successful! User ID: ${signIn.user?.id}`, true);
        log(`✅ account_type: ${signIn.user?.user_metadata?.account_type || "not set"}`, true);

        // Sign out so the state is clean for the actual login
        await supabase.auth.signOut();
        log("Signed out — ready for login.");

        log("─────────────────────────────────");
        log("✅ Done! Sign in with:", true);
        log("  Phone: 6421651", true);
        log("  Password: Zaq12wsx", true);
        setStatus("done");

      } catch (err: any) {
        log("Unexpected error: " + err.message, false);
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Admin User Setup</h1>
            <p className="text-sm text-muted-foreground">One-time setup — remove after use</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 font-mono text-sm space-y-1.5 min-h-[200px]">
          {status === "running" && lines.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Initializing…
            </div>
          )}
          {lines.map((l, i) => (
            <div key={i} className={`flex items-start gap-2 ${
              l.ok === true  ? "text-green-600" :
              l.ok === false ? "text-red-500"   :
              "text-foreground/80"
            }`}>
              {l.ok === true  && <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {l.ok === false && <XCircle      className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {l.ok === undefined && <span className="w-3.5 shrink-0" />}
              <span>{l.text}</span>
            </div>
          ))}
          {status === "running" && lines.length > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Working…
            </div>
          )}
        </div>

        {status === "done" && (
          <Button className="w-full" onClick={() => navigate("/auth")}>
            Go to Sign In →
          </Button>
        )}
        {status === "error" && (
          <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
