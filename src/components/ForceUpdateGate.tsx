import { useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION, compareSemver } from "@/lib/appVersion";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, Smartphone } from "lucide-react";

interface ForceUpdateGateProps {
  children: ReactNode;
}

export function ForceUpdateGate({ children }: ForceUpdateGateProps) {
  const [blocked, setBlocked] = useState(false);
  const [minVersion, setMinVersion] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["force_update_enabled", "force_update_min_version"]);

      if (!settings) { setChecked(true); return; }

      const enabled = String(settings.find((r) => r.key === "force_update_enabled")?.value ?? "") === "true";
      const minVer  = String(settings.find((r) => r.key === "force_update_min_version")?.value ?? "0.0.0");

      if (enabled && compareSemver(APP_VERSION, minVer) < 0) {
        setMinVersion(minVer);
        // Fetch download URL for latest android release
        const { data: rel } = await supabase
          .from("app_releases")
          .select("file_url")
          .eq("is_latest", true)
          .eq("platform", "android")
          .maybeSingle();
        setDownloadUrl(rel?.file_url ?? null);
        setBlocked(true);
      }
      setChecked(true);
    })();
  }, []);

  if (!checked) return null; // wait silently

  if (blocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background text-center">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
          <Smartphone className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Update Required</h1>
        <p className="text-muted-foreground text-sm max-w-xs mb-6">
          Version <strong>v{minVersion}</strong> or newer is required to continue.
          You are on <strong>v{APP_VERSION}</strong>. Please download the latest version.
        </p>
        {downloadUrl ? (
          <a href={downloadUrl} target="_blank" rel="noreferrer">
            <Button size="lg" className="gap-2" data-testid="force-update-download">
              <Download className="w-4 h-4" /> Download latest app
            </Button>
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact your admin for a download link.
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
          data-testid="force-update-reload"
        >
          <RefreshCw className="w-3 h-3" /> I've updated — reload
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
