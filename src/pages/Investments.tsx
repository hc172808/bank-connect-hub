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
  ArrowLeft, TrendingUp, TrendingDown, BarChart3, DollarSign,
  PieChart, Coins, Globe, Shield, Landmark, Plus, RefreshCw,
  AlertTriangle, Star,
} from "lucide-react";
import { format } from "date-fns";

interface Asset {
  symbol: string;
  name: string;
  type: "stock" | "etf" | "bond" | "mutual_fund" | "crypto" | "metal";
  price: number;
  change_pct: number;
  icon: string;
  risk: "low" | "medium" | "high";
  yield?: string;
}

const ASSETS: Asset[] = [
  // Stocks
  { symbol: "AAPL",  name: "Apple Inc.",           type: "stock",       price: 194.35, change_pct:  1.2,  icon: "🍎", risk: "medium" },
  { symbol: "MSFT",  name: "Microsoft Corp.",       type: "stock",       price: 374.51, change_pct:  0.8,  icon: "🪟", risk: "medium" },
  { symbol: "GOOGL", name: "Alphabet Inc.",         type: "stock",       price: 175.20, change_pct: -0.5,  icon: "🔍", risk: "medium" },
  { symbol: "AMZN",  name: "Amazon.com Inc.",       type: "stock",       price: 183.90, change_pct:  2.1,  icon: "📦", risk: "medium" },
  { symbol: "NVDA",  name: "NVIDIA Corp.",          type: "stock",       price: 875.42, change_pct:  3.8,  icon: "🖥️", risk: "high"   },
  // ETFs
  { symbol: "SPY",   name: "S&P 500 ETF",           type: "etf",         price: 523.41, change_pct:  0.6,  icon: "📊", risk: "medium" },
  { symbol: "QQQ",   name: "Nasdaq-100 ETF",        type: "etf",         price: 446.78, change_pct:  0.9,  icon: "📈", risk: "medium" },
  { symbol: "VTI",   name: "Total Stock Market ETF",type: "etf",         price: 234.12, change_pct:  0.5,  icon: "🌐", risk: "medium" },
  // Bonds
  { symbol: "TLT",   name: "20-Year Treasury ETF",  type: "bond",        price: 91.32,  change_pct: -0.2,  icon: "🏛️", risk: "low",  yield: "4.2% p.a." },
  { symbol: "BND",   name: "Total Bond Market ETF", type: "bond",        price: 71.84,  change_pct:  0.1,  icon: "📜", risk: "low",  yield: "3.8% p.a." },
  // Mutual Funds
  { symbol: "VFIAX", name: "Vanguard 500 Index",    type: "mutual_fund", price: 468.22, change_pct:  0.7,  icon: "🏦", risk: "medium" },
  { symbol: "FXAIX", name: "Fidelity 500 Index",    type: "mutual_fund", price: 184.55, change_pct:  0.6,  icon: "🏦", risk: "medium" },
  // Precious Metals
  { symbol: "GOLD",  name: "Gold (XAU/USD)",        type: "metal",       price: 2340.00, change_pct: 0.4, icon: "🥇", risk: "low",  yield: "Store of value" },
  { symbol: "SILV",  name: "Silver (XAG/USD)",      type: "metal",       price: 29.45,  change_pct:  0.8,  icon: "🥈", risk: "medium" },
];

interface Holding {
  symbol: string;
  units: number;
  avg_price: number;
  bought_at: string;
}

const STORAGE_KEY = "vbank_investments_v1";
const ASSET_TYPES = ["All", "stock", "etf", "bond", "mutual_fund", "metal"] as const;

const RISK_COLORS = { low: "text-green-600 bg-green-100", medium: "text-yellow-600 bg-yellow-100", high: "text-red-600 bg-red-100" };

