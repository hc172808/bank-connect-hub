import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, GitBranch, RefreshCw, Loader2, CheckCircle2,
  XCircle, Download, RotateCcw, Info, CalendarClock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type UpdateStatus = "idle" | "running" | "done" | "failed";
const DEFAULT_GIT_REMOTE = "https://github.com/hc172808/bank-connect-hub.git";

const SystemSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const logRef = useRef<HTMLDivElement>(null);

  const [gitRemote, setGitRemote] = useState(DEFAULT_GIT_REMOTE);
  const [gitBranch, setGitBranch] = useState("main");
  const [restartAfter, setRestartAfter] = useState(false);
  const [notificationProvider, setNotificationProvider] = useState("in_app");
  const [notificationSender, setNotificationSender] = useState("NetLife Cash");
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [updateScheduleEnabled, setUpdateScheduleEnabled] = useState(true);
  const [updateScheduleSaving, setUpdateScheduleSaving] = useState(false);

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [logs, setLogs] = useState<{ kind: "step" | "log" | "error"; text: string }[]>([]);
  const esRef = useRef<EventSource | null>(null);

  // Auto-scroll log panel
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  // Cleanup SSE on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  useEffect(() => {
    void supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["notification_provider", "notification_sender"])
      .then(({ data }) => {
        (data || []).forEach((setting: { key: string; value: unknown }) => {
          if (setting.key === "notification_provider") setNotificationProvider(String(setting.value || "in_app"));
          if (setting.key === "notification_sender") setNotificationSender(String(setting.value || "NetLife Cash"));
        });
      });
  }, []);

  useEffect(() => {
    void fetch("/api/update/schedule", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load update schedule.");
        return response.json() as Promise<{ enabled?: boolean }>;
      })
      .then((schedule) => setUpdateScheduleEnabled(schedule.enabled !== false))
      .catch(() => {
        // Keep the enabled default; the host installer also enables the
        // monthly cron unless an administrator turns it off.
      });
  }, []);

  const saveNotificationSettings = async () => {
    setNotificationSaving(true);
    const { error } = await supabase.from("app_settings").upsert([
      { key: "notification_provider", value: notificationProvider },
      { key: "notification_sender", value: notificationSender || "NetLife Cash" },
    ], { onConflict: "key" });
    setNotificationSaving(false);
    toast({
      title: error ? "Notification settings failed" : "Notification settings saved",
      description: error ? error.message : "In-app reserve alerts remain active; the selected provider is ready for server configuration.",
      variant: error ? "destructive" : "default",
    });
  };

  const saveUpdateSchedule = async () => {
    setUpdateScheduleSaving(true);
    let serverError: string | null = null;
    try {
      const response = await fetch("/api/update/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: updateScheduleEnabled, day: 10, hour: 3, minute: 0 }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        serverError = data.error || response.statusText;
      }
    } catch (error) {
      serverError = error instanceof Error ? error.message : "Could not reach the update service.";
    }

    const { error: databaseError } = await supabase.from("app_settings").upsert({
      key: "update_schedule",
      value: { enabled: updateScheduleEnabled, day: 10, hour: 3, minute: 0 },
    }, { onConflict: "key" });
    setUpdateScheduleSaving(false);

    const error = serverError || databaseError?.message;
    toast({
      title: error ? "Update schedule failed" : "Update schedule saved",
      description: error || (updateScheduleEnabled
        ? "The app will pull, build, and restart services on the 10th at 03:00 server time."
        : "The monthly update cron is disabled. Manual updates remain available."),
      variant: error ? "destructive" : "default",
    });
  };

  const appendLog = (kind: "step" | "log" | "error", text: string) =>
    setLogs((prev) => [...prev, { kind, text }]);

  const connectStream = (withRestart = restartAfter) => {
    esRef.current?.close();
    const es = new EventSource("/api/update/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "idle") {
          es.close();
          return;
        }
        if (ev.type === "step") appendLog("step", ev.text);
        else if (ev.type === "log") appendLog("log", ev.text);
        else if (ev.type === "error") appendLog("error", ev.text);
        else if (ev.type === "done") {
          setStatus(ev.status === "done" ? "done" : "failed");
          if (ev.status === "done") {
            toast({ title: "Update complete", description: withRestart ? "All application services are restarting…" : "Reload the page to see changes." });
          } else {
            toast({ title: "Update failed", description: "Check the log for details.", variant: "destructive" });
          }
          es.close();
        }
      } catch (error) {
        void error;
      }
    };

    es.onerror = () => {
      es.close();
      void fetch("/api/update/status", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not verify update status.");
          return response.json() as Promise<{ status?: string }>;
        })
        .then((data) => {
          if (data.status === "done") {
            setStatus("done");
            toast({ title: "Update complete", description: "Reload the page to see changes." });
          } else if (data.status === "failed") {
            setStatus("failed");
            toast({ title: "Update failed", description: "Check the log for details.", variant: "destructive" });
          } else {
            setStatus("failed");
            appendLog("error", "The update connection closed before the server reported completion.");
            toast({ title: "Update status unavailable", description: "Check the server logs before trying again.", variant: "destructive" });
          }
        })
        .catch(() => {
          setStatus("failed");
          appendLog("error", "The update connection was lost before completion could be confirmed.");
          toast({ title: "Update status unavailable", description: "Check the server logs before trying again.", variant: "destructive" });
        });
    };
  };

  const runUpdate = async (withRestart = restartAfter) => {
    setStatus("running");
    setLogs([]);

    try {
      const r = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: gitBranch || "main",
          remote: gitRemote || undefined,
          restart: withRestart,
        }),
      });

      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setStatus("failed");
        toast({ title: "Failed to start update", description: d.error || r.statusText, variant: "destructive" });
        return;
      }

      connectStream(withRestart);
    } catch (err: unknown) {
      setStatus("failed");
      toast({
        title: "Network error",
        description: err instanceof Error ? err.message : "Could not reach the update service.",
        variant: "destructive",
      });
    }
  };

  const statusBadge = () => {
    if (status === "running") return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</Badge>;
    if (status === "done")    return <Badge className="gap-1 bg-green-600 text-white"><CheckCircle2 className="h-3 w-3" /> Done</Badge>;
    if (status === "failed")  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
    return null;
  };

  const busy = status === "running";

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate("/admin")} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-4xl mx-auto">

        {/* ── Update App ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Download className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Update App</CardTitle>
              <CardDescription className="mt-0.5">
                Pull the latest code from Git, install any new dependencies, then reload.
                User data is never touched.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Git options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                  <Label>Remote URL</Label>
                <Input
                  value={gitRemote}
                  onChange={(e) => setGitRemote(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label>Branch</Label>
                <Input
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                  disabled={busy}
                />
              </div>
            </div>

            <Separator />

            {/* Options */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Restart server after update</Label>
                <p className="text-xs text-muted-foreground">
                  Applies server-side changes immediately. The app will be briefly unavailable.
                </p>
              </div>
              <Switch
                checked={restartAfter}
                onCheckedChange={setRestartAfter}
                disabled={busy}
              />
            </div>

            {/* Action row */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={runUpdate} disabled={busy} className="gap-2">
                {busy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>
                  : <><RefreshCw className="h-4 w-4" /> Pull &amp; Update</>}
              </Button>
              <Button
                onClick={() => void runUpdate(true)}
                disabled={busy}
                variant="outline"
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" /> Pull, Build &amp; Restart All
              </Button>

              {statusBadge()}

              {status === "done" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 ml-auto"
                  onClick={() => window.location.reload()}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reload page
                </Button>
              )}
            </div>

            {/* Info note */}
            {status === "idle" && (
              <div className="flex gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>
                  This runs <code className="bg-muted px-1 rounded">git pull</code> then{" "}
                  <code className="bg-muted px-1 rounded">npm install</code>. Vite's hot-reload
                  picks up frontend changes automatically. Enable "Restart server" if you added
                  new backend packages or changed <code className="bg-muted px-1 rounded">build-server.mjs</code>.
                </span>
              </div>
            )}

            {/* Live log */}
            {logs.length > 0 && (
              <div
                ref={logRef}
                className="bg-black rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5"
              >
                {logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.kind === "step"  ? "text-yellow-300 font-semibold mt-2 first:mt-0" :
                      l.kind === "error" ? "text-red-400" :
                      "text-green-300"
                    }
                  >
                    {l.kind === "step" ? `▶ ${l.text}` : l.text}
                  </div>
                ))}
                {busy && <div className="text-gray-500 animate-pulse">…</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Scheduled Update ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-start gap-2">
            <CalendarClock className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <CardTitle>Monthly Automatic Update</CardTitle>
              <CardDescription className="mt-0.5">
                Pulls the latest code, builds the frontend, and restarts all application services on the 10th of every month at 03:00 server time.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="monthly-update-enabled" className="text-sm font-medium">
                  Enable monthly update cron
                </Label>
                <p className="text-xs text-muted-foreground">
                  Disable this if updates must only be started manually.
                </p>
              </div>
              <Switch
                id="monthly-update-enabled"
                checked={updateScheduleEnabled}
                onCheckedChange={setUpdateScheduleEnabled}
                disabled={updateScheduleSaving || busy}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void saveUpdateSchedule()}
                disabled={updateScheduleSaving || busy}
                className="gap-2"
              >
                {updateScheduleSaving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><CalendarClock className="h-4 w-4" /> Save monthly schedule</>}
              </Button>
              <span className="text-xs text-muted-foreground">
                Schedule: day 10 · 03:00 · server timezone
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── General Settings ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">System Name</h3>
                <p className="text-sm text-muted-foreground">Virtual Banking Services</p>
              </div>
              <Button variant="outline">Edit</Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Currency</h3>
                <p className="text-sm text-muted-foreground">USD</p>
              </div>
              <Button variant="outline">Edit</Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Notification Settings ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Provider</CardTitle>
            <CardDescription>
              Choose where future reserve and account alerts should be delivered. Credentials stay server-side.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notification-provider">Provider</Label>
              <select
                id="notification-provider"
                value={notificationProvider}
                onChange={(event) => setNotificationProvider(event.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="in_app">In-app notifications</option>
                <option value="twilio">Twilio SMS (server configured)</option>
                <option value="smtp">SMTP / email (server configured)</option>
                <option value="custom">Custom provider</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notification-sender">Sender label</Label>
              <Input
                id="notification-sender"
                value={notificationSender}
                onChange={(event) => setNotificationSender(event.target.value)}
                placeholder="NetLife Cash"
              />
            </div>
            <Button onClick={() => void saveNotificationSettings()} disabled={notificationSaving}>
              {notificationSaving ? "Saving…" : "Save notification settings"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Security Settings ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Security Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Two-Factor Authentication</h3>
                <p className="text-sm text-muted-foreground">Disabled</p>
              </div>
              <Button variant="outline">Enable</Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Session Timeout</h3>
                <p className="text-sm text-muted-foreground">30 minutes</p>
              </div>
              <Button variant="outline">Edit</Button>
            </div>
          </CardContent>
        </Card>

      </main>
    </div>
  );
};

export default SystemSettings;
