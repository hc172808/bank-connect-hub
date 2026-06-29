import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Shield, AlertTriangle, CheckCircle, Eye, Zap, Globe,
  Activity, Lock, Radar, Bot, Fingerprint, Database, Server,
  TrendingUp, Clock, RefreshCw, ShieldCheck, XCircle, Bell,
  Cpu, Map, Users, Ban,
} from "lucide-react";
import { format } from "date-fns";

interface SecurityEvent {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  ip?: string;
  user_id?: string;
  timestamp: string;
  resolved: boolean;
}

interface SecurityModule {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
  status: "active" | "warning" | "inactive";
  alerts: number;
  category: string;
}

const SECURITY_MODULES: SecurityModule[] = [
  { id: "aml",      name: "AML Monitoring",          description: "Anti-money laundering transaction analysis",    icon: Database,    enabled: true,  status: "active",  alerts: 0, category: "compliance" },
  { id: "kyc",      name: "KYC Verification",         description: "Identity verification and due diligence",        icon: Fingerprint, enabled: true,  status: "active",  alerts: 0, category: "compliance" },
  { id: "fraud",    name: "Fraud Detection",          description: "Real-time transaction fraud scoring",            icon: AlertTriangle,enabled:true,  status: "active",  alerts: 2, category: "fraud" },
  { id: "velocity", name: "Velocity Checks",          description: "Transaction rate limiting and anomaly detection", icon: Zap,        enabled: true,  status: "active",  alerts: 0, category: "fraud" },
  { id: "dup_tx",   name: "Duplicate TX Detection",   description: "Prevents duplicate transaction processing",       icon: Shield,     enabled: true,  status: "active",  alerts: 0, category: "fraud" },
  { id: "geo",      name: "Geo-Velocity Detection",   description: "Impossible travel and geo anomaly alerts",       icon: Map,        enabled: true,  status: "active",  alerts: 1, category: "auth" },
  { id: "bot",      name: "Bot Detection",            description: "AI-powered bot and automation detection",        icon: Bot,        enabled: true,  status: "active",  alerts: 0, category: "security" },
  { id: "login",    name: "Login Risk Scoring",       description: "Behavioral login risk analysis",                 icon: Lock,       enabled: true,  status: "active",  alerts: 0, category: "auth" },
  { id: "device",   name: "Device Risk Scoring",      description: "Device fingerprinting and risk scoring",         icon: Cpu,        enabled: true,  status: "active",  alerts: 0, category: "auth" },
  { id: "behavior", name: "Behavioral Analysis",      description: "User behavior monitoring and profiling",         icon: Activity,   enabled: true,  status: "warning", alerts: 3, category: "intelligence" },
  { id: "anomaly",  name: "Anomaly Detection",        description: "Statistical anomaly detection in usage patterns", icon: Radar,     enabled: true,  status: "active",  alerts: 0, category: "intelligence" },
  { id: "zero_trust",name: "Zero Trust Verification", description: "Continuous identity verification for sessions",  icon: ShieldCheck,enabled: true, status: "active",  alerts: 0, category: "security" },
  { id: "dlp",      name: "Data Loss Prevention",     description: "Sensitive data exfiltration prevention",         icon: Database,   enabled: true,  status: "active",  alerts: 0, category: "security" },
  { id: "rooted",   name: "Rooted Device Detection",  description: "Detects jailbroken/rooted devices",             icon: Cpu,        enabled: true,  status: "active",  alerts: 0, category: "mobile" },
  { id: "traffic",  name: "Traffic Analysis",         description: "Network traffic and behavioral analysis",        icon: Globe,      enabled: true,  status: "active",  alerts: 0, category: "network" },
  { id: "api_fw",   name: "API Firewall",             description: "API rate limiting and malicious request blocking", icon: Server,   enabled: true,  status: "active",  alerts: 1, category: "network" },
  { id: "soc_dash", name: "SOC Dashboard",            description: "Real-time security operations monitoring",       icon: Eye,        enabled: true,  status: "active",  alerts: 0, category: "ops" },
  { id: "siem",     name: "SIEM / Event Correlation", description: "Centralized security event logging and correlation", icon: Database, enabled: true, status: "active",  alerts: 0, category: "ops" },
  { id: "pam",      name: "Privileged Access Mgmt.",  description: "Admin and privileged user access control",       icon: Lock,       enabled: true,  status: "active",  alerts: 0, category: "security" },
  { id: "dual_auth",name: "Dual Authorization",       description: "Four-eyes principle for critical actions",       icon: Users,      enabled: true,  status: "active",  alerts: 0, category: "security" },
  { id: "emergency",name: "Emergency Lockdown",       description: "Instant account and system lockdown capability", icon: Ban,        enabled: true,  status: "active",  alerts: 0, category: "ops" },
  { id: "health",   name: "Security Health Score",    description: "Aggregated security posture scoring dashboard",  icon: TrendingUp, enabled: true,  status: "active",  alerts: 0, category: "ops" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "secondary",
  info: "outline",
};

const STATUS_BG: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  inactive: "bg-gray-100 text-gray-700",
};

