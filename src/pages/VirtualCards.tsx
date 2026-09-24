import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, CreditCard, Copy, Eye, EyeOff, Lock, Unlock,
  RefreshCw, ShieldCheck, Settings, Sliders, Smartphone, Wifi,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface VCard {
  id: string;
  label: string;
  number: string;
  expiry: string;
  cvv: string;
  color: string;
  frozen: boolean;
  online_enabled: boolean;
  contactless_enabled: boolean;
  daily_limit: number;
  monthly_limit: number;
  pin: string;
  created_at: string;
}

// Deterministic card data from user UUID seed
function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function generateCardFromSeed(seed: string, index: number): Omit<VCard, "frozen" | "online_enabled"> {
  const h1 = hashCode(seed + index);
  const h2 = hashCode(seed + index + "exp");
  const h3 = hashCode(seed + index + "cvv");

  const n1 = 4000 + (h1 % 9000);
  const n2 = 1000 + (h2 % 9000);
  const n3 = 1000 + (hashCode(seed + index + "n3") % 9000);
  const n4 = 1000 + (hashCode(seed + index + "n4") % 9000);
  const number = `${n1} ${n2} ${n3} ${n4}`;

  // Keep generated cards valid when the app is first opened late in the year.
  // The old 2026-only range could produce cards that were already expired.
  const month = 1 + (h2 % 12);
  const year  = (new Date().getFullYear() % 100) + 3 + (h2 % 3);
  const expiry = `${String(month).padStart(2, "0")}/${year}`;

  const cvv = String(100 + (h3 % 900));

  const colors = [
    "from-primary to-primary/70",
    "from-purple-600 to-purple-800",
    "from-slate-700 to-slate-900",
    "from-emerald-600 to-emerald-800",
    "from-rose-600 to-rose-800",
  ];
  const color = colors[index % colors.length];

  return {
    id: `vc-${index}`,
    label: index === 0 ? "Primary Card" : `Virtual Card ${index + 1}`,
    number, expiry, cvv, color,
    created_at: new Date().toISOString(),
    contactless_enabled: true,
    daily_limit: 1000,
    monthly_limit: 10000,
    pin: String(1000 + (hashCode(seed + index + "pin") % 9000)),
  };
}

const STORAGE_KEY = "vbank_vcards_v1";
const DEFAULT_DAILY_LIMIT = 500;
const DEFAULT_MONTHLY_LIMIT = 2000;

const createCard = (userId: string, index: number): VCard => ({
  ...generateCardFromSeed(userId, index),
  frozen: false,
  online_enabled: true,
});

const normalizeCard = (raw: unknown, userId: string, index: number): VCard => {
  const fallback = createCard(userId, index);
  if (!raw || typeof raw !== "object") return fallback;

  const value = raw as Partial<VCard>;
  return {
    ...fallback,
    id: typeof value.id === "string" && value.id ? value.id : fallback.id,
    label: typeof value.label === "string" && value.label ? value.label : fallback.label,
    number: typeof value.number === "string" && /^\d{4}( \d{4}){3}$/.test(value.number)
      ? value.number
      : fallback.number,
    expiry: typeof value.expiry === "string" && /^\d{2}\/\d{2}$/.test(value.expiry)
      ? value.expiry
      : fallback.expiry,
    cvv: typeof value.cvv === "string" && /^\d{3}$/.test(value.cvv) ? value.cvv : fallback.cvv,
    color: typeof value.color === "string" && value.color ? value.color : fallback.color,
    frozen: value.frozen === true,
    online_enabled: value.online_enabled !== false,
    contactless_enabled: value.contactless_enabled !== false,
    daily_limit: Number.isFinite(value.daily_limit) && Number(value.daily_limit) >= 0
      ? Number(value.daily_limit)
      : DEFAULT_DAILY_LIMIT,
    monthly_limit: Number.isFinite(value.monthly_limit) && Number(value.monthly_limit) >= 0
      ? Number(value.monthly_limit)
      : DEFAULT_MONTHLY_LIMIT,
    pin: typeof value.pin === "string" && /^\d{4}$/.test(value.pin) ? value.pin : fallback.pin,
    created_at: typeof value.created_at === "string" && !Number.isNaN(Date.parse(value.created_at))
      ? value.created_at
      : fallback.created_at,
  };
};

