import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ToggleLeft, Loader2, Power, PowerOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface FeatureToggle {
  id: string;
  feature_key: string;
  feature_name: string;
  is_enabled: boolean;
}

const FeatureToggles = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role, loading: authLoading } = useAuth();
  const [features, setFeatures] = useState<FeatureToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
      if (!authLoading && role !== "admin" && role !== "founder") {
      navigate("/");
    }
  }, [role, authLoading, navigate]);

  useEffect(() => {
    fetchFeatures();
  }, []);

  const fetchFeatures = async () => {
    const { data, error } = await supabase
      .from("feature_toggles")
      .select("*")
      .order("feature_name");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load feature toggles",
        variant: "destructive",
      });
    } else {
      const existing = data || [];
      if (!existing.some((feature) => feature.feature_key === "internal_funds")) {
        const { data: inserted } = await supabase
          .from("feature_toggles")
          .insert({
            feature_key: "internal_funds",
            feature_name: "Internal Funds (master switch)",
            is_enabled: false,
          })
          .select()
          .single();
        if (inserted) existing.push(inserted as FeatureToggle);
      }
      setFeatures(existing);
    }
    setLoading(false);
  };

  const internalFeatures = features.filter((feature) =>
    feature.feature_key === "internal_funds" ||
    feature.feature_key.startsWith("internal_funds_") ||
    ["fund_requests", "fund_reversals", "bank_transfer", "card_deposits"].includes(feature.feature_key)
  );

  const setInternalFunds = async (enabled: boolean) => {
    if (internalFeatures.length === 0) return;
    setUpdating("internal-funds-bulk");
    const ids = internalFeatures.map((feature) => feature.id);
    const { error } = await supabase
      .from("feature_toggles")
      .update({ is_enabled: enabled })
      .in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to update internal-funds controls", variant: "destructive" });
    } else {
      setFeatures((current) => current.map((feature) =>
        ids.includes(feature.id) ? { ...feature, is_enabled: enabled } : feature
      ));
      toast({ title: enabled ? "Internal funds enabled" : "Internal funds disabled" });
    }
    setUpdating(null);
  };

  const toggleFeature = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    
    const { error } = await supabase
      .from("feature_toggles")
      .update({ is_enabled: !currentValue })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update feature",
        variant: "destructive",
      });
    } else {
      setFeatures(features.map(f => 
        f.id === id ? { ...f, is_enabled: !currentValue } : f
      ));
      toast({
        title: "Updated",
        description: `Feature ${!currentValue ? "enabled" : "disabled"}`,
      });
    }
    setUpdating(null);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate("/admin")} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Feature Toggles</h1>
        </div>
      </header>

        <main className="p-6 space-y-6">
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ToggleLeft size={24} />
                  Internal funds
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Disabled by default. Enable individual controls or all internal-funds controls together.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void setInternalFunds(true)}
                  disabled={updating === "internal-funds-bulk"}
                >
                  <Power size={15} className="mr-1" /> Enable all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void setInternalFunds(false)}
                  disabled={updating === "internal-funds-bulk"}
                >
                  <PowerOff size={15} className="mr-1" /> Disable all
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {internalFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">The internal-funds controls are not available until the database migration is applied.</p>
            ) : internalFeatures.map((feature) => (
              <div key={feature.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h3 className="font-medium">{feature.feature_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.is_enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <Switch
                  checked={feature.is_enabled}
                  onCheckedChange={() => void toggleFeature(feature.id, feature.is_enabled)}
                  disabled={updating === feature.id || updating === "internal-funds-bulk"}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ToggleLeft size={24} />
              User Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h3 className="font-medium">{feature.feature_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.is_enabled ? "Visible to users" : "Hidden from users"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {updating === feature.id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <Switch
                    checked={feature.is_enabled}
                    onCheckedChange={() => toggleFeature(feature.id, feature.is_enabled)}
                    disabled={updating === feature.id}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default FeatureToggles;
