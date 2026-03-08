import { ethers } from "ethers";

const RPC_TIMEOUT_MS = 5000;

interface RpcStatus {
  url: string;
  reachable: boolean | null;
  checkedAt: number;
}

const rpcStatusCache: Map<string, RpcStatus> = new Map();
const RPC_CHECK_INTERVAL = 60_000;

/**
 * Try connecting to multiple RPC URLs in order, returning the first working provider.
 * If one goes down, the next is tried automatically.
 */
export async function getProviderWithFallback(
  rpcUrls: string[]
): Promise<ethers.JsonRpcProvider | null> {
  for (const url of rpcUrls) {
    if (!url) continue;

    // Check cache
    const cached = rpcStatusCache.get(url);
    if (cached && cached.reachable === false && Date.now() - cached.checkedAt < RPC_CHECK_INTERVAL) {
      continue; // Skip known-dead RPCs
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

/**
 * Test all RPC URLs and return their status.
 */
export async function testAllRpcs(
  rpcUrls: string[]
): Promise<{ url: string; reachable: boolean; chainId?: string; latencyMs?: number }[]> {
  const results = await Promise.all(
    rpcUrls.map(async (url) => {
      const start = Date.now();
      try {
        const provider = new ethers.JsonRpcProvider(url);
        const network = await Promise.race([
          provider.getNetwork(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), RPC_TIMEOUT_MS)
          ),
        ]);
        return {
          url,
          reachable: true,
          chainId: network.chainId.toString(),
          latencyMs: Date.now() - start,
        };
      } catch {
        return { url, reachable: false, latencyMs: Date.now() - start };
      }
    })
  );
  return results;
}
