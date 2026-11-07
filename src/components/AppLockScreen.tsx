import { useEffect, useState } from "react";
import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/hooks/useT";
import { isValidAppLockPin } from "@/lib/appLockPin";
import { clearAppLockRequirement } from "@/hooks/useAppLock";

interface Props {
  onUnlock: () => void;
}

export function AppLockScreen({ onUnlock }: Props) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [legacyPinMode, setLegacyPinMode] = useState(false);
  const [canSetAppLockPin, setCanSetAppLockPin] = useState(true);
  const [checkingPin, setCheckingPin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Your sign-in session has expired.");
      const { data: configured, error: statusError } = await supabase.rpc(
        "has_app_lock_pin" as never,
        {} as never,
      );
      if (!statusError) {
        if (active) {
          setHasPin(configured === true);
          setCanSetAppLockPin(true);
        }
        return;
      }

      // Keep existing users able to unlock with their transaction PIN until
      // the App Lock database migration has been applied.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("pin_hash")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;
      if (active) {
        const hasLegacyPin = Boolean(profile?.pin_hash);
        setHasPin(hasLegacyPin);
        setLegacyPinMode(true);
        setCanSetAppLockPin(true);
        if (!hasLegacyPin) {
          setError("The database update for mixed-character passcodes is not applied. You can set a temporary 4–10 digit code.");
        }
      }
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : t("common.error"));
    }).finally(() => {
      if (active) setCheckingPin(false);
    });
    return () => { active = false; };
  }, [t]);

  const setNewPin = async () => {
    if (!canSetAppLockPin) {
      setError("Apply the latest Supabase SQL update before creating an App Lock passcode.");
      return;
    }
    const validNewPin = legacyPinMode
      ? /^\d{4,10}$/.test(pin)
      : isValidAppLockPin(pin);
    const validNewConfirm = legacyPinMode
      ? /^\d{4,10}$/.test(confirmPin)
      : isValidAppLockPin(confirmPin);
    if (!validNewPin || !validNewConfirm) {
      setError(legacyPinMode
        ? "Use 4–10 digits until the latest database update is applied."
        : "Use 4–10 letters, numbers, or symbols. Spaces are not allowed.");
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
      const result = legacyPinMode
        ? await supabase.rpc("set_user_pin", { user_pin: pin })
        : await supabase.rpc("set_app_lock_pin" as never, { user_pin: pin } as never);
      const { data, error: pinError } = result;
      if (pinError) throw pinError;
      if (data !== true) throw new Error("The App Lock passcode could not be saved. Please try again.");
      setPin("");
      setConfirmPin("");
      setHasPin(true);
      setLegacyPinMode(false);
      onUnlock();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const tryUnlock = async () => {
    const validCurrentPin = legacyPinMode
      ? /^\d{4,10}$/.test(pin)
      : isValidAppLockPin(pin);
    if (!validCurrentPin || hasPin !== true) return;
    setLoading(true);
    setError("");
    try {
      let isCorrect = false;
      if (legacyPinMode) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { handleSignOut(); return; }
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("pin_hash")
          .eq("id", user.id)
          .single();
        if (profileError) throw profileError;
        if (!profile?.pin_hash) {
          setHasPin(false);
          setPin("");
          return;
        }
        const encoder = new TextEncoder();
        const buf = await crypto.subtle.digest("SHA-256", encoder.encode(pin));
        const hashed = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
        isCorrect = hashed === profile.pin_hash;
      } else {
        const { data, error: verifyError } = await supabase.rpc(
          "verify_app_lock_pin" as never,
          { user_pin: pin } as never,
        );
        if (verifyError) throw verifyError;
        isCorrect = data === true;
      }

      if (isCorrect) {
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
    clearAppLockRequirement();
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/auth";
  };
  const validCurrentPin = legacyPinMode
    ? /^\d{4,10}$/.test(pin)
    : isValidAppLockPin(pin);
  const validConfirmPin = legacyPinMode
    ? /^\d{4,10}$/.test(confirmPin)
    : isValidAppLockPin(confirmPin);

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
              ? legacyPinMode
                ? "Database update pending. Enter your existing 4–10 digit code."
                : "Enter your App Lock passcode."
              : canSetAppLockPin
                ? legacyPinMode
                  ? "Set a temporary 4–10 digit code. Apply the database update to use letters and symbols."
                  : "Set a passcode of 4–10 characters. Letters, numbers, and symbols are allowed."
                : "App Lock setup needs the latest Supabase database update."}
        </p>
        <Input
          type="password"
          inputMode="text"
          autoComplete={hasPin ? "current-password" : "new-password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={10}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
          className="text-center text-xl tracking-widest h-14"
          placeholder={hasPin ? "App Lock passcode" : "4–10 characters"}
          autoFocus={!checkingPin}
        />
        {!checkingPin && hasPin === false && canSetAppLockPin && (
          <Input
            type="password"
            inputMode="text"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={10}
            value={confirmPin}
            onChange={(e) => {
              setConfirmPin(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && void setNewPin()}
            className="text-center text-xl tracking-widest h-14"
            placeholder="Confirm passcode"
            aria-label="Confirm App Lock passcode"
          />
        )}
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <Button
          onClick={hasPin === true ? tryUnlock : setNewPin}
          disabled={checkingPin || hasPin === null || !validCurrentPin || loading || (hasPin === false && (!canSetAppLockPin || !validConfirmPin))}
          className="w-full"
        >
          {loading || checkingPin ? t("actions.loading") : hasPin ? "Unlock app" : "Set passcode and unlock"}
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground gap-2">
        <LogIn className="h-4 w-4" />
        {t("appLock.signInAgain")}
      </Button>
    </div>
  );
}
