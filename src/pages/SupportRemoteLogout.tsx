import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, LockKeyhole, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PageState = "loading" | "ready" | "submitting" | "success" | "invalid";

export default function SupportRemoteLogout() {
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");
  const [state, setState] = useState<PageState>("loading");
  const [message, setMessage] = useState("");
  const [revokedCount, setRevokedCount] = useState<number | null>(null);

  useEffect(() => {
    const rawToken = window.location.hash.slice(1).trim();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (!/^[0-9a-f]{64}$/i.test(rawToken)) {
      setMessage("This confirmation link is invalid or has expired. Contact support for a new link.");
      setState("invalid");
      return;
    }
    setToken(rawToken);
    setState("ready");
  }, []);

  const confirmLogout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(pin) || !token) {
      setMessage("Enter your four-digit wallet-lock PIN.");
      return;
    }

    setState("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/auth/support-logout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      const result = await response.json().catch(() => ({}));
      setPin("");
      if (!response.ok || result.ok !== true) {
        setMessage(result.error || "Could not confirm the logout. Contact support.");
        setState(response.status === 410 || response.status === 429 ? "invalid" : "ready");
        return;
      }
      setRevokedCount(Number(result.revokedCount) || 0);
      setToken("");
      setState("success");
    } catch {
      setPin("");
      setMessage("Could not reach the confirmation service. Check your connection and try again.");
      setState("ready");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-md shadow-xl border-primary/20">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            {state === "success"
              ? <CheckCircle2 className="h-7 w-7 text-green-600" />
              : state === "invalid"
                ? <AlertTriangle className="h-7 w-7 text-destructive" />
                : <LockKeyhole className="h-7 w-7 text-primary" />}
          </div>
          <CardTitle>
            {state === "success" ? "Signed out of your devices" : "Confirm account sign-out"}
          </CardTitle>
          <CardDescription>
            {state === "success"
              ? `Your PIN was confirmed. ${revokedCount ?? 0} active device session${revokedCount === 1 ? " was" : "s were"} signed out.`
              : "Enter the four-digit PIN you use to unlock your wallet. It is checked securely and is never shown to support staff."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "loading" ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : state === "success" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">You can now return to the app and sign in again.</p>
              <Button asChild className="w-full">
                <Link to="/auth">Go to sign in</Link>
              </Button>
            </div>
          ) : state === "invalid" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-destructive">{message}</p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth">Go to sign in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => void confirmLogout(event)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="support-logout-pin" className="text-sm font-medium">
                  Wallet-lock PIN
                </label>
                <Input
                  id="support-logout-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4-digit PIN"
                  disabled={state === "submitting"}
                  autoFocus
                />
              </div>
              {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
              <Button type="submit" className="w-full" disabled={state === "submitting" || pin.length !== 4}>
                {state === "submitting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm and sign out all devices
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                This link is single-use and expires shortly. Support staff should never ask you to send them your PIN.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
