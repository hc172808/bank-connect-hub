import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAttempts, getRetryAt, backoffDelayMs, getBackoffStep } from "@/lib/bootDiagnostics";

const SPIKE_THRESHOLD = 3;      // reports in the window before we call it an incident
const WINDOW_MINUTES = 30;
const POLL_MS = 120_000;

/**
 * Shows a slim status banner when bootstrap/monitoring health degrades:
 *  - locally: this device needed retries to start the app
 *  - globally: a spike of boot error reports in the last 30 minutes (admins,
 *    who are the only role allowed to read the reports table)
 * Displays the ETA of the next automatic retry.
 */
export const IncidentBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const [localAttempts] = useState(() => getAttempts());
  const [eta, setEta] = useState<number | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
        const { count } = await supabase
          .from("boot_error_reports")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if (!cancelled) setRemoteCount(count ?? 0);
      } catch { /* monitoring is best-effort */ }
    };
    void check();
    const iv = setInterval(check, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    const tick = () => {
      const at = getRetryAt();
      setEta(at ? Math.max(0, Math.round((at - Date.now()) / 1000)) : null);
      setOnline(navigator.onLine);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const spike = remoteCount >= SPIKE_THRESHOLD;
  const degraded = spike || localAttempts > 0;
  if (dismissed || !degraded) return null;

  const nextRetry = eta !== null
    ? `Next automatic retry in ${eta}s.`
    : `Retries back off up to ${backoffDelayMs(getBackoffStep()) / 1000}s.`;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-destructive/10 border-t border-destructive/40 backdrop-blur px-4 py-2">
      <div className="max-w-2xl mx-auto flex items-start gap-2">
        <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 text-[11px] leading-snug">
          <p className="font-semibold text-destructive">
            {spike
              ? `Startup issues detected — ${remoteCount} report(s) in the last ${WINDOW_MINUTES} minutes.`
              : `This device needed ${localAttempts} retry attempt(s) to start.`}
          </p>
          <p className="text-muted-foreground">
            {online ? nextRetry : "Waiting for connectivity — we'll retry automatically once you're back online."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss incident banner"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground p-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default IncidentBanner;
