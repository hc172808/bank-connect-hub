import { supabase } from "@/integrations/supabase/client";

export type SystemDoctorCheck = {
  id: string;
  label: string;
  status: "ok" | "warning" | "error" | "unknown";
  detail: string;
  latencyMs?: number;
};

export type SystemDoctorSettings = {
  aiEnabled: boolean;
  automaticRepairsEnabled: false;
};

export type SystemDoctorResult = {
  checks: SystemDoctorCheck[];
  analysis: string | null;
  analysisStatus: "complete" | "disabled" | "unavailable";
  model: string | null;
  checkedAt: string;
  safeActions: Array<{ id: "rerun_diagnostics"; label: string }>;
};

async function requestSystemDoctor<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your admin session has expired. Sign in again.");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "System Doctor request failed.");
  }
  return body as T;
}

export function getSystemDoctorSettings() {
  return requestSystemDoctor<SystemDoctorSettings>("/api/admin/system-doctor/settings");
}

export function updateSystemDoctorSettings(aiEnabled: boolean) {
  return requestSystemDoctor<SystemDoctorSettings>("/api/admin/system-doctor/settings", {
    method: "PATCH",
    body: JSON.stringify({ aiEnabled }),
  });
}

export function runSystemDoctorDiagnostics() {
  return requestSystemDoctor<SystemDoctorResult>("/api/admin/system-doctor/diagnose", {
    method: "POST",
    body: JSON.stringify({}),
  });
}