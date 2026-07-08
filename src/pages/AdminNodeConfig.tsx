import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Save, RotateCcw, Globe, Wifi, WifiOff,
  Network, Server, Loader2, CheckCircle2, XCircle,
  Info, Link2, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NodeConfig {
  UPSTREAM_RPC: string;
  BOOTNODE_URL: string;
  FULLNODE_RPC_1: string;
  FULLNODE_RPC_2: string;
  FULLNODE_RPC_3: string;
  LITENODE_RATE_PER_MIN: string;
}

type TestResult = "idle" | "testing" | "ok" | "fail";

interface FieldState {
  result: TestResult;
  latency?: number;
  error?: string;
}

const DEFAULT_CONFIG: NodeConfig = {
  UPSTREAM_RPC: "https://bsc-dataseed.binance.org",
  BOOTNODE_URL: "",
  FULLNODE_RPC_1: "",
  FULLNODE_RPC_2: "",
  FULLNODE_RPC_3: "",
  LITENODE_RATE_PER_MIN: "120",
};

const FIELD_META: { key: keyof NodeConfig; label: string; placeholder: string; hint: string; isRPC: boolean }[] = [
  {
    key: "UPSTREAM_RPC",
    label: "Upstream RPC (litenode target)",
    placeholder: "https://bsc-dataseed.binance.org",
    hint: "The litenode proxies all RPC calls to this URL. Changing this and saving with restart will update the running container.",
    isRPC: true,
  },
  {
    key: "BOOTNODE_URL",
    label: "Bootnode URL",
    placeholder: "enode://PUBKEY@IP:30301",
    hint: "Your private bootnode for P2P peer discovery. Used in docker-compose for peer seeding.",
    isRPC: false,
  },
  {
    key: "FULLNODE_RPC_1",
    label: "Full Node RPC 1",
    placeholder: "https://rpc.yourdomain.com",
    hint: "Your primary fullnode RPC endpoint. Used as the first fallback in the app's RPC chain.",
    isRPC: true,
  },
  {
    key: "FULLNODE_RPC_2",
    label: "Full Node RPC 2",
    placeholder: "https://rpc2.yourdomain.com",
    hint: "Secondary fullnode RPC endpoint (optional).",
    isRPC: true,
  },
  {
    key: "FULLNODE_RPC_3",
    label: "Full Node RPC 3",
    placeholder: "https://rpc3.yourdomain.com",
    hint: "Third fullnode RPC endpoint (optional).",
    isRPC: true,
  },
  {
    key: "LITENODE_RATE_PER_MIN",
    label: "Litenode Rate Limit (req/min per IP)",
    placeholder: "120",
    hint: "Max JSON-RPC requests per minute per IP. Lower = more restrictive. Takes effect on litenode restart.",
    isRPC: false,
  },
];

