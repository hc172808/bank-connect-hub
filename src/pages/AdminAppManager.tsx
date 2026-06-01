import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, Upload, Download, Trash2, Star, Smartphone, Apple, FileArchive,
  Loader2, ExternalLink, Link2, Share2, RefreshCw, ShieldAlert, Send,
  Globe, QrCode, Copy, CheckCircle2, Save,
} from "lucide-react";
import { APP_VERSION } from "@/lib/appVersion";

interface AppRelease {
  id: string;
  version: string;
  platform: "android" | "ios" | "web";
  file_path: string | null;
  file_url: string | null;
  file_size: number | null;
  release_notes: string | null;
  is_latest: boolean;
  created_at: string;
}

const BUCKET = "app-releases";
const fmt = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};
const platformIcon = (p: string) =>
  p === "ios" ? <Apple className="w-4 h-4" /> : p === "web" ? <FileArchive className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />;

const upsertSetting = (key: string, value: string) =>
  supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

export default function AdminAppManager() {
  const navigate = useNavigate();
  const { role, loading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Releases state ──────────────────────────────────────────────────────────
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loadingRel, setLoadingRel] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState<"android" | "ios" | "web">("android");
  const [notes, setNotes] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // ── OTA / Distribution state ────────────────────────────────────────────────
  const [otaUrl, setOtaUrl] = useState("");
  const [savingOta, setSavingOta] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Force-update state ──────────────────────────────────────────────────────
  const [forceEnabled, setForceEnabled] = useState(false);
  const [minVersion, setMinVersion] = useState("");
  const [savingForce, setSavingForce] = useState(false);

  const appUrl = window.location.origin;
  const latestAndroid = releases.find((r) => r.is_latest && r.platform === "android");

  useEffect(() => {
    if (!authLoading && role !== "admin") navigate("/admin");
  }, [role, authLoading, navigate]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoadingRel(true);
    const [{ data: rels }, { data: settings }] = await Promise.all([
      supabase.from("app_releases").select("*").order("created_at", { ascending: false }),
      supabase.from("app_settings").select("key, value").in("key", ["ota_url", "force_update_enabled", "force_update_min_version"]),
    ]);
    setReleases((rels as AppRelease[]) || []);
    if (settings) {
      for (const r of settings) {
        if (r.key === "ota_url") setOtaUrl(String(r.value ?? ""));
        if (r.key === "force_update_enabled") setForceEnabled(String(r.value) === "true");
        if (r.key === "force_update_min_version") setMinVersion(String(r.value ?? ""));
      }
    }
    setLoadingRel(false);
  };

  // ── Publish release ─────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!user) return;
    if (!version.trim()) { toast({ variant: "destructive", title: "Version required", description: "e.g. 1.2.0" }); return; }
    if (!file && !externalUrl.trim()) { toast({ variant: "destructive", title: "Pick a file or paste a URL" }); return; }
    setUploading(true);
    try {
      let file_path: string | null = null;
      let file_url: string | null = externalUrl.trim() || null;
      let file_size: number | null = null;
      if (file) {
        const path = `${platform}/${version}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        file_path = path; file_url = pub.publicUrl; file_size = file.size;
      }
      await supabase.from("app_releases").update({ is_latest: false }).eq("platform", platform).eq("is_latest", true);
      const { error: insErr } = await supabase.from("app_releases").insert({
        version: version.trim(), platform, file_path, file_url, file_size,
        release_notes: notes.trim() || null, is_latest: true, created_by: user.id,
      });
      if (insErr) throw insErr;
      toast({ title: "Release published", description: `v${version} (${platform}) is live.` });
      setVersion(""); setNotes(""); setExternalUrl(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const setLatest = async (rel: AppRelease) => {
    await supabase.from("app_releases").update({ is_latest: false }).eq("platform", rel.platform).eq("is_latest", true);
    await supabase.from("app_releases").update({ is_latest: true }).eq("id", rel.id);
    toast({ title: `v${rel.version} marked latest` }); fetchAll();
  };

  const remove = async (rel: AppRelease) => {
    if (!confirm(`Delete release v${rel.version} (${rel.platform})?`)) return;
    if (rel.file_path) await supabase.storage.from(BUCKET).remove([rel.file_path]);
    await supabase.from("app_releases").delete().eq("id", rel.id);
    toast({ title: "Release deleted" }); fetchAll();
  };

  // ── Save OTA URL ────────────────────────────────────────────────────────────
  const saveOta = async () => {
    setSavingOta(true);
    const { error } = await upsertSetting("ota_url", otaUrl.trim());
    if (error) toast({ variant: "destructive", title: "Failed", description: error.message });
    else toast({ title: "OTA URL saved", description: "Rebuild the APK to apply." });
    setSavingOta(false);
  };

  // ── Save force-update ───────────────────────────────────────────────────────
  const saveForce = async () => {
    setSavingForce(true);
    const errs = await Promise.all([
      upsertSetting("force_update_enabled", String(forceEnabled)),
      upsertSetting("force_update_min_version", minVersion || "0.0.0"),
    ]);
    if (errs.some((r) => r.error)) toast({ variant: "destructive", title: "Failed to save" });
    else toast({ title: "Force-update settings saved" });
    setSavingForce(false);
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const whatsappShare = (url: string, msg: string) =>
    window.open(`https://wa.me/?text=${encodeURIComponent(msg + "\n" + url)}`, "_blank");

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Smartphone className="w-7 h-7 text-primary" />
          App Manager
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Publish builds, share the app, configure OTA updates, and manage force-update requirements.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" /> Running v{APP_VERSION}
          </Badge>
          <Badge variant="outline" className="text-xs">{releases.length} release{releases.length !== 1 ? "s" : ""}</Badge>
        </div>
      </div>

      <Tabs defaultValue="share">
        <TabsList className="w-full mb-6 grid grid-cols-4">
          <TabsTrigger value="share" className="text-xs sm:text-sm gap-1.5"><Share2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Share</span></TabsTrigger>
          <TabsTrigger value="releases" className="text-xs sm:text-sm gap-1.5"><Upload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Releases</span></TabsTrigger>
          <TabsTrigger value="ota" className="text-xs sm:text-sm gap-1.5"><Globe className="w-3.5 h-3.5" /><span className="hidden sm:inline">OTA</span></TabsTrigger>
          <TabsTrigger value="force" className="text-xs sm:text-sm gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /><span className="hidden sm:inline">Force Update</span></TabsTrigger>
        </TabsList>

        {/* ── SHARE & TEST TAB ─────────────────────────────────── */}
        <TabsContent value="share" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Web app QR */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><QrCode className="w-4 h-4 text-primary" /> Web App QR</CardTitle>
                <CardDescription className="text-xs">Scan to open the live web app on any device — great for quick testing.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <div className="p-3 bg-white rounded-xl shadow-inner">
                  <QRCodeSVG value={appUrl} size={160} bgColor="#ffffff" fgColor="#0f172a" />
                </div>
                <p className="text-[11px] text-muted-foreground break-all text-center">{appUrl}</p>
                <div className="flex gap-2 w-full">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => copyLink(appUrl)} data-testid="copy-web-url">
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy link"}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => whatsappShare(appUrl, "Try our virtual bank app:")} data-testid="share-web-whatsapp">
                    <Send className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* APK download QR */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Download className="w-4 h-4 text-primary" /> APK Download QR</CardTitle>
                <CardDescription className="text-xs">Share a direct download link for the latest Android APK.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                {latestAndroid?.file_url ? (
                  <>
                    <div className="p-3 bg-white rounded-xl shadow-inner">
                      <QRCodeSVG value={latestAndroid.file_url} size={160} bgColor="#ffffff" fgColor="#0f172a" />
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">v{latestAndroid.version} · {fmt(latestAndroid.file_size)}</p>
                    <div className="flex gap-2 w-full">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => copyLink(latestAndroid.file_url!)} data-testid="copy-apk-url">
                        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy link
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => whatsappShare(latestAndroid.file_url!, `Download Virtual Bank v${latestAndroid.version}:`)} data-testid="share-apk-whatsapp">
                        <Send className="w-3.5 h-3.5" /> WhatsApp
                      </Button>
                    </div>
                    <a href={latestAndroid.file_url} target="_blank" rel="noreferrer" className="w-full">
                      <Button size="sm" className="w-full gap-1.5" data-testid="download-apk-admin">
                        <Download className="w-3.5 h-3.5" /> Download APK
                      </Button>
                    </a>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
                    <Smartphone className="w-10 h-10 opacity-30" />
                    <p className="text-sm text-center">No Android release yet.<br />Publish one in the Releases tab.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Share to other projects */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Link2 className="w-4 h-4 text-primary" /> Send to your other Replit apps</CardTitle>
              <CardDescription className="text-xs">
                Copy these details into any other app's admin area or documentation so users can download or link to this app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Live web URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={appUrl} readOnly className="font-mono text-xs" data-testid="input-web-url" />
                  <Button size="sm" variant="outline" onClick={() => copyLink(appUrl)}><Copy className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              {latestAndroid?.file_url && (
                <div>
                  <Label className="text-xs">Latest Android APK URL (v{latestAndroid.version})</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={latestAndroid.file_url} readOnly className="font-mono text-xs" data-testid="input-apk-url" />
                    <Button size="sm" variant="outline" onClick={() => copyLink(latestAndroid.file_url!)}><Copy className="w-3.5 h-3.5" /></Button>
                    <a href={latestAndroid.file_url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline"><ExternalLink className="w-3.5 h-3.5" /></Button>
                    </a>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground bg-muted p-2 rounded-lg">
                Paste the web URL as an iframe or link in your other apps. Paste the APK URL as a download link so users can sideload the app.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── RELEASES TAB ─────────────────────────────────────── */}
        <TabsContent value="releases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publish a new release</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Version</Label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.2.0" data-testid="input-version" />
                </div>
                <div>
                  <Label>Platform</Label>
                  <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={platform} onChange={(e) => setPlatform(e.target.value as any)} data-testid="select-platform">
                    <option value="android">Android (APK)</option>
                    <option value="ios">iOS (IPA / TestFlight)</option>
                    <option value="web">Web (PWA bundle)</option>
                  </select>
                </div>
                <div>
                  <Label>File</Label>
                  <Input ref={fileRef} type="file" accept=".apk,.ipa,.zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="input-file" />
                </div>
              </div>
              <div>
                <Label>…or paste an external download URL</Label>
                <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://example.com/app-1.2.0.apk" data-testid="input-external-url" />
              </div>
              <div>
                <Label>Release notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="• New feature&#10;• Bug fixes" rows={3} data-testid="input-notes" />
              </div>
              <Button onClick={handlePublish} disabled={uploading} className="w-full" data-testid="button-publish">
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? "Publishing…" : "Publish release"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">All releases</CardTitle></CardHeader>
            <CardContent>
              {loadingRel ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
              ) : releases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No releases yet.</p>
              ) : (
                <div className="divide-y">
                  {releases.map((r) => (
                    <div key={r.id} className="py-3 flex items-start gap-3" data-testid={`release-${r.id}`}>
                      <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">{platformIcon(r.platform)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">v{r.version}</span>
                          <Badge variant="outline" className="text-[10px]">{r.platform}</Badge>
                          {r.is_latest && <Badge className="text-[10px] bg-green-600 hover:bg-green-600">Latest</Badge>}
                          <span className="text-[11px] text-muted-foreground">{fmt(r.file_size)} · {new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                        {r.release_notes && <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{r.release_notes}</p>}
                        {r.file_url && (
                          <a href={r.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                            <ExternalLink className="w-3 h-3" /> Open file
                          </a>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!r.is_latest && (
                          <Button size="sm" variant="outline" onClick={() => setLatest(r)} data-testid={`set-latest-${r.id}`}>
                            <Star className="w-3.5 h-3.5 mr-1" /> Latest
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => remove(r)} data-testid={`delete-${r.id}`}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── OTA TAB ──────────────────────────────────────────── */}
        <TabsContent value="ota" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> Over-the-Air (OTA) URL</CardTitle>
              <CardDescription>
                When set, every installed APK loads your app directly from this URL on launch — no re-install needed for updates.
                Leave empty to use the bundled web assets inside the APK.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Deployed app URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={otaUrl}
                    onChange={(e) => setOtaUrl(e.target.value)}
                    placeholder="https://your-app.replit.app"
                    className="font-mono text-sm"
                    data-testid="input-ota-url"
                  />
                  <Button variant="outline" size="sm" onClick={() => { setOtaUrl(appUrl); }} title="Use this Replit URL">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Current preview URL: <span className="font-mono">{appUrl}</span>
                </p>
              </div>
              <Button onClick={saveOta} disabled={savingOta} className="gap-2" data-testid="button-save-ota">
                {savingOta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingOta ? "Saving…" : "Save OTA URL"}
              </Button>

              <div className="bg-muted rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium">How to build an OTA-enabled APK</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Deploy this app (Replit → Publish)</li>
                  <li>Save the deployed URL above</li>
                  <li>On your local machine with Android Studio:</li>
                </ol>
                <pre className="text-[11px] bg-background rounded p-3 overflow-auto mt-1">{`CAP_PROD_URL=${otaUrl || "https://your-app.replit.app"} \\
  ./setup-mobile.sh release android

# Android Studio → Build → Build APK(s)`}</pre>
                <p className="text-[11px] text-muted-foreground">
                  Every future web deploy is instantly live in all installed APKs — no re-install, no Play Store submission.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FORCE UPDATE TAB ─────────────────────────────────── */}
        <TabsContent value="force" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-primary" /> Force Update</CardTitle>
              <CardDescription>
                Block users on old app versions from using the app until they install the required version.
                The current running build is <strong>v{APP_VERSION}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">Enable force update</p>
                  <p className="text-xs text-muted-foreground">Users below the minimum version will see an update screen and cannot proceed.</p>
                </div>
                <Switch checked={forceEnabled} onCheckedChange={setForceEnabled} data-testid="switch-force-update" />
              </div>

              <div className={`space-y-2 transition-opacity ${forceEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                <Label>Minimum required version</Label>
                <Input
                  value={minVersion}
                  onChange={(e) => setMinVersion(e.target.value)}
                  placeholder="1.2.0"
                  className="font-mono"
                  data-testid="input-min-version"
                />
                <p className="text-[11px] text-muted-foreground">
                  Any build with a version number lower than this will be blocked.
                  Set this to the version you just published in the Releases tab.
                </p>
              </div>

              {forceEnabled && minVersion && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-700 dark:text-yellow-300">
                  ⚠️ With current build v{APP_VERSION}: users on versions below v{minVersion} will be blocked. Make sure you've published the new APK first.
                </div>
              )}

              <Button onClick={saveForce} disabled={savingForce} className="gap-2 w-full" data-testid="button-save-force">
                {savingForce ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingForce ? "Saving…" : "Save force-update settings"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader className="pb-1"><CardTitle className="text-sm">How versioning works</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>1. When you build a new APK, update <code className="bg-muted px-1 rounded">src/lib/appVersion.ts</code> → <code className="bg-muted px-1 rounded">APP_VERSION</code></p>
              <p>2. Publish the APK in the Releases tab</p>
              <p>3. Set Minimum Required Version here to the new version</p>
              <p>4. Users on old builds see an update screen and get sent to the download link</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Setup SQL */}
      <Card className="mt-6 border-yellow-500/30 bg-yellow-500/5">
        <CardHeader className="pb-1"><CardTitle className="text-sm">First-time Supabase setup</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">Run this in your Supabase SQL editor if you see errors:</p>
          <pre className="text-[11px] bg-muted p-3 rounded overflow-auto">{`insert into public.app_settings (key, value) values
  ('ota_url',                  ''),
  ('force_update_enabled',     'false'),
  ('force_update_min_version', '0.0.0')
on conflict (key) do nothing;`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
