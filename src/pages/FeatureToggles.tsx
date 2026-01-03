import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ToggleLeft, Loader2 } from "lucide-react";
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
    if (!authLoading && role !== "admin") {
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
      setFeatures(data || []);
    }
    setLoading(false);
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
