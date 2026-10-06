import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getGydsProvider } from "@/lib/chain";

interface OnChainBalanceCardProps {
  walletAddress: string | null;
  showBalance?: boolean;
}

type BalanceState =
  | { status: "loading"; symbol: string }
  | { status: "ready"; amount: string; symbol: string }
  | { status: "unlinked"; symbol: string }
  | { status: "unavailable"; symbol: string };

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
    let provider: Awaited<ReturnType<typeof getGydsProvider>> = null;
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
        const { data: settings, error: settingsError } = await supabase
          .from("blockchain_settings_public")
          .select("native_coin_symbol")
          .eq("is_active", true)
          .maybeSingle();
        if (settingsError) throw settingsError;
        symbol = settings?.native_coin_symbol || "GYDS";

        provider = await getGydsProvider();
        if (!provider) throw new Error("The configured blockchain RPC is unavailable.");

        const amount = await Promise.race([
          provider.getBalance(walletAddress),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
              () => reject(new Error("The blockchain balance request timed out.")),
              10000,
            );
          }),
        ]);

        if (active) {
          setBalance({ status: "ready", amount: formatNativeBalance(amount), symbol });
        }
      } catch (error) {
        console.warn("Could not load the on-chain wallet balance:", error);
        if (active) {
          setBalance({ status: "unavailable", symbol });
        }
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        provider?.destroy();
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
      provider?.destroy();
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
              Could not read the configured blockchain network. Try again shortly.
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
