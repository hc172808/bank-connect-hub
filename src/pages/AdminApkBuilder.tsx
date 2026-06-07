import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Play,
  Square,
  Download,
  RefreshCw,
  Smartphone,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Cpu,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Build {
  id: string;
  version: string;
  buildType: "debug" | "release";
  includeRpcNode: boolean;
  status: "running" | "success" | "failed";
  startedAt: string;
  finishedAt?: string;
  apkFile?: string;
  logs?: string[];
}

const StatusBadge = ({ status }: { status: Build["status"] }) => {
  if (status === "running")
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </Badge>
    );
  if (status === "success")
    return (
      <Badge className="gap-1 bg-green-600 text-white">
        <CheckCircle2 className="h-3 w-3" /> Success
      </Badge>
    );
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" /> Failed
    </Badge>
  );
};

const elapsed = (startedAt: string, finishedAt?: string) => {
  const ms = new Date(finishedAt ?? Date.now()).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

export default function AdminApkBuilder() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [version, setVersion] = useState("1.0.0");
  const [buildType, setBuildType] = useState<"debug" | "release">("debug");
  const [includeRpcNode, setIncludeRpcNode] = useState(true);
  const [building, setBuilding] = useState(false);
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [buildStatus, setBuildStatus] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [history, setHistory] = useState<Build[]>([]);
  const [selectedLogBuild, setSelectedLogBuild] = useState<Build | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [logs]);

  const loadHistory = async () => {
    try {
      const r = await fetch("/api/builds");
      if (r.ok) setHistory(await r.json());
    } catch {}
  };

  useEffect(() => {
    loadHistory();
    checkRunningBuild();
  }, []);

  const checkRunningBuild = async () => {
    try {
      const r = await fetch("/api/build/status");
      if (!r.ok) return;
      const data = await r.json();
      if (data.status === "running") {
        setBuilding(true);
        setBuildStatus("running");
        setCurrentBuildId(data.id);
        setLogs([]);
        streamLogs();
      }
    } catch {}
  };

  const streamLogs = () => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource("/api/build/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "log") {
        setLogs((prev) => [...prev, msg.text]);
      } else if (msg.type === "done") {
        setBuildStatus(msg.status);
        setBuilding(false);
        es.close();
        loadHistory();
        toast({
          title: msg.status === "success" ? "Build successful!" : "Build failed",
          variant: msg.status === "success" ? "default" : "destructive",
        });
      } else if (msg.type === "idle") {
        es.close();
      }
    };

    es.onerror = () => es.close();
  };

  const startBuild = async () => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      toast({ title: "Invalid version", description: "Use format: 1.0.0", variant: "destructive" });
      return;
    }
    setLogs([]);
    setBuildStatus("running");
    setBuilding(true);

    try {
      const r = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, buildType, includeRpcNode }),
      });

      if (r.status === 409) {
        toast({ title: "Build already running", variant: "destructive" });
        setBuilding(false);
        setBuildStatus("idle");
        return;
      }

      if (!r.ok) throw new Error("Failed to start build");

      const data = await r.json();
      setCurrentBuildId(data.id);
      streamLogs();
    } catch (err) {
      toast({ title: "Could not reach build server", description: String(err), variant: "destructive" });
      setBuilding(false);
      setBuildStatus("idle");
    }
  };

  const cancelBuild = async () => {
    await fetch("/api/build/cancel", { method: "POST" });
  };

  const viewBuildLogs = async (build: Build) => {
    setSelectedLogBuild(build);
    setLoadingLogs(true);
    try {
      const r = await fetch(`/api/builds/${build.id}/logs`);
      if (r.ok) {
        const { logs: l } = await r.json();
        setSelectedLogBuild({ ...build, logs: l });
      }
    } catch {}
    setLoadingLogs(false);
  };

  const logText = selectedLogBuild
    ? (selectedLogBuild.logs ?? []).join("")
    : logs.join("");

  return (
    <div className="min-h-screen bg-background p-4 space-y-4 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6" /> APK Builder
          </h1>
          <p className="text-sm text-muted-foreground">Build & version Android APKs from the admin panel</p>
        </div>
      </div>

      {/* Build form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Build</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Version */}
            <div className="space-y-1">
              <Label>Version (x.x.x)</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                disabled={building}
              />
            </div>

            {/* Build type */}
            <div className="space-y-1">
              <Label>Build Type</Label>
              <div className="flex gap-2 pt-1">
                {(["debug", "release"] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={buildType === t ? "default" : "outline"}
                    onClick={() => setBuildType(t)}
                    disabled={building}
                    className="capitalize"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            {/* RPC node toggle */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5" /> Include RPC Node
              </Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={includeRpcNode}
                  onCheckedChange={setIncludeRpcNode}
                  disabled={building}
                />
                <span className="text-sm text-muted-foreground">
                  {includeRpcNode ? "Bundled" : "Skip"}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {!building ? (
              <Button onClick={startBuild} className="gap-2">
                <Play className="h-4 w-4" /> Start Build
              </Button>
            ) : (
              <>
                <Button disabled className="gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Building…
                </Button>
                <Button variant="destructive" onClick={cancelBuild} className="gap-2">
                  <Square className="h-4 w-4" /> Cancel
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => { loadHistory(); checkRunningBuild(); }} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log console */}
      {(buildStatus !== "idle" || selectedLogBuild) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              {selectedLogBuild
                ? `Logs — v${selectedLogBuild.version} (${selectedLogBuild.buildType})`
                : `Live Logs — v${version} (${buildType})`}
            </CardTitle>
            <div className="flex items-center gap-2">
              {buildStatus !== "idle" && !selectedLogBuild && <StatusBadge status={buildStatus} />}
              {selectedLogBuild && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedLogBuild(null)}>
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-black rounded-lg p-3 h-72 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap">
              {loadingLogs ? (
                <span className="text-muted-foreground">Loading logs…</span>
              ) : logText ? (
                logText
              ) : (
                <span className="text-muted-foreground">Waiting for output…</span>
              )}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Build history */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Build History</CardTitle>
          <Button variant="ghost" size="sm" onClick={loadHistory}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No builds yet</p>
          ) : (
            <div className="space-y-2">
              {history.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={b.status} />
                    <div>
                      <p className="text-sm font-medium">
                        v{b.version} · <span className="capitalize">{b.buildType}</span>
                        {b.includeRpcNode && (
                          <span className="ml-1 text-xs text-muted-foreground">[+RPC]</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(b.startedAt).toLocaleString()} · {elapsed(b.startedAt, b.finishedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => viewBuildLogs(b)}>
                      <Terminal className="h-3.5 w-3.5 mr-1" /> Logs
                    </Button>
                    {b.apkFile && (
                      <Button
                        size="sm"
                        onClick={() => window.open(`/api/download/${b.apkFile}`, "_blank")}
                        className="gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> APK
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