const AdminNodeConfig = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [config, setConfig] = useState<NodeConfig>(DEFAULT_CONFIG);
  const [original, setOriginal] = useState<NodeConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restartLitenode, setRestartLitenode] = useState(true);
  const [testStates, setTestStates] = useState<Record<string, FieldState>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/nodes/config");
      const data = await res.json();
      setConfig({ ...DEFAULT_CONFIG, ...data });
      setOriginal({ ...DEFAULT_CONFIG, ...data });
    } catch {
      toast({ variant: "destructive", title: "Could not load node config", description: "Build server may be offline." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const set = (key: keyof NodeConfig, val: string) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  const testUrl = async (key: keyof NodeConfig) => {
    const url = config[key].trim();
    if (!url) return;
    setTestStates(p => ({ ...p, [key]: { result: "testing" } }));
    const t0 = Date.now();
    try {
      const res = await fetch("/api/nodes/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      const latency = Date.now() - t0;
      if (data.ok) {
        setTestStates(p => ({ ...p, [key]: { result: "ok", latency } }));
      } else {
        setTestStates(p => ({ ...p, [key]: { result: "fail", error: data.error || `HTTP ${data.status}` } }));
      }
    } catch (err: any) {
      setTestStates(p => ({ ...p, [key]: { result: "fail", error: err.message } }));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/nodes/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, restartLitenode }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");
      setOriginal(config);
      toast({
        title: "Node config saved",
        description: data.restarted
          ? `Written to .env. Litenode restarted with new UPSTREAM_RPC.`
          : `Written to .env. ${data.written?.length} variable(s) updated.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setConfig(original); setTestStates({}); };

  const isDirty = JSON.stringify(config) !== JSON.stringify(original);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back to Admin
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="text-primary" /> Node Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Link your fullnodes and bootnode. Changes are written to <code className="bg-muted px-1 rounded text-xs">.env</code> and picked up by docker-compose.
          </p>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          {FIELD_META.map(({ key, label, placeholder, hint, isRPC }) => {
            const ts = testStates[key];
            const val = config[key];
            return (
              <Card key={key}>
                <CardContent className="pt-4 space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    {key === "UPSTREAM_RPC" && <Zap size={14} className="text-yellow-500" />}
                    {key === "BOOTNODE_URL" && <Link2 size={14} className="text-blue-500" />}
                    {key.startsWith("FULLNODE") && <Server size={14} className="text-green-500" />}
                    {key === "LITENODE_RATE_PER_MIN" && <Globe size={14} className="text-purple-500" />}
                    {label}
                    {val && val !== original[key] && (
                      <Badge variant="outline" className="text-xs text-orange-500 border-orange-400 ml-1">unsaved</Badge>
                    )}
                  </Label>

                  <div className="flex gap-2">
                    <Input
                      value={val}
                      onChange={e => set(key, e.target.value)}
                      placeholder={placeholder}
                      className="font-mono text-sm"
                    />
                    {isRPC && val && !val.startsWith("enode://") && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => testUrl(key)}
                        disabled={ts?.result === "testing"}
                        title="Test connectivity"
                      >
                        {ts?.result === "testing" ? <Loader2 size={14} className="animate-spin" /> :
                         ts?.result === "ok"      ? <CheckCircle2 size={14} className="text-green-500" /> :
                         ts?.result === "fail"    ? <XCircle size={14} className="text-red-500" /> :
                         <Wifi size={14} />}
                      </Button>
                    )}
                  </div>

                  {ts?.result === "ok" && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Reachable — {ts.latency}ms
                    </p>
                  )}
                  {ts?.result === "fail" && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <WifiOff size={12} /> Unreachable — {ts.error}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <Info size={11} className="mt-0.5 shrink-0" />
                    {hint}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Separator className="my-6" />

        {/* Restart option */}
        <Card className="mb-4 border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={restartLitenode}
                onChange={e => setRestartLitenode(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Restart litenode after saving</p>
                <p className="text-xs text-muted-foreground">
                  Required for <code className="bg-muted px-1 rounded">UPSTREAM_RPC</code> and <code className="bg-muted px-1 rounded">LITENODE_RATE_PER_MIN</code> changes to take effect.
                  The container will be recreated via <code className="bg-muted px-1 rounded">docker compose up -d litenode</code>.
                </p>
              </div>
            </label>
          </CardContent>
        </Card>

        {/* Save / Reset */}
        <div className="flex gap-3">
          <Button
            onClick={save}
            disabled={saving || !isDirty}
            className="flex-1 gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving…" : "Save to .env"}
          </Button>
          <Button
            variant="outline"
            onClick={reset}
            disabled={!isDirty || saving}
            className="gap-2"
          >
            <RotateCcw size={16} /> Reset
          </Button>
        </div>

        {/* .env preview */}
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Server size={14} /> .env preview (node section)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {[
                `UPSTREAM_RPC=${config.UPSTREAM_RPC || "# not set"}`,
                `BOOTNODE_URL=${config.BOOTNODE_URL || "# not set"}`,
                `FULLNODE_RPC_1=${config.FULLNODE_RPC_1 || "# not set"}`,
                `FULLNODE_RPC_2=${config.FULLNODE_RPC_2 || "# not set"}`,
                `FULLNODE_RPC_3=${config.FULLNODE_RPC_3 || "# not set"}`,
                `LITENODE_RATE_PER_MIN=${config.LITENODE_RATE_PER_MIN || "120"}`,
              ].join("\n")}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminNodeConfig;
