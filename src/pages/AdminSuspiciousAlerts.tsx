import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle } from "lucide-react";

interface Alert {
  id: string;
  user_id: string | null;
  alert_type: string;
  severity: string;
  description: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const AdminSuspiciousAlerts = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("suspicious_activity_alerts" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setAlerts((data as Alert[]) || []);
  };

  const resolve = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("suspicious_activity_alerts" as never)
      .update({ status: "resolved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as never)
      .eq("id", id);
    await supabase.rpc("log_audit_event" as never, {
      _action: "resolve_alert", _entity_type: "alert", _entity_id: id,
    } as never);
    toast.success("Alert resolved");
    void load();
  };

  const sevColor = (s: string) =>
    s === "critical" ? "destructive" : s === "high" ? "destructive" : s === "medium" ? "default" : "secondary";

  const shown = alerts.filter((a) => filter === "all" || a.status === filter);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Suspicious Activity</h1>
      </header>

      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          {(["open", "resolved", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>
        {shown.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                <Badge variant={sevColor(a.severity)}>{a.severity}</Badge>
                <Badge variant="outline">{a.alert_type}</Badge>
                <Badge variant={a.status === "open" ? "destructive" : "secondary"}>{a.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>{a.description}</p>
              <p className="text-xs text-muted-foreground">
                User: {a.user_id?.slice(0, 8)} — {new Date(a.created_at).toLocaleString()}
              </p>
              {Object.keys(a.metadata || {}).length > 0 && (
                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{JSON.stringify(a.metadata, null, 2)}</pre>
              )}
              {a.status === "open" && (
                <Button size="sm" onClick={() => resolve(a.id)}>Mark Resolved</Button>
              )}
            </CardContent>
          </Card>
        ))}
        {shown.length === 0 && <p className="text-center text-muted-foreground">No alerts.</p>}
      </div>
    </div>
  );
};

export default AdminSuspiciousAlerts;