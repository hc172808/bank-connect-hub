import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildRpcList, WALLET_TEST_RPC_URL } from "@/lib/rpcFallback";

interface OnChainBalanceCardProps {
  walletAddress: string | null;
  showBalance?: boolean;
}

type BalanceState =
  | { status: "loading"; symbol: string }
  | { status: "ready"; amount: string; symbol: string }
  | { status: "unlinked"; symbol: string }
  | { status: "unavailable"; symbol: string; reason?: string };

type JsonRpcResponse = {
  result?: unknown;
  error?: { message?: unknown };
};

function parseJsonRpcResponse(data: unknown): JsonRpcResponse | null {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data && typeof data === "object" ? data as JsonRpcResponse : null;
}

async function nativeRpcCall(url: string, method: string, params: unknown[]): Promise<string> {
  const response = await CapacitorHttp.post({
    url,
    headers: { "Content-Type": "application/json" },
    data: { jsonrpc: "2.0", id: 1, method, params },
    connectTimeout: 8000,
    readTimeout: 8000,
    disableRedirects: true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`RPC responded with HTTP ${response.status}.`);
  }
  const body = parseJsonRpcResponse(response.data);
  if (body?.error) throw new Error(String(body.error.message || "The RPC rejected the request."));
  if (typeof body?.result !== "string") throw new Error("The RPC returned an invalid response.");
  return body.result;
}

function formatNativeBalance(value: bigint): string {
  const [whole, fraction = ""] = ethers.formatEther(value).split(".");
  const visibleFraction = fraction.slice(0, 6).replace(/0+$/, "") || "0";
  return `${BigInt(whole).toLocaleString()}.${visibleFraction}`;
}

export function OnChainBalanceCard({
  walletAddress,
  showBalance = true,
}: OnChainBalanceCardProps) {
  const [balance, setBalance] = useState<BalanceState>({
    status: "loading",
    symbol: "GYDS",
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;

    const loadBalance = async () => {
      setRefreshing(true);
      let symbol = "GYDS";
      if (!walletAddress) {
        setBalance({ status: "unlinked", symbol: "GYDS" });
        setRefreshing(false);
        return;
      }

      if (!ethers.isAddress(walletAddress)) {
        setBalance({ status: "unavailable", symbol: "GYDS" });
        setRefreshing(false);
        return;
      }

      setBalance((current) => ({ status: "loading", symbol: current.symbol }));
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Sign in to read the on-chain balance.");

        let balanceWei: bigint;
        if (Capacitor.isNativePlatform()) {
          const { data: settings, error: settingsError } = await supabase
            .from("blockchain_settings_public")
            .select("rpc_url, rpc_urls, chain_id, native_coin_symbol")
            .eq("is_active", true)
            .maybeSingle();
          if (settingsError) throw settingsError;
          if (!settings) throw new Error("No active blockchain network is configured.");
          symbol = settings.native_coin_symbol || "GYDS";

          const configuredRpcUrls = buildRpcList({
            rpc_url: settings.rpc_url,
            rpc_urls: Array.isArray(settings.rpc_urls)
              ? settings.rpc_urls.filter((url): url is string => typeof url === "string")
              : null,
          });
          const rpcUrls = configuredRpcUrls
            .filter((url) => url !== WALLET_TEST_RPC_URL)
            .slice(0, 2);
          rpcUrls.push(WALLET_TEST_RPC_URL);
          if (rpcUrls.length === 0) throw new Error("No blockchain RPC URL is configured.");

          const expectedChainId = BigInt(settings.chain_id || "198282");
          let nativeBalance: bigint | null = null;
          for (const url of rpcUrls) {
            try {
              const [chainIdHex, balanceHex] = await Promise.all([
                nativeRpcCall(url, "eth_chainId", []),
                nativeRpcCall(url, "eth_getBalance", [walletAddress, "latest"]),
              ]);
              if (BigInt(chainIdHex) !== expectedChainId) continue;
              if (!/^0x[0-9a-f]+$/i.test(balanceHex)) continue;
              nativeBalance = BigInt(balanceHex);
              break;
            } catch {
              // Try the next configured RPC.
            }
          }
          if (nativeBalance === null) {
            throw new Error("No configured RPC could read this wallet on the expected network.");
          }
          balanceWei = nativeBalance;
        } else {
          const controller = new AbortController();
          timeoutId = window.setTimeout(() => controller.abort(), 30000);
          try {
            const response = await fetch("/api/blockchain/balance", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ address: walletAddress }),
              signal: controller.signal,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok || body?.ok !== true || typeof body.balanceWei !== "string") {
              throw new Error(body?.error || `Could not read the on-chain balance (HTTP ${response.status}).`);
            }
            balanceWei = BigInt(body.balanceWei);
            symbol = body.symbol || symbol;
          } finally {
            window.clearTimeout(timeoutId);
            timeoutId = undefined;
          }
        }

        if (active) {
          setBalance({ status: "ready", amount: formatNativeBalance(balanceWei), symbol });
        }
      } catch (error) {
        console.warn("Could not load the on-chain wallet balance:", error);
        if (active) {
          setBalance({
            status: "unavailable",
            symbol,
            reason: error instanceof Error ? error.message : "Could not read the configured blockchain network.",
          });
        }
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (active) setRefreshing(false);
      }
    };

    void loadBalance();
    const refreshOnFocus = () => setRefreshKey((current) => current + 1);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshOnFocus);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [walletAddress, refreshKey]);

  const value = balance.status === "ready"
    ? showBalance ? `${balance.amount} ${balance.symbol}` : "••••••"
    : balance.status === "loading"
      ? "Loading…"
      : balance.status === "unlinked"
        ? "No on-chain wallet linked"
        : "Network unavailable";

  return (
    <Card data-testid="card-on-chain-balance">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">On-chain native balance</p>
          <p className="mt-1 text-xl font-bold" aria-live="polite">{value}</p>
          {balance.status === "unlinked" && (
            <Button asChild variant="link" size="sm" className="h-auto p-0">
              <Link to="/profile#blockchain-wallet">Link an on-chain wallet</Link>
            </Button>
          )}
          {balance.status === "unavailable" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {balance.reason || "Could not read the configured blockchain network. Try again shortly."}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Refresh on-chain balance"
          disabled={refreshing}
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </Button>
      </CardContent>
    </Card>
  );
}
