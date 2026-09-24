import express from "express";
import cors from "cors";
import { spawn, execSync, exec, execFileSync } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";
import crypto from "crypto";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env file into process.env (Replit doesn't auto-load it for child procs) ──
try {
  const dotenvPath = path.join(__dirname, ".env");
  if (fs.existsSync(dotenvPath)) {
    const raw = fs.readFileSync(dotenvPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
    console.log("[build-server] Loaded .env file");
  }
} catch (e) {
  console.warn("[build-server] Could not load .env:", e.message);
}

const app = express();
const PORT = 3001;
const BUILDS_FILE = path.join(__dirname, ".local", "builds.json");

app.use(cors());
app.use(express.json());

// ── No-cache headers on all responses ────────────────────────────────────────
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Prefer the project reference when it is available. This keeps a stale
// VITE_SUPABASE_URL from pointing the browser at an older Supabase project
// after the project is switched in Replit Secrets.
function getSupabaseUrl() {
  const projectId = (
    process.env.VITE_SUPABASE_PROJECT_ID ||
    process.env.SUPABASE_PROJECT_ID ||
    process.env.PROJECT_ID ||
    ""
  ).trim();
  const configuredUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).trim();
  const requestedProjectUrl = "https://ocngdgwelxaiyzdywjld.supabase.co";
  const legacyProjectRef = "pdsjwvcxolifgvwjvtwy";

  // Migration guard for the previous project. Remove this branch after the
  // Replit secret has been replaced with the new project URL/reference.
  if (projectId === legacyProjectRef || configuredUrl.includes(`${legacyProjectRef}.supabase.co`)) {
    return requestedProjectUrl;
  }
  // SUPABASE_URL is the authoritative server-side setting. PROJECT_ID can be
  // a Replit project id rather than a Supabase project ref, and deriving a
  // hostname from it can silently point the browser at a nonexistent project.
  if (configuredUrl) {
    return configuredUrl;
  }
  if (/^[a-z0-9]{20}$/.test(projectId)) {
    return `https://${projectId}.supabase.co`;
  }
  return configuredUrl;
}

// ── Persistence ──────────────────────────────────────────────────────────────
function loadBuilds() {
  try {
    if (fs.existsSync(BUILDS_FILE)) return JSON.parse(fs.readFileSync(BUILDS_FILE, "utf-8"));
  } catch {}
  return [];
}
function saveBuilds(builds) {
  fs.mkdirSync(path.dirname(BUILDS_FILE), { recursive: true });
  fs.writeFileSync(BUILDS_FILE, JSON.stringify(builds, null, 2));
}

// ── Resolve JAVA_HOME once at startup (not per-request) ──────────────────────
let RESOLVED_JAVA_HOME = process.env.JAVA_HOME || "";
try {
  RESOLVED_JAVA_HOME = execSync(
    "dirname $(dirname $(readlink -f $(which java) 2>/dev/null || echo /usr/bin/java))",
    { stdio: "pipe", timeout: 5000 }
  ).toString().trim();
} catch { /* keep whatever was in JAVA_HOME env */ }

// ── In-memory current build ──────────────────────────────────────────────────
let current = null; // { id, proc, logs[], status, listeners[] }

// ── SSE helpers ──────────────────────────────────────────────────────────────
function sseInit(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}
function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/health — liveness check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// GET /api/config — serve public client config (keeps secrets off the browser bundle)
// Header-safe: strip quotes/whitespace and drop values with non-ASCII
// characters (smart quotes, en-dashes, non-breaking spaces) that would make
// every browser fetch fail with "String contains non ISO-8859-1 code point".
function headerSafe(value, label) {
  const cleaned = String(value || "")
    .replace(/^[\s\u00a0\ufeff"']+|[\s\u00a0\ufeff"']+$/g, "")
    .replace(/[\r\n\t]/g, "");
  if (!/^[\x20-\x7e]*$/.test(cleaned)) {
    console.error(`[config] ${label} contains invalid non-ASCII characters — check your .env. Serving empty value.`);
    return "";
  }
  return cleaned;
}

app.get("/api/config", (_req, res) => {
  res.json({
    supabaseUrl: headerSafe(getSupabaseUrl(), "VITE_SUPABASE_URL"),
    supabaseAnonKey: headerSafe(
      process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "VITE_SUPABASE_PUBLISHABLE_KEY"
    ),
    whatsappNumber: headerSafe(process.env.VITE_WHATSAPP_SUPPORT_NUMBER, "VITE_WHATSAPP_SUPPORT_NUMBER"),
  });
});

// GET /api/services/status — check all system services
app.get("/api/services/status", async (_req, res) => {
  const check = (cmd) => {
    try { execSync(cmd, { stdio: "pipe", timeout: 5000 }); return true; }
    catch { return false; }
  };
  const read = (cmd) => {
    try { return execSync(cmd, { stdio: "pipe", timeout: 5000 }).toString().trim(); }
    catch { return null; }
  };

  const androidHome = "/home/runner/android-sdk";
  const sdkOk = fs.existsSync(`${androidHome}/build-tools/34.0.0/aapt`);
  const javaVer = read("java -version 2>&1 | head -1");
  const nodeVer = read("node --version");
  const npmVer  = read("npm --version");
  const gradleOk = check(`ls ${androidHome}/platforms/android-35 2>/dev/null`);
  const keystoreOk = fs.existsSync(path.join(__dirname, "android/debug.keystore"));
  const localPropsOk = (() => {
    try {
      const lp = fs.readFileSync(path.join(__dirname, "android/local.properties"), "utf8");
      return lp.includes("sdk.dir=") && fs.existsSync(lp.match(/sdk\.dir=(.*)/)?.[1]?.trim() || "");
    } catch { return false; }
  })();

  const packages = ["web-push", "nodemailer", "cors", "express", "concurrently"];
  const pkgStatus = {};
  for (const p of packages) {
    try { const pj = JSON.parse(fs.readFileSync(path.join(__dirname, "node_modules", p, "package.json"), "utf8")); pkgStatus[p] = pj.version; }
    catch { pkgStatus[p] = null; }
  }

  const diskFree = read("df -h / | tail -1 | awk '{print $4}'");
  const memFree  = read("free -h | grep Mem | awk '{print $4}'");

  res.json({
    buildServer: { ok: true, version: "1.0" },
    java:        { ok: !!javaVer, version: javaVer },
    node:        { ok: !!nodeVer, version: nodeVer },
    npm:         { ok: !!npmVer, version: npmVer },
    androidSdk:  { ok: sdkOk, path: androidHome },
    androidPlatform: { ok: gradleOk, platform: "android-35" },
    debugKeystore: { ok: keystoreOk },
    localProperties: { ok: localPropsOk },
    packages:    pkgStatus,
    system:      { diskFree, memFree },
  });
});

// GET /api/todo — parse TODO.md and return structured data
app.get("/api/todo", (_req, res) => {
  try {
    const todoPath = path.join(__dirname, "TODO.md");
    if (!fs.existsSync(todoPath)) return res.json({ sections: [], exists: false });
    const raw = fs.readFileSync(todoPath, "utf8");
    const sections = [];
    let current = null;
    for (const line of raw.split("\n")) {
      if (line.startsWith("## ")) {
        if (current) sections.push(current);
        current = { title: line.replace("## ", "").trim(), items: [] };
      } else if (current && /^\|\s*[\w-]+\s*\|/.test(line) && !line.includes("---") && !line.includes("Status")) {
        const parts = line.split("|").map(s => s.trim()).filter(Boolean);
        if (parts.length >= 3) {
          const status = parts[parts.length - 1];
          const name = parts.slice(1, parts.length - 1).join(" | ");
          current.items.push({
            id: parts[0],
            name,
            status: status.includes("✅") ? "done" : status.includes("🔄") ? "progress" : status.includes("🔒") ? "blocked" : "pending",
          });
        }
      }
    }
    if (current) sections.push(current);
    const total = sections.reduce((a, s) => a + s.items.length, 0);
    const done  = sections.reduce((a, s) => a + s.items.filter(i => i.status === "done").length, 0);
    res.json({ sections, total, done, exists: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bash — run a bash command and stream output via SSE
app.post("/api/bash", (req, res) => {
  const { cmd } = req.body || {};
  if (!cmd || typeof cmd !== "string") return res.status(400).json({ error: "cmd required" });

  // Safety: block obviously destructive commands
  const blocked = /rm\s+-rf\s+\/[^h]|mkfs|dd\s+if|:\s*\(\s*\)\s*\{|shutdown|reboot|halt/i;
  if (blocked.test(cmd)) return res.status(403).json({ error: "Command not allowed" });

  sseInit(res);
  sseSend(res, { type: "start", cmd });

  const proc = spawn("bash", ["-c", cmd], {
    cwd: __dirname,
    env: {
      ...process.env,
      ANDROID_HOME: "/home/runner/android-sdk",
      JAVA_HOME: RESOLVED_JAVA_HOME,
      PATH: `/home/runner/android-sdk/build-tools/34.0.0:/home/runner/android-sdk/platform-tools:/home/runner/android-sdk/cmdline-tools/latest/bin:${process.env.PATH}`,
    },
  });

  proc.stdout.on("data", (d) => sseSend(res, { type: "out", text: d.toString() }));
  proc.stderr.on("data", (d) => sseSend(res, { type: "err", text: d.toString() }));
  proc.on("close", (code) => {
    sseSend(res, { type: "done", code });
    res.end();
  });
  req.on("close", () => { try { proc.kill(); } catch {} });
});

// GET /api/builds — history
app.get("/api/builds", (_req, res) => {
  res.json(loadBuilds());
});

// GET /api/build/status — current build status
app.get("/api/build/status", (_req, res) => {
  if (!current) return res.json({ status: "idle" });
  res.json({
    id: current.id,
    version: current.version,
    buildType: current.buildType,
    includeRpcNode: current.includeRpcNode,
    status: current.status,
    startedAt: current.startedAt,
  });
});

// GET /api/build/stream — SSE log stream for current build
app.get("/api/build/stream", (req, res) => {
  sseInit(res);

  if (!current) {
    sseSend(res, { type: "idle" });
    res.end();
    return;
  }

  // Replay buffered logs
  for (const line of current.logs) {
    sseSend(res, { type: "log", text: line });
  }

  if (current.status !== "running") {
    sseSend(res, { type: "done", status: current.status, apkFile: current.apkFile || null });
    res.end();
    return;
  }

  // Live stream
  const listener = (event) => sseSend(res, event);
  current.listeners.push(listener);

  req.on("close", () => {
    if (current) current.listeners = current.listeners.filter((l) => l !== listener);
  });
});

// POST /api/build — start a new APK build
app.post("/api/build", (req, res) => {
  if (current && current.status === "running") {
    return res.status(409).json({ error: "A build is already in progress" });
  }

  const { version = "1.0.0", buildType = "debug", includeRpcNode = false } = req.body;
  const id = Date.now().toString();
  const startedAt = new Date().toISOString();

  const { rpcUrl, chainId } = req.body;

  const args = ["build-apk.sh", "--version", version, "--type", buildType];
  if (includeRpcNode) args.push("--include-rpc");
  if (rpcUrl) args.push("--rpc-url", rpcUrl);
  if (chainId) args.push("--chain-id", chainId);

  // detached: true creates a new process group so we can SIGKILL the entire tree
  const proc = spawn("bash", args, { cwd: __dirname, detached: true });

  current = {
    id,
    proc,
    logs: [],
    listeners: [],
    status: "running",
    version,
    buildType,
    includeRpcNode,
    startedAt,
    apkFile: null,
  };

  // Persist to history
  const builds = loadBuilds();
  builds.unshift({ id, version, buildType, includeRpcNode, status: "running", startedAt, logs: [], apkFile: null });
  saveBuilds(builds);

  const appendLog = (text) => {
    // Drop any buffered output that arrives after cancellation
    if (current && current.status === "cancelled") return;
    current.logs.push(text);
    for (const l of current.listeners) l({ type: "log", text });
    const idx = builds.findIndex((b) => b.id === id);
    if (idx >= 0) {
      builds[idx].logs.push(text);
      saveBuilds(builds);
    }
  };

  proc.stdout.on("data", (d) => appendLog(d.toString()));
  proc.stderr.on("data", (d) => appendLog(d.toString()));

  proc.on("close", (code) => {
    // If already marked cancelled by the cancel endpoint, skip entirely —
    // the cancel handler already persisted the state and notified listeners.
    if (current && current.status === "cancelled") return;

    const status = code === 0 ? "success" : "failed";
    const apkFile = code === 0 ? `VirtualBank-${version}-${buildType}.apk` : null;
    if (current) {
      current.status = status;
      current.apkFile = apkFile;
      for (const l of current.listeners) l({ type: "done", status, apkFile });
    }

    const idx = builds.findIndex((b) => b.id === id);
    if (idx >= 0) {
      builds[idx].status = status;
      builds[idx].finishedAt = new Date().toISOString();
      builds[idx].apkFile = apkFile;
      saveBuilds(builds);
    }
  });

  res.json({ id, version, buildType });
});

// POST /api/build/cancel — kill current build
app.post("/api/build/cancel", (_req, res) => {
  if (!current || current.status !== "running") {
    return res.status(400).json({ error: "No running build" });
  }

  const cancelledId = current.id;

  // 1. Mark cancelled first so the close-event handler knows to skip
  current.status = "cancelled";

  // 2. Notify all SSE listeners immediately so their UIs update
  for (const l of current.listeners) l({ type: "done", status: "cancelled", apkFile: null });
  current.listeners = [];

  // 3. Kill the entire process GROUP (SIGKILL, not SIGTERM) so gradle
  //    and every sub-process it spawned are all killed, not just bash.
  try { process.kill(-current.proc.pid, "SIGKILL"); } catch { /* process may not have a group */ }
  try { current.proc.kill("SIGKILL"); } catch { /* already dead */ }

  // 4. Persist "cancelled" status immediately — don't wait for proc.close
  try {
    const builds = loadBuilds();
    const idx = builds.findIndex((b) => b.id === cancelledId);
    if (idx >= 0) {
      builds[idx].status = "cancelled";
      builds[idx].finishedAt = new Date().toISOString();
      saveBuilds(builds);
    }
  } catch { /* non-fatal */ }

  res.json({ ok: true });
});

// POST /api/build/pwa — run vite build and zip the dist folder
app.post("/api/build/pwa", async (_req, res) => {
  try {
    console.log("[build-server] Starting PWA build…");
    execSync("npm run build", { cwd: __dirname, stdio: "inherit", timeout: 300_000 });

    const zipFile = `pwa-build-${Date.now()}.zip`;
    const zipPath = path.join(__dirname, zipFile);

    // Use the zip CLI (available on Linux) or fall back to a JS zip
    try {
      execSync(`cd "${path.join(__dirname, "dist")}" && zip -r "${zipPath}" .`, { stdio: "inherit" });
    } catch {
      // Fallback: write a tar.gz if zip is not available
      const tarFile = zipFile.replace(".zip", ".tar.gz");
      const tarPath = path.join(__dirname, tarFile);
      execSync(`tar -czf "${tarPath}" -C "${path.join(__dirname, "dist")}" .`, { stdio: "inherit" });
      return res.json({ file: tarFile });
    }

    console.log("[build-server] PWA build complete →", zipFile);
    res.json({ file: zipFile });
  } catch (err) {
    console.error("[build-server] PWA build error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/git-pull — pull latest code from git
app.post("/api/git-pull", (req, res) => {
  try {
    const { remote, branch = "main" } = req.body || {};
    const output = [];

    if (remote) {
      try {
        const setRemote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: __dirname }).toString().trim();
        if (setRemote !== remote) {
          execFileSync("git", ["remote", "set-url", "origin", remote], { cwd: __dirname });
          output.push(`Remote updated to: ${remote}`);
        }
      } catch {
        execFileSync("git", ["remote", "add", "origin", remote], { cwd: __dirname });
        output.push(`Remote set to: ${remote}`);
      }
    }

    const activeRemote = remote || execFileSync("git", ["remote", "get-url", "origin"], { cwd: __dirname }).toString().trim();
    const pullOut = execFileSync("git", ["pull", "origin", branch], {
      cwd: __dirname,
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnvForRemote(activeRemote),
    }).toString();

    output.push(...pullOut.split("\n").filter(Boolean));
    console.log("[build-server] git pull output:", pullOut);
    res.json({ ok: true, output });
  } catch (err) {
    const errMsg = err.stderr?.toString() || err.stdout?.toString() || err.message;
    console.error("[build-server] git pull error:", errMsg);
    res.status(500).json({ error: errMsg, output: errMsg.split("\n").filter(Boolean) });
  }
});

// ── App Update (git pull + npm install + optional restart) ───────────────────
// Tracks the in-progress update so only one runs at a time
let updateJob = null; // { logs[], status: "running"|"done"|"failed", listeners[] }

function findGitRoot() {
  const candidates = [
    __dirname,
    process.cwd(),
    path.dirname(__dirname),
    "/home/runner/workspace",
  ];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: candidate,
        stdio: ["ignore", "pipe", "ignore"],
      }).toString().trim();
    } catch {
      // Try the next known project location.
    }
  }

  return null;
}

const GIT_ASKPASS_HELPER = path.join("/tmp", "vbank-git-askpass.cjs");

function ensureGitAskpassHelper() {
  if (!fs.existsSync(GIT_ASKPASS_HELPER)) {
    fs.writeFileSync(
      GIT_ASKPASS_HELPER,
      [
        "const prompt = process.argv.slice(2).join(' ').toLowerCase();",
        "process.stdout.write(prompt.includes('username') ? 'x-access-token' : (process.env.GIT_ASKPASS_VALUE || ''));",
        "",
      ].join("\n"),
      { mode: 0o700 },
    );
  }
  return GIT_ASKPASS_HELPER;
}

function gitEnvForRemote(remoteUrl) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const token = process.env.GITHUB_TOKEN;
  if (token && /github\.com/i.test(String(remoteUrl || ""))) {
    // Keep the credential out of .git/config, the remote URL, and streamed logs.
    // GitHub receives it through this short-lived child-process environment.
    env.GIT_ASKPASS = ensureGitAskpassHelper();
    env.GIT_ASKPASS_VALUE = token;
    env.GIT_USERNAME = "x-access-token";
  }
  return env;
}

function updateSseSend(data) {
  if (!updateJob) return;
  const line = `data: ${JSON.stringify(data)}\n\n`;
  for (const write of updateJob.listeners) {
    try { write(line); } catch {}
  }
  updateJob.logs.push(data);
}

// GET /api/update/stream — SSE stream of update progress
app.get("/api/update/stream", (req, res) => {
  sseInit(res);

  if (!updateJob) {
    sseSend(res, { type: "idle" });
    res.end();
    return;
  }

  // Replay buffered events
  for (const ev of updateJob.logs) {
    sseSend(res, ev);
  }

  if (updateJob.status !== "running") {
    const alreadySentDone = updateJob.logs.some((event) => event.type === "done");
    if (alreadySentDone) {
      res.end();
      return;
    }
    sseSend(res, { type: "done", status: updateJob.status });
    res.end();
    return;
  }

  // Live stream
  const write = (chunk) => res.write(chunk);
  updateJob.listeners.push(write);

  req.on("close", () => {
    if (updateJob) updateJob.listeners = updateJob.listeners.filter((l) => l !== write);
  });
});

// POST /api/update — pull latest code, install deps, optionally restart
app.post("/api/update", (req, res) => {
  if (updateJob && updateJob.status === "running") {
    return res.status(409).json({ error: "An update is already in progress" });
  }

  const { branch = "main", remote, restart = false } = req.body || {};

  updateJob = { logs: [], status: "running", listeners: [] };
  res.json({ ok: true, message: "Update started — connect to /api/update/stream for progress" });

  // Run steps sequentially in background
  (async () => {
    const log = (text) => updateSseSend({ type: "log", text });
    const step = (text) => updateSseSend({ type: "step", text });
    const fail = (text) => { updateSseSend({ type: "error", text }); updateJob.status = "failed"; updateSseSend({ type: "done", status: "failed" }); };

    try {
      // ── Step 1: optionally update remote ───────────────────────────────────
      if (remote) {
        step("Configuring git remote…");
        const gitRoot = findGitRoot();
        if (!gitRoot) {
          throw new Error(
            "This running app is not inside a Git repository. Open the Replit workspace from the repository checkout or initialize/clone the repository before using Pull & Update.",
          );
        }
        try {
          const existing = execFileSync("git", ["remote", "get-url", "origin"], { cwd: gitRoot }).toString().trim();
          if (existing !== remote) {
            execFileSync("git", ["remote", "set-url", "origin", remote], { cwd: gitRoot });
            log(`Remote updated to: ${remote}`);
          }
        } catch {
          execFileSync("git", ["remote", "add", "origin", remote], { cwd: gitRoot });
          log(`Remote added: ${remote}`);
        }
      }

      // ── Step 2: git pull ───────────────────────────────────────────────────
      step(`Pulling from origin/${branch}…`);
      const gitRoot = findGitRoot();
      if (!gitRoot) {
        throw new Error(
          "This running app is not inside a Git repository. Pull & Update cannot run until the project is started from a Git checkout.",
        );
      }
      const activeRemote = remote || execFileSync("git", ["remote", "get-url", "origin"], { cwd: gitRoot }).toString().trim();
      await new Promise((resolve, reject) => {
        const proc = spawn("git", ["pull", "origin", branch], {
          cwd: gitRoot,
          stdio: ["ignore", "pipe", "pipe"],
          env: gitEnvForRemote(activeRemote),
        });
        proc.stdout.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(log));
        proc.stderr.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(log));
        proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`git pull exited ${code}`)));
      });

      // ── Step 3: npm install ────────────────────────────────────────────────
      step("Installing dependencies (npm install)…");
      await new Promise((resolve, reject) => {
        const proc = spawn("npm", ["install", "--no-audit", "--no-fund"], {
          cwd: __dirname,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, CI: "true" },
        });
        proc.stdout.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(log));
        proc.stderr.on("data", (d) => {
          const text = d.toString();
          text.split("\n").filter(Boolean)
            .filter((l) => !l.startsWith("npm warn") && !l.startsWith("npm notice"))
            .forEach(log);
        });
        proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`npm install exited ${code}`)));
      });

      step("Update complete ✓");
      updateJob.status = "done";
      updateSseSend({ type: "done", status: "done" });

      // ── Step 4 (optional): restart server ─────────────────────────────────
      if (restart) {
        log("Restarting server in 2 s…");
        setTimeout(() => process.exit(0), 2000);
      }
    } catch (err) {
      console.error("[build-server] update error:", err.message);
      fail(err.message);
    }
  })();
});

