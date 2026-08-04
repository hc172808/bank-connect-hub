import { useEffect, useState } from "react";
import { buildSnapshot, snapshotToText, clearBootState, BootSnapshot } from "@/lib/bootDiagnostics";

/**
 * Hidden diagnostics panel.
 * Opened by tapping the logo 5 times (or the "Diagnostics" link when stalled).
 * Shows bootstrap timestamps, failure reason and the retry schedule, and lets
 * the user copy the whole report when filing an issue.
 */
export const BootDiagnosticsPanel = ({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: string | null;
  onClose: () => void;
}) => {
  const [snap, setSnap] = useState<BootSnapshot | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setSnap(buildSnapshot(reason));
    refresh();
    const iv = setInterval(refresh, 1000);
    return () => clearInterval(iv);
  }, [open, reason]);

  if (!open || !snap) return null;
  const text = snapshotToText(snap);

  return (
    <div className="fixed inset-0 z-[999] bg-background/95 backdrop-blur-sm overflow-y-auto p-4">
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Bootstrap diagnostics</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground"
          >
            Close
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <dt className="text-muted-foreground">first seen</dt><dd className="text-foreground break-all">{snap.firstSeen ?? "—"}</dd>
          <dt className="text-muted-foreground">last attempt</dt><dd className="text-foreground break-all">{snap.lastAttempt ?? "—"}</dd>
          <dt className="text-muted-foreground">attempts</dt><dd className="text-foreground">{snap.attempts}</dd>
          <dt className="text-muted-foreground">backoff step</dt><dd className="text-foreground">{snap.backoffStep}</dd>
          <dt className="text-muted-foreground">next retry</dt>
          <dd className="text-foreground break-all">
            {snap.nextRetryAt ? `${snap.nextRetryAt} (${snap.nextRetryInSeconds}s)` : "—"}
          </dd>
          <dt className="text-muted-foreground">schedule</dt><dd className="text-foreground break-all">{snap.schedule}</dd>
          <dt className="text-muted-foreground">last step</dt><dd className="text-foreground break-all">{snap.lastStep ?? "—"}</dd>
          <dt className="text-muted-foreground">network</dt><dd className="text-foreground">{snap.online ? "online" : "offline"}</dd>
        </dl>

        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <p className="text-[11px] font-semibold text-destructive mb-1">Failure reason</p>
          <p className="text-[11px] font-mono text-foreground break-words">{snap.reason ?? "none recorded"}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Timeline</p>
          <div className="rounded-md border border-border max-h-56 overflow-y-auto divide-y divide-border">
            {snap.timeline.length === 0 && (
              <p className="text-[11px] font-mono text-muted-foreground p-2">no events recorded</p>
            )}
            {snap.timeline.map((e, i) => (
              <div key={i} className="p-1.5 text-[10px] font-mono">
                <span className="text-muted-foreground">{e.at}</span>{" "}
                <span className="text-foreground">{e.step}</span>
                {e.detail && <span className="text-destructive break-words"> — {e.detail}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pb-6">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                const ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
          >
            {copied ? "Copied!" : "Copy report"}
          </button>
          <button
            type="button"
            onClick={() => { clearBootState(); window.location.reload(); }}
            className="px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground"
          >
            Reset & reload
          </button>
        </div>
      </div>
    </div>
  );
};

export default BootDiagnosticsPanel;
