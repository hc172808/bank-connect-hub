import { useEffect, useState } from "react";
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
  const [confirmPin, setConfirmPin] = useState("");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [checkingPin, setCheckingPin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Your sign-in session has expired.");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("pin_hash")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;
      if (active) setHasPin(Boolean(profile?.pin_hash));
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : t("common.error"));
    }).finally(() => {
      if (active) setCheckingPin(false);
    });
    return () => { active = false; };
  }, [t]);

  const setNewPin = async () => {
    if (pin.length !== 4 || confirmPin.length !== 4) {
      setError("Enter and confirm a 4-digit PIN.");
      return;
    }
    if (pin !== confirmPin) {
      setError("The PINs do not match.");
      setConfirmPin("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data, error: pinError } = await supabase.rpc("set_user_pin", { user_pin: pin });
      if (pinError) throw pinError;
      if (data !== true) throw new Error("The PIN could not be saved. Please try again.");
      setPin("");
      setConfirmPin("");
      setHasPin(true);
      onUnlock();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const tryUnlock = async () => {
    if (pin.length !== 4 || hasPin !== true) return;
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { handleSignOut(); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("pin_hash")
        .eq("id", user.id)
        .single();

      if (!profile?.pin_hash) {
        setHasPin(false);
        setPin("");
        return;
      }

      // Hash the entered PIN and compare (SHA-256 hex)
      const encoder = new TextEncoder();
      const buf = await crypto.subtle.digest("SHA-256", encoder.encode(pin));
      const hashed = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

      if (hashed === profile.pin_hash) {
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
    await supabase.auth.signOut({ scope: "local" });
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
        <p className="text-sm text-center text-muted-foreground">
          {checkingPin
            ? t("actions.loading")
            : hasPin
              ? t("appLock.enterPin")
              : "Set a 4-digit PIN to secure this app."}
        </p>
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
          autoFocus={!checkingPin}
        />
        {!checkingPin && hasPin === false && (
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            onChange={(e) => {
              setConfirmPin(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && void setNewPin()}
            className="text-center text-2xl tracking-[0.5em] h-14"
            placeholder="Confirm PIN"
            aria-label="Confirm 4-digit PIN"
          />
        )}
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <Button
          onClick={hasPin === true ? tryUnlock : setNewPin}
          disabled={checkingPin || hasPin === null || pin.length !== 4 || loading || (hasPin === false && confirmPin.length !== 4)}
          className="w-full"
        >
          {loading || checkingPin ? t("actions.loading") : hasPin ? t("appLock.unlockWithPin") : "Set PIN and unlock"}
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground gap-2">
        <LogIn className="h-4 w-4" />
        {t("appLock.signInAgain")}
      </Button>
    </div>
  );
}
