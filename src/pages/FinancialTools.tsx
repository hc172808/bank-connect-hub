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
  ArrowLeft, DollarSign, TrendingUp, TrendingDown, PiggyBank,
  CreditCard, BarChart3, Target, Minus, Plus, Calculator,
  Heart, AlertTriangle, CheckCircle, ArrowLeftRight,
} from "lucide-react";
import { format, subDays } from "date-fns";

interface Expense {
  id: string;
  amount: number;
  category: string;
  note: string;
  date: string;
}
interface Income {
  id: string;
  amount: number;
  source: string;
  date: string;
  recurring: boolean;
}
interface Debt {
  id: string;
  name: string;
  total: number;
  remaining: number;
  rate: number;
  minPayment: number;
}

const EXPENSE_CATEGORIES = [
  "🏠 Housing", "🍔 Food", "🚗 Transport", "💡 Utilities",
  "🏥 Health", "🎭 Entertainment", "👕 Clothing", "📱 Technology",
  "🎓 Education", "🏦 Debt", "💸 Savings", "📦 Other",
];

const INCOME_SOURCES = ["💼 Salary", "💰 Freelance", "🏢 Business", "📈 Investments", "🏠 Rental", "🎁 Bonus", "💳 Cashback", "📦 Other"];

const STORAGE_KEY = "vbank_financial_tools_v1";