const VirtualCards = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cards, setCards] = useState<VCard[]>([]);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState("");

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const normalized = Array.isArray(parsed)
          ? parsed.slice(0, 3).map((card, index) => normalizeCard(card, user.id, index))
          : [];
        if (normalized.length > 0) {
          localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(normalized));
          setCards(normalized);
          return;
        }
      } catch {
        // Recreate the local card record below when storage is corrupt.
      }
      localStorage.removeItem(`${STORAGE_KEY}_${user.id}`);
    }

    {
      // Generate one default card.
      const defaultCard = createCard(user.id, 0);
      const list = [defaultCard];
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(list));
      setCards(list);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void init(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const saveCards = (list: VCard[]) => {
    if (!userId) return;
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(list));
    setCards(list);
  };

  const toggleFrozen = (id: string) => {
    const updated = cards.map((c) => c.id === id ? { ...c, frozen: !c.frozen } : c);
    saveCards(updated);
    const card = updated.find((c) => c.id === id);
    toast({ title: card?.frozen ? "Card frozen" : "Card unfrozen" });
  };

  const toggleOnline = (id: string) => {
    const updated = cards.map((c) => c.id === id ? { ...c, online_enabled: !c.online_enabled } : c);
    saveCards(updated);
  };

  const addCard = () => {
    if (cards.length >= 3) {
      toast({ title: "Maximum 3 virtual cards", variant: "destructive" });
      return;
    }
    const newCard = createCard(userId, cards.length);
    saveCards([...cards, newCard]);
    toast({ title: "New virtual card created" });
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text.replace(/\s/g, ""));
      toast({ title: `${label} copied` });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access. Select the value and copy it manually.",
        variant: "destructive",
      });
    }
  };

  const updateLimit = (id: string, field: "daily_limit" | "monthly_limit", rawValue: string) => {
    const value = Number(rawValue);
    const card = cards.find((candidate) => candidate.id === id);
    if (!card || !Number.isFinite(value) || value < 0) {
      toast({ title: "Enter a valid non-negative limit", variant: "destructive" });
      return;
    }
    if (field === "daily_limit" && value > card.monthly_limit) {
      toast({ title: "Daily limit cannot exceed monthly limit", variant: "destructive" });
      return;
    }
    if (field === "monthly_limit" && value < card.daily_limit) {
      toast({ title: "Monthly limit must cover the daily limit", variant: "destructive" });
      return;
    }
    const updated = cards.map((candidate) =>
      candidate.id === id ? { ...candidate, [field]: value } : candidate
    );
    saveCards(updated);
    toast({ title: `${field === "daily_limit" ? "Daily" : "Monthly"} limit updated` });
  };

  const toggleShow = (id: string) => {
    setShowDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Virtual Cards</h1>
            <p className="text-muted-foreground text-sm">For online purchases</p>
          </div>
          {cards.length < 3 && (
            <Button size="sm" onClick={addCard}>
              <CreditCard size={16} className="mr-1" /> New Card
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {cards.map((card) => {
            const show = showDetails[card.id];
            const masked = card.number.replace(/(\d{4}) (\d{4}) (\d{4}) (\d{4})/, "**** **** **** $4");
            return (
              <div key={card.id} className="space-y-3">
                {/* Card visual */}
                <div className={`relative rounded-2xl bg-gradient-to-br ${card.color} p-5 text-white shadow-lg aspect-[1.586/1]`}>
                  {card.frozen && (
                    <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                      <div className="text-center">
                        <Lock size={32} className="mx-auto mb-1" />
                        <p className="text-sm font-semibold">Card Frozen</p>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-6">
                    <p className="font-semibold text-sm opacity-90">NETLIFE CASH</p>
                    <ShieldCheck size={20} className="opacity-80" />
                  </div>
                  <p className="font-mono text-lg tracking-widest mb-4">
                    {show ? card.number : masked}
                  </p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs opacity-70 uppercase">Card Holder</p>
                      <p className="font-semibold text-sm">{card.label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-70 uppercase">Expires</p>
                      <p className="font-mono text-sm">{show ? card.expiry : "••/••"}</p>
                    </div>
                    {show && (
                      <div className="text-right">
                        <p className="text-xs opacity-70 uppercase">CVV</p>
                        <p className="font-mono text-sm">{card.cvv}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => toggleShow(card.id)}>
                          {show ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />}
                          {show ? "Hide" : "Reveal"}
                        </Button>
                        {show && (
                          <Button variant="outline" size="sm" onClick={() => copy(card.number, "Card number")}>
                            <Copy size={14} className="mr-1" /> Copy
                          </Button>
                        )}
                      </div>
                      <Button
                        variant={card.frozen ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleFrozen(card.id)}
                      >
                        {card.frozen ? <Unlock size={14} className="mr-1" /> : <Lock size={14} className="mr-1" />}
                        {card.frozen ? "Unfreeze" : "Freeze"}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between py-2 border-t">
                      <div>
                        <p className="text-sm font-medium">Online Payments</p>
                        <p className="text-xs text-muted-foreground">Allow e-commerce purchases</p>
                      </div>
                      <Switch
                        checked={card.online_enabled}
                        onCheckedChange={() => toggleOnline(card.id)}
                        disabled={card.frozen}
                      />
                    </div>

                    {show && (
                      <div className="grid grid-cols-2 gap-2 border-t pt-2">
                        <button onClick={() => copy(card.expiry, "Expiry")}
                          className="text-left hover:bg-muted rounded-lg p-2 transition-colors">
                          <p className="text-xs text-muted-foreground">Expiry</p>
                          <p className="font-mono text-sm">{card.expiry}</p>
                        </button>
                        <button onClick={() => copy(card.cvv, "CVV")}
                          className="text-left hover:bg-muted rounded-lg p-2 transition-colors">
                          <p className="text-xs text-muted-foreground">CVV</p>
                          <p className="font-mono text-sm">{card.cvv}</p>
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between py-2 border-t">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1"><Wifi size={14} /> Contactless</p>
                        <p className="text-xs text-muted-foreground">NFC / tap payments</p>
                      </div>
                      <Switch
                        checked={card.contactless_enabled ?? true}
                        onCheckedChange={() => {
                          const updated = cards.map(c =>
                            c.id === card.id ? { ...c, contactless_enabled: !(c.contactless_enabled ?? true) } : c
                          );
                          saveCards(updated);
                        }}
                        disabled={card.frozen}
                      />
                    </div>

                    {/* Card Controls Dialog */}
                    <div className="border-t pt-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full gap-2">
                            <Sliders size={14} /> Card Controls &amp; Limits
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings size={16} /> Card Controls</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Daily Spending Limit ($)</Label>
                              <Input
                                type="number"
                                 min="0"
                                 step="0.01"
                                defaultValue={card.daily_limit ?? 500}
                                 onBlur={e => updateLimit(card.id, "daily_limit", e.target.value)}
                              />
                            </div>
                            <div>
                              <Label>Monthly Spending Limit ($)</Label>
                              <Input
                                type="number"
                                 min="0"
                                 step="0.01"
                                defaultValue={card.monthly_limit ?? 2000}
                                 onBlur={e => updateLimit(card.id, "monthly_limit", e.target.value)}
                              />
                            </div>
                            <div className="border-t pt-3">
                              <Label className="flex items-center gap-2 mb-2"><Smartphone size={14} /> Change PIN</Label>
                              <Input
                                type="password"
                                maxLength={4}
                                placeholder="New 4-digit PIN"
                                onBlur={e => {
                                  if (e.target.value.length === 4 && /^\d{4}$/.test(e.target.value)) {
                                    const updated = cards.map(c => c.id === card.id ? { ...c, pin: e.target.value } : c);
                                    saveCards(updated);
                                    toast({ title: "PIN updated" });
                                    e.target.value = "";
                                  }
                                }}
                              />
                              <p className="text-xs text-muted-foreground mt-1">Enter a 4-digit numeric PIN</p>
                            </div>
                            <div className="bg-muted rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
                              <p><strong>Daily limit:</strong> ${(card.daily_limit ?? 500).toFixed(2)}</p>
                              <p><strong>Monthly limit:</strong> ${(card.monthly_limit ?? 2000).toFixed(2)}</p>
                              <p><strong>Status:</strong> {card.frozen ? "Frozen" : "Active"}</p>
                              <p><strong>Contactless:</strong> {(card.contactless_enabled ?? true) ? "Enabled" : "Disabled"}</p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Badge variant={card.frozen ? "destructive" : card.online_enabled ? "secondary" : "outline"} className="text-xs">
                        {card.frozen ? "Frozen" : card.online_enabled ? "Active" : "Online Disabled"}
                      </Badge>
                      <p className="text-xs text-muted-foreground">Virtual — not a physical card</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 px-4">
          Virtual cards are linked to your NETLIFE CASH wallet. Funds are drawn from your main balance.
        </p>
      </div>
    </div>
  );
};

export default VirtualCards;
