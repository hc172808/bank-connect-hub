import { ethers } from "ethers";

const RPC_TIMEOUT_MS = 8000;

export interface RpcStatus {
  url: string;
  reachable: boolean | null;
  checkedAt: number;
}

export interface RpcTestResult {
  url: string;
  reachable: boolean;
  chainId?: string;
  latencyMs?: number;
  httpStatus?: number;
  error?: string;
}

const rpcStatusCache: Map<string, RpcStatus> = new Map();
const RPC_CHECK_INTERVAL = 60_000;

/**
 * Test a single RPC URL – checks HTTP reachability first, then JSON-RPC.
 */
export async function testRpc(url: string): Promise<RpcTestResult> {
  const start = Date.now();

  // Step 1 – HTTP-level check (catches 502, 503, 504 before ethers even tries)
  try {
    const httpRes = await Promise.race([
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("HTTP timeout")), RPC_TIMEOUT_MS)
      ),
    ]);

    if (!httpRes.ok) {
      return {
        url,
        reachable: false,
        httpStatus: httpRes.status,
        latencyMs: Date.now() - start,
        error: httpStatusLabel(httpRes.status),
      };
    }

    // Step 2 – parse JSON-RPC response
    const json = await httpRes.json().catch(() => null);
    if (json?.result) {
      const chainId = BigInt(json.result).toString();
      return { url, reachable: true, chainId, latencyMs: Date.now() - start, httpStatus: httpRes.status };
    }

    // Fallback – use ethers for network detection
    const provider = new ethers.JsonRpcProvider(url);
    const network = await Promise.race([
      provider.getNetwork(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), RPC_TIMEOUT_MS)
      ),
    ]);
    return {
      url,
      reachable: true,
      chainId: network.chainId.toString(),
      latencyMs: Date.now() - start,
      httpStatus: httpRes.status,
    };
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    const isTimeout = msg.toLowerCase().includes("timeout");
    return {
      url,
      reachable: false,
      latencyMs: Date.now() - start,
      error: isTimeout ? "Connection timed out" : msg,
    };
  }
}

function httpStatusLabel(status: number): string {
  const labels: Record<number, string> = {
    400: "Bad request (400)",
    401: "Unauthorised (401) – check API key",
    403: "Forbidden (403) – access denied",
    404: "Not found (404) – wrong endpoint path",
    429: "Rate limited (429) – too many requests",
    500: "Server error (500)",
    502: "Bad gateway (502) – server is unreachable or starting up",
    503: "Service unavailable (503) – server is down",
    504: "Gateway timeout (504)",
  };
  return labels[status] ?? `HTTP ${status} error`;
}

/**
 * Test every URL in the list and return results.
 */
export async function testAllRpcs(rpcUrls: string[]): Promise<RpcTestResult[]> {
  return Promise.all(rpcUrls.filter(Boolean).map(testRpc));
}

/**
 * Try connecting to multiple RPC URLs in order, returning the first working provider.
 */
export async function getProviderWithFallback(
  rpcUrls: string[]
): Promise<ethers.JsonRpcProvider | null> {
  for (const url of rpcUrls) {
    if (!url) continue;

    const cached = rpcStatusCache.get(url);
    if (
      cached &&
      cached.reachable === false &&
      Date.now() - cached.checkedAt < RPC_CHECK_INTERVAL
    ) {
      continue;
    }

    try {
      const provider = new ethers.JsonRpcProvider(url);
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RPC timeout")), RPC_TIMEOUT_MS)
        ),
      ]);
      rpcStatusCache.set(url, { url, reachable: true, checkedAt: Date.now() });
      return provider;
    } catch {
      rpcStatusCache.set(url, { url, reachable: false, checkedAt: Date.now() });
    }
  }
  return null;
}

/**
 * Build a unified RPC URL list from blockchain_settings row.
 * Primary rpc_url first, then all rpc_urls entries.
 */
export function buildRpcList(settings: {
  rpc_url?: string | null;
  rpc_urls?: string[] | null;
}): string[] {
  const urls: string[] = [];
  if (settings.rpc_url) urls.push(settings.rpc_url);
  if (settings.rpc_urls && Array.isArray(settings.rpc_urls)) {
    for (const u of settings.rpc_urls) {
      if (u && !urls.includes(u)) urls.push(u);
    }
  }
  return urls;
}

/** Get a safe provider (used by wallet components). */
export async function getSafeProvider(
  rpcUrl: string
): Promise<ethers.JsonRpcProvider | null> {
  return getProviderWithFallback([rpcUrl]);
}
