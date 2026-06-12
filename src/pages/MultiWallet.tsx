import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Wallet, PiggyBank, Briefcase, Users, Lock, ShieldCheck,
  TrendingUp, Globe, Plus, ArrowUpRight, ArrowDownLeft, Coins,
} from "lucide-react";

interface WalletType {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
  currency?: string;
}

const WALLET_TYPES: WalletType[] = [
  { key: "main",         label: "Main Wallet",        description: "Your primary spending wallet",         icon: Wallet,      color: "text-blue-600",   gradient: "from-blue-600 to-blue-400" },
  { key: "savings",      label: "Savings Wallet",      description: "Earn interest on saved funds",         icon: PiggyBank,   color: "text-green-600",  gradient: "from-green-600 to-green-400" },
  { key: "business",     label: "Business Wallet",     description: "Separate business expenses",           icon: Briefcase,   color: "text-purple-600", gradient: "from-purple-600 to-purple-400" },
  { key: "family",       label: "Family Wallet",       description: "Shared wallet for family use",         icon: Users,       color: "text-orange-600", gradient: "from-orange-500 to-orange-400" },
  { key: "joint",        label: "Joint Wallet",        description: "Co-owned with another person",         icon: Users,       color: "text-pink-600",   gradient: "from-pink-600 to-pink-400" },
  { key: "locked",       label: "Locked Savings",      description: "Locked until target date/amount",      icon: Lock,        color: "text-red-600",    gradient: "from-red-600 to-red-400" },
  { key: "escrow",       label: "Escrow Wallet",       description: "Funds held until conditions met",      icon: ShieldCheck, color: "text-teal-600",   gradient: "from-teal-600 to-teal-400" },
  { key: "rewards",      label: "Rewards Wallet",      description: "Store cashback and reward points",     icon: TrendingUp,  color: "text-yellow-600", gradient: "from-yellow-500 to-yellow-400" },
  { key: "multicurrency",label: "Multi-Currency",      description: "Hold multiple currencies at once",     icon: Globe,       color: "text-indigo-600", gradient: "from-indigo-600 to-indigo-400" },
];

interface UserWallet {
  id: string;
  type: string;
  label: string;
  balance: number;
  locked_until?: string;
  target?: number;
  currency?: string;
  interest_rate?: number;
  co_owner?: string;
  created_at: string;
}

const STORAGE_KEY = "vbank_wallets_v1";