// GET /api/update/status — quick status poll
app.get("/api/update/status", (_req, res) => {
  if (!updateJob) return res.json({ status: "idle" });
  res.json({ status: updateJob.status });
});

// GET /api/download/:filename — download an APK or zip
app.get("/api/download/:filename", (req, res) => {
  const { filename } = req.params;
  const allowed = filename.endsWith(".apk") || filename.endsWith(".zip") || filename.endsWith(".tar.gz");
  if (!allowed) return res.status(400).json({ error: "Invalid file type" });
  const filepath = path.join(__dirname, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: "File not found" });
  res.download(filepath, filename);
});

// GET /api/builds/:id/logs — full logs for a past build
app.get("/api/builds/:id/logs", (req, res) => {
  const builds = loadBuilds();
  const build = builds.find((b) => b.id === req.params.id);
  if (!build) return res.status(404).json({ error: "Build not found" });
  res.json({ logs: build.logs || [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// VAPID keys — loaded from env or auto-generated once and persisted locally
const VAPID_FILE = path.join(__dirname, ".local", "vapid.json");

function loadOrGenerateVapidKeys() {
  // Prefer env vars (set by Replit Secrets)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails(
        `mailto:${process.env.VAPID_EMAIL || "admin@virtualbank.app"}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    } catch (e) {
      console.warn("[push] VAPID env vars invalid, falling back to local file:", e.message);
    }
  }

  // Fall back to persisted local file
  if (fs.existsSync(VAPID_FILE)) {
    try {
      const keys = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
      webpush.setVapidDetails(`mailto:admin@virtualbank.app`, keys.publicKey, keys.privateKey);
      return keys;
    } catch {}
  }

  // Generate fresh keys and save
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(VAPID_FILE), { recursive: true });
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2));
  webpush.setVapidDetails(`mailto:admin@virtualbank.app`, keys.publicKey, keys.privateKey);
  console.log("[push] Generated new VAPID keys. Add to .env for persistence:");
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}`);
  return keys;
}

// In-memory subscription store (persisted to .local/push-subscriptions.json)
const SUBS_FILE = path.join(__dirname, ".local", "push-subscriptions.json");

function loadSubscriptions() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, "utf8")); } catch { return []; }
}
function saveSubscriptions(subs) {
  fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

const vapidKeys = loadOrGenerateVapidKeys();

// GET /api/push/vapid-public-key — client fetches this to create subscriptions
app.get("/api/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// POST /api/push/subscribe — save a push subscription
app.post("/api/push/subscribe", (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: "Missing subscription" });

  const subs = loadSubscriptions();
  const idx = subs.findIndex((s) => s.subscription?.endpoint === subscription.endpoint);
  const entry = { subscription, userId: userId || null, createdAt: new Date().toISOString() };
  if (idx >= 0) subs[idx] = entry; else subs.push(entry);
  saveSubscriptions(subs);
  console.log(`[push] Subscription saved (total: ${subs.length})`);
  res.json({ ok: true, total: subs.length });
});

