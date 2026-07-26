import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, initSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";

/**
 * TEMPORARY one-shot admin setup page.
 * Creates phone 6421651 / Zaq12wsx as admin.
 * Remove this file and route from App.tsx after use.
 */
export default function SetupAdminUser() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [lines, setLines] = useState<{ text: string; ok?: boolean }[]>([]);
  const [userId, setUserId] = useState("");

  const log = (text: string, ok?: boolean) =>
    setLines((l) => [...l, { text, ok }]);

  useEffect(() => {
    (async () => {
      const EMAIL    = "6421651@vbank.com";
      const PASSWORD = "Zaq12wsx";
      const METADATA = { full_name: "Admin", phone_number: "6421651", account_type: "admin" };

      log("Initialising Supabase client…");
      await initSupabase();
      log("Attempting sign-up for " + EMAIL + " …");

      // ── Try sign-up ──────────────────────────────────────────────────────
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: EMAIL,
        password: PASSWORD,
        options: { data: METADATA },
      });

      if (signUpErr) {
        if (signUpErr.message?.toLowerCase().includes("already registered") ||
            signUpErr.message?.toLowerCase().includes("already been registered")) {
          log("User already exists — verifying credentials…");
        } else {
          log("Sign-up error: " + signUpErr.message, false);
          setStatus("error");
          return;
        }
      } else if (signUpData?.user) {
        const uid = signUpData.user.id;
        setUserId(uid);
        log("✅ User created! ID: " + uid, true);
        log("Metadata account_type: " + (signUpData.user.user_metadata?.account_type || "not set"),
            signUpData.user.user_metadata?.account_type === "admin");
        if (!signUpData.session) {
          log("⚠ No session — Supabase email confirmation may be enabled. Check Supabase Dashboard → Auth → Settings → 'Confirm email' and disable it.", false);
        } else {
          log("✅ Session active — user can sign in immediately.", true);
        }
      }

      // ── If user already existed, sign in to confirm + update metadata ───
      if (signUpErr) {
        const { data: signinData, error: signinErr } = await supabase.auth.signInWithPassword({
          email: EMAIL,
          password: PASSWORD,
        });
        if (signinErr) {
          log("Sign-in failed: " + signinErr.message, false);
          setStatus("error");
          return;
        }
        const uid = signinData.user?.id || "";
        setUserId(uid);
        log("✅ Signed in successfully. User ID: " + uid, true);

        const currentType = signinData.user?.user_metadata?.account_type;
        if (currentType !== "admin") {
          log("Updating metadata to account_type: admin…");
          const { error: updateErr } = await supabase.auth.updateUser({ data: METADATA });
          if (updateErr) {
            log("Metadata update failed: " + updateErr.message, false);
          } else {
            log("✅ Metadata updated — account_type is now admin.", true);
          }
        } else {
          log("✅ account_type is already admin.", true);
        }
        // Sign out so the state is clean
        await supabase.auth.signOut();
        log("Signed out — ready for admin sign-in.");
      }

      // ── Try inserting into user_roles table ──────────────────────────────
      if (userId || signUpData?.user?.id) {
        const uid = userId || signUpData?.user?.id || "";
        if (uid) {
          const { error: roleErr } = await (supabase as any)
            .from("user_roles")
            .upsert({ user_id: uid, role: "admin" });
          if (roleErr) {
            log("Note: user_roles insert failed (" + roleErr.message + ") — role will use metadata fallback instead.", undefined);
          } else {
            log("✅ Admin role inserted into user_roles table.", true);
          }
        }
      }

      log("─────────────────────────────────");
      log("✅ Done! Sign in with:", true);
      log("  Phone: 6421651", true);
      log("  Password: Zaq12wsx", true);
      setStatus("done");
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
              l.ok === true ? "text-green-600" :
              l.ok === false ? "text-red-500" :
              "text-foreground/80"
            }`}>
              {l.ok === true && <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {l.ok === false && <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
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
          <p className="text-sm text-red-500 text-center">
            Setup failed. Check the log above and try again, or create the user manually via the Supabase dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
