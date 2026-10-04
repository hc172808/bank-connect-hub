import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Cpu,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  getSystemDoctorSettings,
  runSystemDoctorDiagnostics,
  updateSystemDoctorSettings,
  type SystemDoctorCheck,
  type SystemDoctorResult,
  type SystemDoctorSettings,
} from "@/lib/systemDoctor";

type CheckStatus = SystemDoctorCheck["status"];

const statusPresentation: Record<
  CheckStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  ok: {
    label: "Operational",
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  warning: {
    label: "Attention",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    Icon: AlertTriangle,
  },
  error: {
    label: "Issue detected",
    className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    Icon: XCircle,
  },
  unknown: {
    label: "Unknown",
    className: "border-border bg-muted/70 text-muted-foreground",
    Icon: AlertCircle,
  },
};

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected request error occurred.";
}

function ErrorNotice({
  title,
  message,
  testId,
}: {
  title: string;
  message: string;
  testId: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex gap-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.07] p-3.5 text-sm"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
      <div className="min-w-0">
        <p className="font-semibold text-rose-800 dark:text-rose-200">{title}</p>
        <p className="mt-0.5 break-words text-rose-800/80 dark:text-rose-200/80">{message}</p>
      </div>
    </div>
  );
}

export default function SystemDoctorPanel() {
  const [settings, setSettings] = useState<SystemDoctorSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [result, setResult] = useState<SystemDoctorResult | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const nextResult = await runSystemDoctorDiagnostics();
      setResult(nextResult);
    } catch (error) {
      setDiagnosticsError(errorMessage(error));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setSettingsLoading(true);
    getSystemDoctorSettings()
      .then((loadedSettings) => {
        if (active) {
          setSettings(loadedSettings);
          setSettingsError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setSettingsError(errorMessage(error));
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveAISetting = async (aiEnabled: boolean) => {
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const savedSettings = await updateSystemDoctorSettings(aiEnabled);
      setSettings(savedSettings);
    } catch (error) {
      setSettingsError(errorMessage(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const checkCounts = (result?.checks ?? []).reduce(
    (counts, check) => {
      counts[check.status] += 1;
      return counts;
    },
    { ok: 0, warning: 0, error: 0, unknown: 0 },
  );

  const analysisMessage =
    result?.analysisStatus === "disabled"
      ? "AI analysis is disabled. Diagnostics still run and report system checks."
      : result?.analysisStatus === "unavailable"
        ? "Analysis is unavailable for this run. Review the individual diagnostic checks below."
        : result?.analysis?.trim()
          ? result.analysis
          : "No analysis text was returned. Use the checks below as the source of diagnostic results.";

  return (
    <section aria-labelledby="system-doctor-heading" className="space-y-4">
      <Card className="overflow-hidden border-border/80 bg-card shadow-sm">
        <div className="h-1 bg-gradient-to-r from-teal-600 via-cyan-600 to-sky-500" />
        <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600/10 text-teal-700 dark:text-teal-300">
                <Activity className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle id="system-doctor-heading" className="text-lg tracking-tight">
                  System Doctor
                </CardTitle>
                <CardDescription className="text-xs">
                  Read-only service diagnostics and AI-assisted analysis
                </CardDescription>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runDiagnostics()}
            disabled={diagnosticsLoading}
            data-testid="button-rerun-diagnostics"
            className="w-full shrink-0 border-teal-700/20 bg-background hover:bg-teal-700/[0.06] sm:w-auto"
          >
            {diagnosticsLoading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {diagnosticsLoading ? "Checking…" : "Run diagnostics"}
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {settingsError && (
            <ErrorNotice
              title="AI setting could not be loaded or saved"
              message={settingsError}
              testId="error-system-doctor-settings"
            />
          )}
          {diagnosticsError && (
            <ErrorNotice
              title="Diagnostics request failed"
              message={diagnosticsError}
              testId="error-system-doctor-diagnostics"
            />
          )}

          <div className="grid gap-3 rounded-xl border border-border/80 bg-muted/30 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600/10 text-teal-700 dark:text-teal-300">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">AI analysis</p>
                <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  Controls whether Grok analyzes diagnostic results. Only service status and
                  aggregate boot-error counts are sent; account data is not. System checks remain
                  available when this is off.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span
                data-testid="status-ai-analysis-setting"
                className="text-xs font-medium text-muted-foreground"
              >
                {settingsLoading
                  ? "Loading setting"
                  : settingsSaving
                    ? "Saving…"
                    : settings?.aiEnabled
                      ? "Enabled"
                      : settings
                        ? "Disabled"
                        : "Unavailable"}
              </span>
              <Switch
                checked={settings?.aiEnabled ?? false}
                onCheckedChange={(value) => void saveAISetting(value)}
                disabled={settingsLoading || settingsSaving || !settings}
                aria-label="Enable AI analysis"
                data-testid="switch-ai-analysis"
              />
            </div>
          </div>

          <div
            role="note"
            data-testid="status-automatic-repairs-disabled"
            className="flex items-center gap-2 rounded-lg border border-sky-700/15 bg-sky-700/[0.045] px-3.5 py-3 text-xs text-foreground/80"
          >
            <LockKeyhole className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-foreground">Automatic repairs are disabled.</strong>{" "}
              System Doctor reports findings only; no changes are applied to services.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Diagnostic checks</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {result
                ? `${result.checks.length} checks returned`
                : "Live status from the latest diagnostics run"}
            </CardDescription>
          </div>
          {result && (
            <div
              className="flex flex-wrap justify-end gap-1.5"
              data-testid="summary-diagnostic-status-counts"
              aria-label="Diagnostic status counts"
            >
              {checkCounts.error > 0 && (
                <Badge className="border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                  {checkCounts.error} issue{checkCounts.error === 1 ? "" : "s"}
                </Badge>
              )}
              {checkCounts.warning > 0 && (
                <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  {checkCounts.warning} attention
                </Badge>
              )}
              {checkCounts.ok > 0 && (
                <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  {checkCounts.ok} operational
                </Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {diagnosticsLoading && !result ? (
            <div
              data-testid="loading-system-doctor-diagnostics"
              className="space-y-3 py-2"
              aria-label="Loading diagnostics"
            >
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-3 rounded-lg border p-3.5">
                  <div className="h-8 w-8 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-muted" />
                    <div className="h-2.5 w-2/3 rounded bg-muted" />
                  </div>
                  <div className="h-5 w-20 rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : result?.checks.length ? (
            <div className="divide-y divide-border/70" data-testid="list-system-doctor-checks">
              {result.checks.map((check) => {
                const { label, className, Icon } = statusPresentation[check.status];
                return (
                  <article
                    key={check.id}
                    data-testid={`result-check-${check.id}`}
                    className="flex flex-col gap-3 py-3.5 first:pt-1 last:pb-1 sm:flex-row sm:items-start"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/75 text-muted-foreground">
                      <Icon
                        className={`h-4 w-4 ${
                          check.status === "ok"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : check.status === "warning"
                              ? "text-amber-700 dark:text-amber-300"
                              : check.status === "error"
                                ? "text-rose-700 dark:text-rose-300"
                                : ""
                        }`}
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold" data-testid={`text-check-label-${check.id}`}>
                          {check.label}
                        </h4>
                        <Badge
                          variant="outline"
                          className={`px-2 py-0.5 text-[10px] font-semibold ${className}`}
                          data-testid={`status-check-${check.id}`}
                        >
                          {label}
                        </Badge>
                      </div>
                      <p
                        className="mt-1 text-xs leading-relaxed text-muted-foreground"
                        data-testid={`text-check-detail-${check.id}`}
                      >
                        {check.detail}
                      </p>
                    </div>
                    {typeof check.latencyMs === "number" && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 pl-11 text-[11px] tabular-nums text-muted-foreground sm:pl-0"
                        data-testid={`text-check-latency-${check.id}`}
                      >
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        {check.latencyMs} ms
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          ) : result ? (
            <div
              data-testid="empty-system-doctor-checks"
              className="flex flex-col items-center rounded-xl border border-dashed border-border px-5 py-8 text-center"
            >
              <ShieldCheck className="h-8 w-8 text-muted-foreground/70" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">No checks returned</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The diagnostic run completed without any check records.
              </p>
            </div>
          ) : diagnosticsError ? (
            <div
              data-testid="empty-system-doctor-result"
              className="rounded-xl border border-dashed border-border px-5 py-8 text-center"
            >
              <p className="text-sm font-medium">No diagnostic results yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run diagnostics again to request the latest system status.
              </p>
            </div>
          ) : (
            <div
              data-testid="empty-system-doctor-result"
              className="rounded-xl border border-dashed border-border px-5 py-8 text-center"
            >
              <p className="text-sm font-medium">Waiting for diagnostics</p>
              <p className="mt-1 text-xs text-muted-foreground">
                System checks will appear here when the first run completes.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-700 dark:text-indigo-300">
              <Cpu className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base">AI analysis</CardTitle>
              <CardDescription className="mt-1 text-xs">
                Context for operators, not an automated action
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {result ? (
            <>
              <div
                data-testid="result-system-doctor-analysis"
                className="rounded-lg border border-border/80 bg-muted/25 px-4 py-3.5 text-sm leading-relaxed text-foreground/90"
              >
                {analysisMessage}
              </div>
              <Separator />
              <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span
                    data-testid="status-system-doctor-analysis"
                    className="inline-flex items-center gap-1.5"
                  >
                    {result.analysisStatus === "complete" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Analysis {result.analysisStatus}
                  </span>
                  {result.model && (
                    <span className="inline-flex items-center gap-1.5" data-testid="text-system-doctor-model">
                      <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                      {result.model}
                    </span>
                  )}
                </div>
                <time
                  data-testid="text-system-doctor-checked-at"
                  dateTime={result.checkedAt}
                  className="inline-flex items-center gap-1.5 tabular-nums"
                >
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Checked {formatCheckedAt(result.checkedAt)}
                </time>
              </div>
            </>
          ) : (
            <div
              data-testid="empty-system-doctor-analysis"
              className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground"
            >
              Analysis details will appear after diagnostics complete.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}