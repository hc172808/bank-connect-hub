import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, GitBranch, RefreshCw, Loader2, CheckCircle2,
  XCircle, Download, RotateCcw, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type UpdateStatus = "idle" | "running" | "done" | "failed";

const SystemSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const logRef = useRef<HTMLDivElement>(null);

  const [gitRemote, setGitRemote] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [restartAfter, setRestartAfter] = useState(false);

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [logs, setLogs] = useState<{ kind: "step" | "log" | "error"; text: string }[]>([]);
  const esRef = useRef<EventSource | null>(null);

  // Auto-scroll log panel
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  // Cleanup SSE on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  const appendLog = (kind: "step" | "log" | "error", text: string) =>
    setLogs((prev) => [...prev, { kind, text }]);

  const connectStream = () => {
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
            toast({ title: "Update complete", description: restartAfter ? "Server is restarting…" : "Reload the page to see changes." });
          } else {
            toast({ title: "Update failed", description: "Check the log for details.", variant: "destructive" });
          }
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      // If server restarted mid-stream, the SSE connection drops — that's expected
      setStatus((s) => s === "running" ? "done" : s);
      es.close();
    };
  };

  const runUpdate = async () => {
    setStatus("running");
    setLogs([]);

    try {
      const r = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: gitBranch || "main",
          remote: gitRemote || undefined,
          restart: restartAfter,
        }),
      });

      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setStatus("failed");
        toast({ title: "Failed to start update", description: d.error || r.statusText, variant: "destructive" });
        return;
      }

      connectStream();
    } catch (err: any) {
      setStatus("failed");
      toast({ title: "Network error", description: err.message, variant: "destructive" });
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
                <Label>Remote URL <span className="text-muted-foreground text-xs">(leave blank to use existing origin)</span></Label>
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
