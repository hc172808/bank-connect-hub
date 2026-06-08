import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, BarChart3, PieChart, Calendar, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

interface Tx {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
  status: string;
}

interface MonthlySummary {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

const FinancialInsights = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlies, setMonthlies] = useState<MonthlySummary[]>([]);
  const [categories, setCategories] = useState<{ label: string; amount: number; pct: number; color: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) { navigate("/auth"); return; }

    const sixMonthsAgo = subMonths(new Date(), 6).toISOString();
    const { data, error } = await supabase
      .from("transactions")
      .select("id, amount, transaction_type, description, created_at, status")
      .or(`sender_id.eq.${user.user.id},recipient_id.eq.${user.user.id}`)
      .gte("created_at", sixMonthsAgo)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading transactions", variant: "destructive" });
    } else {
      setTransactions(data || []);
      computeInsights(data || [], user.user.id);
    }
    setLoading(false);
  };

  const computeInsights = (txs: Tx[], userId: string) => {
    // Monthly breakdown for past 6 months
    const months: MonthlySummary[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const monthTxs = txs.filter(t => {
        const d = new Date(t.created_at);
        return d >= start && d <= end;
      });
      const income = monthTxs
        .filter(t => t.transaction_type === "receive" || t.transaction_type === "deposit")
        .reduce((s, t) => s + Number(t.amount), 0);
      const expenses = monthTxs
        .filter(t => t.transaction_type === "send" || t.transaction_type === "payment" || t.transaction_type === "transfer")
        .reduce((s, t) => s + Number(t.amount), 0);
      months.push({ month: format(date, "MMM yyyy"), income, expenses, net: income - expenses });
    }
    setMonthlies(months);

    // Spending categories from description keywords
    const spending = txs.filter(t => t.transaction_type === "send" || t.transaction_type === "payment");
    const catMap: Record<string, number> = {};
    spending.forEach(t => {
      const desc = (t.description || "Other").toLowerCase();
      let cat = "Other";
      if (desc.includes("food") || desc.includes("restaurant") || desc.includes("eat")) cat = "Food";
      else if (desc.includes("transport") || desc.includes("taxi") || desc.includes("fuel") || desc.includes("bus")) cat = "Transport";
      else if (desc.includes("bill") || desc.includes("utility") || desc.includes("electric") || desc.includes("water")) cat = "Utilities";
      else if (desc.includes("school") || desc.includes("tuition") || desc.includes("edu")) cat = "Education";
      else if (desc.includes("health") || desc.includes("medical") || desc.includes("pharmacy") || desc.includes("doctor")) cat = "Healthcare";
      else if (desc.includes("shop") || desc.includes("store") || desc.includes("market") || desc.includes("buy")) cat = "Shopping";
      catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
    });
    const total = Object.values(catMap).reduce((s, v) => s + v, 0);
    const colors = ["bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-red-500", "bg-orange-500", "bg-pink-500"];
    const cats = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount], i) => ({
        label, amount,
        pct: total ? Math.round((amount / total) * 100) : 0,
        color: colors[i % colors.length],
      }));
    setCategories(cats);
  };

  const totalIncome   = monthlies.reduce((s, m) => s + m.income, 0);
  const totalExpenses = monthlies.reduce((s, m) => s + m.expenses, 0);
  const totalNet      = totalIncome - totalExpenses;
  const maxBar = Math.max(...monthlies.flatMap(m => [m.income, m.expenses]), 1);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-xl font-bold">Financial Insights</h1>
      </div>

      <div className="p-4 space-y-5 max-w-2xl mx-auto">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1 text-green-600 mb-1">
                <ArrowDownLeft size={14} /> <span className="text-xs font-medium">Income</span>
              </div>
              <div className="text-lg font-bold text-green-600">
                {loading ? "—" : `$${totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </div>
              <div className="text-xs text-muted-foreground">Last 6 months</div>
            </CardContent>
          </Card>
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1 text-red-600 mb-1">
                <ArrowUpRight size={14} /> <span className="text-xs font-medium">Spent</span>
              </div>
              <div className="text-lg font-bold text-red-600">
                {loading ? "—" : `$${totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </div>
              <div className="text-xs text-muted-foreground">Last 6 months</div>
            </CardContent>
          </Card>
          <Card className={`${totalNet >= 0 ? "border-blue-500/30 bg-blue-500/5" : "border-orange-500/30 bg-orange-500/5"}`}>
            <CardContent className="pt-4 pb-4">
              <div className={`flex items-center gap-1 mb-1 ${totalNet >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                {totalNet >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span className="text-xs font-medium">Net</span>
              </div>
              <div className={`text-lg font-bold ${totalNet >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                {loading ? "—" : `${totalNet >= 0 ? "+" : ""}$${Math.abs(totalNet).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </div>
              <div className="text-xs text-muted-foreground">Saved / deficit</div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 size={17} /> Monthly Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            ) : monthlies.every(m => m.income === 0 && m.expenses === 0) ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No transaction data yet</div>
            ) : (
              <div className="space-y-3">
                {monthlies.map(m => (
                  <div key={m.month}>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{m.month}</span>
                      <span className={m.net >= 0 ? "text-green-600" : "text-red-500"}>
                        {m.net >= 0 ? "+" : ""}{m.net.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex gap-1 h-4">
                      <div
                        className="bg-green-500/70 rounded-l h-full transition-all"
                        style={{ width: `${(m.income / maxBar) * 50}%` }}
                        title={`Income: $${m.income.toFixed(2)}`}
                      />
                      <div
                        className="bg-red-500/70 rounded-r h-full transition-all"
                        style={{ width: `${(m.expenses / maxBar) * 50}%` }}
                        title={`Expenses: $${m.expenses.toFixed(2)}`}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500/70 rounded inline-block" /> Income</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-500/70 rounded inline-block" /> Expenses</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spending categories */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart size={17} /> Spending by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-16 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No spending data yet. Send money or make payments to see categories.</p>
            ) : (
              <div className="space-y-3">
                {categories.map(cat => (
                  <div key={cat.label} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${cat.color} shrink-0`} />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="font-medium">{cat.label}</span>
                        <span className="text-muted-foreground">${cat.amount.toFixed(2)}</span>
                      </div>
                      <div className="bg-muted rounded-full h-1.5">
                        <div className={`${cat.color} h-1.5 rounded-full`} style={{ width: `${cat.pct}%` }} />
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{cat.pct}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent high-value transactions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign size={17} /> Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent transactions found.</p>
            ) : (
              <div className="space-y-2">
                {transactions.slice(0, 10).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      {tx.transaction_type === "receive" || tx.transaction_type === "deposit"
                        ? <ArrowDownLeft size={16} className="text-green-600" />
                        : <ArrowUpRight size={16} className="text-red-500" />
                      }
                      <div>
                        <p className="text-sm font-medium capitalize">{tx.transaction_type}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(tx.created_at), "d MMM yyyy")}</p>
                      </div>
                    </div>
                    <span className={`font-bold text-sm ${tx.transaction_type === "receive" || tx.transaction_type === "deposit" ? "text-green-600" : "text-red-500"}`}>
                      {tx.transaction_type === "receive" || tx.transaction_type === "deposit" ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FinancialInsights;
