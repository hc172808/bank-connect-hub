import express from "express";
import cors from "cors";
import { spawn, execSync, exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

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
        const setRemote = execSync(`git remote get-url origin`, { cwd: __dirname }).toString().trim();
        if (setRemote !== remote) {
          execSync(`git remote set-url origin "${remote}"`, { cwd: __dirname });
          output.push(`Remote updated to: ${remote}`);
        }
      } catch {
        execSync(`git remote add origin "${remote}"`, { cwd: __dirname });
        output.push(`Remote set to: ${remote}`);
      }
    }

    const pullOut = execSync(`git pull origin "${branch}" 2>&1`, {
      cwd: __dirname,
      timeout: 120_000,
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
  // Prefer env vars (set by deploy.sh / Portainer)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL || "admin@virtualbank.app"}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
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

const twilioOk = () => !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

async function sendSms(to, body) {
  if (!twilioOk()) throw new Error("Twilio not configured");
  const twilio = (await import("twilio")).default;
  const client = twilio(TWILIO_SID, TWILIO_TOKEN);
  return client.messages.create({ body, from: TWILIO_FROM, to });
}

app.get("/api/sms/status", (_req, res) => {
  res.json({ configured: twilioOk(), from: TWILIO_FROM ? TWILIO_FROM.replace(/\d(?=\d{4})/g, "*") : null });
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

// POST /api/litenode/docker/start
app.post("/api/litenode/docker/start", async (_req, res) => {
  try {
    const hasDocker = await dockerAvailable();
    if (!hasDocker) return res.status(503).json({ error: "Docker not available" });
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

app.post("/api/rpcnode/docker/start", async (_req, res) => {
  try {
    if (!await dockerAvailable()) return res.status(503).json({ error: "Docker not available" });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[build-server] listening on port ${PORT}`);
  if (twilioOk()) console.log(`[build-server] SMS (Twilio) ✓  from ${TWILIO_FROM}`);
  else            console.log(`[build-server] SMS (Twilio) — not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)`);
  if (smtpOk())   console.log(`[build-server] Email (SMTP) ✓  ${SMTP_HOST}:${SMTP_PORT}`);
  else            console.log(`[build-server] Email (SMTP)  — not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)`);
});
