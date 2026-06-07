import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;
const BUILDS_FILE = path.join(__dirname, ".local", "builds.json");

app.use(cors());
app.use(express.json());

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
    sseSend(res, { type: "done", status: current.status });
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

// POST /api/build — start a new build
app.post("/api/build", (req, res) => {
  if (current && current.status === "running") {
    return res.status(409).json({ error: "A build is already in progress" });
  }

  const { version = "1.0.0", buildType = "debug", includeRpcNode = false } = req.body;
  const id = Date.now().toString();
  const startedAt = new Date().toISOString();

  const args = ["build-apk.sh", "--version", version, "--type", buildType];
  if (includeRpcNode) args.push("--include-rpc");

  const proc = spawn("bash", args, { cwd: __dirname });

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
  };

  // Persist to history
  const builds = loadBuilds();
  builds.unshift({ id, version, buildType, includeRpcNode, status: "running", startedAt, logs: [], apkFile: null });
  saveBuilds(builds);

  const appendLog = (text) => {
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
    const status = code === 0 ? "success" : "failed";
    current.status = status;
    for (const l of current.listeners) l({ type: "done", status });

    const idx = builds.findIndex((b) => b.id === id);
    if (idx >= 0) {
      builds[idx].status = status;
      builds[idx].finishedAt = new Date().toISOString();
      if (code === 0) {
        builds[idx].apkFile = `VirtualBank-${version}-${buildType}.apk`;
      }
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
  current.proc.kill("SIGTERM");
  res.json({ ok: true });
});

// GET /api/download/:filename — download an APK
app.get("/api/download/:filename", (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith(".apk")) return res.status(400).json({ error: "Invalid file type" });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[build-server] listening on port ${PORT}`);
});
