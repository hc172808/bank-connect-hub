import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Play, Square, RefreshCw, Trash2, Plus,
  Cpu, Activity, Clock, Zap, AlertTriangle, CheckCircle2, XCircle,
  Server, RotateCcw, Terminal, Wifi, WifiOff, HelpCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  LitenodeConfig, MockTx,
  getConfig, startLitenode, stopLitenode, updateConfig,
  clearTxLog, setMockBalance, onConfigChange, handleRPCCall,
} from "@/lib/replitLitenode";
import { format } from "date-fns";

// ── Docker Litenode API helpers ──────────────────────────────────────────────
type DockerStatus = "running" | "exited" | "paused" | "not_found" | "unavailable" | "loading";

async function fetchDockerStatus(): Promise<{ docker: boolean; status: DockerStatus; container?: string; message?: string }> {
  const res = await fetch("/api/litenode/docker/status");
  return res.json();
}

async function dockerAction(action: "start" | "stop" | "restart"): Promise<{ ok?: boolean; status?: string; error?: string }> {
  const res = await fetch(`/api/litenode/docker/${action}`, { method: "POST" });
  return res.json();
}

async function fetchDockerLogs(lines = 150): Promise<string[]> {
  const res = await fetch(`/api/litenode/docker/logs?lines=${lines}`);
  const data = await res.json();
  return data.logs || [];
}

async function fetchDockerStats(): Promise<{ cpu?: string; mem?: string; net?: string } | null> {
  try {
    const res = await fetch("/api/litenode/docker/stats");
    const data = await res.json();
    return data.stats || null;
  } catch { return null; }
}