const MultiWallet = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<UserWallet | null>(null);
  const [mainBalance, setMainBalance] = useState(0);

  const [form, setForm] = useState({
    type: "",
    label: "",
    initialDeposit: "",
    lockedUntil: "",
    target: "",
    coOwner: "",
    currency: "USD",
  });
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmt, setTransferAmt] = useState("");

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    setMainBalance((w as any)?.balance || 0);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) {
      setWallets(JSON.parse(raw));
    } else {
      const defaults: UserWallet[] = [
        { id: "main", type: "main", label: "Main Wallet", balance: (w as any)?.balance || 0, created_at: new Date().toISOString() },
      ];
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(defaults));
      setWallets(defaults);
    }
  };

  const save = (list: UserWallet[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(list));
    setWallets(list);
  };

  const createWallet = () => {
    if (!form.type || !form.label) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    const wtype = WALLET_TYPES.find(w => w.key === form.type)!;
    const deposit = parseFloat(form.initialDeposit) || 0;
    const newWallet: UserWallet = {
      id: `wallet-${Date.now()}`,
      type: form.type,
      label: form.label || wtype.label,
      balance: deposit,
      locked_until: form.lockedUntil || undefined,
      target: form.target ? parseFloat(form.target) : undefined,
      co_owner: form.coOwner || undefined,
      currency: form.type === "multicurrency" ? form.currency : undefined,
      interest_rate: form.type === "savings" ? 3.5 : form.type === "locked" ? 5.0 : undefined,
      created_at: new Date().toISOString(),
    };
    save([...wallets, newWallet]);
    setCreateOpen(false);
    setForm({ type: "", label: "", initialDeposit: "", lockedUntil: "", target: "", coOwner: "", currency: "USD" });
    toast({ title: `${wtype.label} created!` });
  };

  const doTransfer = () => {
    if (!transferFrom || !transferTo || !transferAmt) { toast({ title: "Fill all fields", variant: "destructive" }); return; }
    const amt = parseFloat(transferAmt);
    const from = wallets.find(w => w.id === transferFrom);
    const to = wallets.find(w => w.id === transferTo);
    if (!from || !to) return;
    if (from.balance < amt) { toast({ title: "Insufficient balance", variant: "destructive" }); return; }
    if (from.type === "locked") { toast({ title: "Cannot transfer from a locked wallet", variant: "destructive" }); return; }
    const updated = wallets.map(w => {
      if (w.id === transferFrom) return { ...w, balance: w.balance - amt };
      if (w.id === transferTo) return { ...w, balance: w.balance + amt };
      return w;
    });
    save(updated);
    setTransferOpen(false);
    setTransferFrom(""); setTransferTo(""); setTransferAmt("");
    toast({ title: "Transfer complete", description: `Moved $${amt.toFixed(2)} from ${from.label} to ${to.label}` });
  };

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5" /> My Wallets</h1>
              <p className="text-xs text-primary-foreground/70">Manage all your wallet types</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">Transfer</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Transfer Between Wallets</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>From Wallet</Label>
                    <Select value={transferFrom} onValueChange={setTransferFrom}>
                      <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>
                        {wallets.filter(w => w.type !== "locked").map(w => (
                          <SelectItem key={w.id} value={w.id}>{w.label} (${w.balance.toFixed(2)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To Wallet</Label>
                    <Select value={transferTo} onValueChange={setTransferTo}>
                      <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                      <SelectContent>
                        {wallets.filter(w => w.id !== transferFrom).map(w => (
                          <SelectItem key={w.id} value={w.id}>{w.label} (${w.balance.toFixed(2)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount ($)</Label>
                    <Input type="number" value={transferAmt} onChange={e => setTransferAmt(e.target.value)} placeholder="0.00" />
                  </div>
                  <Button className="w-full" onClick={doTransfer}>Move Funds</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create New Wallet</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Wallet Type *</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v, label: WALLET_TYPES.find(w => w.key === v)?.label || "" })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {WALLET_TYPES.filter(w => w.key !== "main").map(w => (
                          <SelectItem key={w.key} value={w.key}>
                            <span className="flex items-center gap-2"><w.icon className="h-4 w-4" />{w.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.type && <p className="text-xs text-muted-foreground mt-1">{WALLET_TYPES.find(w => w.key === form.type)?.description}</p>}
                  </div>
                  <div>
                    <Label>Wallet Name *</Label>
                    <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Emergency Fund" />
                  </div>
                  <div>
                    <Label>Initial Deposit ($)</Label>
                    <Input type="number" value={form.initialDeposit} onChange={e => setForm({ ...form, initialDeposit: e.target.value })} placeholder="0.00" />
                  </div>
                  {form.type === "savings" && (
                    <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700">
                      Interest rate: <strong>3.5% p.a.</strong> — paid monthly
                    </div>
                  )}
                  {form.type === "locked" && (
                    <>
                      <div>
                        <Label>Locked Until</Label>
                        <Input type="date" value={form.lockedUntil} onChange={e => setForm({ ...form, lockedUntil: e.target.value })} />
                      </div>
                      <div>
                        <Label>Target Amount ($)</Label>
                        <Input type="number" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} />
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
                        Interest rate: <strong>5.0% p.a.</strong> — paid at maturity
                      </div>
                    </>
                  )}
                  {(form.type === "family" || form.type === "joint") && (
                    <div>
                      <Label>Co-owner Phone / Email</Label>
                      <Input value={form.coOwner} onChange={e => setForm({ ...form, coOwner: e.target.value })} placeholder="Co-owner contact" />
                    </div>
                  )}
                  {form.type === "multicurrency" && (
                    <div>
                      <Label>Primary Currency</Label>
                      <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["USD","EUR","GBP","CAD","TTD","JMD","BBD","BRL","CNY","INR"].map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button className="w-full" onClick={createWallet}>Create Wallet</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="bg-white/20 rounded-2xl p-4 text-center">
          <p className="text-sm opacity-80">Total Across All Wallets</p>
          <p className="text-4xl font-bold">${totalBalance.toFixed(2)}</p>
          <p className="text-xs opacity-70">{wallets.length} wallet{wallets.length !== 1 ? "s" : ""}</p>
        </div>
      </header>

      <div className="p-4 space-y-3">
        {wallets.map(wallet => {
          const wtype = WALLET_TYPES.find(w => w.key === wallet.type) || WALLET_TYPES[0];
          const isLocked = wallet.type === "locked" && wallet.locked_until && new Date(wallet.locked_until) > new Date();
          const progress = wallet.target ? Math.min((wallet.balance / wallet.target) * 100, 100) : null;

          return (
            <Card key={wallet.id} className={`border-2 ${selectedWallet?.id === wallet.id ? "border-primary" : "border-border"}`}
              onClick={() => setSelectedWallet(selectedWallet?.id === wallet.id ? null : wallet)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 bg-gradient-to-br ${wtype.gradient} rounded-2xl flex items-center justify-center shrink-0`}>
                    <wtype.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{wallet.label}</p>
                      {isLocked && <Badge variant="destructive" className="text-xs shrink-0"><Lock className="h-3 w-3 mr-1" />Locked</Badge>}
                      {wallet.type === "escrow" && <Badge variant="secondary" className="text-xs shrink-0">Escrow</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{wtype.description}</p>
                    {wallet.interest_rate && (
                      <p className="text-xs text-green-600">+{wallet.interest_rate}% p.a.</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${wallet.balance.toFixed(2)}</p>
                    {wallet.currency && <p className="text-xs text-muted-foreground">{wallet.currency}</p>}
                  </div>
                </div>

                {progress !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress to target</span>
                      <span>${wallet.balance.toFixed(2)} / ${wallet.target!.toFixed(2)}</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}

                {wallet.locked_until && (
                  <p className="text-xs text-muted-foreground mt-2">
                    🔒 Unlocks: {new Date(wallet.locked_until).toLocaleDateString()}
                  </p>
                )}
                {wallet.co_owner && (
                  <p className="text-xs text-muted-foreground mt-1">
                    👥 Shared with: {wallet.co_owner}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Wallet type guide */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="h-4 w-4" /> Available Wallet Types
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            {WALLET_TYPES.filter(w => w.key !== "main").map(w => (
              <button key={w.key} onClick={() => { setForm(f => ({ ...f, type: w.key, label: w.label })); setCreateOpen(true); }}
                className="flex flex-col items-center gap-1 p-2 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-all text-center">
                <div className={`w-8 h-8 bg-gradient-to-br ${w.gradient} rounded-xl flex items-center justify-center`}>
                  <w.icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-[10px] font-medium leading-tight">{w.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MultiWallet;
