import { supabase } from "@/integrations/supabase/client";
import { CLIENT_MENU_FEATURES } from "@/lib/clientMenuFeatures";

export type UserFeatureAccess = Record<string, boolean>;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Feature access is unavailable.");
  return body as T;
}

export async function fetchCurrentUserFeatureAccess(): Promise<UserFeatureAccess> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  const response = await fetch("/api/feature-access/me", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const body = await readJson<{ access?: UserFeatureAccess }>(response);
  return body.access || {};
}

export async function fetchAdminUserFeatureAccess(userId: string): Promise<UserFeatureAccess> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/features`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const body = await readJson<{ access?: UserFeatureAccess }>(response);
  return body.access || Object.fromEntries(CLIENT_MENU_FEATURES.map((feature) => [feature.featureKey, true]));
}

export async function updateAdminUserFeatureAccess(
  userId: string,
  featureKey: string,
  isEnabled: boolean,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");
  const response = await fetch(
    `/api/admin/users/${encodeURIComponent(userId)}/features/${encodeURIComponent(featureKey)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ is_enabled: isEnabled }),
    },
  );
  await readJson(response);
}