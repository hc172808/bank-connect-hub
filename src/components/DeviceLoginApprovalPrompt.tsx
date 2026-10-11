import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getDeviceInfo } from "@/hooks/useDeviceSession";

interface DeviceLoginRequest {
  id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  created_at: string;
  expires_at: string;
}

interface Props {
  accessToken?: string;
}

export function DeviceLoginApprovalPrompt({ accessToken }: Props) {
  const [requests, setRequests] = useState<DeviceLoginRequest[]>([]);
  const [requestsForToken, setRequestsForToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const device = useMemo(() => getDeviceInfo(), []);
  const { toast } = useToast();
  const request = accessToken && requestsForToken === accessToken ? requests[0] : undefined;

  const refresh = useCallback(async () => {
    if (!accessToken || inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(
        `/api/auth/device-login/requests?deviceId=${encodeURIComponent(device.deviceId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setRequestsForToken(accessToken);
          setRequests([]);
        }
        return;
      }
      const result = await response.json().catch(() => ({}));
      setRequestsForToken(accessToken);
      setRequests(result.available ? result.requests || [] : []);
    } catch {
      // Keep the last known prompt visible while connectivity recovers.
    } finally {
      inFlight.current = false;
    }
  }, [accessToken, device.deviceId]);

  useEffect(() => {
    if (!accessToken) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [accessToken, refresh]);

  const respond = async (allow: boolean) => {
    if (!request || !accessToken) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/device-login/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ...device, requestId: request.id, allow }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not respond to this login request.");
      setRequests((current) => current.filter((item) => item.id !== request.id));
      toast({
        title: allow ? "Login approved" : "Login denied",
        description: allow
          ? "The new device can now finish signing in. This device stays signed in."
          : "The sign-in request was blocked.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not respond",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        {request && (
          <>
            <DialogHeader className="items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <DialogTitle>Allow this device to sign in?</DialogTitle>
              <DialogDescription>
                If you allow it, both devices stay signed in. Your account can have up to two active devices.
              </DialogDescription>
            </DialogHeader>

            <div
              className="rounded-xl border bg-muted/40 p-4"
              data-testid={`status-login-request-${request.id}`}
            >
              <div className="flex items-center gap-3">
                {/mobile|phone|android|iphone/i.test(`${request.device_name} ${request.os}`)
                  ? <Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
                  : <Laptop className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <p className="truncate font-medium" data-testid={`text-login-device-${request.id}`}>
                    {request.device_name || "Unknown device"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[request.browser, request.os].filter(Boolean).join(" · ") || "Device details unavailable"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Requested {new Date(request.created_at).toLocaleString()}. If you did not start this, deny it.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:flex-col">
              <Button
                variant="outline"
                onClick={() => void respond(false)}
                disabled={busy}
                className="w-full"
                data-testid="button-deny-device-login"
              >
                Deny
              </Button>
              <Button
                onClick={() => void respond(true)}
                disabled={busy}
                className="w-full"
                data-testid="button-allow-device-login"
              >
                {busy ? "Saving…" : "Allow login"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
