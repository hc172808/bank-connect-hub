/**
 * Bootstrap diagnostics + automatic error reporting.
 *
 * Keeps a rolling timeline of startup events in localStorage so it survives
 * auto-retry reloads, persists the exponential-backoff schedule, and reports
 * hard failures (initSupabase / auth) to the backend with a stack trace.
 */
import { supabase } from "@/integrations/supabase/client";

export const BOOT_KEYS = {
  attempts: "nlc_boot_attempts",
  step: "nlc_boot_step",
  lastAttempt: "nlc_boot_last_attempt",
  log: "nlc_boot_log",
  retryAt: "nlc_boot_retry_at",
  backoffStep: "nlc_boot_backoff_step",
  firstSeen: "nlc_boot_first_seen",
} as const;

export interface BootEvent {
  t: number;
  step: string;
  detail?: string;
}

const MAX_EVENTS = 60;

function read<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function getBootLog(): BootEvent[] {
  return read(() => {
    const raw = localStorage.getItem(BOOT_KEYS.log);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as BootEvent[]) : [];
  }, []);
}

export function logBoot(step: string, detail?: string) {
  try {
    const events = getBootLog();
    events.push({ t: Date.now(), step, detail });
    localStorage.setItem(BOOT_KEYS.log, JSON.stringify(events.slice(-MAX_EVENTS)));
    localStorage.setItem(BOOT_KEYS.step, step);
    if (!localStorage.getItem(BOOT_KEYS.firstSeen)) {
      localStorage.setItem(BOOT_KEYS.firstSeen, String(Date.now()));
    }
  } catch { /* storage unavailable — diagnostics are best-effort */ }
}

export function getAttempts(): number {
  return read(() => parseInt(localStorage.getItem(BOOT_KEYS.attempts) || "0", 10) || 0, 0);
}

/** Exponential backoff: 2s, 4s, 8s … capped at 60s. */
export function backoffDelayMs(step: number): number {
  return Math.min(2000 * Math.pow(2, step), 60000);
}

/**
 * Returns the persisted retry deadline, creating one if none exists.
 * Surviving a reload means the user resumes the *exact* remaining wait time.
 */
export function ensureRetryDeadline(): { retryAt: number; step: number } {
  const step = read(() => parseInt(localStorage.getItem(BOOT_KEYS.backoffStep) || "0", 10) || 0, 0);
  const existing = read(() => parseInt(localStorage.getItem(BOOT_KEYS.retryAt) || "0", 10) || 0, 0);
  if (existing > Date.now()) return { retryAt: existing, step };
  const retryAt = Date.now() + backoffDelayMs(step);
  try { localStorage.setItem(BOOT_KEYS.retryAt, String(retryAt)); } catch { /* ignore */ }
  return { retryAt, step };
}

export function getRetryAt(): number | null {
  const v = read(() => parseInt(localStorage.getItem(BOOT_KEYS.retryAt) || "0", 10) || 0, 0);
  return v > 0 ? v : null;
}

/** Advance the backoff step and record the attempt right before reloading. */
export function commitRetry() {
  try {
    const step = getBackoffStep();
    localStorage.setItem(BOOT_KEYS.backoffStep, String(step + 1));
    localStorage.setItem(BOOT_KEYS.attempts, String(getAttempts() + 1));
    localStorage.setItem(BOOT_KEYS.lastAttempt, String(Date.now()));
    localStorage.removeItem(BOOT_KEYS.retryAt);
  } catch { /* ignore */ }
  logBoot("retry-reload");
}

export function getBackoffStep(): number {
  return read(() => parseInt(localStorage.getItem(BOOT_KEYS.backoffStep) || "0", 10) || 0, 0);
}

export function clearBootState() {
  try {
    Object.values(BOOT_KEYS).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export interface BootSnapshot {
  now: string;
  firstSeen: string | null;
  lastAttempt: string | null;
  attempts: number;
  backoffStep: number;
  nextRetryAt: string | null;
  nextRetryInSeconds: number | null;
  schedule: string;
  lastStep: string | null;
  reason: string | null;
  online: boolean;
  userAgent: string;
  url: string;
  timeline: { at: string; step: string; detail?: string }[];
}

export function buildSnapshot(reason: string | null): BootSnapshot {
  const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);
  const firstSeen = read(() => parseInt(localStorage.getItem(BOOT_KEYS.firstSeen) || "0", 10) || 0, 0);
  const lastAttempt = read(() => parseInt(localStorage.getItem(BOOT_KEYS.lastAttempt) || "0", 10) || 0, 0);
  const retryAt = getRetryAt();
  const step = getBackoffStep();
  return {
    now: new Date().toISOString(),
    firstSeen: iso(firstSeen || null),
    lastAttempt: iso(lastAttempt || null),
    attempts: getAttempts(),
    backoffStep: step,
    nextRetryAt: iso(retryAt),
    nextRetryInSeconds: retryAt ? Math.max(0, Math.round((retryAt - Date.now()) / 1000)) : null,
    schedule: [0, 1, 2, 3, 4, 5]
      .map((s) => `${backoffDelayMs(s) / 1000}s${s === step ? " ←" : ""}`)
      .join(" → "),
    lastStep: read(() => localStorage.getItem(BOOT_KEYS.step), null),
    reason,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    url: typeof location !== "undefined" ? location.href : "",
    timeline: getBootLog().map((e) => ({
      at: new Date(e.t).toISOString(),
      step: e.step,
      detail: e.detail,
    })),
  };
}

export function snapshotToText(s: BootSnapshot): string {
  return JSON.stringify(s, null, 2);
}

// ── Automatic error reporting ────────────────────────────────────────────────
let reportedThisSession = false;

export async function reportBootFailure(opts: {
  stage: string;
  reason?: string | null;
  error?: unknown;
  force?: boolean;
}): Promise<void> {
  if (reportedThisSession && !opts.force) return;
  reportedThisSession = true;
  const err = opts.error;
  const snap = buildSnapshot(opts.reason ?? null);
  const payload = {
    stage: opts.stage,
    reason: opts.reason ?? null,
    message: err instanceof Error ? err.message : err ? String(err) : (opts.reason ?? null),
    stack: err instanceof Error ? (err.stack ?? null) : new Error("boot-failure").stack ?? null,
    attempts: snap.attempts,
    online: snap.online,
    user_agent: snap.userAgent.slice(0, 400),
    app_url: snap.url.slice(0, 400),
    timeline: snap.timeline,
  };
  // Always keep a local copy so the diagnostics panel works offline.
  logBoot(`report:${opts.stage}`, payload.message ?? undefined);
  try {
    const { data } = await supabase.auth.getSession();
    await (supabase.from("boot_error_reports") as any).insert({
      ...payload,
      user_id: data?.session?.user?.id ?? null,
    });
  } catch {
    // Reporting must never break the app — the local snapshot is the fallback.
  }
}
