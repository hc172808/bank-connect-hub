import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface FundingEvent {
  id: string;
  transactionId: string | null;
  actorId: string;
  actorName: string | null;
  targetId: string;
  targetName: string | null;
  amount: number | string;
  currency: string;
  balanceBefore: number | string | null;
  balanceAfter: number | string | null;
  createdAt: string;
  source: "audit" | "transaction";
  status: string;
}

interface FundingActivityResponse {
  events?: FundingEvent[];
  auditConfigured?: boolean;
  error?: string;
}

interface AdminFundingActivityProps {
  userId?: string;
}

function formatMoney(value: number | string | null, currency: string) {
  if (value === null) return "Not captured";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Unavailable";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || "USD"}`;
  }
}

function formatTimestamp(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unknown time"
    : timestamp.toLocaleString();
}

export default function AdminFundingActivity({ userId }: AdminFundingActivityProps) {
  const [events, setEvents] = useState<FundingEvent[]>([]);
  const [auditConfigured, setAuditConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");

      const params = new URLSearchParams({ limit: "100" });
      if (userId) params.set("userId", userId);
      const response = await fetch(`/api/admin/funds/activity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({})) as FundingActivityResponse;
      if (!response.ok) throw new Error(result.error || "Could not load funding activity.");
      setEvents(result.events || []);
      setAuditConfigured(result.auditConfigured !== false);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Internal fund activity</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin and founder credits, with the recipient, amount, balance, and timestamp.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!auditConfigured && (
          <div role="status" className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The detailed audit migration is not active in Supabase yet. Older transaction entries are shown below, but their balance change cannot be verified.
            </span>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading && events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading fund activity…</p>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No admin fund entries found.</p>
        ) : (
          <div className="max-h-[32rem] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Added by</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance before</TableHead>
                  <TableHead className="text-right">Balance after</TableHead>
                  <TableHead>Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatTimestamp(event.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{event.targetName || "Unknown user"}</div>
                      <code className="text-xs text-muted-foreground">{event.targetId.slice(0, 8)}…</code>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{event.actorName || "Unknown staff"}</div>
                      <code className="text-xs text-muted-foreground">{event.actorId.slice(0, 8)}…</code>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(event.amount, event.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(event.balanceBefore, event.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(event.balanceAfter, event.currency)}
                    </TableCell>
                    <TableCell>
                      {event.source === "audit" ? (
                        <Badge variant="secondary">Verified audit</Badge>
                      ) : (
                        <Badge variant="outline" className="whitespace-nowrap">Legacy transaction</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