const FinancialTools = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [activeTab, setActiveTab] = useState<"expenses" | "income" | "debt" | "networth">("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

  const [expForm, setExpForm] = useState({ amount: "", category: "", note: "" });
  const [incForm, setIncForm] = useState({ amount: "", source: "", recurring: false });
  const [debtForm, setDebtForm] = useState({ name: "", total: "", remaining: "", rate: "", minPayment: "" });

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    setWalletBalance((w as any)?.balance || 0);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) {
      const d = JSON.parse(raw);
      setExpenses(d.expenses || []);
      setIncomes(d.incomes || []);
      setDebts(d.debts || []);
    }
  };

  const saveAll = (e: Expense[], i: Income[], d: Debt[]) => {
    if (!userId) return;
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify({ expenses: e, incomes: i, debts: d }));
    setExpenses(e); setIncomes(i); setDebts(d);
  };

  const addExpense = () => {
    if (!expForm.amount || !expForm.category) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    const newExp: Expense = {
      id: `exp-${Date.now()}`, amount: parseFloat(expForm.amount),
      category: expForm.category, note: expForm.note, date: new Date().toISOString(),
    };
    saveAll([newExp, ...expenses], incomes, debts);
    setExpForm({ amount: "", category: "", note: "" });
    toast({ title: "Expense tracked" });
  };

  const addIncome = () => {
    if (!incForm.amount || !incForm.source) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    const newInc: Income = {
      id: `inc-${Date.now()}`, amount: parseFloat(incForm.amount),
      source: incForm.source, date: new Date().toISOString(), recurring: incForm.recurring,
    };
    saveAll(expenses, [newInc, ...incomes], debts);
    setIncForm({ amount: "", source: "", recurring: false });
    toast({ title: "Income recorded" });
  };

  const addDebt = () => {
    if (!debtForm.name || !debtForm.total) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    const newDebt: Debt = {
      id: `debt-${Date.now()}`, name: debtForm.name,
      total: parseFloat(debtForm.total), remaining: parseFloat(debtForm.remaining) || parseFloat(debtForm.total),
      rate: parseFloat(debtForm.rate) || 0, minPayment: parseFloat(debtForm.minPayment) || 0,
    };
    saveAll(expenses, incomes, [...debts, newDebt]);
    setDebtForm({ name: "", total: "", remaining: "", rate: "", minPayment: "" });
    toast({ title: "Debt added" });
  };

  const removeDebt = (id: string) => saveAll(expenses, incomes, debts.filter(d => d.id !== id));

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome = incomes.filter(i => !i.recurring).reduce((s, i) => s + i.amount, 0)
    + incomes.filter(i => i.recurring).reduce((s, i) => s + i.amount, 0);
  const totalDebt = debts.reduce((s, d) => s + d.remaining, 0);
  const netWorth = walletBalance - totalDebt;
  const savingsRate = totalIncome > 0 ? Math.max(0, ((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

  // Financial Health Score
  const healthScore = Math.min(100, Math.round(
    (savingsRate >= 20 ? 30 : savingsRate * 1.5) +
    (totalDebt === 0 ? 30 : Math.max(0, 30 - (totalDebt / walletBalance) * 10)) +
    (walletBalance >= 500 ? 25 : walletBalance / 20) +
    (incomes.length >= 2 ? 15 : incomes.length * 7.5)
  ));
  const healthLabel = healthScore >= 80 ? { l: "Excellent", c: "text-green-600" }
    : healthScore >= 60 ? { l: "Good", c: "text-blue-600" }
    : healthScore >= 40 ? { l: "Fair", c: "text-yellow-600" }
    : { l: "Needs Work", c: "text-red-600" };

  const expByCategory = expenses.reduce((acc: Record<string, number>, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Financial Tools</h1>
            <p className="text-xs text-primary-foreground/70">Expense · Income · Debt · Net Worth</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-xs text-primary-foreground/70">Net Worth</p>
            <p className={`text-2xl font-bold ${netWorth < 0 ? "text-red-300" : ""}`}>${netWorth.toFixed(2)}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-xs text-primary-foreground/70">Financial Health</p>
            <p className="text-2xl font-bold">{healthScore}<span className="text-sm">/100</span></p>
            <p className={`text-xs ${healthLabel.c} font-medium bg-white/20 rounded px-1`}>{healthLabel.l}</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <button
          onClick={() => navigate("/currency-converter")}
          className="w-full flex items-center justify-between bg-white/20 hover:bg-white/30 rounded-xl px-4 py-3 transition-colors text-primary-foreground"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ArrowLeftRight className="h-4 w-4" />
            Currency Converter
          </span>
          <span className="text-xs opacity-75">44 currencies →</span>
        </button>

        <div className="grid grid-cols-4 gap-1">
          {(["expenses", "income", "debt", "networth"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 rounded-lg text-xs font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab === "networth" ? "Worth" : tab}
            </button>
          ))}
        </div>

        {activeTab === "expenses" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Track Expense</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Amount ($) *</Label>
                    <Input type="number" placeholder="0.00" value={expForm.amount}
                      onChange={e => setExpForm({ ...expForm, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Category *</Label>
                    <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
                      <option value="">Select</option>
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Note</Label>
                  <Input placeholder="What was this for?" value={expForm.note}
                    onChange={e => setExpForm({ ...expForm, note: e.target.value })} />
                </div>
                <Button className="w-full gap-2" onClick={addExpense}>
                  <Plus className="h-4 w-4" /> Add Expense
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">This Month</p><p className="text-xl font-bold text-red-600">${totalExpenses.toFixed(2)}</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Savings Rate</p><p className="text-xl font-bold text-green-600">{savingsRate.toFixed(1)}%</p></CardContent></Card>
            </div>

            {Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{cat}</span>
                  <span className="font-medium">${amt.toFixed(2)}</span>
                </div>
                <Progress value={totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0} className="h-2" />
              </div>
            ))}

            {expenses.slice(0, 10).map(e => (
              <div key={e.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                <span className="text-lg">{e.category.split(" ")[0]}</span>
                <div className="flex-1"><p className="text-sm font-medium">{e.category.split(" ").slice(1).join(" ")}</p>
                  <p className="text-xs text-muted-foreground">{e.note || format(new Date(e.date), "MMM d")}</p></div>
                <span className="font-bold text-red-600">-${e.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "income" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Record Income</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Amount ($) *</Label>
                    <Input type="number" placeholder="0.00" value={incForm.amount}
                      onChange={e => setIncForm({ ...incForm, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Source *</Label>
                    <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={incForm.source} onChange={e => setIncForm({ ...incForm, source: e.target.value })}>
                      <option value="">Select</option>
                      {INCOME_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={incForm.recurring}
                    onChange={e => setIncForm({ ...incForm, recurring: e.target.checked })} />
                  Recurring (monthly)
                </label>
                <Button className="w-full gap-2" onClick={addIncome}>
                  <Plus className="h-4 w-4" /> Record Income
                </Button>
              </CardContent>
            </Card>

            <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Total Income Recorded</p><p className="text-2xl font-bold text-green-600">${totalIncome.toFixed(2)}</p></CardContent></Card>

            {incomes.map(inc => (
              <div key={inc.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                <span className="text-lg">{inc.source.split(" ")[0]}</span>
                <div className="flex-1"><p className="text-sm font-medium">{inc.source.split(" ").slice(1).join(" ")}</p>
                  <div className="flex gap-1">{inc.recurring && <Badge variant="secondary" className="text-xs">Recurring</Badge>}
                    <p className="text-xs text-muted-foreground">{format(new Date(inc.date), "MMM d")}</p></div></div>
                <span className="font-bold text-green-600">+${inc.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "debt" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Add Debt</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Name *</Label><Input placeholder="e.g. Car loan" value={debtForm.name} onChange={e => setDebtForm({ ...debtForm, name: e.target.value })} /></div>
                  <div><Label className="text-xs">Total ($) *</Label><Input type="number" placeholder="0.00" value={debtForm.total} onChange={e => setDebtForm({ ...debtForm, total: e.target.value })} /></div>
                  <div><Label className="text-xs">Remaining ($)</Label><Input type="number" placeholder="0.00" value={debtForm.remaining} onChange={e => setDebtForm({ ...debtForm, remaining: e.target.value })} /></div>
                  <div><Label className="text-xs">Interest Rate (%)</Label><Input type="number" placeholder="0.0" value={debtForm.rate} onChange={e => setDebtForm({ ...debtForm, rate: e.target.value })} /></div>
                </div>
                <Button className="w-full" onClick={addDebt}><Plus className="h-4 w-4 mr-2" />Add Debt</Button>
              </CardContent>
            </Card>

            {debts.length > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Total Outstanding Debt</p><p className="text-2xl font-bold text-red-700">${totalDebt.toFixed(2)}</p></CardContent>
              </Card>
            )}

            {debts.map(d => (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div><p className="font-semibold">{d.name}</p><p className="text-xs text-muted-foreground">{d.rate}% p.a.</p></div>
                    <div className="text-right"><p className="font-bold text-red-600">${d.remaining.toFixed(2)}</p><p className="text-xs text-muted-foreground">of ${d.total.toFixed(2)}</p></div>
                  </div>
                  <Progress value={((d.total - d.remaining) / d.total) * 100} className="h-2 mb-2" />
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">{(((d.total - d.remaining) / d.total) * 100).toFixed(1)}% paid off</p>
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => removeDebt(d.id)}>
                      <Minus className="h-3 w-3" /> Mark Paid
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "networth" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Assets</p>
                      <p className="text-2xl font-bold text-green-700">${walletBalance.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Wallet balance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Liabilities</p>
                      <p className="text-2xl font-bold text-red-700">${totalDebt.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Outstanding debt</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className={`${netWorth >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">NET WORTH</p>
                  <p className={`text-4xl font-bold ${netWorth >= 0 ? "text-green-700" : "text-red-700"}`}>${Math.abs(netWorth).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{netWorth < 0 ? "Negative" : "Positive"} net worth</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Heart className="h-4 w-4 text-red-500" /> Financial Health Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-3">
                  <div className="text-5xl font-bold">{healthScore}</div>
                  <div>
                    <p className={`font-bold ${healthLabel.c}`}>{healthLabel.l}</p>
                    <p className="text-xs text-muted-foreground">Out of 100</p>
                  </div>
                </div>
                <Progress value={healthScore} className="h-3 mb-3" />
                <div className="space-y-2 text-sm">
                  {[
                    { label: "Savings Rate ≥ 20%", done: savingsRate >= 20 },
                    { label: "Multiple income sources", done: incomes.length >= 2 },
                    { label: "Low/no outstanding debt", done: totalDebt === 0 },
                    { label: "Wallet balance ≥ $500", done: walletBalance >= 500 },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {item.done ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                      <span className={item.done ? "text-green-700" : ""}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialTools;
