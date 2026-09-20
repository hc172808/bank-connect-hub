import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Activity, Blocks, Fuel, Clock, Signal, Link2 } from "lucide-react";
import { getChainStatus, type ChainStatus } from "@/lib/chain";
import { supabase } from "@/integrations/supabase/client";

interface AnchoredTx {
  id: string;
  amount: number;
  chain_block_number: number | null;
  chain_tx_hash: string | null;
  chain_status: string;
  created_at: string;
}

export default function AdminChainStatus() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uptimeSince, setUptimeSince] = useState<number | null>(null);
  const [recent, setRecent] = useState<AnchoredTx[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await getChainStatus();
    setStatus(s);
    setUptimeSince((prev) => (s.online ? prev ?? Date.now() : null));

    const { data } = await supabase
      .from("transactions")
      .select("id, amount, chain_block_number, chain_tx_hash, chain_status, created_at")
      .not("chain_block_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    setRecent((data as unknown as AnchoredTx[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const uptimeLabel = uptimeSince
    ? `${Math.max(1, Math.round((Date.now() - uptimeSince) / 60000))} min observed`
    : "Not reachable";

  const metrics = [
    { icon: Blocks, label: "Block number", value: status?.blockNumber?.toLocaleString() ?? "—" },
    { icon: Fuel, label: "Gas price", value: status?.gasPriceGwei != null ? `${status.gasPriceGwei.toFixed(3)} Gwei` : "—" },
    { icon: Activity, label: "Pending transactions", value: status?.pendingTransactions?.toString() ?? "—" },
    { icon: Signal, label: "Peers", value: status?.peerCount?.toString() ?? "—" },
    { icon: Clock, label: "Response time", value: status?.latencyMs != null ? `${status.latencyMs} ms` : "—" },
    { icon: Link2, label: "Chain ID", value: status?.chainId ?? "—" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Chain Status</h1>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={load} aria-label="Refresh">
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <main className="space-y-4 p-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">GYDS Node</CardTitle>
            <Badge variant={status?.online ? "default" : "destructive"}>
              {status?.online ? "Online" : "Offline"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p className="break-all">{status?.rpcUrl ?? "No node URL configured"}</p>
            <p>Uptime: {uptimeLabel}</p>
            {status?.error && <p className="text-destructive">{status.error}</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m) => (
            <Card key={m.label}>
              <CardContent className="space-y-1 p-4">
                <m.icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-lg font-semibold">{m.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent transfers with block numbers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No transfers have been anchored yet. Once the node is reachable, every Send Money
                transfer records the block number it was committed at.
              </p>
            )}
            {recent.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">${Number(tx.amount).toFixed(2)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tx.chain_tx_hash ?? new Date(tx.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono">#{tx.chain_block_number}</p>
                  <p className="text-xs text-muted-foreground">{tx.chain_status}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
