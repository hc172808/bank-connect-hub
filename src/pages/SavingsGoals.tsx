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
  ArrowLeft, PlusCircle, Trash2, Target, Trophy, Pencil,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const STORAGE_KEY = "vbank_savings_goals_v1";

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string;
  emoji: string;
  color: string;
  created_at: string;
}

const GOAL_EMOJIS = ["🏠", "🚗", "✈️", "💻", "📱", "🎓", "👶", "💍", "🏋️", "🎯", "💰", "🌴"];
const GOAL_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-yellow-500", "bg-red-500",
];

const SavingsGoals = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [open, setOpen] = useState(false);
  const [topUpId, setTopUpId] = useState<string | null>(null);
  const [topUpAmt, setTopUpAmt] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    target: "",
    deadline: "",
    emoji: "🎯",
    color: "bg-green-500",
  });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    setGoals(raw ? JSON.parse(raw) : []);
  };

  const save = (list: SavingsGoal[]) => {
    if (!userId) return;
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(list));
    setGoals(list);
  };

  const addGoal = () => {
    if (!form.name || !form.target || Number(form.target) <= 0) {
      toast({ title: "Fill in goal name and target amount", variant: "destructive" });
      return;
    }
    const goal: SavingsGoal = {
      id: crypto.randomUUID(),
      name: form.name,
      target: Number(form.target),
      saved: 0,
      deadline: form.deadline,
      emoji: form.emoji,
      color: form.color,
      created_at: new Date().toISOString(),
    };
    save([...goals, goal]);
    setOpen(false);
    setForm({ name: "", target: "", deadline: "", emoji: "🎯", color: "bg-green-500" });
    toast({ title: "Goal created!", description: `${form.emoji} ${form.name} — target $${form.target}` });
  };

  const applyTopUp = () => {
    if (!topUpId || !topUpAmt || Number(topUpAmt) <= 0) return;
    const updated = goals.map((g) =>
      g.id === topUpId
        ? { ...g, saved: Math.min(g.target, g.saved + Number(topUpAmt)) }
        : g
    );
    save(updated);
    const goal = updated.find((g) => g.id === topUpId);
    setTopUpId(null);
    setTopUpAmt("");
    if (goal && goal.saved >= goal.target) {
      toast({ title: "🎉 Goal reached!", description: `You've saved $${goal.target} for ${goal.name}!` });
    } else {
      toast({ title: "Savings updated" });
    }
  };

  const removeGoal = (id: string) => {
    save(goals.filter((g) => g.id !== id));
  };

  const totalSaved  = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const completed   = goals.filter((g) => g.saved >= g.target);

  const daysLeft = (deadline: string) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
    return diff;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Savings Goals</h1>
            <p className="text-muted-foreground text-sm">
              {completed.length}/{goals.length} goals reached
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><PlusCircle size={16} className="mr-1" /> New Goal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Savings Goal</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Goal Name</Label>
                  <Input placeholder="e.g. New Laptop" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label>Target Amount ($)</Label>
                  <Input type="number" min="1" placeholder="0.00" value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })} />
                </div>
                <div>
                  <Label>Deadline (optional)</Label>
                  <Input type="date" value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                </div>
                <div>
                  <Label>Pick an emoji</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {GOAL_EMOJIS.map((e) => (
                      <button key={e}
                        onClick={() => setForm({ ...form, emoji: e })}
                        className={`text-xl p-1 rounded ${form.emoji === e ? "ring-2 ring-primary" : ""}`}
                      >{e}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex gap-2 mt-1">
                    {GOAL_COLORS.map((c) => (
                      <button key={c} onClick={() => setForm({ ...form, color: c })}
                        className={`w-7 h-7 rounded-full ${c} ${form.color === c ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                      />
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={addGoal}>Create Goal</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total Saved", value: `$${totalSaved.toFixed(2)}`, color: "text-green-600" },
            { label: "Total Target", value: `$${totalTarget.toFixed(2)}`, color: "text-primary" },
            { label: "Remaining", value: `$${Math.max(0, totalTarget - totalSaved).toFixed(2)}`, color: "text-muted-foreground" },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="p-3 text-center">
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Top-up dialog */}
        <Dialog open={!!topUpId} onOpenChange={(o) => { if (!o) { setTopUpId(null); setTopUpAmt(""); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add to Savings</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Amount to add ($)</Label>
                <Input type="number" min="0.01" step="0.01" placeholder="0.00"
                  value={topUpAmt} onChange={(e) => setTopUpAmt(e.target.value)} />
              </div>
              <Button className="w-full" onClick={applyTopUp}>Add Savings</Button>
            </div>
          </DialogContent>
        </Dialog>

        {goals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="mx-auto mb-3 text-muted-foreground" size={40} />
              <p className="text-muted-foreground mb-4">No savings goals yet.</p>
              <Button onClick={() => setOpen(true)}>
                <PlusCircle size={16} className="mr-2" /> Set your first goal
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {goals.map((g) => {
              const p = Math.min(100, Math.round((g.saved / g.target) * 100));
              const days = daysLeft(g.deadline);
              const done = g.saved >= g.target;
              return (
                <Card key={g.id} className={done ? "border-green-300 bg-green-50 dark:bg-green-950/20" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${g.color} flex items-center justify-center text-xl`}>
                          {g.emoji}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{g.name}</p>
                            {done && <Trophy size={14} className="text-yellow-500" />}
                          </div>
                          {g.deadline && (
                            <p className={`text-xs ${days !== null && days < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                              {days === null ? "" : days < 0 ? "Deadline passed" : `${days}d left`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!done && (
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setTopUpId(g.id)}>
                            <Pencil size={13} />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          onClick={() => removeGoal(g.id)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    <Progress value={p} className="h-2 mb-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="text-green-600 font-medium">${g.saved.toFixed(2)} saved</span>
                      <span>{p}% of ${g.target.toFixed(2)}</span>
                    </div>
                    {!done && (
                      <Button size="sm" variant="outline" className="w-full mt-3 text-xs h-8"
                        onClick={() => setTopUpId(g.id)}>
                        + Add Savings
                      </Button>
                    )}
                    {done && (
                      <Badge className="w-full mt-3 bg-green-600 hover:bg-green-700 justify-center">
                        🎉 Goal Reached!
                      </Badge>
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

export default SavingsGoals;