// POST /api/push/unsubscribe — remove a subscription by endpoint
app.post("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
  const subs = loadSubscriptions().filter((s) => s.subscription?.endpoint !== endpoint);
  saveSubscriptions(subs);
  res.json({ ok: true, total: subs.length });
});

// GET /api/push/subscribers — count (admin info)
app.get("/api/push/subscribers", (_req, res) => {
  const subs = loadSubscriptions();
  res.json({ total: subs.length });
});

// POST /api/push/send — send a push to all (or one user's) subscribers
app.post("/api/push/send", async (req, res) => {
  const { title, body, icon, url, userId } = req.body;
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  let subs = loadSubscriptions();
  if (userId) subs = subs.filter((s) => s.userId === userId);
  if (subs.length === 0) return res.json({ ok: true, sent: 0, failed: 0 });

  const payload = JSON.stringify({ title, body, icon: icon || "/icon.svg", url: url || "/" });

  let sent = 0, failed = 0;
  const expired = [];

  await Promise.allSettled(
    subs.map(async ({ subscription }) => {
      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        // 410 Gone = subscription expired / unsubscribed by browser
        if (err.statusCode === 410 || err.statusCode === 404) {
          expired.push(subscription.endpoint);
        }
        console.error("[push] send error:", err.statusCode, err.message);
      }
    })
  );

  // Clean up expired subscriptions
  if (expired.length > 0) {
    const cleaned = loadSubscriptions().filter((s) => !expired.includes(s.subscription?.endpoint));
    saveSubscriptions(cleaned);
    console.log(`[push] Removed ${expired.length} expired subscriptions`);
  }

  console.log(`[push] Sent ${sent}, failed ${failed}`);
  res.json({ ok: true, sent, failed });
});

// ══════════════════════════════════════════════════════════════════════════════
// SMS — Twilio
// ══════════════════════════════════════════════════════════════════════════════
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM  = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";

const twilioOk = () => !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

async function sendSms(to, body) {
  if (!twilioOk()) throw new Error("Twilio not configured");
  const twilio = (await import("twilio")).default;
  const client = twilio(TWILIO_SID, TWILIO_TOKEN);
  return client.messages.create({ body, from: TWILIO_FROM, to });
}

const whatsappOk = () => !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_WHATSAPP_FROM);

async function sendWhatsApp(to, body) {
  if (!whatsappOk()) throw new Error("WhatsApp delivery is not configured.");
  const twilio = (await import("twilio")).default;
  const client = twilio(TWILIO_SID, TWILIO_TOKEN);
  const from = TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
  const recipient = String(to).startsWith("whatsapp:")
    ? String(to)
    : `whatsapp:${to}`;
  return client.messages.create({ body, from, to: recipient });
}

app.get("/api/sms/status", (_req, res) => {
  res.json({
    configured: twilioOk(),
    whatsappConfigured: whatsappOk(),
    from: TWILIO_FROM ? TWILIO_FROM.replace(/\d(?=\d{4})/g, "*") : null,
  });
});

// POST /api/sms/send — raw SMS (admin)
app.post("/api/sms/send", async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: "to and message required" });
  if (!twilioOk()) return res.status(503).json({ error: "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER." });
  try {
    const msg = await sendSms(to, message);
    res.json({ ok: true, sid: msg.sid });
  } catch (err) {
    console.error("[sms] send error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/transaction-alert — formatted transaction SMS
app.post("/api/sms/transaction-alert", async (req, res) => {
  const { to, type, amount, from_name, to_name, balance, reference, otp } = req.body || {};
  if (!to) return res.status(400).json({ error: "to required" });
  if (!twilioOk()) return res.status(503).json({ error: "Twilio not configured" });

  const fmt  = (v) => v != null ? `$${parseFloat(v).toFixed(2)}` : "";
  const bal  = balance != null ? ` Bal: ${fmt(balance)}.` : "";
  const ref  = reference ? ` Ref: ${reference}.` : "";

  const messages = {
    sent:            `NETLIFE CASH: You sent ${fmt(amount)} to ${to_name}.${bal}${ref}`,
    received:        `NETLIFE CASH: ${from_name} sent you ${fmt(amount)}.${bal}${ref}`,
    request:         `NETLIFE CASH: ${from_name} requested ${fmt(amount)} from you. Login to approve.`,
    topup:           `NETLIFE CASH: Your account was funded with ${fmt(amount)}.${bal}`,
    reversal:        `NETLIFE CASH: Reversal of ${fmt(amount)} processed.${bal}${ref}`,
    login:           `NETLIFE CASH: New login to your account. Not you? Change your password now.`,
    kyc:             `NETLIFE CASH: Your KYC status was updated. Login to view details.`,
    otp:             `NETLIFE CASH: Your OTP is ${otp}. Valid for 10 minutes. Do not share.`,
  };
  const body = messages[type] || `NETLIFE CASH: Account activity detected. Login to review.`;

  try {
    const msg = await sendSms(to, body);
    console.log(`[sms] sent ${type} alert to ${to.slice(0, 6)}*** sid=${msg.sid}`);
    res.json({ ok: true, sid: msg.sid });
  } catch (err) {
    console.error("[sms] alert error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/broadcast — send to multiple numbers (admin)
app.post("/api/sms/broadcast", async (req, res) => {
  const { numbers, message } = req.body || {};
  if (!Array.isArray(numbers) || !message) return res.status(400).json({ error: "numbers[] and message required" });
  if (!twilioOk()) return res.status(503).json({ error: "Twilio not configured" });
  let sent = 0, failed = 0;
  await Promise.allSettled(
    numbers.map(async (to) => {
      try { await sendSms(to, message); sent++; }
      catch { failed++; }
    })
  );
  res.json({ ok: true, sent, failed });
});

// ══════════════════════════════════════════════════════════════════════════════
// Password Reset via OTP (Twilio SMS + Supabase Admin)
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = getSupabaseUrl();
const SUPABASE_ADMIN_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY; // optional
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** In-memory OTP store: email -> { otpHash, expiresAt, attempts } */
const resetOtpStore = new Map();

const adminOk = () => !!(SUPABASE_URL && SUPABASE_ADMIN_KEY);

const DEFAULT_FEATURE_TOGGLES = [
  { feature_key: "pay_bills", feature_name: "Pay Bills", is_enabled: false },
  { feature_key: "top_up", feature_name: "Mobile Top-up", is_enabled: false },
  { feature_key: "pay_merchant", feature_name: "Pay Merchant", is_enabled: false },
  { feature_key: "pwa_install", feature_name: "Install App Prompt", is_enabled: false },
  { feature_key: "app_download", feature_name: "App Download", is_enabled: false },
  { feature_key: "internal_funds", feature_name: "Internal Funds (master switch)", is_enabled: false },
  { feature_key: "fund_requests", feature_name: "Fund Requests", is_enabled: false },
  { feature_key: "fund_reversals", feature_name: "Fund Reversals", is_enabled: false },
  { feature_key: "bank_transfer", feature_name: "Bank Transfer Deposits", is_enabled: false },
  { feature_key: "card_deposits", feature_name: "Card Deposits", is_enabled: false },
  { feature_key: "agent_deposits", feature_name: "Agent Deposits", is_enabled: false },
  { feature_key: "agent_distributions", feature_name: "Agent Distributions", is_enabled: false },
  { feature_key: "bank_reserve", feature_name: "Bank Reserve Controls", is_enabled: false },
  { feature_key: "financial_tools_expenses", feature_name: "Financial Tools · Expense Tracking", is_enabled: false },
  { feature_key: "financial_tools_income", feature_name: "Financial Tools · Income Tracking", is_enabled: false },
  { feature_key: "financial_tools_debt", feature_name: "Financial Tools · Debt Tracking", is_enabled: false },
  { feature_key: "financial_tools_networth", feature_name: "Financial Tools · Net Worth", is_enabled: false },
];

const CLIENT_MENU_FEATURES = [
  ["client_menu_profile", "My Profile"],
  ["client_menu_change_password", "Change Password"],
  ["client_menu_security", "Security & 2FA"],
  ["client_menu_kyc", "Identity Verification (KYC)"],
  ["client_menu_insights", "Financial Insights"],
  ["client_menu_budget", "Budget Planner"],
  ["client_menu_savings", "Savings Goals"],
  ["client_menu_savings_accounts", "Savings Accounts"],
  ["client_menu_loans", "Loans"],
  ["client_menu_credit_builder", "Credit Builder"],
  ["client_menu_scheduled_payments", "Scheduled Payments"],
  ["client_menu_international_transfers", "International Transfer"],
  ["client_menu_group_payments", "Group Payments"],
  ["client_menu_split_bills", "Split Bills"],
  ["client_menu_currency_converter", "Currency Converter"],
  ["client_menu_ai_assistant", "AI Financial Assistant"],
  ["client_menu_recommendations", "Personalized Recommendations"],
  ["client_menu_nfc_payment", "NFC Tap Payments"],
  ["client_menu_open_banking", "Open Banking"],
  ["client_menu_beneficiaries", "Beneficiaries"],
  ["client_menu_virtual_cards", "Virtual Cards"],
  ["client_menu_multi_wallet", "All Wallets"],
  ["client_menu_investments", "Investments"],
  ["client_menu_business_banking", "Business Banking"],
  ["client_menu_rewards", "Rewards"],
  ["client_menu_pay_bills", "Pay Bills"],
  ["client_menu_send_money", "Send Money"],
  ["client_menu_request_funds", "Request Funds"],
  ["client_menu_top_up", "Top-up"],
  ["client_menu_pay_merchant", "Pay Merchant"],
  ["client_menu_shop", "Shop"],
  ["client_menu_refer", "Refer & Earn"],
  ["client_menu_transactions", "Transactions"],
  ["client_menu_download_app", "Download App"],
  ["client_menu_whats_new", "What's New"],
  ["client_menu_notifications", "Notifications"],
  ["client_menu_messages", "Messages"],
  ["client_menu_support_center", "Support Center"],
  ["client_menu_achievements", "Achievements"],
  ["client_menu_help_support", "Help & Support"],
  ["client_menu_feedback", "Feedback"],
];
const CLIENT_MENU_FEATURE_KEYS = new Set(CLIENT_MENU_FEATURES.map(([key]) => key));

function defaultClientMenuAccess() {
  return Object.fromEntries(CLIENT_MENU_FEATURES.map(([key]) => [key, true]));
}

function mergeClientMenuAccess(rows = []) {
  const access = defaultClientMenuAccess();
  for (const row of rows) {
    if (CLIENT_MENU_FEATURE_KEYS.has(row.feature_key)) access[row.feature_key] = Boolean(row.is_enabled);
  }
  return access;
}

async function getSupabaseAdminClient() {
  if (!adminOk()) throw new Error("Supabase service role is not configured on this server.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
  });
}

async function requireStaffActor(req, admin, allowedRoles = ["admin", "founder", "agent"]) {
  const authorization = String(req.headers.authorization || "");
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) return { status: 401, error: "Staff sign-in required." };

  const { data: actorResult, error: actorError } = await admin.auth.getUser(accessToken);
  if (actorError || !actorResult?.user) {
    return { status: 401, error: "Staff session is invalid or expired." };
  }

  let actorRole = actorResult.user.user_metadata?.account_type || actorResult.user.user_metadata?.role;
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", actorResult.user.id)
    .limit(1)
    .maybeSingle();
  if (roleRow?.role) actorRole = roleRow.role;

  if (!allowedRoles.includes(actorRole)) {
    return { status: 403, error: `Only ${allowedRoles.join(", ")} can perform this action.` };
  }
  return { user: actorResult.user, role: actorRole, accessToken };
}

async function requireFeatureAdmin(req, admin) {
  const authorization = String(req.headers.authorization || "");
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) return { status: 401, error: "Admin sign-in required." };

  const { data: actorResult, error: actorError } = await admin.auth.getUser(accessToken);
  if (actorError || !actorResult?.user) {
    return { status: 401, error: "Admin session is invalid or expired." };
  }

  let actorRole = actorResult.user.user_metadata?.account_type || actorResult.user.user_metadata?.role;
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", actorResult.user.id)
    .limit(1)
    .maybeSingle();
  if (roleRow?.role) actorRole = roleRow.role;

  if (actorRole !== "admin" && actorRole !== "founder") {
    return { status: 403, error: "Only admins and founders can manage feature toggles." };
  }
  return { user: actorResult.user };
}

async function requireBearerUser(req, admin) {
  const authorization = String(req.headers.authorization || "");
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) return { status: 401, error: "Sign-in required." };
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data?.user) return { status: 401, error: "Session is invalid or expired." };
  return { user: data.user, accessToken };
}

async function getUserRole(admin, userId, user = null) {
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return roleRow?.role || user?.user_metadata?.account_type || user?.user_metadata?.role || "client";
}

// Feature toggles are public configuration, but some Supabase projects have
// missing/stale anonymous SELECT policies. Read them through the server-held
// service key so feature gates cannot silently treat every feature as absent.
app.get("/api/feature-toggles", async (_req, res) => {
  try {
    const admin = await getSupabaseAdminClient();
    const { data, error } = await admin
      .from("feature_toggles")
      .select("id, feature_key, feature_name, is_enabled, updated_at")
      .order("feature_name");
    if (error) throw new Error(error.message);
    res.json({ features: data || [] });
  } catch (err) {
    console.error("[feature-toggles] read error:", err.message);
    res.status(503).json({ error: err.message });
  }
});

// Seed missing rows without changing the enabled state of existing rows.
app.post("/api/feature-toggles/seed", async (req, res) => {
  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireFeatureAdmin(req, admin);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });
    const { error } = await admin
      .from("feature_toggles")
      .upsert(DEFAULT_FEATURE_TOGGLES, { onConflict: "feature_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    console.error("[feature-toggles] seed error:", err.message);
    res.status(503).json({ error: err.message });
  }
});

