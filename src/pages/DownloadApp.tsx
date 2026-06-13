import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Download, Smartphone, Globe, Apple, CheckCircle2,
  Loader2, Share, MoreHorizontal, Plus, Star, Zap, Shield, Wifi,
  RefreshCw, ChevronDown, ChevronUp, Clock,
} from "lucide-react";

interface AppRelease {
  id: string;
  version: string;
  platform: "android" | "ios" | "web";
  file_url: string | null;
  file_size: number | null;
  release_notes: string | null;
  is_latest: boolean;
  created_at: string;
}

const fmt = (b: number | null) => {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export default function DownloadApp() {
  const navigate = useNavigate();
  const pwa = usePWAInstall();

  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const latest = releases.find((r) => r.is_latest && r.platform === "android");
  const latestIOS = releases.find((r) => r.is_latest && r.platform === "ios");
  const history = releases.filter((r) => !r.is_latest).slice(0, 8);

  useEffect(() => {
    fetchReleases();

    // Live subscription — update when admin publishes a new release
    const channel = supabase
      .channel("download-page-releases")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_releases" }, fetchReleases)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchReleases = async () => {
    const { data } = await supabase
      .from("app_releases")
      .select("id, version, platform, file_url, file_size, release_notes, is_latest, created_at")
      .order("created_at", { ascending: false });
    setReleases((data as AppRelease[]) || []);
    setLoading(false);
  };

  const handlePWAInstall = async () => {
    setInstalling(true);
    await pwa.install();
    setInstalling(false);
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-base">Download App</h1>
        <div className="ml-auto">
          <Button variant="ghost" size="icon" onClick={fetchReleases}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {/* App Hero */}
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg flex-shrink-0">
            <img src="/icon.svg" alt="NETLIFE CASH" className="w-14 h-14" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">NETLIFE CASH</h2>
            <p className="text-sm text-muted-foreground">Digital Wallet &amp; Payments</p>
            <div className="flex items-center gap-1 mt-1">
              {[1,2,3,4,5].map(i => (
                <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              ))}
              <span className="text-xs text-muted-foreground ml-1">Finance</span>
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Zap className="w-4 h-4" />, label: "Instant transfers" },
            { icon: <Shield className="w-4 h-4" />, label: "Bank-grade security" },
            { icon: <Wifi className="w-4 h-4" />, label: "Works offline" },
          ].map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/50 text-center">
              <div className="text-primary">{f.icon}</div>
              <span className="text-[11px] font-medium">{f.label}</span>
            </div>
          ))}
        </div>

        {/* ── Install as PWA ── */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Install as App</CardTitle>
              <Badge variant="secondary" className="ml-auto text-[10px]">PWA</Badge>
            </div>
            <CardDescription>
              Install directly to your home screen — no app store needed. Works on Android, iOS, and desktop.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pwa.isInstalled ? (
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                App already installed on this device
              </div>
            ) : pwa.canInstall ? (
              <Button className="w-full" onClick={handlePWAInstall} disabled={installing}>
                {installing
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Installing…</>
                  : <><Plus className="w-4 h-4 mr-2" /> Install App — Free</>}
              </Button>
            ) : pwa.isIOS ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium">Add to Home Screen on iOS:</p>
                <ol className="space-y-1.5 text-muted-foreground list-none">
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                    Tap <Share className="w-3.5 h-3.5 inline mx-1" /> Share in Safari's toolbar
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                    Scroll down and tap <span className="font-medium">"Add to Home Screen"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                    Tap <span className="font-medium">Add</span> to confirm
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  To install, open this page in Chrome or Edge and look for the install icon
                  (<MoreHorizontal className="w-3.5 h-3.5 inline" />) in the address bar.
                </p>
                <Button variant="outline" className="w-full" onClick={() => {
                  navigator.clipboard?.writeText(window.location.origin).catch(() => {});
                }}>
                  Copy App URL
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Android APK ── */}
        <Card className={latest ? "border-green-500/30" : "border-dashed opacity-70"}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-600" />
              <CardTitle className="text-base">Android APK</CardTitle>
              {latest
                ? <Badge className="ml-auto bg-green-500/15 text-green-700 border-green-500/30">v{latest.version} — Latest</Badge>
                : <Badge variant="outline" className="ml-auto text-[10px]">No release yet</Badge>
              }
            </div>
            <CardDescription>
              {latest
                ? "Direct install — tap Download to get the .apk file."
                : "The admin hasn't published an Android release yet. Check back soon."}
            </CardDescription>
          </CardHeader>
          {latest && (
            <CardContent className="space-y-3">
              <a
                href={latest.file_url || "#"}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-4 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 transition ${!latest.file_url ? "pointer-events-none opacity-50" : ""}`}
              >
                <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">NETLIFE CASH v{latest.version}</p>
                  <p className="text-xs text-muted-foreground">
                    Android {latest.file_size ? `· ${fmt(latest.file_size)}` : ""}
                    {" · "}{fmtDate(latest.created_at)}
                  </p>
                </div>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 flex-shrink-0">
                  <Download className="w-4 h-4 mr-1" /> Download
                </Button>
              </a>

              {/* Install steps */}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground font-medium">
                  How to install the APK
                </summary>
                <ol className="mt-2 space-y-1 list-decimal list-inside pl-1">
                  <li>Tap Download above to save the .apk file</li>
                  <li>Open your Downloads folder and tap the file</li>
                  <li>If prompted, allow "Install unknown apps" for your browser</li>
                  <li>Tap Install and wait a few seconds</li>
                  <li>Open NETLIFE CASH from your home screen</li>
                </ol>
              </details>

              {latest.release_notes && (
                <div className="text-xs bg-muted/60 rounded-lg p-3">
                  <p className="font-medium mb-1">What's new in v{latest.version}:</p>
                  <pre className="whitespace-pre-line text-muted-foreground">{latest.release_notes}</pre>
                </div>
              )}
            </CardContent>
          )}
          {loading && (
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading releases…
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── iOS ── */}
        <Card className="border-dashed opacity-75">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Apple className="w-5 h-5" />
              <CardTitle className="text-base">iOS</CardTitle>
              <Badge variant="outline" className="ml-auto text-[10px]">PWA recommended</Badge>
            </div>
            <CardDescription>
              {latestIOS
                ? "An iOS build is available via the link below."
                : "Use Safari to install NETLIFE CASH as a PWA — see the instructions above."}
            </CardDescription>
          </CardHeader>
          {latestIOS && (
            <CardContent>
              <a
                href={latestIOS.file_url || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/50 transition"
              >
                <Apple className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">iOS Build v{latestIOS.version}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(latestIOS.created_at)}</p>
                </div>
                <Download className="w-4 h-4 text-muted-foreground" />
              </a>
            </CardContent>
          )}
        </Card>

        {/* ── Release History ── */}
        {history.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 w-full text-sm font-medium py-2 text-muted-foreground hover:text-foreground transition"
              onClick={() => setShowHistory((p) => !p)}
            >
              <Clock className="w-4 h-4" />
              Past releases ({history.length})
              {showHistory ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
            </button>
            {showHistory && (
              <div className="space-y-2 mt-2">
                {history.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border bg-muted/30 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      {r.platform === "ios" ? <Apple className="w-4 h-4" /> : r.platform === "web" ? <Globe className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">v{r.version} — {r.platform}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
                    </div>
                    {r.file_url && (
                      <a href={r.file_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* PWA info footer */}
        <div className="text-center space-y-1 pb-4">
          <p className="text-xs text-muted-foreground">
            NETLIFE CASH is a Progressive Web App — install it once, use it anywhere.
          </p>
          <p className="text-xs text-muted-foreground">
            All data is secured with bank-grade encryption via Supabase.
          </p>
        </div>
      </div>
    </div>
  );
}
