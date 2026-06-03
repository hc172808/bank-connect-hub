import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Terminal } from "lucide-react";

interface Line {
  t: "in" | "out" | "err";
  text: string;
  ts: string;
}

const HELP = `Available commands:
  help                 — show this list
  process-reversals    — release reversal funds whose 1h hold is up
  recalc-balances      — recompute every wallet balance from transactions
  clear-stale-sessions — revoke device sessions inactive >30 days
  kyc-stats            — counts of KYC submissions by status
  tx-stats             — transaction totals (today / 7d / 30d)
  flag-large-tx [amt]  — list completed transactions >= amount (default 10000)
  alerts-open          — list open suspicious-activity alerts`;

const AdminConsole = () => {
  const nav = useNavigate();
  const [history, setHistory] = useState<Line[]>([
    { t: "out", text: "Admin Console — type 'help' to see commands.", ts: new Date().toISOString() },
  ]);
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const push = (line: Line) => setHistory((h) => [...h, line]);

  const run = async () => {
    const command = cmd.trim();
    if (!command) return;
    setCmd("");
    push({ t: "in", text: `$ ${command}`, ts: new Date().toISOString() });

    if (command === "help") {
      push({ t: "out", text: HELP, ts: new Date().toISOString() });
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-console", {
        body: { command },
      });
      if (error) {
        push({ t: "err", text: `Error: ${error.message}`, ts: new Date().toISOString() });
      } else {
        const out = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        push({ t: "out", text: out, ts: new Date().toISOString() });
      }
    } catch (e) {
      push({ t: "err", text: String(e), ts: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 flex flex-col">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Terminal className="h-5 w-5" /> Admin Console
        </h1>
      </header>

      <div className="flex-1 p-3">
        <div className="bg-black text-green-400 font-mono text-xs rounded-lg p-3 h-[60vh] overflow-y-auto">
          {history.map((l, i) => (
            <pre
              key={i}
              className={`whitespace-pre-wrap break-words ${
                l.t === "err" ? "text-red-400" : l.t === "in" ? "text-yellow-300" : "text-green-400"
              }`}
            >
              {l.text}
            </pre>
          ))}
          <div ref={endRef} />
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="type a command (e.g. help)"
            className="font-mono"
            disabled={busy}
          />
          <Button type="submit" disabled={busy}>
            Run
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AdminConsole;