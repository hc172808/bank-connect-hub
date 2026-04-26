import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Upload,
  Download,
  Trash2,
  Star,
  Smartphone,
  Apple,
  FileArchive,
  Loader2,
  ExternalLink,
} from "lucide-react";

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

const formatSize = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AdminAppReleases() {
  const navigate = useNavigate();
  const { role, loading: authLoading, user } = useAuth();
  const { toast } = useToast();

  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState<"android" | "ios" | "web">("android");
  const [notes, setNotes] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!authLoading && role !== "admin") navigate("/");
  }, [role, authLoading, navigate]);

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_releases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({
        variant: "destructive",
        title: "Couldn't load releases",
        description: error.message + ". Run the setup SQL shown at the bottom of this page.",
      });
    } else {
      setReleases((data as AppRelease[]) || []);
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!user) return;
    if (!version.trim()) {
      toast({ variant: "destructive", title: "Version required", description: "e.g. 1.2.0" });
      return;
    }
    if (!file && !externalUrl.trim()) {
      toast({
        variant: "destructive",
        title: "Pick a file or paste a URL",
        description: "Upload an APK/IPA, or link to one already hosted elsewhere.",
      });
      return;
    }

    setUploading(true);
    let file_path: string | null = null;
    let file_url: string | null = externalUrl.trim() || null;
    let file_size: number | null = null;

    try {
      if (file) {
        const path = `${platform}/${version}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/vnd.android.package-archive",
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        file_path = path;
        file_url = pub.publicUrl;
        file_size = file.size;
      }

      // Mark previous releases of the same platform as not-latest
      await supabase
        .from("app_releases")
        .update({ is_latest: false })
        .eq("platform", platform)
        .eq("is_latest", true);

      const { error: insErr } = await supabase.from("app_releases").insert({
        version: version.trim(),
        platform,
        file_path,
        file_url,
        file_size,
        release_notes: notes.trim() || null,
        is_latest: true,
        created_by: user.id,
      });
      if (insErr) throw insErr;

      toast({ title: "Release published", description: `v${version} for ${platform} is now live.` });
      setVersion("");
      setNotes("");
      setExternalUrl("");
      setFile(null);
      const fileInput = document.getElementById("release-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      fetchReleases();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: e.message || String(e),
      });
    } finally {
      setUploading(false);
    }
  };

  const setLatest = async (rel: AppRelease) => {
    await supabase
      .from("app_releases")
      .update({ is_latest: false })
      .eq("platform", rel.platform)
      .eq("is_latest", true);
    const { error } = await supabase
      .from("app_releases")
      .update({ is_latest: true })
      .eq("id", rel.id);
    if (error) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    } else {
      toast({ title: `v${rel.version} marked latest` });
      fetchReleases();
    }
  };

  const remove = async (rel: AppRelease) => {
    if (!confirm(`Delete release v${rel.version} (${rel.platform})?`)) return;
    if (rel.file_path) {
      await supabase.storage.from(BUCKET).remove([rel.file_path]);
    }
    const { error } = await supabase.from("app_releases").delete().eq("id", rel.id);
    if (error) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    } else {
      toast({ title: "Release deleted" });
      fetchReleases();
    }
  };

  const platformIcon = (p: string) =>
    p === "ios" ? <Apple className="w-4 h-4" /> : p === "web" ? <FileArchive className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />;

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4" data-testid="back">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Upload className="w-7 h-7 text-primary" />
          App Releases
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload APK / IPA files (or link to ones hosted elsewhere). Users will see the latest one
          on their Profile screen as a download button.
        </p>
      </div>

      {/* Upload form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Publish a new release</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Version</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.2.0"
                data-testid="input-version"
              />
            </div>
            <div>
              <Label>Platform</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as any)}
                data-testid="select-platform"
              >
                <option value="android">Android (APK)</option>
                <option value="ios">iOS (IPA / TestFlight URL)</option>
                <option value="web">Web (PWA bundle)</option>
              </select>
            </div>
            <div>
              <Label>File</Label>
              <Input
                id="release-file"
                type="file"
                accept=".apk,.ipa,.zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="input-file"
              />
            </div>
          </div>

          <div>
            <Label>...or paste an external download URL</Label>
            <Input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://example.com/app-1.2.0.apk"
              data-testid="input-external-url"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Useful for iOS TestFlight / Play Store links, or APKs hosted on your own CDN.
            </p>
          </div>

          <div>
            <Label>Release notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="• Added Face ID&#10;• Faster wallet refresh&#10;• Bug fixes"
              rows={4}
              data-testid="input-notes"
            />
          </div>

          <Button onClick={handleUpload} disabled={uploading} className="w-full" data-testid="button-publish">
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploading ? "Publishing..." : "Publish release"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing releases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All releases</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : releases.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No releases yet. Publish your first APK above.
            </div>
          ) : (
            <div className="divide-y">
              {releases.map((r) => (
                <div key={r.id} className="py-3 flex items-start gap-3" data-testid={`release-${r.id}`}>
                  <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                    {platformIcon(r.platform)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">v{r.version}</span>
                      <Badge variant="outline" className="text-[10px]">{r.platform}</Badge>
                      {r.is_latest && (
                        <Badge className="text-[10px] bg-green-600 hover:bg-green-600">Latest</Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatSize(r.file_size)} · {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.release_notes && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{r.release_notes}</p>
                    )}
                    {r.file_url && (
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary inline-flex items-center gap-1 mt-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Open file
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {!r.is_latest && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLatest(r)}
                        data-testid={`set-latest-${r.id}`}
                      >
                        <Star className="w-3.5 h-3.5 mr-1" /> Make latest
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(r)}
                      data-testid={`delete-${r.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup help */}
      <Card className="mt-6 border-yellow-500/30 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="text-sm">First-time setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            If uploads fail, run this SQL in your Supabase SQL editor once:
          </p>
          <pre className="text-[11px] bg-muted p-3 rounded overflow-auto">{`-- Table
create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  platform text not null check (platform in ('android','ios','web')),
  file_path text,
  file_url  text,
  file_size bigint,
  release_notes text,
  is_latest boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.app_releases enable row level security;
create policy "anyone reads releases" on public.app_releases for select using (true);
create policy "admins manage releases" on public.app_releases for all
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

-- Storage bucket (run via Supabase Dashboard > Storage > new public bucket "app-releases")
-- Then add policy:
create policy "anyone downloads app files" on storage.objects for select
  using (bucket_id = 'app-releases');
create policy "admins upload app files" on storage.objects for insert
  with check (bucket_id = 'app-releases' and has_role(auth.uid(),'admin'));
create policy "admins delete app files" on storage.objects for delete
  using (bucket_id = 'app-releases' and has_role(auth.uid(),'admin'));

-- Feature toggle
insert into public.feature_toggles (feature_key, feature_name, is_enabled)
values ('app_download','Show app download to users', true)
on conflict (feature_key) do nothing;`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
