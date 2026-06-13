import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, Link2, LinkIcon, Unlink, RefreshCw,
  CheckCircle2, Shield, TrendingUp, ArrowRightLeft, Eye,
  Plus, Search, Loader2, Lock, Globe, Info,
} from "lucide-react";

interface BankAccount {
  id: string;
  bankId: string;
  bankName: string;
  bankIcon: string;
  accountType: string;
  accountNumber: string;
  balance: number;
  currency: string;
  connectedAt: string;
  lastSync: string;
  status: "active" | "error" | "syncing";
}

interface AvailableBank {
  id: string;
  name: string;
  icon: string;
  country: string;
  popular: boolean;
}

const STORAGE_KEY = "vbank_open_banking_v1";

function load<T>(def: T): T {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") ?? def; } catch { return def; }
}
function save(val: unknown) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch {}
}

const AVAILABLE_BANKS: AvailableBank[] = [
  { id: "chase", name: "Chase", icon: "🏦", country: "US", popular: true },
  { id: "boa", name: "Bank of America", icon: "🏛️", country: "US", popular: true },
  { id: "wells", name: "Wells Fargo", icon: "🐴", country: "US", popular: true },
  { id: "citi", name: "Citibank", icon: "🏙️", country: "US", popular: true },
  { id: "hsbc", name: "HSBC", icon: "🔴", country: "UK", popular: true },
  { id: "barclays", name: "Barclays", icon: "🦅", country: "UK", popular: false },
  { id: "lloyds", name: "Lloyds Bank", icon: "🐎", country: "UK", popular: false },
  { id: "santander", name: "Santander", icon: "🔥", country: "ES", popular: true },
  { id: "bnp", name: "BNP Paribas", icon: "🟢", country: "FR", popular: false },
  { id: "deutsche", name: "Deutsche Bank", icon: "🔷", country: "DE", popular: false },
  { id: "dbs", name: "DBS Bank", icon: "🌏", country: "SG", popular: true },
  { id: "paypal", name: "PayPal", icon: "💙", country: "Global", popular: true },
];

type ConnectStep = "list" | "auth" | "confirm" | "done";

