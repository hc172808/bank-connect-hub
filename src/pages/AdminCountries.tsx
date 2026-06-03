import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Globe } from "lucide-react";

interface Country {
  id: string;
  code: string;
  name: string;
  dial_code: string;
  local_number_length: number;
  is_allowed: boolean;
  is_banned: boolean;
}

const AdminCountries = () => {
  const nav = useNavigate();
  const [items, setItems] = useState<Country[]>([]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("countries" as never)
      .select("*")
      .order("sort_order");
    setItems((data as Country[]) || []);
  };

  const setField = async (id: string, field: "is_allowed" | "is_banned", value: boolean) => {
    const { error } = await supabase
      .from("countries" as never)
      .update({ [field]: value } as never)
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Updated");
      void supabase.rpc("log_audit_event" as never, {
        _action: `country_${field}`,
        _entity_type: "country",
        _entity_id: id,
        _metadata: { value },
      } as never);
      void load();
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Globe className="h-5 w-5" /> Countries
        </h1>
      </header>

      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Toggle <strong>Allowed</strong> to enable sign-up from that country. Toggle{" "}
          <strong>Banned</strong> to block it entirely.
        </p>
        {items.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span>
                  {c.name}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({c.code} {c.dial_code})
                  </span>
                </span>
                {c.is_banned ? (
                  <Badge variant="destructive">Banned</Badge>
                ) : c.is_allowed ? (
                  <Badge>Allowed</Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <Switch
                  checked={c.is_allowed}
                  disabled={c.is_banned}
                  onCheckedChange={(v) => setField(c.id, "is_allowed", v)}
                />
                Allowed
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={c.is_banned}
                  onCheckedChange={(v) => setField(c.id, "is_banned", v)}
                />
                Banned
              </label>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminCountries;