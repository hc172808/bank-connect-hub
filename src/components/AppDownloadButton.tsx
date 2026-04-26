import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Apple, FileArchive, Sparkles } from "lucide-react";

interface AppRelease {
  id: string;
  version: string;
  platform: "android" | "ios" | "web";
  file_url: string | null;
  file_size: number | null;
  release_notes: string | null;
  created_at: string;
}

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function AppDownloadButton() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_releases")
        .select("id, version, platform, file_url, file_size, release_notes, created_at")
        .eq("is_latest", true)
        .order("created_at", { ascending: false });
      setReleases((data as AppRelease[]) || []);
      setLoading(false);
    })();
  }, []);

  const detectPlatform = (): "android" | "ios" | "web" => {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return "android";
    if (/iPad|iPhone|iPod/.test(ua)) return "ios";
    return "web";
  };

  if (loading || releases.length === 0) return null;

  // Sort so the user's current platform is shown first.
  const myPlatform = detectPlatform();
  const sorted = [...releases].sort((a, b) => (a.platform === myPlatform ? -1 : b.platform === myPlatform ? 1 : 0));

  const labelFor = (p: string) => (p === "android" ? "Android" : p === "ios" ? "iOS" : "Web");
  const iconFor = (p: string) =>
    p === "ios" ? <Apple className="w-4 h-4" /> : p === "web" ? <FileArchive className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span>Download the native app for the smoothest experience.</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sorted.map((r) => (
          <a
            key={r.id}
            href={r.file_url || "#"}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-card hover:bg-primary/5 transition"
            data-testid={`download-${r.platform}`}
          >
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
              {iconFor(r.platform)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                Download for {labelFor(r.platform)}
                {r.platform === myPlatform && (
                  <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">your device</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                v{r.version}
                {r.file_size ? ` · ${formatSize(r.file_size)}` : ""}
              </div>
            </div>
            <Button variant="ghost" size="icon" tabIndex={-1}>
              <Download className="w-4 h-4 text-primary" />
            </Button>
          </a>
        ))}
      </div>
      {sorted[0]?.release_notes && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">What's new in v{sorted[0].version}</summary>
          <pre className="whitespace-pre-line mt-1 pl-2">{sorted[0].release_notes}</pre>
        </details>
      )}
    </div>
  );
}
