import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Terminal, RefreshCw, CheckCircle2, XCircle,
  Loader2, Play, Trash2, ChevronDown, ChevronRight, Cpu,
  Package, Shield, HardDrive, Layers, Server, ListChecks,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Line { t: "in" | "out" | "err" | "sys"; text: string; }

interface ServiceStatus {
  buildServer?: { ok: boolean; version?: string };
  java?:        { ok: boolean; version?: string | null };
  node?:        { ok: boolean; version?: string | null };
  npm?:         { ok: boolean; version?: string | null };
  androidSdk?:  { ok: boolean; path?: string };
  androidPlatform?: { ok: boolean; platform?: string };
  debugKeystore?: { ok: boolean };
  localProperties?: { ok: boolean };
  packages?:    Record<string, string | null>;
  system?:      { diskFree?: string | null; memFree?: string | null };
}

interface TodoItem { id: string; name: string; status: "done" | "progress" | "pending" | "blocked"; }
interface TodoSection { title: string; items: TodoItem[]; }
interface TodoData { sections: TodoSection[]; total: number; done: number; exists: boolean; }

// ─── Quick-action presets ─────────────────────────────────────────────────────
const QUICK = [
  { label: "npm install",       cmd: "npm install 2>&1 | tail -5" },
  { label: "Check Android SDK", cmd: "ls /home/runner/android-sdk/build-tools/34.0.0/aapt && echo 'SDK OK' || echo 'SDK MISSING'" },
  { label: "Reinstall SDK",     cmd: "curl -sL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/ct.zip && unzip -q /tmp/ct.zip -d /home/runner/android-sdk/cmdline-tools && mv /home/runner/android-sdk/cmdline-tools/cmdline-tools /home/runner/android-sdk/cmdline-tools/latest && rm /tmp/ct.zip && yes | sdkmanager --licenses --sdk_root=/home/runner/android-sdk >/dev/null 2>&1 && sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;34.0.0' --sdk_root=/home/runner/android-sdk && echo 'SDK installed'" },
  { label: "Fix local.properties", cmd: "echo 'sdk.dir=/home/runner/android-sdk' > android/local.properties && cat android/local.properties" },
  { label: "Java version",      cmd: "java -version 2>&1" },
  { label: "Node version",      cmd: "node --version && npm --version" },
  { label: "Disk & memory",     cmd: "df -h / && free -h" },
  { label: "List APKs",         cmd: "ls -lh *.apk 2>/dev/null || echo 'No APKs found'" },
  { label: "Build history",     cmd: "cat .local/builds.json 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.slice(0,5).forEach(b=>console.log(b.id,b.version,b.buildType,b.status,b.startedAt))\" || echo 'No build history'" },
  { label: "ps aux (server)",   cmd: "ps aux | grep -E 'node|gradle|java' | grep -v grep" },
  { label: "Git status",        cmd: "git --no-optional-locks status --short" },
  { label: "Git log",           cmd: "git --no-optional-locks log --oneline -8" },
  { label: "Env check",         cmd: "echo \"ANDROID_HOME=$ANDROID_HOME\" && echo \"JAVA_HOME=$JAVA_HOME\" && echo \"PATH snippet: $(echo $PATH | tr ':' '\\n' | grep -E 'android|java|nix' | head -5 | tr '\\n' ':')\"" },
];

// ─── Service row ─────────────────────────────────────────────────────────────
const SvcRow = ({ label, ok, detail }: { label: string; ok?: boolean; detail?: string | null }) => (
  <div className="flex items-center gap-2 py-1.5 border-b last:border-0">
    {ok === undefined ? (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    ) : ok ? (
      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
    )}
    <span className="text-sm font-medium w-36 shrink-0">{label}</span>
    <span className="text-xs text-muted-foreground truncate">{detail ?? (ok === undefined ? "checking…" : ok ? "OK" : "MISSING")}</span>
  </div>
);

