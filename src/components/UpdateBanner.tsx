import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION, compareSemver } from "@/lib/appVersion";
import { Download, X, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const DISMISSED_KEY = "vb.updateDismissed";

export function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [latestVersion, setLatestVersion] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const dismissed = sessionStorage.getItem(DISMISSED_KEY);
      if (dismissed) return;

      const { data } = await supabase
        .from("app_releases")
        .select("version, file_url, platform, release_notes")
        .eq("is_latest", true)
        .eq("platform", "android")
        .maybeSingle();

      if (!data) return;
      if (compareSemver(data.version, APP_VERSION) > 0) {
        setLatestVersion(data.version);
        setDownloadUrl(data.file_url);
        setReleaseNotes((data as { release_notes?: string }).release_notes ?? null);
        setShow(true);
      }
    })();
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
                 bg-primary text-primary-foreground rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-4"
      data-testid="update-banner"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">
            Update available — v{latestVersion}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            You have v{APP_VERSION}. A new version of the app is ready.
          </p>

          {releaseNotes && (
            <button
              className="mt-1 text-xs opacity-70 hover:opacity-100 flex items-center gap-0.5"
              onClick={() => setExpanded((e) => !e)}
            >
              What's new
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {expanded && releaseNotes && (
            <p className="mt-1 text-xs opacity-80 whitespace-pre-line leading-relaxed border-t border-primary-foreground/20 pt-1">
              {releaseNotes}
            </p>
          )}

          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
              data-testid="update-banner-download"
            >
              <Download className="w-3.5 h-3.5" /> Download now
            </a>
          )}
        </div>
        <button
          onClick={dismiss}
          className="opacity-70 hover:opacity-100 shrink-0"
          data-testid="update-banner-dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
