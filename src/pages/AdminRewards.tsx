import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Star, Save, Gift, TrendingUp, Crown, Coins,
  Info, Award, RefreshCw,
} from "lucide-react";
import {
  getRewardsConfig, saveRewardsConfig, RewardsConfig,
} from "@/lib/rewards";

const TIERS = [
  { key: "bronze",   label: "Bronze",   minPoints: 0,    cashbackPct: 0.5 },
  { key: "silver",   label: "Silver",   minPoints: 500,  cashbackPct: 1.0 },
  { key: "gold",     label: "Gold",     minPoints: 2000, cashbackPct: 1.5 },
  { key: "platinum", label: "Platinum", minPoints: 5000, cashbackPct: 2.0 },
];

const AdminRewards = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [config, setConfig] = useState<RewardsConfig>(getRewardsConfig());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(getRewardsConfig());
  }, []);

  const handleSave = () => {
    setSaving(true);
    saveRewardsConfig(config);
    setTimeout(() => {
      setSaving(false);
      toast({ title: "Rewards settings saved ✓", description: "Changes apply to new transactions immediately." });
    }, 500);
  };

  const exampleDollar = 10;
  const examplePts = Math.floor(exampleDollar * config.pointsPerDollar);
  const exampleCb = parseFloat((examplePts * config.cashbackPctPerPoint).toFixed(4));

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Star className="h-6 w-6 text-yellow-500" /> Loyalty &amp; Rewards
            </h1>
            <p className="text-sm text-muted-foreground">Configure cashback rates and reward tiers</p>
          </div>
        </div>

        {/* Enable / disable */}
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold">Rewards Programme</p>
              <p className="text-sm text-muted-foreground">Enable or disable the entire loyalty system for all users.</p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={v => setConfig(c => ({ ...c, enabled: v }))}
            />
          </CardContent>
        </Card>

        {/* Rate settings */}
        <Card className={config.enabled ? "" : "opacity-50 pointer-events-none"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Earning Rules
            </CardTitle>
            <CardDescription>
              How many points users earn per dollar spent, and what those points are worth.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            <div className="space-y-1.5">
              <Label htmlFor="ppd">Points per $1 spent</Label>
              <Input
                id="ppd"
                type="number"
                min={0.1}
                max={100}
                step={0.5}
                value={config.pointsPerDollar}
                onChange={e => setConfig(c => ({ ...c, pointsPerDollar: parseFloat(e.target.value) || 1 }))}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">Default: 2 pts per $1</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cpp">Cashback per point ($)</Label>
              <Input
                id="cpp"
                type="number"
                min={0.0001}
                max={1}
                step={0.001}
                value={config.cashbackPctPerPoint}
                onChange={e => setConfig(c => ({ ...c, cashbackPctPerPoint: parseFloat(e.target.value) || 0.005 }))}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Default: $0.005 per point (= 1% cashback at 2 pts/$1). Example: 1000 pts × $0.005 = $5.00 cashback.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="min">Minimum cashback to redeem ($)</Label>
              <Input
                id="min"
                type="number"
                min={0.5}
                max={100}
                step={0.5}
                value={config.minRedemption}
                onChange={e => setConfig(c => ({ ...c, minRedemption: parseFloat(e.target.value) || 1 }))}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">Users can only redeem when their cashback balance reaches this amount.</p>
            </div>

            {/* Live preview */}
            <div className="flex items-start gap-2 p-4 rounded-xl border bg-muted/50">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-medium">Preview: ${exampleDollar} transaction</p>
                <p className="text-muted-foreground">
                  → <span className="font-mono font-bold text-foreground">{examplePts} pts</span> earned
                  → <span className="font-mono font-bold text-green-600">${exampleCb.toFixed(4)}</span> cashback
                </p>
                <p className="text-muted-foreground text-xs">
                  To reach $1.00 cashback: {Math.ceil(1 / exampleCb * exampleDollar)} transactions of ${exampleDollar}
                  &nbsp;(≈ {Math.ceil(config.minRedemption / exampleCb)} transactions)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tier reference */}
        <Card className={config.enabled ? "" : "opacity-50"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4 text-yellow-500" /> Membership Tiers (Reference)
            </CardTitle>
            <CardDescription>These thresholds are built-in to the rewards system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {TIERS.map(tier => (
              <div key={tier.key} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium capitalize">{tier.label}</span>
                </div>
                <div className="text-right text-sm">
                  <span className="text-muted-foreground">{tier.minPoints.toLocaleString()} pts</span>
                  <span className="ml-3 font-medium text-green-600">{tier.cashbackPct}% cashback</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Redemption info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4" /> Redemption Flow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {[
              "User sends money → points awarded instantly to sender's localStorage",
              "Points accumulate until cashback balance ≥ minimum redemption threshold",
              "User taps 'Redeem' → cashback credited directly to their wallet balance",
              "A transaction record is created for audit (type: cashback_redemption)",
              "Tier upgrades are automatic based on total points earned",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin")} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminRewards;
