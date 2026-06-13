import { spawn } from "child_process";

const colors = { cyan: "\x1b[36m", yellow: "\x1b[33m", reset: "\x1b[0m" };

function spawnProcess(name, cmd, args, color) {
  const proc = spawn(cmd, args, {
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
  proc.on("exit", (code) => {
    console.log(`${color}[${name}]${colors.reset} exited with code ${code}`);
    process.exit(code ?? 1);
  });

  return proc;
}

const viteProc = spawnProcess(
  "vite",
  "./node_modules/.bin/vite",
  [],
  colors.cyan
);

const serverProc = spawnProcess(
  "build-srv",
  "node",
  ["build-server.mjs"],
  colors.yellow
);

process.on("SIGTERM", () => {
  viteProc.kill("SIGTERM");
  serverProc.kill("SIGTERM");
});
process.on("SIGINT", () => {
  viteProc.kill("SIGINT");
  serverProc.kill("SIGINT");
});