app.patch("/api/feature-toggles/:id", async (req, res) => {
  const { id } = req.params;
  const { is_enabled } = req.body || {};
  if (!id || typeof is_enabled !== "boolean") {
    return res.status(400).json({ error: "id and boolean is_enabled are required." });
  }

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireFeatureAdmin(req, admin);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });
    const { data, error } = await admin
      .from("feature_toggles")
      .update({ is_enabled })
      .eq("id", id)
      .select("id, feature_key, feature_name, is_enabled, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: "Feature toggle not found." });
    res.json({ feature: data });
  } catch (err) {
    console.error("[feature-toggles] update error:", err.message);
    res.status(503).json({ error: err.message });
  }
});

// Per-user client-menu access. Missing rows mean enabled, which keeps access
// backwards-compatible until an admin explicitly changes a user's settings.
app.get("/api/feature-access/me", async (req, res) => {
  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireBearerUser(req, admin);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: rows, error } = await admin
      .from("user_feature_access")
      .select("feature_key, is_enabled")
      .eq("user_id", actor.user.id);
    if (error) throw new Error(error.message);
    res.json({ access: mergeClientMenuAccess(rows || []) });
  } catch (err) {
    console.error("[feature-access] current-user read error:", err.message);
    res.status(503).json({ error: err.message });
  }
});

app.get("/api/admin/users/:userId/features", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required." });
  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireFeatureAdmin(req, admin);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });
    const targetRole = await getUserRole(admin, userId, targetResult.user);
    if (targetRole === "admin" || targetRole === "founder") {
      return res.status(403).json({ error: "Admin and founder accounts cannot be managed here." });
    }

    const { data: rows, error } = await admin
      .from("user_feature_access")
      .select("feature_key, is_enabled")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    res.json({
      userId,
      targetRole,
      features: CLIENT_MENU_FEATURES.map(([featureKey, featureName]) => ({ featureKey, featureName })),
      access: mergeClientMenuAccess(rows || []),
    });
  } catch (err) {
    console.error("[feature-access] admin read error:", err.message);
    res.status(503).json({ error: err.message });
  }
});

app.patch("/api/admin/users/:userId/features/:featureKey", async (req, res) => {
  const { userId, featureKey } = req.params;
  const { is_enabled } = req.body || {};
  if (!userId || !CLIENT_MENU_FEATURE_KEYS.has(featureKey) || typeof is_enabled !== "boolean") {
    return res.status(400).json({ error: "A valid featureKey and boolean is_enabled are required." });
  }
  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireFeatureAdmin(req, admin);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });
    const targetRole = await getUserRole(admin, userId, targetResult.user);
    if (targetRole === "admin" || targetRole === "founder") {
      return res.status(403).json({ error: "Admin and founder accounts cannot be managed here." });
    }

    const { error } = await admin
      .from("user_feature_access")
      .upsert({
        user_id: userId,
        feature_key: featureKey,
        is_enabled,
        updated_by: actor.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,feature_key" });
    if (error) throw new Error(error.message);
    res.json({ ok: true, userId, featureKey, is_enabled });
  } catch (err) {
    console.error("[feature-access] admin update error:", err.message);
    res.status(503).json({ error: err.message });
  }
});

function normalizePhoneDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // The app's default country is Guyana. CountryPhoneInput normally sends
  // E.164, but this also canonicalizes seven-digit legacy entries.
  if (digits.length === 7) digits = `592${digits}`;
  return digits;
}

function phoneEmailCandidates(value) {
  const raw = String(value || "").replace(/\D/g, "");
  const normalized = normalizePhoneDigits(value);
  return [...new Set([
    `${normalized}@vbank.com`,
    `${raw}@vbank.com`,
    `${raw.replace(/^592/, "")}@vbank.com`,
    `${normalized}@virtualbank.app`,
    `${raw}@virtualbank.app`,
  ].filter((email) => !email.startsWith("@")))];
}

function phoneToE164(value) {
  const digits = normalizePhoneDigits(value);
  return digits ? `+${digits}` : "";
}

function normalizeDocumentNumber(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// GET /api/auth/reset-status
app.get("/api/auth/reset-status", (_req, res) => {
  res.json({
    smsAvailable: twilioOk(),
    whatsappAvailable: whatsappOk(),
    adminResetAvailable: adminOk(),
    emailAvailable: smtpOk(),
  });
});

/** In-memory pre-authentication OTP store. Sessions are released only after
 * the one-time code is verified. A process restart invalidates pending codes. */
const loginOtpStore = new Map();

// POST /api/auth/request-login-otp { phone, password }
app.post("/api/auth/request-login-otp", async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ error: "Phone number and password are required." });
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(503).json({ error: "Supabase authentication is not configured on the server." });
  }
  if (!whatsappOk()) {
    return res.status(503).json({ error: "WhatsApp login verification is not configured. Add TWILIO_WHATSAPP_FROM on the server." });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let authData = null;
    let lastError = null;
    for (const email of phoneEmailCandidates(phone)) {
      const result = await authClient.auth.signInWithPassword({ email, password });
      if (!result.error && result.data.session && result.data.user) {
        authData = result.data;
        break;
      }
      lastError = result.error;
    }
    if (!authData) {
      return res.status(401).json({ error: lastError?.message || "Invalid phone number or password." });
    }

    const e164 = phoneToE164(authData.user.user_metadata?.phone_number || phone);
    if (!e164) return res.status(400).json({ error: "The account does not have a valid phone number." });

    const code = generateOtp();
    const challengeId = crypto.randomBytes(24).toString("hex");
    loginOtpStore.set(challengeId, {
      otpHash: hashOtp(code),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      session: authData.session,
      user: authData.user,
    });

    try {
      await sendWhatsApp(
        e164,
        `NETLIFE CASH: Your login verification code is ${code}. It expires in 5 minutes. Never share this code.`,
      );
    } catch (deliveryError) {
      loginOtpStore.delete(challengeId);
      console.error("[login-otp] WhatsApp delivery error:", deliveryError.message);
      return res.status(503).json({ error: "We could not send the WhatsApp verification code. Try again or contact an agent." });
    }

    const masked = `${e164.slice(0, 3)}${"*".repeat(Math.max(0, e164.length - 7))}${e164.slice(-4)}`;
    res.json({ ok: true, challengeId, masked, expiresIn: 300 });
  } catch (err) {
    console.error("[login-otp] request error:", err.message);
    res.status(500).json({ error: "Unable to start login verification." });
  }
});

// POST /api/auth/verify-login-otp { challengeId, code }
app.post("/api/auth/verify-login-otp", (req, res) => {
  const { challengeId, code } = req.body || {};
  const entry = loginOtpStore.get(String(challengeId || ""));
  if (!entry) return res.status(400).json({ error: "This login code has expired. Request a new one." });
  if (Date.now() > entry.expiresAt) {
    loginOtpStore.delete(challengeId);
    return res.status(400).json({ error: "This login code has expired. Request a new one." });
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    loginOtpStore.delete(challengeId);
    return res.status(429).json({ error: "Too many attempts. Request a new code." });
  }
  if (hashOtp(String(code || "")) !== entry.otpHash) {
    return res.status(400).json({ error: `Incorrect code. ${5 - entry.attempts} attempt(s) remaining.` });
  }

  loginOtpStore.delete(challengeId);
  res.json({ ok: true, session: entry.session, user: entry.user });
});