export default function OpenBanking() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<BankAccount[]>(load<BankAccount[]>([]));
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"connected" | "available">("connected");
  const [connectStep, setConnectStep] = useState<ConnectStep | null>(null);
  const [selectedBank, setSelectedBank] = useState<AvailableBank | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const persist = (accs: BankAccount[]) => { setAccounts(accs); save(accs); };

  const startConnect = (bank: AvailableBank) => {
    setSelectedBank(bank);
    setConnectStep("auth");
  };

  const doConnect = async () => {
    if (!selectedBank) return;
    setConnecting(true);
    setConnectStep("confirm");
    await new Promise(r => setTimeout(r, 1800));

    const mockAccount: BankAccount = {
      id: `${selectedBank.id}-${Date.now()}`,
      bankId: selectedBank.id,
      bankName: selectedBank.name,
      bankIcon: selectedBank.icon,
      accountType: "Checking",
      accountNumber: "••••" + Math.floor(1000 + Math.random() * 9000),
      balance: parseFloat((Math.random() * 5000 + 100).toFixed(2)),
      currency: selectedBank.country === "UK" ? "GBP" : selectedBank.country === "EU" || selectedBank.country === "DE" || selectedBank.country === "FR" || selectedBank.country === "ES" ? "EUR" : "USD",
      connectedAt: new Date().toISOString(),
      lastSync: new Date().toISOString(),
      status: "active",
    };

    const updated = [...accounts, mockAccount];
    persist(updated);
    setConnecting(false);
    setConnectStep("done");
    toast.success(`${selectedBank.name} connected successfully!`);
  };

  const syncAccount = async (id: string) => {
    setSyncing(id);
    await new Promise(r => setTimeout(r, 1200));
    const updated = accounts.map(a => a.id === id
      ? { ...a, lastSync: new Date().toISOString(), balance: parseFloat((a.balance + (Math.random() - 0.5) * 20).toFixed(2)), status: "active" as const }
      : a
    );
    persist(updated);
    setSyncing(null);
    toast.success("Account synced");
  };

  const disconnect = (id: string) => {
    const acc = accounts.find(a => a.id === id);
    const updated = accounts.filter(a => a.id !== id);
    persist(updated);
    toast.success(`${acc?.bankName} disconnected`);
  };

  const filtered = AVAILABLE_BANKS.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) && !accounts.some(a => a.bankId === b.id)
  );
  const popular = filtered.filter(b => b.popular);
  const others = filtered.filter(b => !b.popular);
  const totalExternal = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-gradient-to-r from-emerald-700 to-teal-600 text-white p-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-black flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Open Banking
            </h1>
            <p className="text-xs text-white/70">Connect external bank accounts for a complete financial view</p>
          </div>
        </div>
        {accounts.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-xs text-white/70">External Accounts</p>
              <p className="text-2xl font-black">{accounts.length}</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-xs text-white/70">Combined Balance</p>
              <p className="text-xl font-black">${totalExternal.toFixed(2)}</p>
            </div>
          </div>
        )}
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Connect modal */}
        {connectStep && selectedBank && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
            <div className="bg-background rounded-t-3xl w-full max-w-md p-6 space-y-4">
              {connectStep === "auth" && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{selectedBank.icon}</span>
                    <div>
                      <h2 className="font-bold text-lg">Connect {selectedBank.name}</h2>
                      <p className="text-sm text-muted-foreground">Secure OAuth connection</p>
                    </div>
                  </div>
                  <div className="bg-muted rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold">NETLIFE CASH will:</p>
                    {["View account balances", "Read transaction history", "Import transactions (read-only)"].map(p => (
                      <div key={p} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500" /> {p}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                      <Lock className="h-4 w-4" /> Will never initiate transfers or modify your account
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={doConnect}>Authorize & Connect</Button>
                    <Button variant="outline" className="flex-1" onClick={() => { setConnectStep(null); setSelectedBank(null); }}>Cancel</Button>
                  </div>
                </>
              )}
              {connectStep === "confirm" && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <p className="font-semibold">Connecting to {selectedBank.name}…</p>
                  <p className="text-sm text-muted-foreground text-center">Establishing secure OAuth connection and importing account data</p>
                </div>
              )}
              {connectStep === "done" && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="font-bold text-lg text-green-600">{selectedBank.name} Connected!</p>
                  <p className="text-sm text-muted-foreground text-center">Your account has been linked. Balance and transactions will sync automatically.</p>
                  <Button className="w-full" onClick={() => { setConnectStep(null); setSelectedBank(null); setTab("connected"); }}>View Connected Accounts</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border rounded-xl p-1 bg-muted">
          <Button size="sm" variant={tab === "connected" ? "default" : "ghost"}
            className="flex-1 gap-2 text-xs" onClick={() => setTab("connected")}>
            <Link2 className="h-4 w-4" /> Connected ({accounts.length})
          </Button>
          <Button size="sm" variant={tab === "available" ? "default" : "ghost"}
            className="flex-1 gap-2 text-xs" onClick={() => setTab("available")}>
            <Plus className="h-4 w-4" /> Add Bank
          </Button>
        </div>

        {/* Connected accounts */}
        {tab === "connected" && (
          <>
            {accounts.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/30" />
                <p className="font-semibold text-muted-foreground">No banks connected yet</p>
                <p className="text-sm text-muted-foreground">Link your external bank accounts to see all your finances in one place.</p>
                <Button onClick={() => setTab("available")} className="gap-2">
                  <Plus className="h-4 w-4" /> Connect a Bank
                </Button>
              </div>
            )}
            {accounts.map(acc => (
              <Card key={acc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{acc.bankIcon}</span>
                      <div>
                        <p className="font-semibold text-sm">{acc.bankName}</p>
                        <p className="text-xs text-muted-foreground">{acc.accountType} · {acc.accountNumber}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last sync: {new Date(acc.lastSync).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-base">{acc.currency} {acc.balance.toFixed(2)}</p>
                      <Badge className={`text-[10px] mt-1 ${acc.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {acc.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                      onClick={() => syncAccount(acc.id)} disabled={syncing === acc.id}>
                      {syncing === acc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sync
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs text-destructive"
                      onClick={() => disconnect(acc.id)}>
                      <Unlink className="h-3.5 w-3.5" /> Disconnect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {/* Available banks */}
        {tab === "available" && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search banks…" className="pl-9" />
            </div>

            {popular.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Popular</p>
                <div className="grid grid-cols-2 gap-2">
                  {popular.map(bank => (
                    <Card key={bank.id} className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => startConnect(bank)}>
                      <CardContent className="p-3 flex items-center gap-2">
                        <span className="text-2xl">{bank.icon}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{bank.name}</p>
                          <p className="text-xs text-muted-foreground">{bank.country}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {others.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">More Banks</p>
                {others.map(bank => (
                  <Card key={bank.id} className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => startConnect(bank)}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-2xl">{bank.icon}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{bank.name}</p>
                        <p className="text-xs text-muted-foreground">{bank.country}</p>
                      </div>
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No banks found matching "{search}"</p>
              </div>
            )}
          </>
        )}

        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-4 flex gap-3">
            <Shield className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700">
              <p className="font-semibold mb-1">Bank-Level Security</p>
              <p>Connections use read-only OAuth 2.0 — we can never move money from your external accounts. Data is encrypted in transit and at rest.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
