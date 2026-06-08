import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Upload,
  Megaphone,
  ShieldAlert,
  Globe,
  Apple,
  Package,
  Link2,
  Hash,
  Settings,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Build {
  id: string;
  version: string;
  buildType: "debug" | "release";
  includeRpcNode: boolean;
  status: "running" | "success" | "failed" | "cancelled";
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
  if (status === "cancelled")
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <XCircle className="h-3 w-3" /> Cancelled
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

interface NetworkConfig {
  rpc_url: string;
  chain_id: string;
  native_coin_symbol: string;
  explorer_url: string;
}

export default function AdminApkBuilder() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // ── Build form state ────────────────────────────────────────────────────────
  const [version, setVersion] = useState("1.0.0");
  const [buildType, setBuildType] = useState<"debug" | "release">("debug");
  const [includeRpcNode, setIncludeRpcNode] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState<"idle" | "running" | "success" | "failed" | "cancelled">("idle");
  const [currentApkFile, setCurrentApkFile] = useState<string | null>(null);
  const [buildTab, setBuildTab] = useState<"apk" | "pwa" | "ipa">("apk");
  const [pwaBuilding, setPwaBuilding] = useState(false);

  // ── Network config (from blockchain_settings) ────────────────────────────────
  const [netConfig, setNetConfig] = useState<NetworkConfig | null>(null);

  // ── Logs ────────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedLogBuild, setSelectedLogBuild] = useState<Build | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // ── History ─────────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<Build[]>([]);

  // ── Publish dialog ──────────────────────────────────────────────────────────
  const [publishTarget, setPublishTarget] = useState<Build | null>(null);
  const [publishNotes, setPublishNotes] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [forceMinVersion, setForceMinVersion] = useState("");
  const [publishing, setPublishing] = useState(false);

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
    loadNetworkConfig();
  }, []);

  const loadNetworkConfig = async () => {
    try {
      const { data } = await supabase
        .from("blockchain_settings")
        .select("rpc_url, chain_id, native_coin_symbol, explorer_url")
        .single();
      if (data) setNetConfig(data as NetworkConfig);
    } catch {}
  };

  const checkRunningBuild = async () => {
    try {
      const r = await fetch("/api/build/status");
      if (!r.ok) return;
      const data = await r.json();
      if (data.status === "running") {
        setBuilding(true);
        setBuildStatus("running");
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
        if (msg.apkFile) setCurrentApkFile(msg.apkFile);
        es.close();
        loadHistory();
        if (msg.status !== "cancelled") {
          toast({
            title: msg.status === "success" ? "Build successful!" : "Build failed",
            description: msg.status === "success"
              ? "APK is ready — click Publish to push the update to users."
              : "Check the logs for details.",
            variant: msg.status === "success" ? "default" : "destructive",
          });
        }
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
    setSelectedLogBuild(null);
    setBuildStatus("running");
    setBuilding(true);
    setCurrentApkFile(null);

    try {
      const r = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          buildType,
          includeRpcNode,
          rpcUrl: netConfig?.rpc_url || undefined,
          chainId: netConfig?.chain_id || undefined,
        }),
      });

      if (r.status === 409) {
        toast({ title: "Build already running", variant: "destructive" });
        setBuilding(false);
        setBuildStatus("idle");
        return;
      }
      if (!r.ok) throw new Error("Failed to start build");

      streamLogs();
    } catch (err) {
      toast({ title: "Could not reach build server", description: String(err), variant: "destructive" });
      setBuilding(false);
      setBuildStatus("idle");
    }
  };

  const cancelBuild = async () => {
    // 1. Close the SSE stream FIRST — no more log events will arrive
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    // 2. Tell the server to SIGKILL the build process
    try { await fetch("/api/build/cancel", { method: "POST" }); } catch {}
    // 3. Update UI state immediately
    setBuilding(false);
    setBuildStatus("cancelled");
    setCurrentApkFile(null);
    // 4. Stamp the log terminal with a clear cancellation marker
    setLogs((prev) => [
      ...prev,
      "\n\n========================================\n",
      "  BUILD CANCELLED — process was stopped.\n",
      "========================================\n",
    ]);
    setTimeout(loadHistory, 600);
    toast({ title: "Build cancelled", description: "The build process was stopped." });
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

  // ── Publish flow ─────────────────────────────────────────────────────────────
  const openPublishDialog = (build: Build) => {
    setPublishTarget(build);
    setPublishNotes("");
    setForceUpdate(false);
    setForceMinVersion(build.version);
  };

  const doPublish = async () => {
    if (!publishTarget || !user) return;
    setPublishing(true);

    try {
      // 1. Fetch the APK blob from the build server
      toast({ title: "Uploading APK…", description: "This may take a few seconds." });
      const apkRes = await fetch(`/api/download/${publishTarget.apkFile}`);
      if (!apkRes.ok) throw new Error("Could not fetch APK from build server");
      const blob = await apkRes.blob();

      // 2. Upload to Supabase Storage
      const storagePath = `android/${publishTarget.version}/${Date.now()}-${publishTarget.apkFile}`;
      const { error: upErr } = await supabase.storage
        .from("app-releases")
        .upload(storagePath, blob, {
          contentType: "application/vnd.android.package-archive",
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      const { data: pub } = supabase.storage.from("app-releases").getPublicUrl(storagePath);
      const fileUrl = pub.publicUrl;

      // 3. Mark existing android releases as not-latest
      await supabase
        .from("app_releases")
        .update({ is_latest: false })
        .eq("platform", "android")
        .eq("is_latest", true);

      // 4. Insert new release record
      const { error: insErr } = await supabase.from("app_releases").insert({
        version: publishTarget.version,
        platform: "android",
        file_path: storagePath,
        file_url: fileUrl,
        file_size: blob.size,
        release_notes: publishNotes.trim() || null,
        is_latest: true,
        created_by: user.id,
      });
      if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);

      // 5. Handle force-update settings
      if (forceUpdate) {
        // Upsert force_update_enabled = true
        await supabase.from("app_settings").upsert(
          { key: "force_update_enabled", value: "true" },
          { onConflict: "key" }
        );
        // Upsert min version
        await supabase.from("app_settings").upsert(
          { key: "force_update_min_version", value: forceMinVersion || publishTarget.version },
          { onConflict: "key" }
        );
      } else {
        // Ensure force update is off
        await supabase.from("app_settings").upsert(
          { key: "force_update_enabled", value: "false" },
          { onConflict: "key" }
        );
      }

      toast({
        title: "Update published!",
        description: `v${publishTarget.version} is live. Users on older versions will see a download prompt.`,
      });
      setPublishTarget(null);
    } catch (err: unknown) {
      toast({
        title: "Publish failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
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
            <Package className="h-6 w-6" /> App Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            Build Android APKs, Progressive Web Apps, and iOS archives
          </p>
        </div>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-2 border-b pb-2">
        {([
          { key: "apk", label: "Android APK", icon: <Smartphone className="h-4 w-4" /> },
          { key: "pwa", label: "PWA / Web", icon: <Globe className="h-4 w-4" /> },
          { key: "ipa", label: "iOS IPA", icon: <Apple className="h-4 w-4" /> },
        ] as const).map(({ key, label, icon }) => (
          <Button
            key={key}
            size="sm"
            variant={buildTab === key ? "default" : "ghost"}
            onClick={() => setBuildTab(key)}
            className="gap-2"
          >
            {icon} {label}
          </Button>
        ))}
      </div>

      {/* ── PWA tab ─────────────────────────────────────────────────────────── */}
      {buildTab === "pwa" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Progressive Web App Build
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Runs <code className="bg-muted px-1 rounded text-xs">vite build</code> and packages the{" "}
              <code className="bg-muted px-1 rounded text-xs">dist/</code> folder as a zip archive.
              Deploy the zip to any static host (Netlify, Vercel, nginx, etc.).
            </p>
            <Button
              onClick={async () => {
                setPwaBuilding(true);
                try {
                  const r = await fetch("/api/build/pwa", { method: "POST" });
                  if (r.ok) {
                    const { file } = await r.json();
                    window.open(`/api/download/${file}`, "_blank");
                    toast({ title: "PWA build complete!", description: "Your zip download has started." });
                  } else {
                    const { error } = await r.json();
                    toast({ title: "PWA build failed", description: error, variant: "destructive" });
                  }
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setPwaBuilding(false);
                }
              }}
              disabled={pwaBuilding}
              className="gap-2"
            >
              {pwaBuilding
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Building PWA…</>
                : <><Globe className="h-4 w-4" /> Build &amp; Download PWA</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── IPA tab ─────────────────────────────────────────────────────────── */}
      {buildTab === "ipa" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Apple className="h-4 w-4" /> iOS IPA Build
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-2">
              <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">macOS + Xcode required</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                iOS IPA builds must be compiled on a Mac using Xcode. This server runs Linux, so a full IPA cannot be
                generated here.
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">To build an IPA on your Mac:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Clone the repository and install dependencies: <code className="bg-muted px-1 rounded text-xs">npm install</code></li>
                <li>Add iOS platform: <code className="bg-muted px-1 rounded text-xs">npx cap add ios</code></li>
                <li>Build the web app: <code className="bg-muted px-1 rounded text-xs">npm run build</code></li>
                <li>Sync to Capacitor: <code className="bg-muted px-1 rounded text-xs">npx cap sync ios</code></li>
                <li>Open in Xcode: <code className="bg-muted px-1 rounded text-xs">npx cap open ios</code></li>
                <li>Archive and export the IPA from Xcode → Product → Archive</li>
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              Alternatively, use a CI service like GitHub Actions with a macOS runner to automate IPA builds.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── APK tab ─────────────────────────────────────────────────────────── */}
      {buildTab === "apk" && (
      <>

      {/* Network Config card */}
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-500" /> Network Configuration
            </CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1"
              onClick={() => navigate("/admin/blockchain")}
            >
              <Settings className="h-3.5 w-3.5" /> Edit Settings
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            These values from Blockchain Settings will be embedded into the APK at build time.
          </p>
        </CardHeader>
        <CardContent>
          {netConfig ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
                <Link2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Primary RPC URL</p>
                  <p className="text-xs font-mono break-all">{netConfig.rpc_url || <span className="text-muted-foreground italic">not set</span>}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
                <Hash className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Chain ID</p>
                  <p className="text-xs font-mono">{netConfig.chain_id || <span className="text-muted-foreground italic">not set</span>}</p>
                </div>
              </div>
              {netConfig.native_coin_symbol && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
                  <span className="text-[10px] font-bold text-muted-foreground mt-0.5">$</span>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Native Coin</p>
                    <p className="text-xs font-mono">{netConfig.native_coin_symbol}</p>
                  </div>
                </div>
              )}
              {netConfig.explorer_url && (
                <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
                  <Globe className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Explorer URL</p>
                    <p className="text-xs font-mono break-all">{netConfig.explorer_url}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading network config…
            </div>
          )}
        </CardContent>
      </Card>

      {/* Build form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Android Build</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Version (x.x.x)</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                disabled={building}
              />
            </div>

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
            <Button
              variant="outline"
              onClick={() => { loadHistory(); checkRunningBuild(); }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Immediate download after successful live build */}
      {buildStatus === "success" && currentApkFile && !selectedLogBuild && (
        <div className="flex gap-2 items-center p-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800 dark:text-green-300 flex-1">
            Build complete — <span className="font-mono">{currentApkFile}</span>
          </p>
          <Button
            size="sm"
            className="gap-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => window.open(`/api/download/${currentApkFile}`, "_blank")}
          >
            <Download className="h-3.5 w-3.5" /> Download APK
          </Button>
        </div>
      )}

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
                  Close
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
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => viewBuildLogs(b)}>
                      <Terminal className="h-3.5 w-3.5 mr-1" /> Logs
                    </Button>
                    {b.apkFile && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/api/download/${b.apkFile}`, "_blank")}
                        className="gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> APK
                      </Button>
                    )}
                    {b.status === "success" && b.apkFile && (
                      <Button
                        size="sm"
                        onClick={() => openPublishDialog(b)}
                        className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Megaphone className="h-3.5 w-3.5" /> Publish Update
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      </>
      )}

      {/* Publish dialog */}
      <Dialog open={!!publishTarget} onOpenChange={(o) => { if (!o) setPublishTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Publish v{publishTarget?.version} as Update
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will upload the APK to Supabase Storage and mark it as the latest release.
              Users on older versions will see a download banner in the app.
            </p>

            {/* Release notes */}
            <div className="space-y-1">
              <Label>Release notes (shown to users)</Label>
              <Textarea
                value={publishNotes}
                onChange={(e) => setPublishNotes(e.target.value)}
                placeholder={"• New feature added\n• Bug fixes\n• Performance improvements"}
                rows={4}
              />
            </div>

            {/* Force update */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-orange-500" /> Force Update
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Block users on older versions until they update
                  </p>
                </div>
                <Switch checked={forceUpdate} onCheckedChange={setForceUpdate} />
              </div>

              {forceUpdate && (
                <div className="space-y-1 pt-1">
                  <Label className="text-xs">Minimum required version</Label>
                  <Input
                    value={forceMinVersion}
                    onChange={(e) => setForceMinVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="h-8 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Users below this version will see a full-screen update wall.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPublishTarget(null)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={doPublish} disabled={publishing} className="gap-2">
              {publishing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</>
              ) : (
                <><Megaphone className="h-4 w-4" /> Publish to Users</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
