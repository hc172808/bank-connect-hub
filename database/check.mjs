#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }));
}

const env = { ...parseEnv(path.join(root, ".env")), ...process.env };
const mode = (env.DATABASE_MODE || "replit").toLowerCase();
const url = mode === "local"
  ? `postgresql://${encodeURIComponent(env.LOCAL_DB_USER || "postgres")}:${encodeURIComponent(env.LOCAL_DB_PASSWORD || "")}@${env.LOCAL_DB_HOST || "127.0.0.1"}:${env.LOCAL_DB_PORT || "5432"}/${encodeURIComponent(env.LOCAL_DB_NAME || "netlifecash")}`
  : env.DATABASE_URL || "";

console.log(`Database mode: ${mode}`);
if (mode === "local") {
  const { spawnSync } = await import("node:child_process");
  const localDbDir = env.LOCAL_DB_DIR || path.join(root, "db-server");
  const composeFile = path.join(localDbDir, "docker-compose.yml");
  const composeEnv = path.join(localDbDir, ".env");
  if (fs.existsSync(composeFile) && fs.existsSync(composeEnv)) {
    const composeArgs = [
      "compose",
      "--project-name", env.LOCAL_DB_PROJECT || "netlifecash-db",
      "--env-file", composeEnv,
      "-f", composeFile,
      "ps",
    ];
    const result = spawnSync("docker", composeArgs, { cwd: root, encoding: "utf8" });
    process.stdout.write(result.stdout || "");
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

const config = url
  ? { connectionString: url, connectionTimeoutMillis: 5000 }
  : { host: env.PGHOST, port: Number(env.PGPORT || 5432), user: env.PGUSER, password: env.PGPASSWORD, database: env.PGDATABASE, connectionTimeoutMillis: 5000 };
if (!config.connectionString && !config.host) {
  throw new Error("No database connection is available. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.");
}

const pool = new pg.Pool(config);
try {
  const result = await pool.query("select current_database() as database, current_user as user, version()");
  console.log(JSON.stringify({ ok: true, mode, ...result.rows[0] }, null, 2));
} finally {
  await pool.end();
}