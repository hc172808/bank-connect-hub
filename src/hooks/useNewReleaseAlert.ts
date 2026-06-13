import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useNewReleaseAlert(userId: string | undefined) {
  const latestIdRef = useRef<string | null>(null);
  const navigateRef = useRef<((path: string) => void) | null>(null);

  // Attach navigate lazily — callers pass it after router is ready
  const setNavigate = (fn: (path: string) => void) => { navigateRef.current = fn; };

  useEffect(() => {
    if (!userId) return;

    // Seed the known-latest id so we don't alert on the existing release
    supabase
      .from("app_releases")
      .select("id, version")
      .eq("is_latest", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) latestIdRef.current = data.id;
      });

    const channel = supabase
      .channel(`new-release-alert-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_releases" },
        (payload) => {
          const r = payload.new as {
            id: string; version: string; platform: string; is_latest: boolean;
          };
          if (!r.is_latest) return;
          if (r.id === latestIdRef.current) return;
          latestIdRef.current = r.id;

          const label = r.platform === "android" ? "Android APK" : r.platform === "ios" ? "iOS build" : "web build";
          toast.success(`New app release — v${r.version}`, {
            description: `A new ${label} is now available for download.`,
            duration: 12000,
            action: {
              label: "Download",
              onClick: () => navigateRef.current?.("/download-app"),
            },
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { setNavigate };
}
