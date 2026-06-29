import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Megaphone, Bell, Smartphone, CheckCircle2,
  Loader2, Users, Send, Clock, RefreshCw, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Broadcast {
  id: string;
  title: string;
  body: string;
  sent_at: string;
  sent: number;
  failed: number;
  channel: string;
}

const TEMPLATES = [
  { label: "New version available", title: "Update Available 🚀", body: "A new version of NETLIFE CASH is ready. Tap to update and enjoy the latest features." },
  { label: "Maintenance tonight", title: "Scheduled Maintenance", body: "NETLIFE CASH will be briefly unavailable tonight for improvements. We'll be back soon." },
  { label: "New feature", title: "New Feature Added ✨", body: "We've added exciting new features to NETLIFE CASH. Open the app to explore what's new." },
  { label: "Security notice", title: "Important Security Notice 🔒", body: "For your security, please update to the latest version of NETLIFE CASH immediately." },
];

const BROADCASTS_KEY = "vbank_admin_broadcasts_v1";

function loadHistory(): Broadcast[] {
  try { return JSON.parse(localStorage.getItem(BROADCASTS_KEY) || "[]"); } catch { return []; }
}
function saveHistory(h: Broadcast[]) {
  localStorage.setItem(BROADCASTS_KEY, JSON.stringify(h.slice(0, 20)));
}

export default function AdminSendUpdate() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [title, setTitle] = useState("Update Available 🚀");
  const [body, setBody] = useState("A new version of NETLIFE CASH is ready. Tap to update and enjoy the latest features.");
  const [url, setUrl] = useState("/download-app");
  const [sending, setSending] = useState(false);
  const [pushCount, setPushCount] = useState<number | null>(null);
  const [history, setHistory] = useState<Broadcast[]>(loadHistory);
  const [latestRelease, setLatestRelease] = useState<{ version: string } | null>(null);

  useEffect(() => {
    fetchSubscriberCount();
    fetchLatestRelease();
  }, []);

  const fetchSubscriberCount = async () => {
    try {
      const res = await fetch("/api/push/subscribers");
      if (res.ok) {
        const data = await res.json();
        setPushCount(data.total ?? 0);
      }
    } catch { setPushCount(0); }
  };

  const fetchLatestRelease = async () => {
    const { data } = await supabase
      .from("app_releases")
      .select("version")
      .eq("is_latest", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setLatestRelease(data as { version: string });
  };

  const applyTemplate = (t: typeof TEMPLATES[number]) => {
    setTitle(t.title);
    setBody(t.body);
  };

  const sendBroadcast = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" });
      return;
    }
    setSending(true);
    let pushSent = 0, pushFailed = 0;

    try {
      // 1. Send push notification to all subscribed devices
      const pushRes = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url, icon: "/icon.svg" }),
      });
      if (pushRes.ok) {
        const d = await pushRes.json();
        pushSent = d.sent ?? 0;
        pushFailed = d.failed ?? 0;
      }

      // 2. Upsert an app_settings announcement so every user sees it on next app open
      await supabase.from("app_settings").upsert(
        {
          key: "latest_broadcast",
          value: JSON.stringify({
            title,
            body,
            url,
            sent_at: new Date().toISOString(),
          }),
        },
        { onConflict: "key" }
      );

      // 3. Save to local history
      const entry: Broadcast = {
        id: Date.now().toString(),
        title,
        body,
        sent_at: new Date().toISOString(),
        sent: pushSent,
        failed: pushFailed,
        channel: "push + in-app",
      };
      const updated = [entry, ...history];
      setHistory(updated);
      saveHistory(updated);

      toast({
        title: `Broadcast sent!`,
        description: `Push: ${pushSent} delivered${pushFailed > 0 ? `, ${pushFailed} failed` : ""}. All users notified in-app.`,
      });
    } catch (err: unknown) {
      toast({ title: "Send failed", description: String(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold text-lg leading-tight">Send App Update</h1>
          <p className="text-xs text-muted-foreground">Broadcast notifications to all installed apps</p>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-6 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Push subscribers</p>
                  <p className="text-xl font-bold">
                    {pushCount === null
                      ? <Loader2 className="w-4 h-4 animate-spin inline" />
                      : pushCount}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-6 text-xs text-muted-foreground px-0"
                onClick={fetchSubscriberCount}
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Latest version</p>
                  <p className="text-xl font-bold">
                    {latestRelease ? `v${latestRelease.version}` : "—"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-6 text-xs text-muted-foreground px-0"
                onClick={() => navigate("/admin/apk-builder")}
              >
                Build new APK →
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* How it works */}
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="pt-4 pb-4 flex gap-3">
            <Bell className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 space-y-0.5">
              <p className="font-medium">How broadcasts reach users</p>
              <p className="text-xs text-blue-700">
                <strong>Push notification</strong> — delivered instantly to all Android / iOS / browser apps that have notifications enabled. Users tap to open the app.
              </p>
              <p className="text-xs text-blue-700 mt-1">
                <strong>In-app banner</strong> — shown to every user the next time they open the app, even without push enabled.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" /> Quick templates
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Button
                key={t.label}
                variant="outline"
                size="sm"
                onClick={() => applyTemplate(t)}
              >
                {t.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Compose */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" /> Compose broadcast
            </CardTitle>
            <CardDescription>Sent simultaneously to all push subscribers and shown in-app to all users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Notification title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Update Available 🚀"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Tell users what changed or why they should update…"
                rows={3}
                maxLength={250}
              />
              <p className="text-[11px] text-muted-foreground text-right">{body.length}/250</p>
            </div>
            <div className="space-y-1.5">
              <Label>Tap action URL <span className="text-muted-foreground font-normal">(in-app path)</span></Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/download-app"
              />
            </div>
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={sendBroadcast}
              disabled={sending || !title.trim() || !body.trim()}
            >
              {sending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Send className="h-4 w-4" /> Send to All Users</>}
            </Button>
            {pushCount === 0 && (
              <div className="flex gap-2 items-start text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>No push subscribers yet. Users need to allow notifications in the app for push delivery. In-app banners will still show to everyone.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Broadcast history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.map((h, i) => (
                <div key={h.id}>
                  {i > 0 && <Separator className="mb-3" />}
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{h.title}</p>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        {h.sent} sent
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{h.body}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(h.sent_at).toLocaleString()}
                      {h.failed > 0 && <span className="text-red-500 ml-1">· {h.failed} failed</span>}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {history.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No broadcasts sent yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
