#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env");
const localEnvPath = path.join(root, "db-server", ".env");
const connectionFile = path.join(root, ".local", "database-connection.local.md");

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[trimmed.slice(0, index).trim()] = value;
  }
  return values;
}

function quoteEnv(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

function argValue(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
}

function requireCommand(command, label) {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
  } catch {
    throw new Error(`${label} is required but '${command}' was not found.`);
  }
}

function upsertEnv(file, updates) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (index >= 0) lines[index] = line;
    else lines.push(line);
  }
  fs.writeFileSync(file, `${lines.filter((line, index) => index < lines.length - 1 || line).join("\n").replace(/\n+$/, "")}\n`);
}

function writeConnectionFile({ mode, url, dbHost, dbPort, dbName, dbUser, pgAdminUrl, pgAdminEmail, pgAdminPassword }) {
  fs.mkdirSync(path.dirname(connectionFile), { recursive: true });
  const passwordNote = mode === "local"
    ? `- PostgreSQL password: \`${dbPasswordForFile}\``
    : "- PostgreSQL password: stored only inside `DATABASE_URL`";
  fs.writeFileSync(connectionFile, `# NETLIFE CASH PostgreSQL connection information

Generated: ${new Date().toISOString()}

## Active mode

\`${mode}\`

## Application connection

\`\`\`
DATABASE_MODE=${mode}
DATABASE_URL=${url || "(provided by Replit runtime)"}
\`\`\`

- Host: \`${dbHost}\`
- Port: \`${dbPort}\`
- Database: \`${dbName}\`
- User: \`${dbUser}\`
${passwordNote}

## pgAdmin

- URL: ${pgAdminUrl || "not applicable"}
- Email: \`${pgAdminEmail || "not applicable"}\`
- Password: \`${pgAdminPassword || "not applicable"}\`

## Start/check commands

\`\`\`bash
npm run db:check
# local mode only:
npm run db:up
npm run db:down
\`\`\`

Keep this file private. It is intentionally ignored by Git.
`);
  fs.chmodSync(connectionFile, 0o600);
}

let dbPasswordForFile = "";
const env = { ...parseEnv(envPath), ...process.env };
const mode = (argValue("--mode") || env.DATABASE_MODE || "replit").toLowerCase();

if (!["replit", "local", "remote"].includes(mode)) {
  throw new Error("DATABASE_MODE must be replit, local, or remote.");
}

if (mode === "local") {
  requireCommand("docker", "Docker");
  const dbPassword = env.LOCAL_DB_PASSWORD && !/^change-me/i.test(env.LOCAL_DB_PASSWORD)
    ? env.LOCAL_DB_PASSWORD
    : randomPassword();
  const pgAdminPassword = env.PGADMIN_PASSWORD && !/^change-me/i.test(env.PGADMIN_PASSWORD)
    ? env.PGADMIN_PASSWORD
    : randomPassword();
  const dbHost = env.LOCAL_DB_HOST || "127.0.0.1";
  const dbPort = env.LOCAL_DB_PORT || "5432";
  const dbName = env.LOCAL_DB_NAME || "netlifecash";
  const dbUser = env.LOCAL_DB_USER || "postgres";
  const pgAdminEmail = env.PGADMIN_EMAIL || "admin@netlifecash.com";
  const pgAdminPort = env.PGADMIN_PORT || "5050";
  const url = `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${encodeURIComponent(dbName)}`;
  dbPasswordForFile = dbPassword;

  upsertEnv(envPath, {
    DATABASE_MODE: "local",
    LOCAL_DB_HOST: dbHost,
    LOCAL_DB_PORT: dbPort,
    LOCAL_DB_NAME: dbName,
    LOCAL_DB_USER: dbUser,
    LOCAL_DB_PASSWORD: quoteEnv(dbPassword),
    DATABASE_URL: quoteEnv(url),
    PGADMIN_EMAIL: pgAdminEmail,
    PGADMIN_PASSWORD: quoteEnv(pgAdminPassword),
    PGADMIN_PORT: pgAdminPort,
  });
  fs.writeFileSync(localEnvPath, `POSTGRES_USER=${dbUser}
POSTGRES_PASSWORD=${quoteEnv(dbPassword)}
POSTGRES_DB=${dbName}
POSTGRES_PORT=${dbPort}
PGADMIN_EMAIL=${pgAdminEmail}
PGADMIN_PASSWORD=${quoteEnv(pgAdminPassword)}
PGADMIN_PORT=${pgAdminPort}
`);
  fs.chmodSync(localEnvPath, 0o600);

  console.log("Starting local PostgreSQL and pgAdmin...");
  const result = run("docker", ["compose", "--env-file", localEnvPath, "-f", "db-server/docker-compose.yml", "up", "-d"]);
  if (result.status !== 0) process.exit(result.status ?? 1);

  console.log("Waiting for PostgreSQL health...");
  const localPool = new pg.Pool({
    host: dbHost,
    port: Number(dbPort),
    database: dbName,
    user: dbUser,
    password: dbPassword,
    connectionTimeoutMillis: 2000,
  });
  for (let i = 0; i < 30; i++) {
    try {
      await localPool.query("select 1");
      break;
    } catch (error) {
      if (i === 29) {
        await localPool.end();
        throw new Error(`PostgreSQL did not become reachable within 60 seconds: ${error.message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await localPool.end();

  const schema = path.join(root, "all_migrations.sql");
  if (fs.existsSync(schema)) {
    console.log("Loading all_migrations.sql (re-runs are safe where migrations allow it)...");
    const load = run("psql", ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", dbName, "-f", schema], {
      env: { ...process.env, PGPASSWORD: dbPassword },
    });
    if (load.status !== 0) console.warn("Schema loading returned warnings. Review the output above; the database containers are still running.");
  }

  writeConnectionFile({
    mode, url, dbHost, dbPort, dbName, dbUser,
    pgAdminUrl: `http://127.0.0.1:${pgAdminPort}`,
    pgAdminEmail, pgAdminPassword,
  });
  console.log(`PostgreSQL: ${url}`);
  console.log(`pgAdmin: http://127.0.0.1:${pgAdminPort}`);
  console.log(`Connection information: ${connectionFile}`);
} else {
  const url = env.DATABASE_URL || "";
  if (mode === "remote" && !url) throw new Error("DATABASE_URL is required when DATABASE_MODE=remote.");
  upsertEnv(envPath, { DATABASE_MODE: mode });
  if (mode === "replit" && !url) {
    console.log("DATABASE_MODE=replit selected. DATABASE_URL is supplied by the Replit runtime when available.");
  }
  writeConnectionFile({
    mode,
    url: mode === "remote" ? url : "",
    dbHost: env.PGHOST || "runtime-provided",
    dbPort: env.PGPORT || "5432",
    dbName: env.PGDATABASE || "runtime-provided",
    dbUser: env.PGUSER || "runtime-provided",
    pgAdminUrl: "",
    pgAdminEmail: "",
    pgAdminPassword: "",
  });
  console.log(`DATABASE_MODE=${mode} configured.`);
  console.log(`Connection information: ${connectionFile}`);
}