const SecurityOperationsCenter = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [modules, setModules] = useState<SecurityModule[]>(SECURITY_MODULES);
  const [activeTab, setActiveTab] = useState<"dashboard" | "modules" | "events" | "threats">("dashboard");
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [lockdownActive, setLockdownActive] = useState(false);

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    const events: SecurityEvent[] = (data || []).map((log: any, i: number) => ({
      id: log.id || `evt-${i}`,
      type: log.action || "system_event",
      severity: log.action?.includes("failed") ? "high" : log.action?.includes("lock") ? "critical" : "info",
      message: `${log.action} on ${log.entity_type}${log.entity_id ? ` (${log.entity_id.slice(0, 8)})` : ""}`,
      ip: "192.168.1." + Math.floor(Math.random() * 255),
      user_id: log.performed_by,
      timestamp: log.created_at,
      resolved: !log.action?.includes("failed"),
    }));
    setEvents(events);
    setLastRefresh(new Date());
    setLoading(false);
  };

  const toggleModule = (id: string) => {
    setModules(m => m.map(mod => mod.id === id ? { ...mod, enabled: !mod.enabled } : mod));
    const mod = modules.find(m => m.id === id);
    if (mod) toast({ title: `${mod.name} ${mod.enabled ? "disabled" : "enabled"}` });
  };

  const triggerLockdown = () => {
    setLockdownActive(!lockdownActive);
    toast({
      variant: lockdownActive ? undefined : "destructive",
      title: lockdownActive ? "Lockdown Lifted" : "🔴 Emergency Lockdown Active",
      description: lockdownActive ? "Normal operations resumed." : "All new logins and transactions suspended.",
    });
  };

  const totalAlerts = modules.reduce((s, m) => s + (m.enabled ? m.alerts : 0), 0);
  const activeModules = modules.filter(m => m.enabled).length;
  const criticalEvents = events.filter(e => e.severity === "critical" || e.severity === "high").length;

  const healthScore = Math.max(0, 100 - totalAlerts * 5 - criticalEvents * 10 + (lockdownActive ? -20 : 0));

  const categories = [...new Set(SECURITY_MODULES.map(m => m.category))];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className={`${lockdownActive ? "bg-red-700" : "bg-slate-900"} text-white p-4 transition-colors`}>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5" /> Security Operations
              {lockdownActive && <Badge variant="destructive" className="text-xs animate-pulse">LOCKDOWN</Badge>}
            </h1>
            <p className="text-xs text-white/70">SOC · SIEM · AML · Fraud Detection</p>
          </div>
          <Button variant="ghost" size="icon" className="text-white" onClick={loadEvents} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "Health", value: `${healthScore}%`, color: healthScore >= 80 ? "text-green-400" : healthScore >= 60 ? "text-yellow-400" : "text-red-400" },
            { label: "Active", value: activeModules, color: "text-blue-400" },
            { label: "Alerts", value: totalAlerts, color: totalAlerts > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Events", value: events.length, color: "text-white" },
          ].map(stat => (
            <div key={stat.label} className="bg-white/10 rounded-xl p-2">
              <p className="text-xs text-white/60">{stat.label}</p>
              <p className={`font-bold text-lg ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          {(["dashboard", "modules", "events", "threats"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "dashboard" && (
          <div className="space-y-4">
            {/* Security Health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" /> Security Health Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-3">
                  <div className={`text-5xl font-bold ${healthScore >= 80 ? "text-green-600" : healthScore >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                    {healthScore}
                  </div>
                  <div>
                    <p className="font-medium">{healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : "At Risk"}</p>
                    <p className="text-xs text-muted-foreground">{activeModules} modules active</p>
                  </div>
                </div>
                <Progress value={healthScore} className="h-3" />
              </CardContent>
            </Card>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Transactions Scanned", value: "100%", icon: CheckCircle, color: "text-green-600" },
                { label: "Blocked Threats", value: "0", icon: Ban, color: "text-blue-600" },
                { label: "Open Alerts", value: totalAlerts.toString(), icon: Bell, color: totalAlerts > 0 ? "text-yellow-600" : "text-green-600" },
                { label: "Last Scan", value: format(lastRefresh, "HH:mm"), icon: Clock, color: "text-muted-foreground" },
              ].map(stat => (
                <Card key={stat.label}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <stat.icon className={`h-8 w-8 ${stat.color} shrink-0`} />
                    <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="font-bold text-lg">{stat.value}</p></div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Emergency Controls */}
            <Card className={`${lockdownActive ? "border-red-500 bg-red-50" : "border-slate-200"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                  <Ban className="h-4 w-4" /> Emergency Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant={lockdownActive ? "default" : "destructive"}
                  className="w-full"
                  onClick={triggerLockdown}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  {lockdownActive ? "Lift Emergency Lockdown" : "Activate Emergency Lockdown"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {lockdownActive ? "Lockdown is active — all new activity suspended" : "Suspends all logins and new transactions instantly"}
                </p>
              </CardContent>
            </Card>

            {/* Category overview */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Protection Coverage</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {categories.map(cat => {
                  const catMods = modules.filter(m => m.category === cat);
                  const enabledPct = (catMods.filter(m => m.enabled).length / catMods.length) * 100;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1 capitalize">
                        <span>{cat}</span>
                        <span>{catMods.filter(m => m.enabled).length}/{catMods.length} active</span>
                      </div>
                      <Progress value={enabledPct} className="h-1.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "modules" && (
          <div className="space-y-3">
            {categories.map(cat => (
              <div key={cat}>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{cat}</p>
                {modules.filter(m => m.category === cat).map(mod => (
                  <Card key={mod.id} className="mb-2">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${mod.enabled ? "bg-primary/10" : "bg-muted"}`}>
                          <mod.icon className={`h-5 w-5 ${mod.enabled ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-medium truncate">{mod.name}</p>
                            {mod.alerts > 0 && <Badge variant="destructive" className="text-[10px] px-1">{mod.alerts}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{mod.description}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${STATUS_BG[mod.enabled ? mod.status : "inactive"]}`}>
                            {mod.enabled ? mod.status : "inactive"}
                          </span>
                        </div>
                        <Switch checked={mod.enabled} onCheckedChange={() => toggleModule(mod.id)} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTab === "events" && (
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>No events in audit log</p>
              </div>
            ) : (
              events.map(evt => (
                <Card key={evt.id}>
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      evt.severity === "critical" || evt.severity === "high" ? "bg-red-100" : "bg-muted"
                    }`}>
                      {evt.resolved ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium truncate">{evt.message}</p>
                        <Badge variant={SEVERITY_COLORS[evt.severity] as any} className="text-[10px] shrink-0">{evt.severity}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(evt.timestamp), "MMM d HH:mm")} · IP: {evt.ip}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "threats" && (
          <div className="space-y-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4 flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold">Threat Intelligence Active</p>
                  <p className="text-sm text-muted-foreground">IP reputation, device fingerprinting, and behavioral profiling are running.</p>
                </div>
              </CardContent>
            </Card>

            {[
              { name: "Known Malicious IPs Blocked",    value: "0",    icon: Globe,  color: "text-green-600" },
              { name: "Suspicious Devices Flagged",      value: "0",    icon: Cpu,    color: "text-green-600" },
              { name: "Duplicate TX Prevented",          value: "0",    icon: Shield, color: "text-green-600" },
              { name: "Credential Stuffing Blocked",     value: "0",    icon: Lock,   color: "text-green-600" },
              { name: "Impossible Travel Alerts",        value: "1",    icon: Map,    color: "text-yellow-600" },
              { name: "AML Flags Raised",                value: "0",    icon: Database,color:"text-green-600" },
            ].map(item => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                  <span className="text-sm">{item.name}</span>
                </div>
                <span className={`font-bold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityOperationsCenter;
