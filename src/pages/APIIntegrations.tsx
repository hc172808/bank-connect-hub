import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, Key, Globe, Webhook, Copy, RefreshCw, Plus,
  CheckCircle2, XCircle, BarChart3, Zap, Code, Trash2,
  Eye, EyeOff, Settings, Link2, AlertTriangle,
} from "lucide-react";

interface APIKey {
  id: string;
  name: string;
  key: string;
  created: string;
  lastUsed: string;
  permissions: string[];
  active: boolean;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDelivery: string;
  successRate: number;
}

interface AppConnection {
  id: string;
  name: string;
  icon: string;
  category: string;
  connected: boolean;
  description: string;
}

const STORAGE_KEY = "vbank_api_integrations_v1";

function load<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? def; } catch { return def; }
}
function save(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return "nlc_live_" + Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const DEFAULT_KEYS: APIKey[] = [
  {
    id: "k1", name: "Production Key", key: "nlc_live_" + "x".repeat(40),
    created: "2026-01-15", lastUsed: "2026-06-13", permissions: ["read", "write", "payments"], active: true,
  },
];

const DEFAULT_WEBHOOKS: WebhookEndpoint[] = [
  {
    id: "wh1", url: "https://myapp.com/webhooks/netlife",
    events: ["payment.completed", "transfer.sent", "kyc.approved"],
    active: true, lastDelivery: "2026-06-13T10:22:00Z", successRate: 98.5,
  },
];

const APPS: AppConnection[] = [
  { id: "xero", name: "Xero", icon: "🔵", category: "Accounting", connected: false, description: "Sync invoices and transactions with Xero" },
  { id: "quickbooks", name: "QuickBooks", icon: "🟢", category: "Accounting", connected: false, description: "Export financial data to QuickBooks Online" },
  { id: "stripe", name: "Stripe", icon: "🔷", category: "Payments", connected: false, description: "Accept card payments via Stripe" },
  { id: "paypal", name: "PayPal", icon: "🔵", category: "Payments", connected: false, description: "Send and receive PayPal transfers" },
  { id: "salesforce", name: "Salesforce", icon: "☁️", category: "CRM", connected: false, description: "Sync customer payment data to Salesforce" },
  { id: "slack", name: "Slack", icon: "💬", category: "Notifications", connected: false, description: "Receive payment alerts in Slack" },
  { id: "zapier", name: "Zapier", icon: "⚡", category: "Automation", connected: false, description: "Automate workflows with 5,000+ apps" },
  { id: "sheets", name: "Google Sheets", icon: "📊", category: "Reports", connected: false, description: "Export transactions to Google Sheets" },
];

const WEBHOOK_EVENTS = [
  "payment.completed", "payment.failed", "transfer.sent", "transfer.received",
  "kyc.approved", "kyc.rejected", "account.suspended", "card.issued",
];

export default function APIIntegrations() {
  const navigate = useNavigate();
  const stored = load<{ keys: APIKey[]; webhooks: WebhookEndpoint[]; apps: AppConnection[] }>(
    STORAGE_KEY, { keys: DEFAULT_KEYS, webhooks: DEFAULT_WEBHOOKS, apps: APPS }
  );

  const [keys, setKeys] = useState<APIKey[]>(stored.keys ?? DEFAULT_KEYS);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>(stored.webhooks ?? DEFAULT_WEBHOOKS);
  const [apps, setApps] = useState<AppConnection[]>(stored.apps ?? APPS);
  const [tab, setTab] = useState<"keys" | "webhooks" | "apps">("keys");
  const [showKey, setShowKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [addingWebhook, setAddingWebhook] = useState(false);

  const persist = (k: APIKey[], w: WebhookEndpoint[], a: AppConnection[]) => {
    save(STORAGE_KEY, { keys: k, webhooks: w, apps: a });
  };

  const createKey = () => {
    if (!newKeyName.trim()) { toast.error("Enter a name for the key"); return; }
    const newKey: APIKey = {
      id: Date.now().toString(), name: newKeyName, key: generateKey(),
      created: new Date().toISOString().split("T")[0],
      lastUsed: "never", permissions: ["read", "payments"], active: true,
    };
    const updated = [newKey, ...keys];
    setKeys(updated); persist(updated, webhooks, apps);
    setNewKeyName("");
    toast.success("API key created");
  };

  const revokeKey = (id: string) => {
    const updated = keys.map(k => k.id === id ? { ...k, active: false } : k);
    setKeys(updated); persist(updated, webhooks, apps);
    toast.success("Key revoked");
  };

  const deleteKey = (id: string) => {
    const updated = keys.filter(k => k.id !== id);
    setKeys(updated); persist(updated, webhooks, apps);
    toast.success("Key deleted");
  };

  const addWebhook = () => {
    if (!newWebhookUrl.startsWith("https://")) { toast.error("URL must start with https://"); return; }
    if (selectedEvents.length === 0) { toast.error("Select at least one event"); return; }
    const wh: WebhookEndpoint = {
      id: Date.now().toString(), url: newWebhookUrl, events: selectedEvents,
      active: true, lastDelivery: "never", successRate: 100,
    };
    const updated = [...webhooks, wh];
    setWebhooks(updated); persist(keys, updated, apps);
    setNewWebhookUrl(""); setSelectedEvents([]); setAddingWebhook(false);
    toast.success("Webhook added");
  };

  const toggleWebhook = (id: string) => {
    const updated = webhooks.map(w => w.id === id ? { ...w, active: !w.active } : w);
    setWebhooks(updated); persist(keys, updated, apps);
  };

  const deleteWebhook = (id: string) => {
    const updated = webhooks.filter(w => w.id !== id);
    setWebhooks(updated); persist(keys, updated, apps);
    toast.success("Webhook removed");
  };

  const toggleApp = (id: string) => {
    const updated = apps.map(a => a.id === id ? { ...a, connected: !a.connected } : a);
    setApps(updated); persist(keys, webhooks, updated);
    const app = apps.find(a => a.id === id);
    toast.success(app?.connected ? `Disconnected ${app?.name}` : `Connected ${app?.name}`);
  };

  const maskKey = (key: string) => key.slice(0, 12) + "●".repeat(20) + key.slice(-4);

  const tabs = [
    { key: "keys", label: "API Keys", icon: Key },
    { key: "webhooks", label: "Webhooks", icon: Webhook },
    { key: "apps", label: "App Connections", icon: Link2 },
  ] as const;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-black flex items-center gap-2">
              <Code className="h-5 w-5" /> API Integrations
            </h1>
            <p className="text-xs text-white/70">Manage API keys, webhooks & third-party app connections</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "API Keys", value: keys.filter(k => k.active).length, icon: Key },
            { label: "Webhooks", value: webhooks.filter(w => w.active).length, icon: Webhook },
            { label: "Apps Connected", value: apps.filter(a => a.connected).length, icon: Link2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
              <Icon className="h-4 w-4 mx-auto mb-1 text-white/60" />
              <p className="text-xl font-black">{value}</p>
              <p className="text-[10px] text-white/60">{label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 border rounded-xl p-1 bg-muted">
          {tabs.map(({ key, label, icon: Icon }) => (
            <Button key={key} size="sm" variant={tab === key ? "default" : "ghost"}
              className="flex-1 gap-1 text-xs" onClick={() => setTab(key)}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Button>
          ))}
        </div>

        {/* API Keys Tab */}
        {tab === "keys" && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Create New API Key
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Key Name</Label>
                  <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                    placeholder="e.g. Mobile App, Accounting Sync" className="h-9 mt-1" />
                </div>
                <Button onClick={createKey} size="sm" className="gap-2">
                  <Key className="h-4 w-4" /> Generate Key
                </Button>
              </CardContent>
            </Card>

            {keys.map(k => (
              <Card key={k.id} className={k.active ? "" : "opacity-60"}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{k.name}</p>
                        <Badge className={k.active ? "bg-green-100 text-green-700 text-[10px]" : "bg-gray-100 text-gray-500 text-[10px]"}>
                          {k.active ? "Active" : "Revoked"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Created {k.created} · Last used {k.lastUsed}</p>
                    </div>
                    <div className="flex gap-1">
                      {k.active && <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)}
                        className="h-7 text-xs text-orange-600">Revoke</Button>}
                      <Button size="sm" variant="ghost" onClick={() => deleteKey(k.id)}
                        className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-2">
                    <code className="text-xs flex-1 font-mono break-all">
                      {showKey === k.id ? k.key : maskKey(k.key)}
                    </code>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                      onClick={() => setShowKey(showKey === k.id ? null : k.id)}>
                      {showKey === k.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(k.key); toast.success("Copied!"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {k.permissions.map(p => (
                      <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {/* Webhooks Tab */}
        {tab === "webhooks" && (
          <>
            {!addingWebhook && (
              <Button onClick={() => setAddingWebhook(true)} className="w-full gap-2" variant="outline">
                <Plus className="h-4 w-4" /> Add Webhook Endpoint
              </Button>
            )}
            {addingWebhook && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">New Webhook</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Endpoint URL (https://)</Label>
                    <Input value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)}
                      placeholder="https://yourapp.com/webhook" className="h-9 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Events to send</Label>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      {WEBHOOK_EVENTS.map(event => (
                        <label key={event} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={selectedEvents.includes(event)}
                            onChange={e => setSelectedEvents(prev =>
                              e.target.checked ? [...prev, event] : prev.filter(x => x !== event)
                            )} className="rounded" />
                          {event}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={addWebhook} size="sm" className="gap-2">
                      <Plus className="h-4 w-4" /> Add Endpoint
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAddingWebhook(false); setNewWebhookUrl(""); setSelectedEvents([]); }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {webhooks.map(wh => (
              <Card key={wh.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs break-all text-foreground">{wh.url}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`text-[10px] ${wh.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {wh.active ? "Active" : "Paused"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {wh.successRate}% delivery rate
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={wh.active} onCheckedChange={() => toggleWebhook(wh.id)} />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => deleteWebhook(wh.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {wh.events.map(e => (
                      <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {/* Apps Tab */}
        {tab === "apps" && (
          <div className="space-y-2">
            {["Accounting", "Payments", "CRM", "Notifications", "Automation", "Reports"].map(cat => {
              const catApps = apps.filter(a => a.category === cat);
              if (!catApps.length) return null;
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">{cat}</p>
                  {catApps.map(app => (
                    <Card key={app.id} className="mb-2">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{app.icon}</span>
                            <div>
                              <p className="font-semibold text-sm">{app.name}</p>
                              <p className="text-xs text-muted-foreground">{app.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {app.connected && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                            <Button
                              size="sm" variant={app.connected ? "outline" : "default"}
                              onClick={() => toggleApp(app.id)}
                              className="h-7 text-xs"
                            >
                              {app.connected ? "Disconnect" : "Connect"}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700">
              <p className="font-semibold mb-1">Security Notice</p>
              <p>Keep your API keys secret. Never share them publicly or commit them to version control. Revoke any compromised key immediately.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
