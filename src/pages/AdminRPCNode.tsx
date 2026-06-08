import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Play, Square, RefreshCw, Server, RotateCcw,
  Terminal, AlertTriangle, HelpCircle, Network, Activity,
  Zap, CheckCircle2, XCircle, Clock, Globe, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DockerStatus = "running" | "exited" | "paused" | "not_found" | "unavailable" | "loading";

async function apiFetch(path: string, method = "GET") {
  const res = await fetch(`/api/rpcnode/docker/${path}`, { method });
  return res.json();
}

async function callRPC(method: string, params: unknown[] = []) {
  try {
    const res = await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return await res.json();
  } catch (err: any) {
    return { error: { message: err.message } };
  }
}

function StatusBadge({ status }: { status: DockerStatus }) {
  const map: Record<DockerStatus, { label: string; cls: string; dot: string }> = {
    running:     { label: "Running",   cls: "bg-green-500/10 text-green-600 border-green-500/30", dot: "bg-green-500 animate-pulse" },
    exited:      { label: "Stopped",   cls: "bg-red-500/10 text-red-600 border-red-500/30",       dot: "bg-red-500" },
    paused:      { label: "Paused",    cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", dot: "bg-yellow-500" },
    not_found:   { label: "Not Found", cls: "bg-muted text-muted-foreground border-muted",         dot: "bg-muted-foreground" },
    unavailable: { label: "Dev Mode",  cls: "bg-blue-500/10 text-blue-600 border-blue-500/30",    dot: "bg-blue-400" },
    loading:     { label: "Checking…", cls: "bg-muted text-muted-foreground border-muted",         dot: "bg-muted-foreground animate-pulse" },
  };
  const { label, cls, dot } = map[status] || map.loading;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cls}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

const RPC_METHODS = [
  "eth_blockNumber", "eth_gasPrice", "eth_chainId", "eth_syncing",
  "web3_clientVersion", "net_version", "eth_getBalance",
];

const AdminRPCNode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [status, setStatus] = useState<DockerStatus>("loading");
  const [dockerAvail, setDockerAvail] = useState(false);
  const [containerName, setContainerName] = useState("litenode");
  const [dockerMsg, setDockerMsg] = useState("");
  const [stats, setStats] = useState<{ cpu?: string; mem?: string; net?: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rpcMethod, setRpcMethod] = useState("eth_blockNumber");
  const [rpcResult, setRpcResult] = useState("");
  const [rpcTesting, setRpcTesting] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch("status");
      setDockerAvail(!!data.docker);
      setStatus(data.status as DockerStatus);
      if (data.container) setContainerName(data.container);
      if (data.message) setDockerMsg(data.message);
      if (data.docker && data.status === "running") {
        const s = await apiFetch("stats");
        setStats(s.stats || null);
      } else {
        setStats(null);
      }
    } catch {
      setStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 6000);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const action = async (act: "start" | "stop" | "restart") => {
    setLoading(true);
    const labels = { start: "Starting", stop: "Stopping", restart: "Restarting" };
    toast({ title: `${labels[act]} RPC node…` });
    try {
      const res = await apiFetch(act, "POST");
      if (res.error) {
        toast({ title: "Failed", description: res.error, variant: "destructive" });
      } else {
        const done = { start: "started", stop: "stopped", restart: "restarted" }[act];
        toast({ title: `RPC node ${done}`, description: `Container: ${containerName}` });
        await refresh();
        if (logsOpen) await loadLogs();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    const data = await apiFetch("logs?lines=200");
    setLogs(data.logs || []);
    setLogsOpen(true);
  };

  const testRPC = async () => {
    setRpcTesting(true);
    const result = await callRPC(rpcMethod);
    setRpcResult(JSON.stringify(result, null, 2));
    setRpcTesting(false);
  };

  const checkHealth = async () => {
    try {
      const res = await fetch("/rpc/health");
      const data = await res.json().catch(() => ({}));
      setHealthOk(res.ok && (data.status === "ok" || res.ok));
    } catch {
      setHealthOk(false);
    }
  };

  const isRunning = status === "running";
  const isStopped = status === "exited";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back to Admin
        </Button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Network className="text-primary" /> RPC Node Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control the Ethereum/BSC JSON-RPC proxy node. Used by the blockchain wallet and all on-chain features.
          </p>
        </div>

        {/* Status + controls */}
        <Card className={`mb-6 border-2 ${isRunning ? "border-green-500/40" : isStopped ? "border-red-400/40" : "border-muted"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between flex-wrap gap-3">
              <span className="flex items-center gap-2 text-lg">
                <Server size={20} className="text-primary" />
                Node Status
                <StatusBadge status={status} />
              </span>
              <Button variant="ghost" size="icon" onClick={refresh} title="Refresh">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Info row */}
            <div className="flex flex-wrap gap-3 items-center">
              {dockerAvail ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    Container: <code className="bg-muted px-1 rounded text-xs">{containerName}</code>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Endpoint: <code className="bg-muted px-1 rounded text-xs">/rpc</code> (nginx proxy → port 8545)
                  </span>
                  {stats && (
                    <>
                      <span className="text-xs border rounded px-2 py-0.5 text-muted-foreground">CPU {stats.cpu}</span>
                      <span className="text-xs border rounded px-2 py-0.5 text-muted-foreground">MEM {stats.mem}</span>
                      {stats.net && <span className="text-xs border rounded px-2 py-0.5 text-muted-foreground">NET {stats.net}</span>}
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-500/10 rounded-lg p-3 border border-blue-500/20 w-full">
                  <HelpCircle size={16} />
                  {dockerMsg || "Docker socket not mounted. RPC node control is available on self-hosted Docker deployments only."}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => action("start")} disabled={!dockerAvail || isRunning || loading} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                <Play size={16} /> Start
              </Button>
              <Button onClick={() => action("stop")} disabled={!dockerAvail || !isRunning || loading} variant="destructive" className="gap-2">
                <Square size={16} /> Stop
              </Button>
              <Button onClick={() => action("restart")} disabled={!dockerAvail || status === "not_found" || loading} variant="outline" className="gap-2">
                <RotateCcw size={16} /> Restart
              </Button>
              <Button onClick={logsOpen ? () => setLogsOpen(false) : loadLogs} disabled={!dockerAvail || status === "not_found"} variant="outline" className="gap-2">
                <Terminal size={16} /> {logsOpen ? "Hide Logs" : "View Logs"}
              </Button>
              {logsOpen && <Button variant="ghost" size="icon" onClick={loadLogs}><RefreshCw size={14} /></Button>}
            </div>

            {/* Log viewer */}
            {logsOpen && (
              <div className="rounded-lg border bg-black/90 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
                  <span className="text-xs text-green-400 font-mono">docker logs {containerName} --tail=200</span>
                  <span className="text-xs text-gray-500">{logs.length} lines</span>
                </div>
                <div ref={logsRef} className="h-64 overflow-y-auto p-3 font-mono text-xs text-green-300 leading-relaxed">
                  {logs.length === 0
                    ? <p className="text-gray-500 italic">No log output</p>
                    : logs.map((line, i) => (
                        <div key={i} className="hover:bg-white/5 px-1 rounded whitespace-pre-wrap break-all">{line}</div>
                      ))
                  }
                </div>
              </div>
            )}

            {/* Not-found hint */}
            {dockerAvail && status === "not_found" && (
              <div className="flex items-start gap-2 text-sm text-yellow-600 bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Container "{containerName}" not found</p>
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    Run <code className="bg-muted px-1 rounded">docker compose up litenode -d</code> on the server first.
                    You can set <code className="bg-muted px-1 rounded">RPCNODE_CONTAINER_NAME</code> to override the container name.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-6">

          {/* Network info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Globe size={17} /> Network Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Upstream RPC",  value: "BSC Dataseed (bsc-dataseed.binance.org)" },
                { label: "Chain",         value: "Binance Smart Chain (Chain ID 56)" },
                { label: "Container port", value: ":8545 (internal)" },
                { label: "Public URL",    value: "/rpc  (via nginx proxy)" },
                { label: "Health check",  value: "/rpc/health" },
                { label: "Rate limit",    value: "120 req/min per IP" },
                { label: "Block cache",   value: "64 blocks" },
              ].map(row => (
                <div key={row.label} className="flex justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium text-right font-mono text-xs">{row.value}</span>
                </div>
              ))}
              <div className="pt-1">
                <Button size="sm" variant="outline" onClick={checkHealth} className="gap-2 w-full">
                  <Activity size={14} /> Check /rpc/health
                </Button>
                {healthOk === true  && <p className="text-xs text-green-600 flex items-center gap-1 mt-2"><CheckCircle2 size={13} /> Health endpoint OK</p>}
                {healthOk === false && <p className="text-xs text-destructive flex items-center gap-1 mt-2"><XCircle size={13} /> Health check failed — node may be down or not yet running</p>}
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck size={17} /> Security Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: "Double-spend guard",    on: true  },
                { label: "Per-IP rate limiting",  on: true  },
                { label: "Block/TX deduplication",on: true  },
                { label: "Nonce tracking",        on: true  },
                { label: "Read-only container",   on: true  },
                { label: "No privilege escalation",on: true },
                { label: "All capabilities dropped",on: true },
                { label: "Exposed to internet",   on: false },
              ].map(f => (
                <div key={f.label} className="flex items-center justify-between border-b pb-1.5 last:border-0 last:pb-0">
                  <span className="text-muted-foreground">{f.label}</span>
                  {f.on
                    ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> Yes</span>
                    : <span className="text-xs text-red-500 flex items-center gap-1"><XCircle size={12} /> No</span>
                  }
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* RPC tester */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Zap size={17} /> JSON-RPC Tester</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Sends a real JSON-RPC call through the <code className="bg-muted px-1 rounded">/rpc</code> proxy. Requires the node to be running.
            </p>
            <div className="flex gap-3 flex-wrap">
              <select
                className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={rpcMethod}
                onChange={e => setRpcMethod(e.target.value)}
              >
                {RPC_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <Button onClick={testRPC} disabled={rpcTesting} className="gap-2">
                <Play size={15} className={rpcTesting ? "animate-spin" : ""} />
                {rpcTesting ? "Calling…" : "Send"}
              </Button>
            </div>
            {rpcResult && (
              <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto max-h-52 font-mono">{rpcResult}</pre>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          RPC node container: <code className="bg-muted px-1 rounded">{containerName}</code> · Set{" "}
          <code className="bg-muted px-1 rounded">RPCNODE_CONTAINER_NAME</code> env var to override
        </p>
      </div>
    </div>
  );
};

export default AdminRPCNode;
