import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnChainBalanceCard } from "@/components/OnChainBalanceCard";
import AdminFundingActivity from "@/components/AdminFundingActivity";
import { supabase } from "@/integrations/supabase/client";

interface UserAccount {
  id: string;
  email: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  walletAddress: string | null;
  role: string;
  disabled: boolean;
  kycStatus: string;
  createdAt: string | null;
  lastSignIn: string | null;
  wallet: { balance: number | string; currency: string } | null;
}

interface UserAccountResponse {
  account?: UserAccount;
  error?: string;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatInternalBalance(wallet: UserAccount["wallet"]) {
  if (!wallet) return "No internal wallet";
  const amount = Number(wallet.balance);
  if (!Number.isFinite(amount)) return "Unavailable";
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${wallet.currency || "USD"}`;
}

export default function AdminUserAccount() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestInFlight = useRef(false);

  const refreshAccount = useCallback(async () => {
    if (!userId) {
      setError("A user ID is required to open an account.");
      setLoading(false);
      return;
    }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Sign in again.");

      const response = await fetch(`/api/auth/users/${encodeURIComponent(userId)}/account`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({})) as UserAccountResponse;
      if (!response.ok || !result.account) {
        throw new Error(result.error || "Could not load this user account.");
      }

      setAccount(result.account);
      setError(null);
      setLastUpdated(new Date());
    } catch (refreshError) {
      setError((refreshError as Error).message || "Could not load this user account.");
    } finally {
      requestInFlight.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let disposed = false;
    const initialLoad = window.setTimeout(() => {
      if (!disposed) void refreshAccount();
    }, 0);
    const interval = window.setInterval(() => void refreshAccount(), 5000);
    window.addEventListener("focus", refreshAccount);
    return () => {
      disposed = true;
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshAccount);
    };
  }, [refreshAccount]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button
            type="button"
            onClick={() => navigate("/admin/users")}
            variant="secondary"
            size="icon"
            aria-label="Back to Manage Users"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">User account</h1>
            <p className="text-xs text-foreground/70 sm:text-sm">
              Read-only admin account view · balances refresh every 5 seconds
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => void refreshAccount()}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        {loading ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Loading user account…</CardContent></Card>
        ) : error && !account ? (
          <Card>
            <CardContent className="space-y-4 py-8 text-center">
              <p className="text-destructive">{error}</p>
              <Button type="button" onClick={() => void refreshAccount()}>Try again</Button>
            </CardContent>
          </Card>
        ) : account ? (
          <>
            {error && (
              <p role="status" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Refresh failed; showing the last loaded account data. {error}
              </p>
            )}

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-3 text-primary">
                    <UserRound size={22} />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate">{account.fullName || account.phoneNumber || "Unnamed user"}</CardTitle>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {account.email || account.phoneNumber || "No contact information"}
                    </p>
                  </div>
                </div>
                <Badge variant={account.disabled ? "destructive" : "secondary"}>
                  {account.disabled ? "Disabled" : account.role}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{account.phoneNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="break-all font-medium">{account.email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">KYC status</p>
                  <p className="font-medium">{account.kycStatus || "Unverified"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Account ID</p>
                  <code className="break-all text-xs">{account.id}</code>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(account.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last sign-in</p>
                  <p className="font-medium">{formatDate(account.lastSignIn)}</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card data-testid="card-internal-ledger-balance">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span aria-hidden="true">USD</span>
                    Internal ledger balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums" aria-live="polite">
                    {formatInternalBalance(account.wallet)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    From the internal wallet ledger · refreshed every 5 seconds
                  </p>
                  {lastUpdated && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last checked {lastUpdated.toLocaleTimeString()}
                    </p>
                  )}
                </CardContent>
              </Card>

              {account.walletAddress ? (
                <OnChainBalanceCard walletAddress={account.walletAddress} />
              ) : (
                <Card data-testid="card-on-chain-balance">
                  <CardHeader><CardTitle className="text-base">On-chain native balance</CardTitle></CardHeader>
                  <CardContent className="text-muted-foreground">No on-chain wallet linked</CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Public blockchain wallet</CardTitle></CardHeader>
              <CardContent>
                <p className="break-all font-mono text-sm">
                  {account.walletAddress || "No wallet address linked"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  This is a public address only. Private keys are never shown in the admin view.
                </p>
              </CardContent>
            </Card>
            <AdminFundingActivity userId={account.id} />
          </>
        ) : null}
      </main>
    </div>
  );
}
