import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, PiggyBank, Plus, TrendingUp, Lock, Unlock,
  DollarSign, Calendar, Percent, AlertCircle,
} from "lucide-react";
import { format, addMonths } from "date-fns";

interface SavingsAccount {
  id: string;
  name: string;
  balance: number;
  target: number;
  interest_rate: number;
  term_months: number;
  account_type: "flexible" | "fixed" | "locked";
  maturity_date: string;
  created_at: string;
  status: "active" | "matured" | "closed";
  interest_earned: number;
}

const ACCOUNT_TYPES = [
  { value: "flexible", label: "Flexible Savings", rate: 2.5, description: "Withdraw anytime, earn 2.5% p.a." },
  { value: "fixed",    label: "Fixed Deposit",    rate: 6.0, description: "Locked 3–24 months, earn 6% p.a." },
  { value: "locked",   label: "Locked Savings",   rate: 8.0, description: "Goal-locked, earn 8% p.a. on maturity." },
];

const STORAGE_KEY = "vbank_savings_accounts_v1";

const SavingsAccounts = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [userId, setUserId] = useState("");
  const [open, setOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("");

  const [form, setForm] = useState({
    name: "",
    account_type: "flexible" as "flexible" | "fixed" | "locked",
    initial_deposit: "",
    target: "",
    term_months: "12",
  });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) setAccounts(JSON.parse(raw));
  };

  const save = (list: SavingsAccount[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(list));
    setAccounts(list);
  };

  const createAccount = () => {
    if (!form.name.trim() || !form.initial_deposit) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }
    const typeInfo = ACCOUNT_TYPES.find(t => t.value === form.account_type)!;
    const months = parseInt(form.term_months) || 12;
    const maturity = addMonths(new Date(), months).toISOString();
    const newAcc: SavingsAccount = {
      id: `sa-${Date.now()}`,
      name: form.name,
      balance: parseFloat(form.initial_deposit) || 0,
      target: parseFloat(form.target) || 0,
      interest_rate: typeInfo.rate,
      term_months: months,
      account_type: form.account_type,
      maturity_date: maturity,
      created_at: new Date().toISOString(),
      status: "active",
      interest_earned: 0,
    };
    save([...accounts, newAcc]);
    setOpen(false);
    setForm({ name: "", account_type: "flexible", initial_deposit: "", target: "", term_months: "12" });
    toast({ title: "Savings account created!" });
  };

  const deposit = (id: string) => {
    const amt = parseFloat(depositAmt);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    const updated = accounts.map(a => {
      if (a.id !== id) return a;
      const newBal = a.balance + amt;
      const monthsElapsed = (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
      const interest = newBal * (a.interest_rate / 100) * (monthsElapsed / 12);
      return { ...a, balance: newBal, interest_earned: interest };
    });
    save(updated);
    setDepositOpen(null);
    setDepositAmt("");
    toast({ title: `Deposited $${amt.toFixed(2)}` });
  };

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalInterest = accounts.reduce((s, a) => s + a.interest_earned, 0);

  const typeColor: Record<string, string> = {
    flexible: "bg-blue-100 text-blue-700",
    fixed: "bg-purple-100 text-purple-700",
    locked: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <PiggyBank className="h-5 w-5" /> Savings Accounts
            </h1>
            <p className="text-xs text-primary-foreground/70">Grow your money</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary"><Plus className="h-4 w-4 mr-1" /> Open Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Open Savings Account</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Account Name</Label>
                <Input placeholder="e.g. Emergency Fund" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Account Type</Label>
                <Select value={form.account_type}
                  onValueChange={v => setForm({ ...form, account_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <div>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.account_type !== "flexible" && (
                <div>
                  <Label>Term</Label>
                  <Select value={form.term_months}
                    onValueChange={v => setForm({ ...form, term_months: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 6, 12, 18, 24].map(m => (
                        <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Initial Deposit ($)</Label>
                <Input type="number" placeholder="0.00" value={form.initial_deposit}
                  onChange={e => setForm({ ...form, initial_deposit: e.target.value })} />
              </div>
              <div>
                <Label>Savings Target ($ optional)</Label>
                <Input type="number" placeholder="0.00" value={form.target}
                  onChange={e => setForm({ ...form, target: e.target.value })} />
              </div>
              <Button className="w-full" onClick={createAccount}>Open Account</Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3 w-3" /> Total Savings
              </div>
              <div className="text-2xl font-bold">${totalBalance.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingUp className="h-3 w-3" /> Interest Earned
              </div>
              <div className="text-2xl font-bold text-green-600">${totalInterest.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Interest rate info */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-700">
                <strong>Interest Rates:</strong> Flexible 2.5% · Fixed Deposit 6.0% · Locked Savings 8.0% per annum. Interest is credited monthly.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accounts list */}
        {accounts.length === 0 ? (
          <div className="text-center py-16">
            <PiggyBank className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No savings accounts yet</p>
            <p className="text-sm text-muted-foreground">Open your first account to start earning interest</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map(acc => {
              const pct = acc.target > 0 ? Math.min((acc.balance / acc.target) * 100, 100) : 0;
              const isLocked = acc.account_type !== "flexible" && new Date(acc.maturity_date) > new Date();
              return (
                <Card key={acc.id} className={isLocked ? "border-orange-200" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {isLocked ? <Lock className="h-4 w-4 text-orange-500" /> : <Unlock className="h-4 w-4 text-green-500" />}
                        {acc.name}
                      </CardTitle>
                      <Badge className={typeColor[acc.account_type]}>
                        {ACCOUNT_TYPES.find(t => t.value === acc.account_type)?.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-2xl font-bold">${acc.balance.toFixed(2)}</p>
                        {acc.interest_earned > 0 && (
                          <p className="text-xs text-green-600">+${acc.interest_earned.toFixed(2)} interest</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div className="flex items-center gap-1"><Percent className="h-3 w-3" />{acc.interest_rate}% p.a.</div>
                        <div className="flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          Matures {format(new Date(acc.maturity_date), "MMM d, yyyy")}
                        </div>
                      </div>
                    </div>
                    {acc.target > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress to goal</span>
                          <span>${acc.balance.toFixed(0)} / ${acc.target.toFixed(0)}</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    )}
                    {!isLocked && (
                      <Dialog open={depositOpen === acc.id} onOpenChange={o => { setDepositOpen(o ? acc.id : null); setDepositAmt(""); }}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="w-full"><Plus className="h-4 w-4 mr-1" /> Deposit Funds</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Deposit to {acc.name}</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Amount ($)</Label>
                              <Input type="number" placeholder="0.00" value={depositAmt}
                                onChange={e => setDepositAmt(e.target.value)} autoFocus />
                            </div>
                            <Button className="w-full" onClick={() => deposit(acc.id)}>Confirm Deposit</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    {isLocked && (
                      <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded flex items-center gap-2">
                        <Lock className="h-3 w-3 shrink-0" />
                        Locked until {format(new Date(acc.maturity_date), "MMM d, yyyy")}. Early withdrawal may incur penalty.
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavingsAccounts;