// POST /api/auth/request-reset  { phone, countryCode }
app.post("/api/auth/request-reset", async (req, res) => {
  const { phone, countryCode = "" } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone required" });
  if (!whatsappOk()) return res.status(503).json({ error: "Business WhatsApp delivery is not configured — contact an agent." });

  const e164 = phone.startsWith("+") ? phone : `${countryCode}${phone.replace(/^0/, "")}`;
  const email = `${phone.replace(/\D/g, "")}@vbank.com`;

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  resetOtpStore.set(email, { otpHash, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, e164 });

  try {
    await sendWhatsApp(e164, `NETLIFE CASH: Your password reset code is ${otp}. Valid for 5 minutes. Do not share this code.`);
    const masked = e164.slice(0, -4).replace(/\d/g, "*") + e164.slice(-4);
    res.json({ ok: true, masked });
  } catch (err) {
    resetOtpStore.delete(email);
    console.error("[reset] WhatsApp error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-reset  { phone, otp, idCardNumber, newPassword }
app.post("/api/auth/verify-reset", async (req, res) => {
  const { phone, otp, idCardNumber, newPassword } = req.body || {};
  if (!phone || !otp || !idCardNumber || !newPassword) {
    return res.status(400).json({ error: "phone, otp, idCardNumber, and newPassword are required" });
  }
  if (String(newPassword).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const email = `${phone.replace(/\D/g, "")}@vbank.com`;
  const entry = resetOtpStore.get(email);

  if (!entry) return res.status(400).json({ error: "No reset request found. Please request a new code." });
  if (Date.now() > entry.expiresAt) {
    resetOtpStore.delete(email);
    return res.status(400).json({ error: "Code expired. Please request a new one." });
  }
  entry.attempts = (entry.attempts || 0) + 1;
  if (entry.attempts > 5) {
    resetOtpStore.delete(email);
    return res.status(429).json({ error: "Too many attempts. Request a new code." });
  }
  if (hashOtp(otp) !== entry.otpHash) {
    return res.status(400).json({ error: `Incorrect code. ${5 - entry.attempts} attempt(s) remaining.` });
  }

  // OTP and identity document must both be verified before changing auth.
  if (!adminOk()) return res.status(503).json({ error: "Password recovery is not fully configured. Contact an agent." });

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket },
    });

    // Look up user by the virtual email
    const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);

    const target = users.find((u) => u.email === email);
    if (!target) return res.status(404).json({ error: "No account found for this phone number." });

    const { data: kycRows, error: kycError } = await adminClient
      .from("kyc_submissions")
      .select("document_number, status")
      .eq("user_id", target.id)
      .neq("status", "rejected");
    if (kycError) throw new Error(kycError.message);
    const suppliedDocument = normalizeDocumentNumber(idCardNumber);
    const documentMatches = (kycRows || []).some((row) =>
      normalizeDocumentNumber(row.document_number) === suppliedDocument
    );
    if (!documentMatches) {
      return res.status(403).json({ error: "The ID card number does not match the identity record." });
    }

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(target.id, { password: newPassword });
    if (updateErr) throw new Error(updateErr.message);

    resetOtpStore.delete(email);
    console.log(`[reset] Password reset for ${email.slice(0, 6)}***`);

    sendWhatsApp(
      entry.e164,
      "NETLIFE CASH: Your password has been reset successfully. Please sign in with your new password.",
    ).catch(() => {});

    res.json({ ok: true, adminReset: true });
  } catch (err) {
    console.error("[reset] admin reset error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/*
// GET /api/setup-admin — one-shot browser page that creates the admin user via client-side JS
app.get("/api/setup-admin", (_req, res) => {
  // Read creds from .env fallback
  let supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  let anonKey     = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!supabaseUrl || !anonKey) {
    try {
      const dotenv = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
      const parse  = (key) => {
        const m = dotenv.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"));
        return m?.[1] || "";
      };
      supabaseUrl = supabaseUrl || parse("VITE_SUPABASE_URL");
      anonKey     = anonKey    || parse("VITE_SUPABASE_PUBLISHABLE_KEY");
    } catch { }
  }
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Admin Setup</title>
<style>body{font-family:sans-serif;max-width:480px;margin:60px auto;padding:20px;background:#f9fafb}
pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;white-space:pre-wrap;word-break:break-all}
.ok{color:#22c55e}.err{color:#ef4444}.btn{margin-top:12px;padding:8px 20px;border:none;border-radius:6px;background:#f59e0b;color:#fff;font-size:14px;cursor:pointer}
</style></head><body>
<h2>Admin User Setup</h2><pre id="out">Running…</pre>
<script type="module">
const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
const ANON_KEY     = ${JSON.stringify(anonKey)};
// The legacy setup page was removed. Use the protected /api/auth/ensure-admin
// endpoint instead; it receives credentials from the admin setup flow.
const out = document.getElementById("out");
const log = (msg, cls) => { const s = document.createElement("span"); s.className = cls||""; s.textContent = msg + "\\n"; out.appendChild(s); };
out.textContent = "";
log("Connecting to Supabase: " + SUPABASE_URL);
try {
  // Step 1: try sign-up
  const r1 = await fetch(SUPABASE_URL + "/auth/v1/signup", {
    method:"POST", headers:{"Content-Type":"application/json","apikey":ANON_KEY,"Authorization":"Bearer "+ANON_KEY},
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, data: METADATA })
  });
  const d1 = await r1.json();
  if (d1.error && d1.error.toLowerCase().includes("already registered")) {
    log("User already exists — trying sign-in to confirm…");
    const r2 = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method:"POST", headers:{"Content-Type":"application/json","apikey":ANON_KEY,"Authorization":"Bearer "+ANON_KEY},
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });
    const d2 = await r2.json();
    if (d2.error) { log("Sign-in failed: " + d2.error, "err"); }
    else {
      log("✅ User already exists and credentials are correct.", "ok");
      log("User ID: " + (d2.user?.id || "unknown"), "ok");
      log("Role in metadata: " + (d2.user?.user_metadata?.account_type || "not set"));
      if (d2.user?.user_metadata?.account_type !== "admin") {
        log("⚠ account_type is not admin — updating metadata…");
        const r3 = await fetch(SUPABASE_URL + "/auth/v1/user", {
          method:"PUT", headers:{"Content-Type":"application/json","apikey":ANON_KEY,"Authorization":"Bearer "+d2.access_token},
          body: JSON.stringify({ data: METADATA })
        });
        const d3 = await r3.json();
        if (d3.error) log("Metadata update failed: " + d3.error, "err");
        else log("✅ Metadata updated to admin.", "ok");
      }
      const btn = document.createElement("a"); btn.href="/auth"; btn.className="btn"; btn.textContent="Go to Sign In →"; document.body.appendChild(btn);
    }
  } else if (d1.error) {
    log("Signup error: " + JSON.stringify(d1.error), "err");
  } else {
    const uid = d1.user?.id || d1.id;
    log("✅ User created!", "ok");
    log("User ID: " + uid, "ok");
    log("Email confirmed: " + (d1.user?.email_confirmed_at ? "yes" : "pending"));
    log("account_type in metadata: " + (d1.user?.user_metadata?.account_type || "not set"));
    if (!d1.session) log("⚠ No session returned — email confirmation may be required in Supabase dashboard.");
    else log("✅ Session active — user can sign in immediately.", "ok");
    const btn = document.createElement("a"); btn.href="/auth"; btn.className="btn"; btn.textContent="Go to Sign In →"; document.body.appendChild(btn);
  }
} catch(e) { log("Network error: " + e.message, "err"); }
</script></body></html>`);
});

// POST /api/auth/register — public registration endpoint (email confirmation bypass)
// Uses service role key if available so users can log in immediately without email confirmation.
app.post("/api/auth/register", async (req, res) => {
  const { email, password, metadata = {} } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  let supabaseUrl = process.env.VITE_SUPABASE_URL;
  let anonKey    = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fallback: parse .env file if env vars not set
  if (!supabaseUrl || !anonKey) {
    try {
      const dotenv = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
      const parse = (key) => {
        const m = dotenv.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"));
        return m?.[1] || "";
      };
      supabaseUrl = supabaseUrl || parse("VITE_SUPABASE_URL");
      anonKey     = anonKey    || parse("VITE_SUPABASE_PUBLISHABLE_KEY");
      serviceKey  = serviceKey || parse("SUPABASE_SERVICE_ROLE_KEY");
    } catch {}
  }

  if (!supabaseUrl || !anonKey) return res.status(503).json({ error: "Supabase not configured" });

  try {
    const { createClient } = await import("@supabase/supabase-js");

    // Prefer admin client (service role) — creates user with email already confirmed
    if (serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        user_metadata: metadata,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
      // Ensure user_roles row exists (trigger may already handle this)
      await adminClient.from("user_roles")
        .upsert({ user_id: data.user.id, role: metadata.account_type || "client" })
        .catch(() => {});
      return res.json({ ok: true, userId: data.user.id, confirmed: true });
    }

    // Fallback: anon signUp (user will need email confirmation if Supabase requires it)
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw new Error(error.message);
    const userId = data.user?.id;
    if (userId) {
      await client.from("user_roles")
        .upsert({ user_id: userId, role: metadata.account_type || "client" })
        .catch(() => {});
    }
    return res.json({ ok: true, userId, confirmed: !!data.session, needsConfirmation: !data.session });
  } catch (err) {
    console.error("[register]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/create-user — create a new user (localhost only, temp utility)
app.post("/api/auth/create-user", async (req, res) => {
  const forwarded = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "";
  const isLocal = String(forwarded).includes("127.0.0.1") || String(forwarded).includes("::1") || String(forwarded).includes("::ffff:127.0.0.1");
  if (!isLocal) return res.status(403).json({ error: "Forbidden" });

  const { email, password, metadata = {} } = req.body || {};
*/
// POST /api/auth/ensure-admin — idempotent: create OR confirm+fix existing admin user
// Accepts { email, password, metadata, legacyEmails? }
// legacyEmails: older emails for the same account (e.g. without country code) that
//               should be migrated to the canonical email automatically.
app.post("/api/auth/ensure-admin", async (req, res) => {
  const { email, password, metadata = {}, legacyEmails = [] } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  let serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    try {
      const dotenv = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
      const parse  = (key) => { const m = dotenv.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m")); return m?.[1] || ""; };
      supabaseUrl = supabaseUrl || parse("VITE_SUPABASE_URL") || parse("SUPABASE_URL");
      serviceKey  = serviceKey || parse("SUPABASE_SERVICE_ROLE_KEY") || parse("SUPABASE_SECRET_KEY");
    } catch { /* ignore */ }
  }
  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured on this server." });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket },
    });

    // Load all users once (used for lookup)
    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw new Error(listErr.message);

    let userId = null;
    let action  = "";

    // 1. Check if canonical email already exists
    const canonical = users.find((u) => u.email === email);
    if (canonical) {
      userId = canonical.id;
      // Ensure email is confirmed, password and metadata are current
      const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
        password, email_confirm: true, user_metadata: metadata,
      });
      if (updateErr) throw new Error(updateErr.message);
      action = "confirmed+updated";
      console.log("[ensure-admin] Canonical user found — confirmed:", email);

    } else {
      // 2. Check for legacy email (e.g. without country code)
      const legacy = users.find((u) => legacyEmails.includes(u.email));
      if (legacy) {
        userId = legacy.id;
        // Migrate: update email to canonical + confirm + fix password+metadata
        const { error: migrateErr } = await admin.auth.admin.updateUserById(userId, {
          email, password, email_confirm: true, user_metadata: metadata,
        });
        if (migrateErr) throw new Error(migrateErr.message);
        action = "migrated+confirmed";
        console.log("[ensure-admin] Legacy user migrated:", legacy.email, "→", email);

      } else {
        // 3. Create brand-new user (email pre-confirmed)
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email, password, user_metadata: metadata, email_confirm: true,
        });
        if (createErr) throw new Error(createErr.message);
        userId = created.user.id;
        action = "created";
        console.log("[ensure-admin] New user created:", email);
      }
    }

    // 4. Upsert admin role in user_roles (best-effort)
    if (userId) {
      const role = metadata.account_type || "admin";
      const { error: roleErr } = await admin.from("user_roles").upsert({ user_id: userId, role });
      if (roleErr) console.warn("[ensure-admin] user_roles upsert:", roleErr.message);
    }

    res.json({ ok: true, userId, action, confirmed: true });
  } catch (err) {
    console.error("[ensure-admin]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/create-user — staff-assisted account creation when a user
// cannot receive the WhatsApp verification code. The service-role key stays
// on this server; the browser only sends the authenticated staff session.
app.post("/api/auth/create-user", async (req, res) => {
  const authorization = String(req.headers.authorization || "");
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) return res.status(401).json({ error: "Staff sign-in required." });
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured on this server." });

  const { fullName, phone, password } = req.body || {};
  const digits = normalizePhoneDigits(phone);
  const e164 = phoneToE164(phone);
  if (!fullName || !digits || !password) {
    return res.status(400).json({ error: "Full name, phone number, and password are required." });
  }
  if (digits.length < 7) return res.status(400).json({ error: "Enter a valid phone number." });
  if (String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket },
    });

    const { data: actorResult, error: actorError } = await admin.auth.getUser(accessToken);
    if (actorError || !actorResult?.user) return res.status(401).json({ error: "Staff session is invalid or expired." });

    let actorRole = actorResult.user.user_metadata?.account_type || actorResult.user.user_metadata?.role;
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actorResult.user.id)
      .limit(1)
      .maybeSingle();
    if (roleRow?.role) actorRole = roleRow.role;
    if (actorRole !== "admin" && actorRole !== "agent") {
      return res.status(403).json({ error: "Only an admin or agent can add users." });
    }

    const email = `${digits}@vbank.com`;
    const { data: usersResult, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw new Error(listError.message);
    const existing = usersResult.users.find((candidate) =>
      phoneEmailCandidates(phone).includes(candidate.email) ||
      normalizePhoneDigits(candidate.user_metadata?.phone_number) === digits
    );
    if (existing) return res.status(409).json({ error: "An account already exists for this phone number." });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        full_name: String(fullName).trim(),
        phone_number: e164,
        role: "client",
        account_type: "client",
        phone_verified: true,
        verification_method: "staff_manual",
      },
    });
    if (createError || !created.user) throw new Error(createError?.message || "User could not be created.");

    // Triggers normally create these rows. These upserts make staff-created
    // accounts usable on projects where the trigger was not applied.
    await admin.from("profiles").upsert({
      id: created.user.id,
      full_name: String(fullName).trim(),
      phone_number: e164,
      kyc_status: "unverified",
    });
    await admin.from("user_roles").upsert(
      { user_id: created.user.id, role: "client" },
      { onConflict: "user_id,role" },
    );
    await admin.from("whatsapp_verification_requests").insert({
      user_id: created.user.id,
      phone_number: e164,
      verification_code: "MANUAL",
      status: "verified",
      admin_notes: `Manually verified by ${actorRole}.`,
      verified_at: new Date().toISOString(),
      verified_by: actorResult.user.id,
    });

    res.json({ ok: true, userId: created.user.id, email, verification: "manual" });
  } catch (err) {
    console.error("[create-user]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register — public registration for customer/vendor accounts.
// The service-role key stays on the server so email confirmation can be skipped
// when configured. Never allow a browser request to create an admin account.
app.post("/api/auth/register", async (req, res) => {
  const { email, password, metadata = {} } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const safeMetadata = {
    full_name: String(metadata.full_name || "").trim(),
    phone_number: String(metadata.phone_number || "").trim(),
    account_type: metadata.account_type === "vendor" ? "vendor" : "client",
  };

  try {
    const { createClient } = await import("@supabase/supabase-js");

    if (adminOk()) {
      const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        realtime: { transport: WebSocket },
      });
      const { data, error } = await admin.auth.admin.createUser({
        email: String(email).trim().toLowerCase(),
        password: String(password),
        user_metadata: safeMetadata,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);

      // The auth trigger normally creates this row. Upsert keeps registration
      // working if a deployment has not applied the trigger yet.
      const { error: roleError } = await admin.from("user_roles").upsert(
        { user_id: data.user.id, role: safeMetadata.account_type },
        { onConflict: "user_id,role" },
      );
      if (roleError) console.warn("[register] user_roles upsert:", roleError.message);

      return res.json({ ok: true, userId: data.user.id, confirmed: true });
    }

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return res.status(503).json({ error: "Supabase is not configured on this server." });
    }

    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const { data, error } = await client.auth.signUp({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      options: { data: safeMetadata },
    });
    if (error) throw new Error(error.message);

    return res.json({
      ok: true,
      userId: data.user?.id || null,
      confirmed: Boolean(data.session),
      needsConfirmation: !data.session,
    });
  } catch (err) {
    console.error("[register]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/pending-resets — staff-only legacy reset queue
app.get("/api/auth/pending-resets", async (req, res) => {
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });
  const admin = await getSupabaseAdminClient();
  const actor = await requireStaffActor(req, admin);
  if (actor.error) return res.status(actor.status).json({ error: actor.error });
  const now = Date.now();
  const list = [];
  for (const [email, entry] of resetOtpStore.entries()) {
    list.push({
      email,
      phone: entry.e164 || null,
      expiresAt: entry.expiresAt,
      expired: now > entry.expiresAt,
      attempts: entry.attempts || 0,
      verified: entry.verified || false,
    });
  }
  res.json({ requests: list });
});

// DELETE /api/auth/pending-resets/:email — remove a pending request
app.delete("/api/auth/pending-resets/:email", async (req, res) => {
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });
  const admin = await getSupabaseAdminClient();
  const actor = await requireStaffActor(req, admin);
  if (actor.error) return res.status(actor.status).json({ error: actor.error });
  const email = decodeURIComponent(req.params.email);
  resetOtpStore.delete(email);
  res.json({ ok: true });
});

// GET /api/auth/all-users — list all Supabase users with profile info (staff only)
app.get("/api/auth/all-users", async (req, res) => {
  if (!adminOk()) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket },
    });
    const bearer = String(req.headers.authorization || "");
    const accessToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
    if (!accessToken) return res.status(401).json({ error: "Staff sign-in required." });
    const { data: actorResult, error: actorError } = await adminClient.auth.getUser(accessToken);
    if (actorError || !actorResult?.user) return res.status(401).json({ error: "Staff session is invalid or expired." });
    let actorRole = actorResult.user.user_metadata?.account_type || actorResult.user.user_metadata?.role;
    const { data: actorRoleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", actorResult.user.id)
      .limit(1)
      .maybeSingle();
    if (actorRoleRow?.role) actorRole = actorRoleRow.role;
    if (actorRole !== "admin" && actorRole !== "founder" && actorRole !== "agent") {
      return res.status(403).json({ error: "Only an admin, founder, or agent can view users." });
    }
    const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);

    // Fetch profiles for display names
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      realtime: { transport: WebSocket },
    });
    // Older Supabase projects may only have id/timestamps on profiles. Read
    // the available row shape and fall back to Auth metadata below instead of
    // failing the entire user list on a missing optional column.
    const { data: profiles } = await supaAdmin.from("profiles").select("*");
    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const { data: roleRows } = await supaAdmin.from("user_roles").select("user_id, role");
    const roleMap = Object.fromEntries((roleRows || []).map((row) => [row.user_id, row.role]));
    const { data: kycRows } = await supaAdmin
      .from("kyc_submissions")
      .select("user_id, status, created_at")
      .order("created_at", { ascending: false });
    const kycMap = {};
    for (const row of kycRows || []) {
      if (!kycMap[row.user_id]) kycMap[row.user_id] = row.status;
    }
    const { data: whatsappRows } = await supaAdmin
      .from("whatsapp_verification_requests")
      .select("user_id, status, requested_at")
      .order("requested_at", { ascending: false });
    const whatsappMap = {};
    for (const row of whatsappRows || []) {
      if (!whatsappMap[row.user_id]) whatsappMap[row.user_id] = row.status;
    }

    const list = users.map((u) => ({
      id: u.id,
      email: u.email,
       fullName: profileMap[u.id]?.full_name || u.user_metadata?.full_name || null,
       phone: profileMap[u.id]?.phone_number || u.user_metadata?.phone_number || null,
       walletAddress: profileMap[u.id]?.wallet_address || u.user_metadata?.wallet_address || null,
       disabled: Boolean(profileMap[u.id]?.disabled),
       role: roleMap[u.id] || u.user_metadata?.account_type || u.user_metadata?.role || "client",
       emailConfirmed: Boolean(u.email_confirmed_at),
       emailConfirmedAt: u.email_confirmed_at || null,
       phoneVerified: Boolean(u.user_metadata?.phone_verified || whatsappMap[u.id] === "verified"),
       verificationStatus: u.user_metadata?.phone_verified || whatsappMap[u.id] === "verified" ? "verified" : "pending",
       kycStatus: profileMap[u.id]?.kyc_status || kycMap[u.id] || "unverified",
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
    }));
    res.json({ users: list });
  } catch (err) {
    console.error("[reset] all-users error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/users/:userId/verify — an admin can approve a registration
// when the user completed an offline/WhatsApp identity check. The service key
// stays on the server; the browser only sends the staff access token.
app.post("/api/auth/users/:userId/verify", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required." });
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin, ["admin", "founder"]);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });
    if (userId === actor.user.id) return res.status(400).json({ error: "Your own session is already verified." });

    const now = new Date().toISOString();
    const metadata = {
      ...(targetResult.user.user_metadata || {}),
      phone_verified: true,
      verification_method: "admin_manual",
      verification_verified_at: now,
      verification_verified_by: actor.user.id,
    };
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      user_metadata: metadata,
    });
    if (updateError) throw new Error(updateError.message);

    const { data: profile } = await admin
      .from("profiles")
      .select("phone_number")
      .eq("id", userId)
      .maybeSingle();
    const phoneNumber = profile?.phone_number || targetResult.user.user_metadata?.phone_number || null;

    // Keep the verification request history in sync when that optional table
    // exists. A missing migration must not prevent the auth verification.
    const { data: pendingRequest } = await admin
      .from("whatsapp_verification_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingRequest?.id) {
      await admin.from("whatsapp_verification_requests").update({
        status: "verified",
        admin_notes: `Verified manually by ${actor.role}.`,
        verified_at: now,
        verified_by: actor.user.id,
      }).eq("id", pendingRequest.id);
    } else if (phoneNumber) {
      await admin.from("whatsapp_verification_requests").insert({
        user_id: userId,
        phone_number: phoneNumber,
        verification_code: "ADMIN",
        status: "verified",
        admin_notes: `Verified manually by ${actor.role}.`,
        requested_at: now,
        verified_at: now,
        verified_by: actor.user.id,
      });
    }

    res.json({ ok: true, userId, verified: true });
  } catch (err) {
    console.error("[users] verification error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/kyc — create an approved KYC record for a user verified by
// staff outside the app. This intentionally does not accept document bytes;
// uploaded files belong in the private Supabase Storage bucket.
app.post("/api/admin/kyc", async (req, res) => {
  const {
    userId,
    fullName,
    dateOfBirth,
    address,
    country,
    documentType,
    documentNumber,
  } = req.body || {};
  if (!userId || !fullName || !dateOfBirth || !address || !country || !documentType || !documentNumber) {
    return res.status(400).json({ error: "userId and all identity details are required." });
  }
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin, ["admin", "founder"]);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });
    const now = new Date().toISOString();
    const { data: submission, error: submissionError } = await admin
      .from("kyc_submissions")
      .insert({
        user_id: userId,
        full_name: String(fullName).trim(),
        date_of_birth: dateOfBirth,
        address: String(address).trim(),
        country: String(country).trim(),
        document_type: String(documentType).trim(),
        document_number: String(documentNumber).trim(),
        status: "approved",
        reviewed_by: actor.user.id,
        reviewed_at: now,
      })
      .select("id, user_id, status")
      .single();
    if (submissionError) throw new Error(submissionError.message);

    const { error: profileError } = await admin
      .from("profiles")
      .update({ kyc_status: "verified" })
      .eq("id", userId);
    if (profileError) throw new Error(profileError.message);

    await admin.from("audit_logs").insert({
      actor_id: actor.user.id,
      actor_role: actor.role,
      action: "kyc_manual_approved",
      entity_type: "user",
      entity_id: userId,
      metadata: { submission_id: submission.id, source: "admin_manual" },
    });
    res.json({ ok: true, submission });
  } catch (err) {
    console.error("[kyc] manual approval error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:userId — permanently remove a non-staff account.
// Supabase Auth cascades the related profile, wallet, role, KYC, and request
// rows. KYC files are removed explicitly because storage objects are separate.
app.delete("/api/auth/users/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required." });
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin, ["admin", "founder"]);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });
    if (userId === actor.user.id) return res.status(400).json({ error: "You cannot delete your own account from user management." });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });
    const targetRole = await getUserRole(admin, userId, targetResult.user);
    if (targetRole === "admin" || targetRole === "founder") {
      return res.status(403).json({ error: "Staff accounts cannot be deleted from user management." });
    }

    const { data: kycRows } = await admin
      .from("kyc_submissions")
      .select("document_front_url, document_back_url, proof_of_address_url, selfie_url")
      .eq("user_id", userId);
    const paths = (kycRows || [])
      .flatMap((row) => [row.document_front_url, row.document_back_url, row.proof_of_address_url, row.selfie_url])
      .filter(Boolean);
    if (paths.length) {
      await admin.storage.from("kyc-documents").remove(paths);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);
    res.json({ ok: true, userId, deleted: true });
  } catch (err) {
    console.error("[users] delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/users/:userId/role — role changes must use the server-held
// service key because user_roles intentionally has no browser UPDATE policy.
app.patch("/api/auth/users/:userId/role", async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body || {};
  const allowedRoles = ["client", "vendor", "agent", "admin", "founder"];
  if (!userId || !allowedRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(", ")}.` });
  }
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin, ["admin", "founder"]);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });

    // user_roles historically has a unique (user_id, role) pair rather than
    // a unique user_id constraint. Replace all old role rows so a user cannot
    // retain a stale role after the change.
    const { error: deleteRoleError } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (deleteRoleError) throw new Error(deleteRoleError.message);
    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role });
    if (roleError) throw new Error(roleError.message);

    const metadata = {
      ...(targetResult.user.user_metadata || {}),
      account_type: role,
      role,
    };
    const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: metadata,
    });
    if (metadataError) throw new Error(metadataError.message);

    console.log(`[users] role=${role} userId=${userId.slice(0, 8)}*** by ${actor.role}`);
    res.json({ ok: true, userId, role });
  } catch (err) {
    console.error("[users] role update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/funds — use the caller's authenticated RPC context so
// auth.uid() remains the real staff member inside the security-definer ledger
// function. This avoids browser RLS inconsistencies while keeping the balance
// update and transaction record atomic.
app.post("/api/admin/funds", async (req, res) => {
  const { userId, amount } = req.body || {};
  const numericAmount = Number(amount);
  if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: "userId and a positive amount are required." });
  }
  if (!adminOk() || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(503).json({ error: "Supabase is not fully configured on this server." });
  }

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin, ["admin", "founder"]);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { createClient } = await import("@supabase/supabase-js");
    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${actor.accessToken}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await userClient.rpc("admin_add_funds", {
      _user_id: userId,
      _amount: numericAmount,
    });
    if (error) throw new Error(error.message);

    const result = data && typeof data === "object" ? data : {};
    if (!result.success) {
      return res.status(403).json({ error: result.error || "The fund operation was rejected." });
    }
    res.json({ success: true, transactionId: result.transaction_id || null });
  } catch (err) {
    console.error("[admin-funds] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/phone-availability?phone=... — duplicate-phone guard for signup
app.get("/api/auth/phone-availability", async (req, res) => {
  const digits = normalizePhoneDigits(req.query.phone);
  if (digits.length < 10) return res.status(400).json({ error: "Enter a valid phone number." });
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket },
    });
    const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    const emails = phoneEmailCandidates(req.query.phone);
    const duplicate = users.some((candidate) =>
      emails.includes(candidate.email) ||
      normalizePhoneDigits(candidate.user_metadata?.phone_number) === digits
    );
    res.json({ available: !duplicate });
  } catch (err) {
    console.error("[phone-availability]", err.message);
    res.status(500).json({ error: "Could not check phone availability." });
  }
});

