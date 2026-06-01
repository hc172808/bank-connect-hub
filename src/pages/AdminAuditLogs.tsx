import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText } from "lucide-react";

interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const AdminAuditLogs = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("audit_logs" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs((data as AuditLog[]) || []);
    setLoading(false);
  };

  const filtered = logs.filter(
    (l) =>
      !filter ||
      l.action.toLowerCase().includes(filter.toLowerCase()) ||
      l.entity_type?.toLowerCase().includes(filter.toLowerCase()) ||
      l.actor_role?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5" /> Audit Logs</h1>
      </header>

      <div className="p-4 space-y-3">
        <Input placeholder="Filter by action, type, role..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        {loading && <p>Loading...</p>}
        {filtered.map((l) => (
          <Card key={l.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                <Badge>{l.action}</Badge>
                {l.actor_role && <Badge variant="outline">{l.actor_role}</Badge>}
                {l.entity_type && <span className="text-muted-foreground text-xs">{l.entity_type}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <div>By: {l.actor_id?.slice(0, 8) || "system"}</div>
              <div>{new Date(l.created_at).toLocaleString()}</div>
              {Object.keys(l.metadata || {}).length > 0 && (
                <pre className="bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(l.metadata, null, 2)}</pre>
              )}
            </CardContent>
          </Card>
        ))}
        {!loading && filtered.length === 0 && <p className="text-center text-muted-foreground">No logs.</p>}
      </div>
    </div>
  );
};

export default AdminAuditLogs;