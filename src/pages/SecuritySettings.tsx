import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Shield, Smartphone, ShieldCheck, ShieldOff, Trash2, Bell, BellOff } from "lucide-react";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { UAParser } from "ua-parser-js";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const PushNotificationCard = () => {
  const { state, loading, enable, disable } = usePushNotifications();

  const label: Record<string, string> = {
    unsupported: "Not supported in this browser",
    denied: "Blocked — allow in browser settings",
    prompt: "Not enabled",
    unsubscribed: "Not enabled",
    subscribed: "Enabled",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Push Notifications
        </CardTitle>
        <CardDescription>
          Receive instant alerts even when the app isn't open.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Status</p>
            <p className="text-xs text-muted-foreground">{label[state]}</p>
          </div>
          <Badge variant={state === "subscribed" ? "default" : "secondary"}>
            {state === "subscribed" ? "On" : "Off"}
          </Badge>
        </div>

        {state === "unsupported" && (
          <p className="text-xs text-muted-foreground">
            Web Push is not available in your current browser.
          </p>
        )}
        {state === "denied" && (
          <p className="text-xs text-destructive">
            Notifications are blocked. Open browser site settings and allow notifications, then try again.
          </p>
        )}

        {state !== "unsupported" && state !== "denied" && (
          state === "subscribed" ? (
            <Button variant="outline" size="sm" onClick={disable} disabled={loading} className="w-full">
              <BellOff className="h-4 w-4 mr-2" />
              {loading ? "Disabling…" : "Disable Push Notifications"}
            </Button>
          ) : (
            <Button size="sm" onClick={enable} disabled={loading} className="w-full">
              <Bell className="h-4 w-4 mr-2" />
              {loading ? "Enabling…" : "Enable Push Notifications"}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
};

interface DeviceSession {
  id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
}

const generateBackupCodes = () =>
  Array.from({ length: 8 }, () =>
    Math.random().toString(36).substring(2, 6).toUpperCase() + "-" +
    Math.random().toString(36).substring(2, 6).toUpperCase()
  );

const SecuritySettings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [otp, setOtp] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserEmail(user.email || "");

    const { data: tfa } = await supabase
      .from("two_factor_auth" as never)
      .select("enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    setTwoFAEnabled(!!(tfa as { enabled?: boolean } | null)?.enabled);

    await ensureCurrentSession(user.id);
    const { data: ds } = await supabase
      .from("device_sessions" as never)
      .select("*")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("last_active_at", { ascending: false });
    setSessions((ds as DeviceSession[]) || []);
    setLoading(false);
  };

  const ensureCurrentSession = async (userId: string) => {
    const sessionKey = `device_session_${userId}`;
    let id = localStorage.getItem(sessionKey);
    const parser = new UAParser(navigator.userAgent);
    const browser = parser.getBrowser().name || "Unknown";
    const os = parser.getOS().name || "Unknown";
    const device = parser.getDevice().model || `${os} Device`;

    if (id) {
      await supabase
        .from("device_sessions" as never)
        .update({ last_active_at: new Date().toISOString() } as never)
        .eq("id", id);
    } else {
      const { data } = await supabase
        .from("device_sessions" as never)
        .insert({
          user_id: userId,
          device_name: device,
          browser,
          os,
          user_agent: navigator.userAgent,
          is_current: true,
        } as never)
        .select("id")
        .single();
      if (data) {
        localStorage.setItem(sessionKey, (data as { id: string }).id);
      }
    }
  };

  const startSetup = async () => {
    const newSecret = new OTPAuth.Secret({ size: 20 }).base32;
    const totp = new OTPAuth.TOTP({
      issuer: "Lovable Pay",
      label: userEmail || "user",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(newSecret),
    });
    const url = totp.toString();
    const dataUrl = await QRCode.toDataURL(url);
    setSecret(newSecret);
    setQrDataUrl(dataUrl);
    setBackupCodes(generateBackupCodes());
    setSetupMode(true);
  };

  const verifyAndEnable = async () => {
    const totp = new OTPAuth.TOTP({
      issuer: "Lovable Pay",
      label: userEmail,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: otp, window: 1 });
    if (delta === null) {
      toast.error("Invalid code, try again");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("two_factor_auth" as never)
      .upsert({
        user_id: user.id,
        secret,
        backup_codes: backupCodes,
        enabled: true,
        verified_at: new Date().toISOString(),
      } as never, { onConflict: "user_id" });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("profiles").update({ two_factor_enabled: true } as never).eq("id", user.id);
    await supabase.rpc("log_audit_event" as never, {
      _action: "enable_2fa", _entity_type: "user", _entity_id: user.id,
    } as never);
    toast.success("2FA enabled. Save your backup codes!");
    setTwoFAEnabled(true);
    setSetupMode(false);
    setOtp("");
  };

  const disable2FA = async () => {
    if (!confirm("Disable two-factor authentication?")) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("two_factor_auth" as never).delete().eq("user_id", user.id);
    await supabase.from("profiles").update({ two_factor_enabled: false } as never).eq("id", user.id);
    await supabase.rpc("log_audit_event" as never, {
      _action: "disable_2fa", _entity_type: "user", _entity_id: user.id,
    } as never);
    toast.success("2FA disabled");
    setTwoFAEnabled(false);
  };

  const revokeSession = async (id: string) => {
    await supabase
      .from("device_sessions" as never)
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("id", id);
    toast.success("Session revoked");
    setSessions(sessions.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><Shield className="h-5 w-5" /> Security</h1>
      </header>

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Two-Factor Authentication
              {twoFAEnabled && <Badge>Enabled</Badge>}
            </CardTitle>
            <CardDescription>Use an authenticator app for an extra layer of security.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!twoFAEnabled && !setupMode && (
              <Button onClick={startSetup}>Enable 2FA</Button>
            )}
            {setupMode && (
              <div className="space-y-3">
                <p className="text-sm">Scan the QR with Google Authenticator / Authy:</p>
                {qrDataUrl && <img src={qrDataUrl} alt="2FA QR" className="w-48 h-48 mx-auto" />}
                <div className="text-xs break-all bg-muted p-2 rounded">Secret: {secret}</div>
                <div>
                  <Label>Enter 6-digit code</Label>
                  <Input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} placeholder="123456" />
                </div>
                <div className="bg-muted p-3 rounded">
                  <p className="text-xs font-semibold mb-2">Backup codes (save these):</p>
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                    {backupCodes.map((c) => <div key={c}>{c}</div>)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={verifyAndEnable}>Verify & Enable</Button>
                  <Button variant="outline" onClick={() => setSetupMode(false)}>Cancel</Button>
                </div>
              </div>
            )}
            {twoFAEnabled && (
              <Button variant="destructive" onClick={disable2FA}>
                <ShieldOff className="h-4 w-4 mr-2" /> Disable 2FA
              </Button>
            )}
          </CardContent>
        </Card>

        <PushNotificationCard />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Active Sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!loading && sessions.length === 0 && <p className="text-sm text-muted-foreground">No active sessions.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="flex justify-between items-center border p-3 rounded">
                <div>
                  <p className="font-medium text-sm">
                    {s.browser} on {s.os}
                    {s.is_current && <Badge variant="secondary" className="ml-2">Current</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last active: {new Date(s.last_active_at).toLocaleString()}
                  </p>
                </div>
                {!s.is_current && (
                  <Button size="icon" variant="ghost" onClick={() => revokeSession(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SecuritySettings;