// ── Status badge ──────────────────────────────────────────────────────────────
function DockerStatusBadge({ status }: { status: DockerStatus }) {
  const map: Record<DockerStatus, { label: string; className: string; dot: string }> = {
    running:     { label: "Running",     className: "bg-green-500/10 text-green-600 border-green-500/30", dot: "bg-green-500 animate-pulse" },
    exited:      { label: "Stopped",     className: "bg-red-500/10 text-red-600 border-red-500/30",       dot: "bg-red-500" },
    paused:      { label: "Paused",      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", dot: "bg-yellow-500" },
    not_found:   { label: "Not Found",   className: "bg-muted text-muted-foreground border-muted",         dot: "bg-muted-foreground" },
    unavailable: { label: "Dev Mode",    className: "bg-blue-500/10 text-blue-600 border-blue-500/30",    dot: "bg-blue-400" },
    loading:     { label: "Checking…",   className: "bg-muted text-muted-foreground border-muted",         dot: "bg-muted-foreground animate-pulse" },
  };
  const { label, className, dot } = map[status] || map.loading;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${className}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const AdminLitenode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Browser mock state ────────────────────────────────────────────────────
  const [cfg, setCfg] = useState<LitenodeConfig>(getConfig);
  const [addrInput, setAddrInput] = useState("");
  const [balInput, setBalInput] = useState("100");
  const [testMethod, setTestMethod] = useState("eth_blockNumber");
  const [testResult, setTestResult] = useState<string>("");
  const [testing, setTesting] = useState(false);

  // ── Docker server state ──────────────────────────────────────────────────
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>("loading");
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [containerName, setContainerName] = useState("litenode");
  const [dockerMsg, setDockerMsg] = useState("");
  const [dockerLogs, setDockerLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [stats, setStats] = useState<{ cpu?: string; mem?: string; net?: string } | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const unsub = onConfigChange(() => setCfg(getConfig()));
    return unsub;
  }, []);

  // ── Poll Docker status ────────────────────────────────────────────────────
  const refreshDockerStatus = useCallback(async () => {
    try {
      const data = await fetchDockerStatus();
      setDockerAvailable(data.docker);
      setDockerStatus(data.status as DockerStatus);
      if (data.container) setContainerName(data.container);
      if (data.message) setDockerMsg(data.message);
      if (data.docker && data.status === "running") {
        fetchDockerStats().then(setStats);
      } else {
        setStats(null);
      }
    } catch {
      setDockerStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    refreshDockerStatus();
    pollRef.current = setInterval(refreshDockerStatus, 6000);
    return () => clearInterval(pollRef.current);
  }, [refreshDockerStatus]);

  // ── Auto-scroll logs ──────────────────────────────────────────────────────
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [dockerLogs]);

  const loadLogs = useCallback(async () => {
    const logs = await fetchDockerLogs(200);
    setDockerLogs(logs);
    setLogsOpen(true);
  }, []);

  const handleDockerAction = async (action: "start" | "stop" | "restart") => {
    setDockerLoading(true);
    const labels = { start: "Starting", stop: "Stopping", restart: "Restarting" };
    toast({ title: `${labels[action]} litenode…` });
    try {
      const result = await dockerAction(action);
      if (result.error) {
        toast({ title: "Action failed", description: result.error, variant: "destructive" });
      } else {
        const doneLabel = { start: "started", stop: "stopped", restart: "restarted" }[action];
        toast({ title: `Litenode ${doneLabel}`, description: `Container: ${containerName}` });
        await refreshDockerStatus();
        if (logsOpen) await loadLogs();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDockerLoading(false);
    }
  };

  // ── Browser mock helpers ──────────────────────────────────────────────────
  const toggleNode = () => {
    if (cfg.running) { stopLitenode(); toast({ title: "Browser mock stopped" }); }
    else             { startLitenode(); toast({ title: "Browser mock started", description: `Network: ${cfg.networkName}` }); }
  };

  const addBalance = useCallback(() => {
    const addr = addrInput.trim();
    const bal  = balInput.trim();
    if (!addr || !bal) return;
    setMockBalance(addr, bal);
    setAddrInput("");
    toast({ title: "Balance set", description: `${addr.slice(0, 10)}… → ${bal} ETH` });
  }, [addrInput, balInput, toast]);

  const runTest = async () => {
    setTesting(true);
    const methods: Record<string, unknown[]> = {
      eth_blockNumber:         [],
      eth_gasPrice:            [],
      eth_chainId:             [],
      eth_getBalance:          [Object.keys(cfg.mockBalances)[0] || "0x0000000000000000000000000000000000000000", "latest"],
      eth_getTransactionCount: [Object.keys(cfg.mockBalances)[0] || "0x0000000000000000000000000000000000000000", "pending"],
      eth_sendRawTransaction:  ["0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd2b6a7"],
      web3_clientVersion:      [],
      eth_syncing:             [],
    };
    const params = methods[testMethod] ?? [];
    const resp = await handleRPCCall({ jsonrpc: "2.0", id: 1, method: testMethod, params });
    setTestResult(JSON.stringify(resp, null, 2));
    setTesting(false);
  };

  const txStatusIcon = (status: MockTx["status"]) =>
    status === "confirmed" ? <CheckCircle2 size={14} className="text-green-500" />
    : status === "failed"  ? <XCircle size={14} className="text-destructive" />
    : <Clock size={14} className="text-yellow-500" />;

  const isRunning = dockerStatus === "running";
  const isStopped = dockerStatus === "exited";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">

        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back to Admin
        </Button>

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Cpu className="text-primary" /> Litenode Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control the server litenode (Docker) and the in-browser mock node for blockchain testing.
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
             SERVER LITENODE — Docker container control
        ══════════════════════════════════════════════════════════════════ */}
        <Card className={`mb-6 border-2 ${isRunning ? "border-green-500/40" : isStopped ? "border-red-400/40" : "border-muted"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between flex-wrap gap-3">
              <span className="flex items-center gap-2 text-lg">
                <Server size={20} className="text-primary" />
                Server Litenode
                <DockerStatusBadge status={dockerStatus} />
              </span>
              <Button variant="ghost" size="icon" onClick={refreshDockerStatus} title="Refresh status">
                <RefreshCw size={16} className={dockerLoading ? "animate-spin" : ""} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Status row */}
            <div className="flex flex-wrap items-center gap-3">
              {dockerAvailable ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    Container: <code className="bg-muted px-1 rounded text-xs">{containerName}</code>
                  </span>
                  {stats && (
                    <>
                      <span className="text-xs text-muted-foreground border rounded px-2 py-0.5">
                        CPU {stats.cpu}
                      </span>
                      <span className="text-xs text-muted-foreground border rounded px-2 py-0.5">
                        MEM {stats.mem}
                      </span>
                      {stats.net && (
                        <span className="text-xs text-muted-foreground border rounded px-2 py-0.5">
                          NET {stats.net}
                        </span>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-500/10 rounded-lg p-3 border border-blue-500/20 w-full">
                  <HelpCircle size={16} />
                  <span>
                    {dockerMsg || "Docker socket not mounted. Start/stop controls are available on self-hosted Docker deployments only."}
                  </span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleDockerAction("start")}
                disabled={!dockerAvailable || isRunning || dockerLoading}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <Play size={16} /> Start
              </Button>
              <Button
                onClick={() => handleDockerAction("stop")}
                disabled={!dockerAvailable || !isRunning || dockerLoading}
                variant="destructive"
                className="gap-2"
              >
                <Square size={16} /> Stop
              </Button>
              <Button
                onClick={() => handleDockerAction("restart")}
                disabled={!dockerAvailable || dockerStatus === "not_found" || dockerLoading}
                variant="outline"
                className="gap-2"
              >
                <RotateCcw size={16} /> Restart
              </Button>
              <Button
                onClick={logsOpen ? () => setLogsOpen(false) : loadLogs}
                disabled={!dockerAvailable || dockerStatus === "not_found"}
                variant="outline"
                className="gap-2"
              >
                <Terminal size={16} />
                {logsOpen ? "Hide Logs" : "View Logs"}
              </Button>
              {logsOpen && (
                <Button variant="ghost" size="icon" onClick={loadLogs} title="Refresh logs">
                  <RefreshCw size={14} />
                </Button>
              )}
            </div>

            {/* Log viewer */}
            {logsOpen && (
              <div className="rounded-lg border bg-black/90 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
                  <span className="text-xs text-green-400 font-mono">
                    docker logs {containerName} --tail=200
                  </span>
                  <span className="text-xs text-gray-500">{dockerLogs.length} lines</span>
                </div>
                <div
                  ref={logsRef}
                  className="h-64 overflow-y-auto p-3 font-mono text-xs text-green-300 leading-relaxed"
                >
                  {dockerLogs.length === 0 ? (
                    <p className="text-gray-500 italic">No log output</p>
                  ) : (
                    dockerLogs.map((line, i) => (
                      <div key={i} className="hover:bg-white/5 px-1 rounded whitespace-pre-wrap break-all">
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Not-found hint */}
            {dockerAvailable && dockerStatus === "not_found" && (
              <div className="flex items-start gap-2 text-sm text-yellow-600 bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Container "{containerName}" not found</p>
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    The litenode container must be created first. Run <code className="bg-muted px-1 rounded">docker compose up litenode</code> on the server, then return here to start/stop it.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-6" />
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Cpu size={18} className="text-muted-foreground" /> Browser Mock Node
          <span className="text-xs text-muted-foreground font-normal">(in-memory simulation for development)</span>
        </h2>

        {/* ══════════════════════════════════════════════════════════════════
             IN-BROWSER MOCK — existing litenode simulation
        ══════════════════════════════════════════════════════════════════ */}
        {/* Mock toggle + status */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <Card className={`flex-1 border ${cfg.running ? "border-green-500/40" : "border-muted"}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className={`w-3 h-3 rounded-full shrink-0 ${cfg.running ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                <div className="flex-1">
                  <div className="font-bold">{cfg.running ? "🟢 Mock node running" : "⚫ Mock node stopped"}</div>
                  <div className="text-sm text-muted-foreground">
                    Network: <strong>{cfg.networkName}</strong> · Chain ID: <strong>{cfg.chainId}</strong> · Block: <strong>#{cfg.currentBlock}</strong>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-bold text-xl">{cfg.txLog.length}</div>
                    <div className="text-muted-foreground text-xs">Total TXs</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-xl text-green-500">{cfg.txLog.filter(t => t.status === "confirmed").length}</div>
                    <div className="text-muted-foreground text-xs">Confirmed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-xl text-yellow-500">{cfg.txLog.filter(t => t.status === "pending").length}</div>
                    <div className="text-muted-foreground text-xs">Pending</div>
                  </div>
                </div>
                <Button
                  onClick={toggleNode}
                  variant={cfg.running ? "destructive" : "default"}
                  size="sm"
                  className="gap-2"
                  data-testid="button-toggle"
                >
                  {cfg.running ? <><Square size={15} /> Stop</> : <><Play size={15} /> Start</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">

          {/* Config */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Activity size={18} /> Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Network Name</Label>
                <Input value={cfg.networkName}
                  onChange={e => updateConfig({ networkName: e.target.value })}
                  data-testid="input-network-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Chain ID</Label>
                  <Input type="number" value={cfg.chainId}
                    onChange={e => updateConfig({ chainId: Number(e.target.value) })}
                    data-testid="input-chain-id" />
                </div>
                <div>
                  <Label>Block time (ms)</Label>
                  <Input type="number" value={cfg.blockTime}
                    onChange={e => updateConfig({ blockTime: Number(e.target.value) })}
                    data-testid="input-block-time" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Simulated latency (ms)</Label>
                  <Input type="number" value={cfg.latencyMs}
                    onChange={e => updateConfig({ latencyMs: Number(e.target.value) })}
                    data-testid="input-latency" />
                </div>
                <div>
                  <Label>TX failure rate (%)</Label>
                  <Input type="number" min={0} max={100} value={cfg.failureRate}
                    onChange={e => updateConfig({ failureRate: Number(e.target.value) })}
                    data-testid="input-failure-rate" />
                </div>
              </div>
              <div>
                <Label>Gas Price (hex wei)</Label>
                <Input value={cfg.gasPrice}
                  onChange={e => updateConfig({ gasPrice: e.target.value })}
                  data-testid="input-gas-price" />
              </div>
            </CardContent>
          </Card>

          {/* Mock balances */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Zap size={18} /> Mock Balances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Set ETH balances for addresses. Used by eth_getBalance.</p>
              <div className="flex gap-2">
                <Input placeholder="0x address" value={addrInput} onChange={e => setAddrInput(e.target.value)} className="flex-1" data-testid="input-addr" />
                <Input placeholder="ETH" value={balInput} onChange={e => setBalInput(e.target.value)} className="w-24" type="number" step="0.01" data-testid="input-bal" />
                <Button onClick={addBalance} className="gap-1"><Plus size={14} /></Button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {Object.keys(cfg.mockBalances).length === 0 && (
                  <p className="text-xs text-muted-foreground">No mock balances set. Returns 100 ETH by default.</p>
                )}
                {Object.entries(cfg.mockBalances).map(([addr, bal]) => (
                  <div key={addr} className="flex items-center justify-between bg-muted/40 rounded px-3 py-1.5 text-sm font-mono" data-testid={`balance-${addr.slice(0,6)}`}>
                    <span className="text-muted-foreground">{addr.slice(0,12)}…</span>
                    <span className="font-semibold">{bal} ETH</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RPC tester */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Activity size={18} /> RPC Call Tester</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <select
                className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={testMethod}
                onChange={e => setTestMethod(e.target.value)}
                data-testid="select-method"
              >
                {["eth_blockNumber","eth_gasPrice","eth_chainId","eth_getBalance","eth_getTransactionCount","eth_sendRawTransaction","web3_clientVersion","eth_syncing"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <Button onClick={runTest} disabled={testing || !cfg.running} className="gap-2" data-testid="button-test">
                <Play size={16} className={testing ? "animate-spin" : ""} />
                {testing ? "Testing…" : "Run"}
              </Button>
            </div>
            {!cfg.running && (
              <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                <AlertTriangle size={16} /> Start the browser mock node first to test RPC calls.
              </div>
            )}
            {testResult && (
              <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto max-h-48 font-mono" data-testid="rpc-result">
                {testResult}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* TX log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-lg"><Clock size={18} /> Transaction Log</span>
              <Button variant="outline" size="sm" onClick={clearTxLog} className="gap-1" data-testid="button-clear-log">
                <Trash2 size={14} /> Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cfg.txLog.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No mock transactions yet. Send a transaction using the tester above.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {cfg.txLog.map(tx => (
                  <div key={tx.hash} className="border rounded-lg p-3 text-sm font-mono flex items-start justify-between gap-3" data-testid={`tx-${tx.hash.slice(0,8)}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {txStatusIcon(tx.status)}
                        <Badge variant={tx.status === "confirmed" ? "default" : tx.status === "failed" ? "destructive" : "secondary"} className="capitalize text-xs">
                          {tx.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(tx.timestamp), "HH:mm:ss")}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{tx.hash}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Block #{tx.blockNumber} · {tx.value} ETH · Gas: {tx.gasUsed}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Browser mock state saved in localStorage · Server litenode managed via Docker socket (<code className="bg-muted px-1 rounded">/var/run/docker.sock</code>)
        </p>
      </div>
    </div>
  );
};

export default AdminLitenode;
