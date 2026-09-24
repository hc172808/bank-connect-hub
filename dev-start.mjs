import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const colors = { cyan: "\x1b[36m", yellow: "\x1b[33m", reset: "\x1b[0m" };
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.join(projectRoot, "node_modules", ".bin", "vite");
let shuttingDown = false;

function spawnProcess(name, cmd, args, color, onExit) {
  const proc = spawn(cmd, args, {
    cwd: projectRoot,
    stdio: "pipe",
    shell: false,
    env: { ...process.env },
  });

  proc.stdout.on("data", (d) =>
    process.stdout.write(`${color}[${name}]${colors.reset} ${d}`)
  );
  proc.stderr.on("data", (d) =>
    process.stderr.write(`${color}[${name}]${colors.reset} ${d}`)
  );
  proc.on("error", (error) => {
    process.stderr.write(
      `${color}[${name}]${colors.reset} failed to start: ${error.message}\n`
    );
    shutdown(1);
  });
  proc.on("exit", (code) => {
    if (shuttingDown) return;
    if (onExit) {
      onExit(code ?? 1);
      return;
    }
    console.log(`${color}[${name}]${colors.reset} exited with code ${code}`);
    shutdown(code ?? 1);
  });

  return proc;
}

const viteProc = spawnProcess(
  "vite",
  viteBin,
  [],
  colors.cyan
);

let serverProc;
const startBuildServer = () => {
  serverProc = spawnProcess(
    "build-srv",
    "node",
    ["build-server.mjs"],
    colors.yellow,
    (code) => {
      if (code === 0 && !shuttingDown) {
        console.log(`${colors.yellow}[build-srv]${colors.reset} restarting after requested update`);
        setTimeout(startBuildServer, 500);
        return;
      }
      console.log(`${colors.yellow}[build-srv]${colors.reset} exited with code ${code}`);
      shutdown(code);
    },
  );
};
startBuildServer();

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const proc of [viteProc, serverProc]) {
    if (!proc.killed) proc.kill("SIGTERM");
  }
  if (code !== 0) process.exitCode = code;
}

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
