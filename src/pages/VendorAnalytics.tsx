import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, TrendingUp, DollarSign, Receipt, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfDay, subDays } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

interface Sale {
  id: string;
  amount: number;
  fee: number;
  created_at: string;
  description: string | null;
  sender_id: string;
}

const RANGES = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const VendorAnalytics = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      const since = subDays(new Date(), range).toISOString();
      const { data } = await supabase
        .from("transactions")
        .select("id, amount, fee, created_at, description, sender_id")
        .eq("receiver_id", user.id)
        .eq("status", "completed")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (data) setSales(data as Sale[]);
      setLoading(false);
    };
    load();
  }, [user, range]);

  // Daily breakdown
  const daily = useMemo(() => {
    const map = new Map<string, { date: string; total: number; count: number }>();
    for (let i = range - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MMM d");
      map.set(d, { date: d, total: 0, count: 0 });
    }
    sales.forEach((s) => {
      const d = format(new Date(s.created_at), "MMM d");
      const cur = map.get(d) ?? { date: d, total: 0, count: 0 };
      cur.total += Number(s.amount || 0);
      cur.count += 1;
      map.set(d, cur);
    });
    return Array.from(map.values());
  }, [sales, range]);

  // Hourly breakdown (busiest hours)
  const hourly = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({
      hour: `${h}:00`,
      count: 0,
      total: 0,
    }));
    sales.forEach((s) => {
      const h = new Date(s.created_at).getHours();
      arr[h].count += 1;
      arr[h].total += Number(s.amount || 0);
    });
    return arr;
  }, [sales]);

  // Top customers
  const topCustomers = useMemo(() => {
    const map = new Map<string, { sender_id: string; total: number; count: number }>();
    sales.forEach((s) => {
      const cur = map.get(s.sender_id) ?? { sender_id: s.sender_id, total: 0, count: 0 };
      cur.total += Number(s.amount || 0);
      cur.count += 1;
      map.set(s.sender_id, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [sales]);

  const totalRevenue = sales.reduce((a, s) => a + Number(s.amount || 0), 0);
  const totalFees = sales.reduce((a, s) => a + Number(s.fee || 0), 0);
  const avgSale = sales.length > 0 ? totalRevenue / sales.length : 0;
  const todaySales = sales.filter(
    (s) => new Date(s.created_at) >= startOfDay(new Date())
  );
  const todayTotal = todaySales.reduce((a, s) => a + Number(s.amount || 0), 0);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/vendor")} className="mb-4" data-testid="button-back">
          <ArrowLeft size={20} className="mr-2" />
          Back to dashboard
        </Button>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="text-primary" /> Sales Analytics
          </h1>
          <Tabs value={range.toString()} onValueChange={(v) => setRange(Number(v))}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.value} value={r.value.toString()} data-testid={`tab-range-${r.label}`}>
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <DollarSign size={14} /> Revenue
              </div>
              <div className="text-2xl font-bold mt-1" data-testid="kpi-revenue">
                ${totalRevenue.toFixed(2)}
              </div>
              <div className="text-[11px] text-muted-foreground">last {range} days</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Receipt size={14} /> Sales
              </div>
              <div className="text-2xl font-bold mt-1" data-testid="kpi-count">{sales.length}</div>
              <div className="text-[11px] text-muted-foreground">transactions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <TrendingUp size={14} /> Avg sale
              </div>
              <div className="text-2xl font-bold mt-1" data-testid="kpi-avg">
                ${avgSale.toFixed(2)}
              </div>
              <div className="text-[11px] text-muted-foreground">per transaction</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Award size={14} /> Today
              </div>
              <div className="text-2xl font-bold mt-1" data-testid="kpi-today">
                ${todayTotal.toFixed(2)}
              </div>
              <div className="text-[11px] text-muted-foreground">{todaySales.length} sales</div>
            </CardContent>
          </Card>
        </div>

        {/* Daily revenue chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Daily revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Hourly chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Busiest hours</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top customers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top customers</CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No sales yet in this range.</p>
            ) : (
              <ul className="space-y-2">
                {topCustomers.map((c, i) => (
                  <li
                    key={c.sender_id}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/40"
                    data-testid={`top-customer-${i}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="font-mono text-xs truncate">{c.sender_id.slice(0, 12)}…</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${c.total.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground">{c.count} sales</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Total platform fees in this period: ${totalFees.toFixed(2)}
        </p>
      </div>
    </div>
  );
};

export default VendorAnalytics;