// POST /api/auth/staff-password-reset/request — send an agent-assisted
// recovery code to the user's WhatsApp number.
app.post("/api/auth/staff-password-reset/request", async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId is required." });
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });
    if (!whatsappOk()) return res.status(503).json({ error: "Business WhatsApp delivery is not configured." });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });

    const { data: profile } = await admin
      .from("profiles")
      .select("phone_number")
      .eq("id", userId)
      .maybeSingle();
    const e164 = phoneToE164(targetResult.user.user_metadata?.phone_number || profile?.phone_number);
    if (!e164) return res.status(400).json({ error: "This user does not have a valid WhatsApp phone number." });

    const code = generateOtp();
    const { data: challenge, error: challengeError } = await admin
      .from("password_reset_challenges")
      .insert({
        user_id: userId,
        requested_by: actor.user.id,
        phone_number: e164,
        code_hash: hashOtp(code),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .select("id, expires_at")
      .single();
    if (challengeError || !challenge) throw new Error(challengeError?.message || "Could not create reset challenge.");

    try {
      await sendWhatsApp(
        e164,
        `NETLIFE CASH: Your password recovery code is ${code}. It expires in 10 minutes. Give this code only to an authorized NETLIFE CASH agent.`,
      );
    } catch (deliveryError) {
      await admin.from("password_reset_challenges").delete().eq("id", challenge.id);
      throw deliveryError;
    }

    const masked = `${e164.slice(0, 3)}${"*".repeat(Math.max(0, e164.length - 7))}${e164.slice(-4)}`;
    res.json({ ok: true, challengeId: challenge.id, masked, expiresAt: challenge.expires_at });
  } catch (err) {
    console.error("[staff-reset] request error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/staff-password-reset/confirm — require the code and a
// normalized match against a non-rejected KYC document number.
app.post("/api/auth/staff-password-reset/confirm", async (req, res) => {
  const { challengeId, idCardNumber, otp, newPassword } = req.body || {};
  if (!challengeId || !idCardNumber || !otp || !newPassword) {
    return res.status(400).json({ error: "challengeId, idCardNumber, otp, and newPassword are required." });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: challenge, error: challengeError } = await admin
      .from("password_reset_challenges")
      .select("*")
      .eq("id", challengeId)
      .maybeSingle();
    if (challengeError) throw new Error(challengeError.message);
    if (!challenge || challenge.consumed_at) return res.status(400).json({ error: "This reset request is no longer valid." });
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: "The WhatsApp code has expired. Request a new code." });
    }

    const attempts = Number(challenge.attempts || 0) + 1;
    await admin.from("password_reset_challenges").update({ attempts }).eq("id", challenge.id);
    if (attempts > 5) return res.status(429).json({ error: "Too many attempts. Request a new code." });
    if (hashOtp(String(otp).trim()) !== challenge.code_hash) {
      return res.status(400).json({ error: `Incorrect WhatsApp code. ${5 - attempts} attempt(s) remaining.` });
    }

    const { data: kycRows, error: kycError } = await admin
      .from("kyc_submissions")
      .select("document_number, status")
      .eq("user_id", challenge.user_id)
      .neq("status", "rejected");
    if (kycError) throw new Error(kycError.message);
    const suppliedDocument = normalizeDocumentNumber(idCardNumber);
    const documentMatches = (kycRows || []).some((row) =>
      normalizeDocumentNumber(row.document_number) === suppliedDocument
    );
    if (!documentMatches) {
      return res.status(403).json({ error: "The ID card number does not match the user's identity record." });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(challenge.user_id, {
      password: String(newPassword),
      user_metadata: { must_change_password: false },
    });
    if (updateError) throw new Error(updateError.message);

    await admin
      .from("password_reset_challenges")
      .update({ verified_at: new Date().toISOString(), consumed_at: new Date().toISOString() })
      .eq("id", challenge.id);
    sendWhatsApp(
      challenge.phone_number,
      "NETLIFE CASH: Your password has been reset by an authorized agent. If you did not request this, contact support immediately.",
    ).catch(() => {});

    res.json({ ok: true, message: "Password reset successfully." });
  } catch (err) {
    console.error("[staff-reset] confirm error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/admin-set-password { userId, newPassword } — admin/founder
// reset from User Manager. The server owns the target phone number and sends
// the notification through the configured business WhatsApp account.
app.post("/api/auth/admin-set-password", async (req, res) => {
  const { userId, newPassword } = req.body || {};
  if (!userId || !newPassword) return res.status(400).json({ error: "userId and newPassword are required." });
  if (String(newPassword).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!adminOk()) return res.status(503).json({ error: "Supabase service role is not configured." });

  try {
    const admin = await getSupabaseAdminClient();
    const actor = await requireStaffActor(req, admin, ["admin", "founder"]);
    if (actor.error) return res.status(actor.status).json({ error: actor.error });

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetResult?.user) return res.status(404).json({ error: "User account not found." });
    const { data: profile } = await admin
      .from("profiles")
      .select("phone_number")
      .eq("id", userId)
      .maybeSingle();
    const e164 = phoneToE164(targetResult.user.user_metadata?.phone_number || profile?.phone_number);
    if (!e164) return res.status(400).json({ error: "This user does not have a valid WhatsApp phone number." });
    if (!whatsappOk()) return res.status(503).json({ error: "Business WhatsApp delivery is not configured." });

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: String(newPassword),
      user_metadata: { must_change_password: true },
    });
    if (updateError) throw new Error(updateError.message);

    let whatsappSent = true;
    let warning = null;
    try {
      await sendWhatsApp(
        e164,
        `NETLIFE CASH: An administrator reset your password. Your temporary password is ${newPassword}. Sign in and change it immediately. If you did not request this, contact support.`,
      );
    } catch (deliveryError) {
      whatsappSent = false;
      warning = "Password changed, but the business WhatsApp notification could not be delivered.";
      console.error("[reset] admin WhatsApp notification error:", deliveryError.message);
    }

    console.log(`[reset] Admin set password for userId=${userId.slice(0, 8)}*** by ${actor.role}`);
    res.json({ ok: true, whatsappSent, warning });
  } catch (err) {
    console.error("[reset] admin-set-password error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Email — nodemailer / SMTP
// ══════════════════════════════════════════════════════════════════════════════
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@virtualbank.app";
const SMTP_NAME = process.env.SMTP_FROM_NAME || "NETLIFE CASH";

const smtpOk = () => !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

async function getMailer() {
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });
}

function emailHtml({ title, amount, from_name, to_name, balance, reference, date, extra = "" }) {
  const fmtAmt = (v) => v != null ? `<span style="font-size:28px;font-weight:700;color:#16a34a;">$${parseFloat(v).toFixed(2)}</span>` : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 28px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-family:sans-serif;">NETLIFE CASH</h1>
      <p style="margin:4px 0 0;color:#bbf7d0;font-size:13px;font-family:sans-serif;">Transaction Alert</p>
    </div>
    <div style="padding:28px;font-family:sans-serif;">
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">${title}</h2>
      ${amount != null ? `<div style="margin-bottom:12px;">${fmtAmt(amount)}</div>` : ""}
      ${from_name ? `<p style="margin:4px 0;color:#374151;font-size:14px;">From: <strong>${from_name}</strong></p>` : ""}
      ${to_name   ? `<p style="margin:4px 0;color:#374151;font-size:14px;">To: <strong>${to_name}</strong></p>` : ""}
      ${balance   ? `<p style="margin:4px 0;color:#374151;font-size:14px;">New balance: <strong>$${parseFloat(balance).toFixed(2)}</strong></p>` : ""}
      ${reference ? `<p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Reference: ${reference}</p>` : ""}
      ${date      ? `<p style="margin:4px 0;color:#6b7280;font-size:12px;">Date: ${date}</p>` : ""}
      ${extra}
    </div>
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:11px;">This is an automated alert. Do not reply. © NETLIFE CASH</p>
    </div>
  </div></body></html>`;
}

app.get("/api/email/status", (_req, res) => {
  res.json({ configured: smtpOk(), from: SMTP_FROM });
});

// POST /api/email/send — raw email (admin)
app.post("/api/email/send", async (req, res) => {
  const { to, subject, html, text } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: "to and subject required" });
  if (!smtpOk()) return res.status(503).json({ error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS." });
  try {
    const mailer = await getMailer();
    const info = await mailer.sendMail({ from: `"${SMTP_NAME}" <${SMTP_FROM}>`, to, subject, html, text });
    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error("[email] send error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email/transaction-alert — formatted transaction email
app.post("/api/email/transaction-alert", async (req, res) => {
  const { to, type, amount, from_name, to_name, balance, reference, date } = req.body || {};
  if (!to) return res.status(400).json({ error: "to required" });
  if (!smtpOk()) return res.status(503).json({ error: "SMTP not configured" });

  const subjects = {
    sent:           "Money Sent — NETLIFE CASH",
    received:       "Money Received — NETLIFE CASH",
    request:        "Fund Request — NETLIFE CASH",
    topup:          "Account Top-Up — NETLIFE CASH",
    reversal:       "Reversal Processed — NETLIFE CASH",
    login:          "New Login Alert — NETLIFE CASH",
    kyc:            "KYC Status Update — NETLIFE CASH",
    welcome:        "Welcome to NETLIFE CASH",
    password_change:"Password Changed — NETLIFE CASH",
  };
  const titles = {
    sent:           "You sent money",
    received:       "You received money",
    request:        "Fund request received",
    topup:          "Account funded",
    reversal:       "Transaction reversed",
    login:          "New login detected",
    kyc:            "KYC verification update",
    welcome:        "Welcome aboard!",
    password_change:"Your password was changed",
  };

  const subject = subjects[type] || "NETLIFE CASH Account Alert";
  const title   = titles[type]   || "Account Activity";
  const extra   = type === "login"
    ? `<div style="margin-top:16px;padding:12px;background:#fef2f2;border-radius:8px;border-left:4px solid #ef4444;">
         <p style="margin:0;color:#b91c1c;font-size:13px;">If this wasn't you, <strong>change your password immediately</strong>.</p>
       </div>`
    : "";

  const html = emailHtml({ title, amount, from_name, to_name, balance, reference, date: date || new Date().toLocaleString(), extra });

  try {
    const mailer = await getMailer();
    const info = await mailer.sendMail({ from: `"${SMTP_NAME}" <${SMTP_FROM}>`, to, subject, html });
    console.log(`[email] sent ${type} alert to ${to.split("@")[0]}@*** id=${info.messageId}`);
    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error("[email] alert error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Litenode Docker Management
// Requires /var/run/docker.sock mounted into this container.
// ══════════════════════════════════════════════════════════════════════════════
const LITENODE_CONTAINER = process.env.LITENODE_CONTAINER_NAME || "litenode";

async function dockerAvailable() {
  try {
    await execAsync("docker info --format '{{.ServerVersion}}'", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function getContainerStatus(name) {
  try {
    const { stdout } = await execAsync(
      `docker inspect ${name} --format '{{.State.Status}}'`,
      { timeout: 5000 }
    );
    return stdout.trim(); // "running", "exited", "paused", "created", "restarting"
  } catch {
    return "not_found";
  }
}

// GET /api/litenode/docker/status
app.get("/api/litenode/docker/status", async (_req, res) => {
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) {
      return res.json({ docker: false, status: "unavailable", message: "Docker socket not mounted — litenode management only available on self-hosted deployments." });
    }
    const status = await getContainerStatus(LITENODE_CONTAINER);
    res.json({ docker: true, status, container: LITENODE_CONTAINER });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/litenode/docker/create — build image + create + start via docker compose
app.post("/api/litenode/docker/create", async (_req, res) => {
  try {
    if (!await dockerAvailable()) return res.status(503).json({ error: "Docker not available" });
    console.log(`[litenode] running docker compose up -d litenode ...`);
    const { stdout, stderr } = await execAsync(`docker compose up -d litenode 2>&1`, { timeout: 180000, cwd: process.cwd() });
    const status = await getContainerStatus(LITENODE_CONTAINER);
    console.log(`[litenode] compose up → ${status}`);
    res.json({ ok: true, status, output: (stdout + stderr).split("\n").filter(Boolean) });
  } catch (err) {
    console.error("[litenode] create error:", err.message);
    res.status(500).json({ error: err.message, output: err.message.split("\n") });
  }
});

app.post("/api/litenode/docker/start", async (_req, res) => {
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) return res.status(503).json({ error: "Docker not available" });
    const current = await getContainerStatus(LITENODE_CONTAINER);
    if (current === "not_found") {
      return res.status(404).json({
        error: `Container "${LITENODE_CONTAINER}" does not exist. Create it first on the server:\n  docker compose up litenode -d\nOr set LITENODE_CONTAINER_NAME to the correct container name.`,
      });
    }
    await execAsync(`docker start ${LITENODE_CONTAINER}`, { timeout: 15000 });
    const status = await getContainerStatus(LITENODE_CONTAINER);
    console.log(`[litenode] started container ${LITENODE_CONTAINER} → ${status}`);
    res.json({ ok: true, status });
  } catch (err) {
    console.error("[litenode] start error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/litenode/docker/stop
app.post("/api/litenode/docker/stop", async (_req, res) => {
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) return res.status(503).json({ error: "Docker not available" });
    await execAsync(`docker stop ${LITENODE_CONTAINER}`, { timeout: 30000 });
    const status = await getContainerStatus(LITENODE_CONTAINER);
    console.log(`[litenode] stopped container ${LITENODE_CONTAINER} → ${status}`);
    res.json({ ok: true, status });
  } catch (err) {
    console.error("[litenode] stop error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/litenode/docker/restart
app.post("/api/litenode/docker/restart", async (_req, res) => {
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) return res.status(503).json({ error: "Docker not available" });
    await execAsync(`docker restart ${LITENODE_CONTAINER}`, { timeout: 30000 });
    const status = await getContainerStatus(LITENODE_CONTAINER);
    console.log(`[litenode] restarted container ${LITENODE_CONTAINER} → ${status}`);
    res.json({ ok: true, status });
  } catch (err) {
    console.error("[litenode] restart error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/litenode/docker/logs?lines=150
app.get("/api/litenode/docker/logs", async (req, res) => {
  const lines = Math.min(parseInt(req.query.lines) || 150, 500);
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) return res.json({ docker: false, logs: [], message: "Docker not available" });
    // 2>&1 merges stderr (where docker logs often go) into stdout
    const { stdout } = await execAsync(
      `docker logs --tail=${lines} --timestamps ${LITENODE_CONTAINER} 2>&1`,
      { timeout: 10000 }
    );
    const logs = stdout.split("\n").filter(Boolean);
    res.json({ ok: true, logs, container: LITENODE_CONTAINER });
  } catch (err) {
    // docker logs errors go to stderr — try to get partial output
    res.json({ ok: false, logs: [], error: err.message });
  }
});

// GET /api/litenode/docker/stats — CPU/memory snapshot
app.get("/api/litenode/docker/stats", async (_req, res) => {
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) return res.json({ docker: false });
    const status = await getContainerStatus(LITENODE_CONTAINER);
    if (status !== "running") return res.json({ docker: true, status, stats: null });
    const { stdout } = await execAsync(
      `docker stats ${LITENODE_CONTAINER} --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}'`,
      { timeout: 8000 }
    );
    const [cpu, mem, net] = stdout.trim().split("|");
    res.json({ docker: true, status, stats: { cpu, mem, net } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RPC Node Docker Management (separate from browser mock litenode)
// RPCNODE_CONTAINER_NAME env var overrides — defaults to "litenode" (same
// container in the standard stack; set a different name for a dedicated node).
// ══════════════════════════════════════════════════════════════════════════════
const RPCNODE_CONTAINER = process.env.RPCNODE_CONTAINER_NAME || "litenode";

app.get("/api/rpcnode/docker/status", async (_req, res) => {
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) {
      return res.json({ docker: false, status: "unavailable", message: "Docker socket not mounted — RPC node management only available on self-hosted deployments." });
    }
    const status = await getContainerStatus(RPCNODE_CONTAINER);
    res.json({ docker: true, status, container: RPCNODE_CONTAINER });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/rpcnode/docker/create — build image + create + start via docker compose
app.post("/api/rpcnode/docker/create", async (_req, res) => {
  try {
    if (!await dockerAvailable()) return res.status(503).json({ error: "Docker not available" });
    console.log(`[rpcnode] running docker compose up -d litenode ...`);
    const { stdout, stderr } = await execAsync(`docker compose up -d litenode 2>&1`, { timeout: 180000, cwd: process.cwd() });
    const status = await getContainerStatus(RPCNODE_CONTAINER);
    console.log(`[rpcnode] compose up → ${status}`);
    res.json({ ok: true, status, output: (stdout + stderr).split("\n").filter(Boolean) });
  } catch (err) {
    console.error("[rpcnode] create error:", err.message);
    res.status(500).json({ error: err.message, output: err.message.split("\n") });
  }
});

app.post("/api/rpcnode/docker/start", async (_req, res) => {
  try {
    if (!await dockerAvailable()) return res.status(503).json({ error: "Docker not available" });
    const current = await getContainerStatus(RPCNODE_CONTAINER);
    if (current === "not_found") {
      return res.status(404).json({
        error: `Container "${RPCNODE_CONTAINER}" does not exist. Create it first on the server:\n  docker compose up litenode -d\nOr set RPCNODE_CONTAINER_NAME to the correct container name.`,
      });
    }
    await execAsync(`docker start ${RPCNODE_CONTAINER}`, { timeout: 15000 });
    const status = await getContainerStatus(RPCNODE_CONTAINER);
    console.log(`[rpcnode] started ${RPCNODE_CONTAINER} → ${status}`);
    res.json({ ok: true, status });
  } catch (err) { console.error("[rpcnode] start:", err.message); res.status(500).json({ error: err.message }); }
});

app.post("/api/rpcnode/docker/stop", async (_req, res) => {
  try {
    if (!await dockerAvailable()) return res.status(503).json({ error: "Docker not available" });
    await execAsync(`docker stop ${RPCNODE_CONTAINER}`, { timeout: 30000 });
    const status = await getContainerStatus(RPCNODE_CONTAINER);
    console.log(`[rpcnode] stopped ${RPCNODE_CONTAINER} → ${status}`);
    res.json({ ok: true, status });
  } catch (err) { console.error("[rpcnode] stop:", err.message); res.status(500).json({ error: err.message }); }
});

app.post("/api/rpcnode/docker/restart", async (_req, res) => {
  try {
    if (!await dockerAvailable()) return res.status(503).json({ error: "Docker not available" });
    await execAsync(`docker restart ${RPCNODE_CONTAINER}`, { timeout: 30000 });
    const status = await getContainerStatus(RPCNODE_CONTAINER);
    console.log(`[rpcnode] restarted ${RPCNODE_CONTAINER} → ${status}`);
    res.json({ ok: true, status });
  } catch (err) { console.error("[rpcnode] restart:", err.message); res.status(500).json({ error: err.message }); }
});

app.get("/api/rpcnode/docker/logs", async (req, res) => {
  const lines = Math.min(parseInt(req.query.lines) || 150, 500);
  try {
    if (!await dockerAvailable()) return res.json({ docker: false, logs: [] });
    const { stdout } = await execAsync(`docker logs --tail=${lines} --timestamps ${RPCNODE_CONTAINER} 2>&1`, { timeout: 10000 });
    res.json({ ok: true, logs: stdout.split("\n").filter(Boolean), container: RPCNODE_CONTAINER });
  } catch (err) { res.json({ ok: false, logs: [], error: err.message }); }
});

app.get("/api/rpcnode/docker/stats", async (_req, res) => {
  try {
    if (!await dockerAvailable()) return res.json({ docker: false });
    const status = await getContainerStatus(RPCNODE_CONTAINER);
    if (status !== "running") return res.json({ docker: true, status, stats: null });
    const { stdout } = await execAsync(
      `docker stats ${RPCNODE_CONTAINER} --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}'`,
      { timeout: 8000 }
    );
    const [cpu, mem, net] = stdout.trim().split("|");
    res.json({ docker: true, status, stats: { cpu, mem, net } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Node Config (.env read/write) ─────────────────────────────────────────────

const ENV_PATH = path.join(process.cwd(), ".env");

const NODE_CONFIG_KEYS = [
  "UPSTREAM_RPC",
  "BOOTNODE_URL",
  "FULLNODE_RPC_1",
  "FULLNODE_RPC_2",
  "FULLNODE_RPC_3",
  "LITENODE_RATE_PER_MIN",
];

function readEnvFile() {
  try { return fs.readFileSync(ENV_PATH, "utf-8"); } catch { return ""; }
}

function writeEnvVars(vars) {
  let content = readEnvFile();
  let lines = content.split("\n");
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined || value === null) continue;
    const idx = lines.findIndex(l => l.split("=")[0].replace(/^#\s*/, "").trim() === key);
    const newLine = value !== "" ? `${key}=${value}` : `# ${key}=`;
    if (idx >= 0) { lines[idx] = newLine; }
    else { lines.push(newLine); }
  }
  fs.writeFileSync(ENV_PATH, lines.join("\n"));
}

// GET /api/nodes/config — returns current node configuration
app.get("/api/nodes/config", (_req, res) => {
  res.json({
    // No public-network default: private ledger infrastructure must fail closed.
    UPSTREAM_RPC:         process.env.UPSTREAM_RPC         || "",
    BOOTNODE_URL:         process.env.BOOTNODE_URL          || "",
    FULLNODE_RPC_1:       process.env.FULLNODE_RPC_1        || "",
    FULLNODE_RPC_2:       process.env.FULLNODE_RPC_2        || "",
    FULLNODE_RPC_3:       process.env.FULLNODE_RPC_3        || "",
    LITENODE_RATE_PER_MIN: process.env.LITENODE_RATE_PER_MIN || "120",
  });
});

// POST /api/nodes/config — write vars to .env, optionally restart litenode
app.post("/api/nodes/config", async (req, res) => {
  try {
    const vars = {};
    for (const key of NODE_CONFIG_KEYS) {
      if (req.body[key] !== undefined) vars[key] = req.body[key];
    }
    writeEnvVars(vars);
    for (const [k, v] of Object.entries(vars)) process.env[k] = v;

    let restarted = false;
    if (req.body.restartLitenode && await dockerAvailable()) {
      try {
        await execAsync(`docker compose up -d litenode 2>&1`, { timeout: 60000, cwd: process.cwd() });
        restarted = true;
        console.log("[nodes] litenode restarted with new config");
      } catch (e) { console.warn("[nodes] litenode restart failed:", e.message); }
    }

    res.json({ ok: true, written: Object.keys(vars), restarted });
  } catch (err) {
    console.error("[nodes] config write error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/nodes/test — test reachability of a given RPC/HTTP URL
app.post("/api/nodes/test", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
  try {
    const { default: fetch } = await import("node-fetch").catch(() => ({ default: globalThis.fetch }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url.startsWith("enode://") ? `https://httpbin.org/get` : url, {
      method: url.startsWith("enode://") ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: url.startsWith("enode://") ? undefined : JSON.stringify({ jsonrpc: "2.0", id: 1, method: "net_version", params: [] }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    const json = await r.json().catch(() => ({}));
    res.json({ ok: r.ok, status: r.status, result: json.result || null });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[build-server] listening on port ${PORT}`);
  if (twilioOk()) console.log(`[build-server] SMS (Twilio) ✓  from ${TWILIO_FROM}`);
  else            console.log(`[build-server] SMS (Twilio) — not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)`);
  if (whatsappOk()) console.log(`[build-server] WhatsApp OTP (Twilio) ✓`);
  else               console.log(`[build-server] WhatsApp OTP — not configured (set TWILIO_WHATSAPP_FROM)`);
  if (smtpOk())   console.log(`[build-server] Email (SMTP) ✓  ${SMTP_HOST}:${SMTP_PORT}`);
  else            console.log(`[build-server] Email (SMTP)  — not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)`);
});
