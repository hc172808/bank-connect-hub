import { useState } from "react";
import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/hooks/useT";

interface Props {
  onUnlock: () => void;
}

export function AppLockScreen({ onUnlock }: Props) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tryUnlock = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { handleSignOut(); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("transaction_pin")
        .eq("id", user.id)
        .single();

      if (!profile?.transaction_pin) {
        // No PIN set — just unlock (PIN was never configured)
        onUnlock();
        return;
      }

      // Hash the entered PIN and compare (SHA-256 hex)
      const encoder = new TextEncoder();
      const buf = await crypto.subtle.digest("SHA-256", encoder.encode(pin));
      const hashed = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

      if (hashed === profile.transaction_pin) {
        setPin("");
        onUnlock();
      } else {
        setError(t("appLock.pinError"));
        setPin("");
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center shadow-lg">
          <Lock className="h-9 w-9 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-black">{t("appLock.locked")}</h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs">{t("appLock.lockedDesc")}</p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <p className="text-sm text-center text-muted-foreground">{t("appLock.enterPin")}</p>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
          className="text-center text-2xl tracking-[0.5em] h-14"
          placeholder="••••"
          autoFocus
        />
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <Button onClick={tryUnlock} disabled={pin.length !== 4 || loading} className="w-full">
          {loading ? t("actions.loading") : t("appLock.unlockWithPin")}
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground gap-2">
        <LogIn className="h-4 w-4" />
        {t("appLock.signInAgain")}
      </Button>
    </div>
  );
}
