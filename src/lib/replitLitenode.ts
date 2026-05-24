// ── Replit Litenode — In-browser mock Ethereum JSON-RPC server ───────────────
//
// For testing blockchain features without a real network.
// The admin can start/stop it and configure mock behaviour.
// When running, the app uses the litenode instead of the real RPC URL.
//
// Stores state in localStorage so it persists across hot-reloads.

export interface LitenodeConfig {
  running: boolean;
  networkName: string;
  chainId: number;
  blockTime: number;       // ms between auto-mined blocks
  latencyMs: number;       // simulated network delay
  failureRate: number;     // 0–100 % chance a tx "fails"
  gasPrice: string;        // in wei (hex)
  mockBalances: Record<string, string>; // address → balance in ETH
  txLog: MockTx[];
  currentBlock: number;
  lastUpdated: number;
}

export interface MockTx {
  hash: string;
  from: string;
  to: string;
  value: string;    // ETH string
  status: "pending" | "confirmed" | "failed";
  blockNumber: number;
  timestamp: number;
  gasUsed: string;
}

export interface RPCRequest {
  jsonrpc: string;
  id: number | string | null;
  method: string;
  params: unknown[];
}

export interface RPCResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const STORAGE_KEY = "vb.litenode.config";
const LITENODE_RPC_URL = "__replit_litenode__";

export const DEFAULT_CONFIG: LitenodeConfig = {
  running: false,
  networkName: "VirtualBank TestNet",
  chainId: 99999,
  blockTime: 3000,
  latencyMs: 200,
  failureRate: 0,
  gasPrice: "0x3B9ACA00",  // 1 Gwei
  mockBalances: {},
  txLog: [],
  currentBlock: 1000,
  lastUpdated: Date.now(),
};

// ── State ─────────────────────────────────────────────────────────────────────

let _config: LitenodeConfig = loadConfig();
let _miningTimer: ReturnType<typeof setInterval> | null = null;
let _listeners: Array<() => void> = [];

export function loadConfig(): LitenodeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(c: LitenodeConfig) {
  _config = c;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {}
  _listeners.forEach(fn => fn());
}

export function getConfig(): LitenodeConfig {
  return _config;
}

