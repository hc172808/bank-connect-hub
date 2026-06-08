import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, PlusCircle, Trash2, TrendingUp, AlertTriangle, CheckCircle2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const STORAGE_KEY = "vbank_budgets_v1";

const DEFAULT_CATEGORIES = [
  "Food & Groceries",
  "Transport",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Health",
  "Education",
  "Savings",
  "Other",
];

interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  month: string; // YYYY-MM
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pct(spent: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((spent / limit) * 100));
}

const BudgetPlanner = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: DEFAULT_CATEGORIES[0], limit: "" });
  const [loading, setLoading] = useState(true);

  const month = currentMonth();

  useEffect(() => {
    loadBudgets();
  }, []);

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Load saved budgets from localStorage (keyed by user)
      const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      const all: Budget[] = raw ? JSON.parse(raw) : [];
      const thisMonth = all.filter((b) => b.month === month);

      // Pull actual spending per category from transactions
      const startOfMonth = `${month}-01`;
      const { data: txns } = await supabase
        .from("transactions")
        .select("amount, description, transaction_type, created_at")
        .eq("user_id", user.id)
        .gte("created_at", startOfMonth)
        .in("transaction_type", ["transfer", "bill_payment", "merchant_payment", "blockchain_transfer"])
        .order("created_at", { ascending: false });

      // Naively assign all outgoing spend to "Other" unless category matched by description
      const spendMap: Record<string, number> = {};
      (txns || []).forEach((t) => {
        const desc = (t.description || "").toLowerCase();
        let cat = "Other";
        if (/food|grocer|restaurant|lunch|dinner|breakfast|cafe|pizza|burger/.test(desc)) cat = "Food & Groceries";
        else if (/transport|uber|taxi|fuel|bus|train|ride/.test(desc)) cat = "Transport";
        else if (/util|electric|water|internet|phone|bill/.test(desc)) cat = "Utilities";
        else if (/shop|cloth|amazon|store|mall/.test(desc)) cat = "Shopping";
        else if (/health|pharma|doctor|hospital|clinic|medic/.test(desc)) cat = "Health";
        else if (/school|tuition|educat|course|university/.test(desc)) cat = "Education";
        else if (/entertain|movie|cinema|concert|game|spotify|netflix/.test(desc)) cat = "Entertainment";
        spendMap[cat] = (spendMap[cat] || 0) + Number(t.amount);
      });

      const updated = thisMonth.map((b) => ({ ...b, spent: spendMap[b.category] || 0 }));
      setBudgets(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveBudgets = async (list: Budget[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(list));
  };

  const addBudget = () => {
    if (!form.limit || Number(form.limit) <= 0) {
      toast({ title: "Enter a budget amount", variant: "destructive" });
      return;
    }
    const exists = budgets.find((b) => b.category === form.category);
    if (exists) {
      toast({ title: "Category already added", description: "Edit the existing budget instead.", variant: "destructive" });
      return;
    }
    const newBudget: Budget = {
      id: crypto.randomUUID(),
      category: form.category,
      limit: Number(form.limit),
      spent: 0,
      month,
    };
    const updated = [...budgets, newBudget];
    setBudgets(updated);
    saveBudgets(updated);
    setOpen(false);
    setForm({ category: DEFAULT_CATEGORIES[0], limit: "" });
    toast({ title: "Budget added", description: `${form.category}: $${form.limit}/month` });
  };

  const removeBudget = (id: string) => {
    const updated = budgets.filter((b) => b.id !== id);
    setBudgets(updated);
    saveBudgets(updated);
  };

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent  = budgets.reduce((s, b) => s + b.spent, 0);
  const overBudget  = budgets.filter((b) => b.spent > b.limit);

  const statusColor = (b: Budget) => {
    const p = pct(b.spent, b.limit);
    if (p >= 100) return "text-red-500";
    if (p >= 80) return "text-yellow-500";
    return "text-green-500";
  };

  const progressColor = (b: Budget) => {
    const p = pct(b.spent, b.limit);
    if (p >= 100) return "bg-red-500";
    if (p >= 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Budget Planner</h1>
            <p className="text-muted-foreground text-sm">{month}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><PlusCircle size={16} className="mr-1" /> Add Budget</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Category Budget</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Category</Label>
                  <select
                    className="w-full mt-1 border rounded-md p-2 bg-background text-sm"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Monthly Limit ($)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="0.00"
                    value={form.limit}
                    onChange={(e) => setForm({ ...form, limit: e.target.value })}
                  />
                </div>
                <Button className="w-full" onClick={addBudget}>Add Budget</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total Budget", value: `$${totalBudget.toFixed(2)}`, color: "text-primary" },
            { label: "Spent", value: `$${totalSpent.toFixed(2)}`, color: totalSpent > totalBudget ? "text-red-500" : "text-foreground" },
            { label: "Remaining", value: `$${Math.max(0, totalBudget - totalSpent).toFixed(2)}`, color: "text-green-600" },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="p-3 text-center">
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {overBudget.length > 0 && (
          <Card className="mb-4 border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-3 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={18} />
              <p className="text-sm text-red-700 dark:text-red-400">
                {overBudget.length} {overBudget.length === 1 ? "category" : "categories"} over budget:&nbsp;
                <strong>{overBudget.map((b) => b.category).join(", ")}</strong>
              </p>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : budgets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="mx-auto mb-3 text-muted-foreground" size={40} />
              <p className="text-muted-foreground mb-4">No budgets set yet.</p>
              <Button onClick={() => setOpen(true)}>
                <PlusCircle size={16} className="mr-2" /> Create your first budget
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {budgets.map((b) => {
              const p = pct(b.spent, b.limit);
              return (
                <Card key={b.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {p >= 100 ? (
                          <AlertTriangle size={16} className="text-red-500" />
                        ) : p >= 80 ? (
                          <AlertTriangle size={16} className="text-yellow-500" />
                        ) : (
                          <CheckCircle2 size={16} className="text-green-500" />
                        )}
                        <span className="font-medium text-sm">{b.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={p >= 100 ? "destructive" : "secondary"} className="text-xs">
                          {p}%
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => removeBudget(b.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    <Progress value={p} className={`h-2 mb-2 [&>div]:${progressColor(b)}`} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className={statusColor(b)}>Spent: ${b.spent.toFixed(2)}</span>
                      <span>Limit: ${b.limit.toFixed(2)}</span>
                    </div>
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

export default BudgetPlanner;
