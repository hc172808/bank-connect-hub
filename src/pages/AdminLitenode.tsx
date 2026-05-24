import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Play, Square, RefreshCw, Trash2, Plus,
  Cpu, Activity, Clock, Zap, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  LitenodeConfig, MockTx,
  getConfig, startLitenode, stopLitenode, updateConfig,
  clearTxLog, setMockBalance, onConfigChange, handleRPCCall,
} from "@/lib/replitLitenode";
import { format } from "date-fns";

const AdminLitenode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cfg, setCfg] = useState<LitenodeConfig>(getConfig);
  const [addrInput, setAddrInput] = useState("");
  const [balInput, setBalInput] = useState("100");
  const [testMethod, setTestMethod] = useState("eth_blockNumber");
  const [testResult, setTestResult] = useState<string>("");
  const [testing, setTesting] = useState(false);

  // Sync with litenode state
  useEffect(() => {
    const unsub = onConfigChange(() => setCfg(getConfig()));
    return unsub;
  }, []);

  const toggleNode = () => {
    if (cfg.running) {
      stopLitenode();
      toast({ title: "Litenode stopped" });
    } else {
      startLitenode();
      toast({ title: "Litenode started", description: `Listening on ${cfg.networkName}` });
    }
  };

  const addBalance = useCallback(() => {
    const addr = addrInput.trim();
    const bal  = balInput.trim();
    if (!addr || !bal) return;
    setMockBalance(addr, bal);
    setAddrInput("");
    toast({ title: "Balance set", description: `${addr.slice(0,10)}… → ${bal} ETH` });
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">

        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back to Admin
        </Button>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Cpu className="text-primary" />
              Replit Litenode
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              In-browser mock Ethereum RPC node for testing blockchain features without a real network.
            </p>
          </div>
          <Button
            onClick={toggleNode}
            variant={cfg.running ? "destructive" : "default"}
            size="lg"
            className="gap-2"
            data-testid="button-toggle"
          >
            {cfg.running ? <><Square size={18} /> Stop Node</> : <><Play size={18} /> Start Node</>}
          </Button>
        </div>

        {/* Status card */}
        <Card className={`mb-6 border-2 ${cfg.running ? "border-green-500/40" : "border-muted"}`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className={`w-3 h-3 rounded-full ${cfg.running ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
              <div className="flex-1">
                <div className="font-bold text-lg">{cfg.running ? "🟢 Node is running" : "⚫ Node is stopped"}</div>
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
            </div>
          </CardContent>
        </Card>

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
                <AlertTriangle size={16} /> Start the node first to test RPC calls.
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
          State saved in localStorage · Interceptor active (fetches to <code className="bg-muted px-1 rounded">__replit_litenode__</code> are handled locally)
        </p>
      </div>
    </div>
  );
};

export default AdminLitenode;