export function onConfigChange(fn: () => void): () => void {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

export function getLitenodeRpcUrl(): string {
  return LITENODE_RPC_URL;
}

export function isLitenodeActive(): boolean {
  return _config.running;
}

// ── Start / Stop ──────────────────────────────────────────────────────────────

export function startLitenode(patch?: Partial<LitenodeConfig>) {
  const cfg: LitenodeConfig = { ..._config, ...(patch || {}), running: true, lastUpdated: Date.now() };
  saveConfig(cfg);
  startMining(cfg);
}

export function stopLitenode() {
  if (_miningTimer) { clearInterval(_miningTimer); _miningTimer = null; }
  saveConfig({ ..._config, running: false, lastUpdated: Date.now() });
}

export function updateConfig(patch: Partial<LitenodeConfig>) {
  const cfg = { ..._config, ...patch, lastUpdated: Date.now() };
  saveConfig(cfg);
  if (cfg.running) {
    if (_miningTimer) clearInterval(_miningTimer);
    startMining(cfg);
  }
}

export function clearTxLog() {
  saveConfig({ ..._config, txLog: [] });
}

export function setMockBalance(address: string, ethAmount: string) {
  saveConfig({
    ..._config,
    mockBalances: { ..._config.mockBalances, [address.toLowerCase()]: ethAmount },
  });
}

// ── Auto-mining ───────────────────────────────────────────────────────────────

function startMining(cfg: LitenodeConfig) {
  if (_miningTimer) clearInterval(_miningTimer);
  _miningTimer = setInterval(() => {
    const current = getConfig();
    if (!current.running) { clearInterval(_miningTimer!); return; }

    // Mine pending transactions
    const updated = current.txLog.map(tx =>
      tx.status === "pending" && Date.now() - tx.timestamp > current.blockTime
        ? { ...tx, status: ("confirmed" as const), blockNumber: current.currentBlock + 1 }
        : tx
    );

    saveConfig({ ...current, txLog: updated, currentBlock: current.currentBlock + 1 });
  }, cfg.blockTime);
}

if (_config.running) startMining(_config);

// ── RPC Handler ───────────────────────────────────────────────────────────────

function toHex(n: number | bigint): string {
  return "0x" + n.toString(16);
}

function ethToWei(eth: string): bigint {
  const [int, frac = ""] = eth.split(".");
  const fracPadded = (frac + "000000000000000000").slice(0, 18);
  return BigInt(int) * BigInt("1000000000000000000") + BigInt(fracPadded);
}

function weiToEth(wei: bigint): string {
  const eth = wei / BigInt("1000000000000000000");
  const rem = wei % BigInt("1000000000000000000");
  const frac = rem.toString().padStart(18, "0").replace(/0+$/, "") || "0";
  return `${eth}.${frac}`;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleRPCCall(req: RPCRequest): Promise<RPCResponse> {
  const cfg = getConfig();
  if (!cfg.running) {
    return { jsonrpc: "2.0", id: req.id, error: { code: -32603, message: "Replit litenode is not running" } };
  }

  await delay(cfg.latencyMs);

  const ok = (result: unknown): RPCResponse => ({ jsonrpc: "2.0", id: req.id, result });
  const err = (code: number, message: string): RPCResponse => ({ jsonrpc: "2.0", id: req.id, error: { code, message } });

  try {
    switch (req.method) {

      case "eth_chainId":
        return ok(toHex(cfg.chainId));

      case "net_version":
        return ok(String(cfg.chainId));

      case "eth_blockNumber":
        return ok(toHex(cfg.currentBlock));

      case "eth_gasPrice":
        return ok(cfg.gasPrice);

      case "eth_getBalance": {
        const addr = (req.params[0] as string).toLowerCase();
        const balanceEth = cfg.mockBalances[addr] ?? "100.0";
        return ok(toHex(ethToWei(balanceEth)));
      }

      case "eth_getTransactionCount": {
        const addr = (req.params[0] as string).toLowerCase();
        const count = cfg.txLog.filter(tx => tx.from.toLowerCase() === addr).length;
        return ok(toHex(count));
      }

      case "eth_estimateGas":
        return ok(toHex(21000));

      case "eth_getBlockByNumber": {
        const blockNum = req.params[0] === "latest" ? cfg.currentBlock : parseInt(req.params[0] as string, 16);
        return ok({
          number: toHex(blockNum),
          hash: randomHex(32),
          parentHash: randomHex(32),
          timestamp: toHex(Math.floor(Date.now() / 1000)),
          transactions: [],
          gasLimit: toHex(8000000),
          gasUsed: toHex(0),
          miner: "0x0000000000000000000000000000000000000000",
        });
      }

      case "eth_sendRawTransaction": {
        // Simulate failure rate
        if (cfg.failureRate > 0 && Math.random() * 100 < cfg.failureRate) {
          return err(-32000, "Mock transaction failure (simulated by litenode)");
        }

        const hash = randomHex(32);
        const mockTx: MockTx = {
          hash,
          from: randomHex(20),
          to: randomHex(20),
          value: "0.001",
          status: "pending",
          blockNumber: cfg.currentBlock + 1,
          timestamp: Date.now(),
          gasUsed: "21000",
        };

        saveConfig({ ...getConfig(), txLog: [mockTx, ...getConfig().txLog].slice(0, 100) });
        return ok(hash);
      }

      case "eth_getTransactionReceipt": {
        const hash = req.params[0] as string;
        const tx = cfg.txLog.find(t => t.hash === hash);
        if (!tx || tx.status === "pending") return ok(null);
        return ok({
          transactionHash: tx.hash,
          blockNumber: toHex(tx.blockNumber),
          blockHash: randomHex(32),
          status: tx.status === "confirmed" ? "0x1" : "0x0",
          gasUsed: toHex(21000),
          from: tx.from,
          to: tx.to,
          logs: [],
        });
      }

      case "eth_getTransactionByHash": {
        const hash = req.params[0] as string;
        const tx = cfg.txLog.find(t => t.hash === hash);
        if (!tx) return ok(null);
        return ok({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: toHex(ethToWei(tx.value)),
          blockNumber: tx.status !== "pending" ? toHex(tx.blockNumber) : null,
          gas: toHex(21000),
          gasPrice: cfg.gasPrice,
          nonce: toHex(0),
          input: "0x",
        });
      }

      case "eth_call":
        return ok("0x");

      case "web3_clientVersion":
        return ok("VirtualBankLitenode/1.0.0");

      case "eth_syncing":
        return ok(false);

      default:
        return err(-32601, `Method ${req.method} not supported by litenode`);
    }
  } catch (e: any) {
    return err(-32603, e.message || "Internal litenode error");
  }
}

// ── Interceptor — patches fetch/XMLHttpRequest to intercept litenode calls ────
// When the app sends a fetch() to LITENODE_RPC_URL, we handle it locally.

let _interceptorInstalled = false;

export function installInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();

    if (url !== LITENODE_RPC_URL) return origFetch(input, init);

    try {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const response = await handleRPCCall(body as RPCRequest);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

// Install immediately on import
installInterceptor();
