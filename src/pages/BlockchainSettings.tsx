import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Link2, Coins, Globe, Hash, Wallet, Key, Percent, Plus, Trash2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { testAllRpcs } from "@/lib/rpcFallback";

interface BlockchainSettingsData {
  id: string;
  rpc_url: string;
  rpc_urls: string[];
  chain_id: string;
  native_coin_symbol: string;
  native_coin_name: string;
  explorer_url: string;
  is_active: boolean;
  liquidity_pool_address: string;
  fee_wallet_address: string;
  fee_wallet_encrypted_key: string;
  gas_fee_gyd: number;
}

export default function BlockchainSettings() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [newRpcUrl, setNewRpcUrl] = useState("");
  const [rpcStatuses, setRpcStatuses] = useState<Record<string, { reachable: boolean; latencyMs?: number }>>({});
  const [settings, setSettings] = useState<BlockchainSettingsData>({
    id: "",
    rpc_url: "",
    rpc_urls: [],
    chain_id: "",
    native_coin_symbol: "GYD",
    native_coin_name: "GYD Coin",
    explorer_url: "",
    is_active: false,
    liquidity_pool_address: "",
    fee_wallet_address: "",
    fee_wallet_encrypted_key: "",
    gas_fee_gyd: 0.01,
  });

  useEffect(() => {
    if (authLoading) return;
    if (role !== "admin") {
      navigate("/admin");
      return;
    }
    fetchSettings();
  }, [role, authLoading]);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("blockchain_settings").select("*").single();
    if (error && error.code !== "PGRST116") {
      toast({ variant: "destructive", title: "Error", description: "Failed to load blockchain settings" });
    }
    if (data) {
      const rpcUrlsRaw = data.rpc_urls as unknown;
      setSettings({
        id: data.id,
        rpc_url: data.rpc_url || "",
        rpc_urls: Array.isArray(rpcUrlsRaw) ? (rpcUrlsRaw as string[]) : [],
        chain_id: data.chain_id || "",
        native_coin_symbol: data.native_coin_symbol || "GYD",
        native_coin_name: data.native_coin_name || "GYD Coin",
        explorer_url: data.explorer_url || "",
        is_active: data.is_active || false,
        liquidity_pool_address: data.liquidity_pool_address || "",
        fee_wallet_address: data.fee_wallet_address || "",
        fee_wallet_encrypted_key: data.fee_wallet_encrypted_key || "",
        gas_fee_gyd: data.gas_fee_gyd || 0.01,
      });
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("blockchain_settings")
      .update({
        rpc_url: settings.rpc_url || null,
        rpc_urls: settings.rpc_urls as any,
        chain_id: settings.chain_id || null,
        native_coin_symbol: settings.native_coin_symbol,
        native_coin_name: settings.native_coin_name,
        explorer_url: settings.explorer_url || null,
        is_active: settings.is_active,
        liquidity_pool_address: settings.liquidity_pool_address || null,
        fee_wallet_address: settings.fee_wallet_address || null,
        fee_wallet_encrypted_key: settings.fee_wallet_encrypted_key || null,
        gas_fee_gyd: settings.gas_fee_gyd,
        updated_by: user.id,
      })
      .eq("id", settings.id);

    if (error) {
      toast({ variant: "destructive", title: "Save failed", description: error.message });
    } else {
      toast({ title: "Settings saved", description: "Blockchain settings have been updated successfully" });
    }
    setSaving(false);
  };

  const addRpcUrl = () => {
    if (!newRpcUrl.trim()) return;
    if (settings.rpc_urls.includes(newRpcUrl.trim())) {
      toast({ variant: "destructive", title: "Duplicate", description: "This RPC URL is already added" });
      return;
    }
    setSettings({ ...settings, rpc_urls: [...settings.rpc_urls, newRpcUrl.trim()] });
    setNewRpcUrl("");
  };

  const removeRpcUrl = (url: string) => {
    setSettings({ ...settings, rpc_urls: settings.rpc_urls.filter((u) => u !== url) });
  };

  const promoteRpcUrl = (url: string) => {
    // Move this URL to be the primary RPC
    const oldPrimary = settings.rpc_url;
    const newUrls = settings.rpc_urls.filter((u) => u !== url);
    if (oldPrimary) newUrls.unshift(oldPrimary);
    setSettings({ ...settings, rpc_url: url, rpc_urls: newUrls });
    toast({ title: "Primary RPC Updated", description: `${url} is now the primary RPC` });
  };

  const testAllConnections = async () => {
    setTesting(true);
    const allUrls = [settings.rpc_url, ...settings.rpc_urls].filter(Boolean);
    const results = await testAllRpcs(allUrls);
    const statusMap: Record<string, { reachable: boolean; latencyMs?: number }> = {};
    results.forEach((r) => {
      statusMap[r.url] = { reachable: r.reachable, latencyMs: r.latencyMs };
      if (r.reachable && r.chainId && !settings.chain_id) {
        setSettings((prev) => ({ ...prev, chain_id: r.chainId! }));
      }
    });
    setRpcStatuses(statusMap);
    setTesting(false);
    const working = results.filter((r) => r.reachable).length;
    toast({
      title: "Connection Test Complete",
      description: `${working}/${results.length} RPC nodes are reachable`,
      variant: working === 0 ? "destructive" : undefined,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background p-4 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  const allUrls = [
    { url: settings.rpc_url, isPrimary: true },
    ...settings.rpc_urls.map((u) => ({ url: u, isPrimary: false })),
  ].filter((x) => x.url);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Coins className="w-6 h-6 text-primary" />
                  Blockchain Settings
                </CardTitle>
                <CardDescription>Configure blockchain RPC nodes with automatic failover</CardDescription>
              </div>
              <Badge variant={settings.is_active ? "default" : "secondary"}>
                {settings.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Enable Blockchain</p>
                  <p className="text-sm text-muted-foreground">Activate blockchain features</p>
                </div>
                <Switch
                  checked={settings.is_active}
                  onCheckedChange={(checked) => setSettings({ ...settings, is_active: checked })}
                />
              </div>

              <div className="space-y-4">
                {/* Primary RPC URL */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Primary RPC URL
                  </label>
                  <Input
                    value={settings.rpc_url}
                    onChange={(e) => setSettings({ ...settings, rpc_url: e.target.value })}
                    placeholder="https://rpc.netlifegy.com"
                  />
                  <p className="text-xs text-muted-foreground">Main RPC endpoint. Backup nodes take over if this goes down.</p>
                </div>

                {/* Backup RPC URLs */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Backup RPC Nodes
                  </label>
                  <div className="space-y-2">
                    {settings.rpc_urls.map((url, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 p-2 bg-muted/30 rounded-lg border">
                          {rpcStatuses[url] && (
                            rpcStatuses[url].reachable
                              ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                              : <XCircle className="w-4 h-4 text-destructive shrink-0" />
                          )}
                          <span className="text-sm truncate flex-1">{url}</span>
                          {rpcStatuses[url]?.latencyMs && (
                            <span className="text-xs text-muted-foreground">{rpcStatuses[url].latencyMs}ms</span>
                          )}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => promoteRpcUrl(url)} title="Make primary">
                          ⬆
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeRpcUrl(url)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newRpcUrl}
                      onChange={(e) => setNewRpcUrl(e.target.value)}
                      placeholder="https://rpc2.netlifegy.com"
                      className="flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRpcUrl(); } }}
                    />
                    <Button type="button" variant="outline" onClick={addRpcUrl}>
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>

                {/* Test All button */}
                <Button type="button" variant="outline" className="w-full" onClick={testAllConnections} disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                  {testing ? "Testing all nodes..." : `Test All ${allUrls.length} Nodes`}
                </Button>

                {/* Status overview */}
                {Object.keys(rpcStatuses).length > 0 && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <p className="text-sm font-medium">Node Status (reads indexer from nodes):</p>
                    {allUrls.map(({ url, isPrimary }) => (
                      <div key={url} className="flex items-center gap-2 text-sm">
                        {rpcStatuses[url] ? (
                          rpcStatuses[url].reachable
                            ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                            : <XCircle className="w-3 h-3 text-destructive" />
                        ) : (
                          <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                        )}
                        <span className="truncate">{url}</span>
                        {isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                        {rpcStatuses[url]?.latencyMs && (
                          <span className="text-xs text-muted-foreground ml-auto">{rpcStatuses[url].latencyMs}ms</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    Chain ID
                  </label>
                  <Input
                    value={settings.chain_id}
                    onChange={(e) => setSettings({ ...settings, chain_id: e.target.value })}
                    placeholder="Auto-detected from RPC"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      Coin Symbol
                    </label>
                    <Input value={settings.native_coin_symbol} onChange={(e) => setSettings({ ...settings, native_coin_symbol: e.target.value })} placeholder="GYD" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      Coin Name
                    </label>
                    <Input value={settings.native_coin_name} onChange={(e) => setSettings({ ...settings, native_coin_name: e.target.value })} placeholder="GYD Coin" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Block Explorer URL
                  </label>
                  <Input value={settings.explorer_url} onChange={(e) => setSettings({ ...settings, explorer_url: e.target.value })} placeholder="https://explorer.your-blockchain.com" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Liquidity Pool Address
                  </label>
                  <Input value={settings.liquidity_pool_address} onChange={(e) => setSettings({ ...settings, liquidity_pool_address: e.target.value })} placeholder="0x..." />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Fee Wallet Address (Bank)
                  </label>
                  <Input value={settings.fee_wallet_address} onChange={(e) => setSettings({ ...settings, fee_wallet_address: e.target.value })} placeholder="0x..." />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Fee Wallet Private Key (Encrypted)
                  </label>
                  <Input type="password" value={settings.fee_wallet_encrypted_key} onChange={(e) => setSettings({ ...settings, fee_wallet_encrypted_key: e.target.value })} placeholder="Enter encrypted private key..." />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Gas Fee in GYD
                  </label>
                  <Input type="number" step="0.0001" value={settings.gas_fee_gyd} onChange={(e) => setSettings({ ...settings, gas_fee_gyd: parseFloat(e.target.value) || 0 })} placeholder="0.01" />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
