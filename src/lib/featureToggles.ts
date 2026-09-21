import { supabase } from "@/integrations/supabase/client";

export interface FeatureToggle {
  id: string;
  feature_key: string;
  feature_name: string;
  is_enabled: boolean;
  updated_at?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Feature toggles are unavailable.");
  }
  return body as T;
}

export async function fetchFeatureToggles(): Promise<FeatureToggle[]> {
  try {
    const response = await fetch("/api/feature-toggles", { cache: "no-store" });
    const body = await readJson<{ features?: FeatureToggle[] }>(response);
    return body.features || [];
  } catch (proxyError) {
    // The server proxy uses the service key, but a direct read keeps public
    // feature gates usable if the backend is restarting or not configured.
    const { data, error } = await supabase
      .from("feature_toggles")
      .select("id, feature_key, feature_name, is_enabled, updated_at")
      .order("feature_name");
    if (error) {
      throw new Error(error.message || (proxyError instanceof Error ? proxyError.message : "Feature toggles are unavailable."));
    }
    return (data || []) as FeatureToggle[];
  }
}

export async function ensureFeatureToggles(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch("/api/feature-toggles/seed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  await readJson(response);
}

export async function updateFeatureToggle(id: string, isEnabled: boolean): Promise<FeatureToggle> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/feature-toggles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ is_enabled: isEnabled }),
    });
    const body = await readJson<{ feature: FeatureToggle }>(response);
    return body.feature;
  } catch (proxyError) {
    const { data, error } = await supabase
      .from("feature_toggles")
      .update({ is_enabled: isEnabled })
      .eq("id", id)
      .select("id, feature_key, feature_name, is_enabled, updated_at")
      .single();
    if (error) {
      throw new Error(error.message || (proxyError instanceof Error ? proxyError.message : "Feature toggle update failed."));
    }
    return data as FeatureToggle;
  }
}

export async function isFeatureEnabled(featureKey: string): Promise<boolean> {
  const features = await fetchFeatureToggles();
  return Boolean(features.find((feature) => feature.feature_key === featureKey)?.is_enabled);
}