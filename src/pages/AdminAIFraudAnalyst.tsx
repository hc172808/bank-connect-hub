import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Loader2, Download } from "lucide-react";

const AdminAIFraudAnalyst = () => {
  const navigate = useNavigate();
  const [details, setDetails] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const loadRecent = async () => {
    setLoadingRecent(true);
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data, error } = await supabase
      .from("transactions")
      .select("id, sender_id, receiver_id, amount, fee, status, transaction_type, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(150);
    setLoadingRecent(false);
    if (error) return toast.error(error.message);
    const lines = (data ?? []).map(
      (t) =>
        `${t.created_at} | ${t.transaction_type} | ${t.status} | $${t.amount} (fee ${t.fee}) | from ${t.sender_id.slice(0, 8)} -> to ${t.receiver_id.slice(0, 8)}`,
    );
    setDetails(`Transactions from the last 7 days (${lines.length}):\n${lines.join("\n")}`);
  };

  const analyze = async () => {
    setLoading(true);
    setAnalysis("");
    const { data, error } = await supabase.functions.invoke("ai-fraud-analyst", { body: { details } });
    setLoading(false);
    if (error) {
      let msg = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) msg = (await ctx.json())?.error ?? msg;
      } catch { /* keep */ }
      return toast.error(msg);
    }
    if (data?.error) return toast.error(data.error);
    setAnalysis(data?.analysis ?? "");
  };

  const download = () => {
    const blob = new Blob([analysis], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fraud-analysis-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> AI Fraud Analyst
        </h1>
      </header>

      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste transactions, login/device activity or account notes. Don't include passwords, PINs or private keys.
              The AI only advises — it never changes accounts or balances.
            </p>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={12}
              maxLength={30000}
              placeholder="e.g. User 3f2a… sent $950 to 6 new recipients between 02:10 and 02:25, then changed phone number…"
            />
            <div className="flex flex-wrap gap-2 justify-between items-center">
              <Button variant="outline" size="sm" onClick={loadRecent} disabled={loadingRecent || loading}>
                {loadingRecent && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Load last 7 days of transactions
              </Button>
              <span className="text-xs text-muted-foreground">{details.length.toLocaleString()} / 30,000</span>
            </div>
            <Button className="w-full" onClick={analyze} disabled={loading || details.trim().length < 10}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {loading ? "Analysing…" : "Analyse with AI"}
            </Button>
          </CardContent>
        </Card>

        {analysis && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Analysis</CardTitle>
              <Button variant="ghost" size="sm" onClick={download}>
                <Download className="h-4 w-4 mr-1" /> Save
              </Button>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{analysis}</ReactMarkdown>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminAIFraudAnalyst;