const Investments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [activeTab, setActiveTab] = useState<"market" | "portfolio">("market");
  const [filter, setFilter] = useState<string>("All");
  const [buyOpen, setBuyOpen] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [buyUnits, setBuyUnits] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) setHoldings(JSON.parse(raw));
  };

  const save = (h: Holding[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(h));
    setHoldings(h);
  };

  const buy = async () => {
    if (!selected || !buyUnits) { toast({ variant: "destructive", title: "Enter units to buy" }); return; }
    const units = parseFloat(buyUnits);
    const total = units * selected.price;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("transactions").insert({
        sender_id: user.id, receiver_id: user.id, amount: total,
        transaction_type: "investment_purchase",
        status: "completed",
        description: `Buy ${units} ${selected.symbol} @ $${selected.price.toFixed(2)}`,
      } as never);
      const existing = holdings.find(h => h.symbol === selected.symbol);
      let updated: Holding[];
      if (existing) {
        const totalUnits = existing.units + units;
        const avgPrice = ((existing.avg_price * existing.units) + (selected.price * units)) / totalUnits;
        updated = holdings.map(h => h.symbol === selected.symbol ? { ...h, units: totalUnits, avg_price: avgPrice } : h);
      } else {
        updated = [...holdings, { symbol: selected.symbol, units, avg_price: selected.price, bought_at: new Date().toISOString() }];
      }
      save(updated);
      setBuyOpen(false);
      setBuyUnits("");
      toast({ title: "Purchase Successful!", description: `Bought ${units} ${selected.symbol} for $${total.toFixed(2)}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Purchase failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredAssets = filter === "All" ? ASSETS : ASSETS.filter(a => a.type === filter);
  const portfolioValue = holdings.reduce((s, h) => {
    const asset = ASSETS.find(a => a.symbol === h.symbol);
    return s + (asset?.price || 0) * h.units;
  }, 0);
  const portfolioCost = holdings.reduce((s, h) => s + h.avg_price * h.units, 0);
  const pnl = portfolioValue - portfolioCost;
  const pnlPct = portfolioCost > 0 ? (pnl / portfolioCost) * 100 : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-to-br from-green-700 to-teal-600 text-white p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Investments</h1>
            <p className="text-xs text-white/70">Stocks · ETFs · Bonds · Metals</p>
          </div>
          <Button variant="ghost" size="icon" className="text-white" onClick={() => setLastUpdated(new Date())}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {portfolioValue > 0 && (
          <div className="bg-white/20 rounded-2xl p-4">
            <p className="text-xs text-white/70">Portfolio Value</p>
            <p className="text-3xl font-bold">${portfolioValue.toFixed(2)}</p>
            <div className={`flex items-center gap-1 text-sm mt-1 ${pnl >= 0 ? "text-green-300" : "text-red-300"}`}>
              {pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>
            </div>
          </div>
        )}
      </header>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          {(["market", "portfolio"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab === "market" ? "Market" : `Portfolio (${holdings.length})`}
            </button>
          ))}
        </div>

        {activeTab === "market" && (
          <>
            {/* Disclaimer */}
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-700">Prices are indicative. Past performance does not guarantee future results. Investment involves risk.</p>
              </CardContent>
            </Card>

            {/* Filter */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {ASSET_TYPES.map(t => (
                <button key={t}
                  onClick={() => setFilter(t)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all capitalize ${filter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {t === "All" ? "All" : t === "mutual_fund" ? "Mutual" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredAssets.map(asset => (
                <Card key={asset.symbol}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl w-10 text-center">{asset.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-sm">{asset.symbol}</span>
                          <Badge variant="outline" className="text-[10px] capitalize px-1">{asset.type === "mutual_fund" ? "Mutual" : asset.type}</Badge>
                          <span className={`text-[10px] px-1 rounded ${RISK_COLORS[asset.risk]}`}>{asset.risk}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{asset.name}</p>
                        {asset.yield && <p className="text-xs text-green-600">{asset.yield}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">${asset.price.toLocaleString()}</p>
                        <p className={`text-xs ${asset.change_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {asset.change_pct >= 0 ? "+" : ""}{asset.change_pct}%
                        </p>
                      </div>
                      <Button size="sm" onClick={() => { setSelected(asset); setBuyOpen(true); }}>Buy</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {activeTab === "portfolio" && (
          <div className="space-y-3">
            {holdings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Your portfolio is empty</p>
                <p className="text-sm">Start investing by buying from the Market tab</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Current Value</p>
                      <p className="text-xl font-bold text-green-700">${portfolioValue.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card className={`${pnl >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">P&amp;L</p>
                      <p className={`text-xl font-bold ${pnl >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {holdings.map(h => {
                  const asset = ASSETS.find(a => a.symbol === h.symbol);
                  if (!asset) return null;
                  const currentValue = asset.price * h.units;
                  const costBasis = h.avg_price * h.units;
                  const gain = currentValue - costBasis;
                  return (
                    <Card key={h.symbol}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{asset.icon}</div>
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <span className="font-bold">{asset.symbol}</span>
                              <span className="font-bold">${currentValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{h.units} units @ avg ${h.avg_price.toFixed(2)}</span>
                              <span className={gain >= 0 ? "text-green-600" : "text-red-600"}>
                                {gain >= 0 ? "+" : ""}${gain.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.icon} Buy {selected?.symbol}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Name</span><strong>{selected.name}</strong></div>
                <div className="flex justify-between"><span>Price</span><strong>${selected.price.toLocaleString()}</strong></div>
                <div className="flex justify-between"><span>Change</span>
                  <strong className={selected.change_pct >= 0 ? "text-green-600" : "text-red-600"}>
                    {selected.change_pct >= 0 ? "+" : ""}{selected.change_pct}%
                  </strong>
                </div>
              </div>
              <div>
                <Label>Units to Buy</Label>
                <Input type="number" placeholder="e.g. 1.5" value={buyUnits}
                  onChange={e => setBuyUnits(e.target.value)} />
                {buyUnits && !isNaN(parseFloat(buyUnits)) && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Total: <strong>${(parseFloat(buyUnits) * selected.price).toFixed(2)}</strong>
                  </p>
                )}
              </div>
              <Button className="w-full" onClick={buy} disabled={loading || !buyUnits}>
                {loading ? "Processing..." : `Buy ${selected.symbol}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Investments;