// ─── Todo section row ─────────────────────────────────────────────────────────
const TodoSec = ({ sec }: { sec: TodoSection }) => {
  const [open, setOpen] = useState(false);
  const done = sec.items.filter(i => i.status === "done").length;
  const pct  = sec.items.length ? Math.round((done / sec.items.length) * 100) : 0;
  return (
    <div className="border rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-3 text-left bg-muted/30 hover:bg-muted/60 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-medium text-sm flex-1">{sec.title}</span>
        <span className="text-xs text-muted-foreground mr-2">{done}/{sec.items.length}</span>
        <div className="w-24">
          <Progress value={pct} className="h-1.5" />
        </div>
        <span className="text-xs w-8 text-right">{pct}%</span>
      </button>
      {open && (
        <div className="divide-y">
          {sec.items.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
              {item.status === "done"     && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
              {item.status === "progress" && <Loader2      className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-spin" />}
              {item.status === "pending"  && <div          className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground shrink-0" />}
              {item.status === "blocked"  && <XCircle      className="h-3.5 w-3.5 text-orange-400 shrink-0" />}
              <span className={item.status === "done" ? "text-muted-foreground line-through" : ""}>{item.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{item.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
type Tab = "terminal" | "services" | "todo";

export default function AdminConsole() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("terminal");

  // Terminal state
  const [lines, setLines]   = useState<Line[]>([{ t: "sys", text: "System Terminal — ready. Type a command or use Quick Actions below." }]);
  const [cmd, setCmd]       = useState("");
  const [running, setRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Services state
  const [svc, setSvc]           = useState<ServiceStatus | null>(null);
  const [svcLoading, setSvcLoading] = useState(false);

  // Todo state
  const [todo, setTodo]         = useState<TodoData | null>(null);
  const [todoLoading, setTodoLoading] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  // ── Services ────────────────────────────────────────────────────────────────
  const loadServices = useCallback(async () => {
    setSvcLoading(true);
    try {
      const r = await fetch("/api/services/status");
      if (r.ok) setSvc(await r.json());
    } finally { setSvcLoading(false); }
  }, []);

  // ── Todo ────────────────────────────────────────────────────────────────────
  const loadTodo = useCallback(async () => {
    setTodoLoading(true);
    try {
      const r = await fetch("/api/todo");
      if (r.ok) setTodo(await r.json());
    } finally { setTodoLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "services" && !svc) loadServices();
    if (tab === "todo"     && !todo) loadTodo();
  }, [tab]);

  // ── Run command ─────────────────────────────────────────────────────────────
  const push = (line: Line) => setLines(prev => [...prev, line]);

  const runCmd = useCallback(async (command: string) => {
    const c = command.trim();
    if (!c) return;
    setCmd("");
    setHistIdx(-1);
    setCmdHistory(h => [c, ...h.filter(x => x !== c).slice(0, 49)]);
    push({ t: "in", text: `$ ${c}` });
    setRunning(true);

    const ctrl = new AbortController();
    let buffer = "";

    const flushBuffer = () => {
      if (!buffer) return;
      const lines = buffer.split("\n");
      // keep incomplete last fragment in buffer
      buffer = lines.pop() ?? "";
      for (const l of lines) push({ t: "out", text: l });
    };

    try {
      const res = await fetch("/api/bash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: c }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        push({ t: "err", text: `Server error: ${res.status} ${res.statusText}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() ?? "";
        for (const ev of events) {
          for (const raw of ev.split("\n")) {
            if (!raw.startsWith("data: ")) continue;
            try {
              const msg = JSON.parse(raw.slice(6));
              if (msg.type === "out" || msg.type === "err") {
                buffer += msg.text;
                flushBuffer();
                if (msg.type === "err" && buffer) push({ t: "err", text: buffer }), (buffer = "");
              } else if (msg.type === "done") {
                if (buffer) { push({ t: "out", text: buffer }); buffer = ""; }
                push({ t: "sys", text: `── exited ${msg.code === 0 ? "OK (0)" : `with code ${msg.code}`}` });
              }
            } catch {}
          }
        }
      }
      if (buffer) { push({ t: "out", text: buffer }); }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        push({ t: "err", text: String(err) });
      }
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(idx);
      setCmd(cmdHistory[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setCmd(idx === -1 ? "" : cmdHistory[idx] ?? "");
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground hover:bg-primary/80">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Terminal className="h-5 w-5" />
        <h1 className="text-xl font-bold flex-1">System Terminal</h1>
        <span className="text-xs opacity-70">Admin only</span>
      </header>

      {/* Tabs */}
      <div className="flex border-b shrink-0">
        {([
          { key: "terminal", label: "Terminal",   icon: <Terminal  className="h-4 w-4" /> },
          { key: "services", label: "Services",   icon: <Server    className="h-4 w-4" /> },
          { key: "todo",     label: "TODO",       icon: <ListChecks className="h-4 w-4" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TERMINAL TAB ─────────────────────────────────────────────────────── */}
      {tab === "terminal" && (
        <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3">
          {/* Quick actions */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(q => (
              <Button
                key={q.label}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={running}
                onClick={() => runCmd(q.cmd)}
              >
                {q.label}
              </Button>
            ))}
          </div>

          {/* Log output */}
          <div
            className="flex-1 bg-black text-green-400 font-mono text-xs rounded-lg p-3 overflow-y-auto min-h-[300px] cursor-text"
            onClick={() => inputRef.current?.focus()}
          >
            {lines.map((l, i) => (
              <pre
                key={i}
                className={`whitespace-pre-wrap break-all leading-5 ${
                  l.t === "in"  ? "text-yellow-300" :
                  l.t === "err" ? "text-red-400"    :
                  l.t === "sys" ? "text-blue-400 opacity-70" :
                                  "text-green-400"
                }`}
              >
                {l.text}
              </pre>
            ))}
            {running && <div className="text-yellow-300 animate-pulse">▋</div>}
            <div ref={endRef} />
          </div>

          {/* Input bar */}
          <form
            className="flex gap-2"
            onSubmit={e => { e.preventDefault(); runCmd(cmd); }}
          >
            <span className="self-center text-sm font-mono text-muted-foreground select-none">$</span>
            <Input
              ref={inputRef}
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Enter bash command… (↑↓ for history)"
              className="font-mono text-sm flex-1"
              disabled={running}
              autoFocus
            />
            <Button type="submit" disabled={running || !cmd.trim()} size="sm">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines([{ t: "sys", text: "Terminal cleared." }])}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {/* ── SERVICES TAB ─────────────────────────────────────────────────────── */}
      {tab === "services" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">System Services Health</h2>
            <Button size="sm" variant="outline" onClick={loadServices} disabled={svcLoading}>
              {svcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {/* Overall status banner */}
          {svc && (() => {
            const allOk = svc.buildServer?.ok && svc.java?.ok && svc.androidSdk?.ok && svc.debugKeystore?.ok && svc.localProperties?.ok;
            return (
              <div className={`rounded-lg p-3 flex items-center gap-2 text-sm font-medium ${allOk ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                {allOk ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {allOk ? "All core services are healthy — ready to build APKs." : "One or more services need attention. Use the Terminal tab to fix them."}
              </div>
            );
          })()}

          {/* Core services */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Server className="h-4 w-4" /> Core Services
            </div>
            <SvcRow label="Build Server"  ok={svc?.buildServer?.ok}       detail={svc?.buildServer?.version ? `v${svc.buildServer.version}` : undefined} />
            <SvcRow label="Java"          ok={svc?.java?.ok}              detail={svc?.java?.version} />
            <SvcRow label="Node.js"       ok={svc?.node?.ok}              detail={svc?.node?.version} />
            <SvcRow label="npm"           ok={svc?.npm?.ok}               detail={svc?.npm?.version} />
          </div>

          {/* Android SDK */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Cpu className="h-4 w-4" /> Android Build Chain
            </div>
            <SvcRow label="Android SDK"       ok={svc?.androidSdk?.ok}       detail={svc?.androidSdk?.path} />
            <SvcRow label="Android Platform"  ok={svc?.androidPlatform?.ok}  detail={svc?.androidPlatform?.platform} />
            <SvcRow label="Debug Keystore"    ok={svc?.debugKeystore?.ok}    detail={svc?.debugKeystore?.ok ? "android/debug.keystore" : undefined} />
            <SvcRow label="local.properties"  ok={svc?.localProperties?.ok}  detail={svc?.localProperties?.ok ? "sdk.dir set correctly" : "sdk.dir missing or path not found"} />
          </div>

          {/* npm packages */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Package className="h-4 w-4" /> Server npm Packages
            </div>
            {svc?.packages ? Object.entries(svc.packages).map(([pkg, ver]) => (
              <SvcRow key={pkg} label={pkg} ok={ver !== null} detail={ver ?? "NOT INSTALLED"} />
            )) : <SvcRow label="Loading…" ok={undefined} />}
          </div>

          {/* System resources */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <HardDrive className="h-4 w-4" /> System Resources
            </div>
            <SvcRow label="Disk free"  ok={!!svc?.system?.diskFree} detail={svc?.system?.diskFree ?? undefined} />
            <SvcRow label="RAM free"   ok={!!svc?.system?.memFree}  detail={svc?.system?.memFree ?? undefined} />
          </div>

          {/* Quick fix buttons */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Shield className="h-4 w-4" /> Quick Fixes
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setTab("terminal"); setTimeout(() => runCmd("npm install 2>&1 | tail -10"), 100); }}>
                npm install
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setTab("terminal"); setTimeout(() => runCmd("echo 'sdk.dir=/home/runner/android-sdk' > android/local.properties && cat android/local.properties"), 100); }}>
                Fix local.properties
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setTab("terminal"); setTimeout(() => runCmd("bash build-apk.sh --version 1.0.0 --type debug 2>&1 | tail -30"), 100); }}>
                Test Build
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── TODO TAB ─────────────────────────────────────────────────────────── */}
      {tab === "todo" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Project TODO (from TODO.md)</h2>
            <Button size="sm" variant="outline" onClick={loadTodo} disabled={todoLoading}>
              {todoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {todoLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {todo && !todoLoading && (
            <>
              {/* Summary */}
              <div className="border rounded-lg p-4 bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Overall Progress</span>
                  <span className="text-sm text-muted-foreground">{todo.done} / {todo.total} done</span>
                </div>
                <Progress value={todo.total ? Math.round((todo.done / todo.total) * 100) : 0} className="h-2.5" />
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {todo.done} done</span>
                  <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 text-blue-500" /> {todo.sections.reduce((a,s)=>a+s.items.filter(i=>i.status==="progress").length,0)} in progress</span>
                  <span className="flex items-center gap-1"><div className="h-3 w-3 rounded-full border-2 border-muted-foreground" /> {todo.total - todo.done} pending</span>
                </div>
              </div>

              {/* Pending summary (just pending items) */}
              {(() => {
                const pending = todo.sections.flatMap(s => s.items.filter(i => i.status === "pending" || i.status === "progress")).slice(0, 10);
                if (!pending.length) return null;
                return (
                  <div className="border rounded-lg p-3 bg-amber-50 border-amber-200">
                    <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-amber-800">
                      <Layers className="h-4 w-4" /> Next up (pending / in progress)
                    </div>
                    <ul className="space-y-1">
                      {pending.map(item => (
                        <li key={item.id} className="flex items-center gap-2 text-sm text-amber-900">
                          {item.status === "progress"
                            ? <Loader2 className="h-3 w-3 text-blue-500 shrink-0 animate-spin" />
                            : <div className="h-3 w-3 rounded-full border-2 border-amber-400 shrink-0" />}
                          {item.name}
                          <span className="ml-auto text-[10px] opacity-60">{item.id}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* All sections */}
              <div>
                {todo.sections.map((sec, i) => <TodoSec key={i} sec={sec} />)}
              </div>
            </>
          )}

          {!todo && !todoLoading && (
            <div className="text-center py-12 text-muted-foreground">
              <ListChecks className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>TODO.md not found or failed to load.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
