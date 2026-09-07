import { supabase } from "@/integrations/supabase/client";
import { buildRpcList, getProviderWithFallback } from "@/lib/rpcFallback";
import type { ethers } from "ethers";

export interface ChainStatus {
  online: boolean;
  rpcUrl?: string;
  chainId?: string;
  blockNumber?: number;
  gasPriceGwei?: number;
  pendingTransactions?: number;
  peerCount?: number;
  latencyMs?: number;
  checkedAt: number;
  error?: string;
}

async function loadRpcList(): Promise<string[]> {
  const { data } = await supabase
    .from("blockchain_settings")
    .select("rpc_url, rpc_urls")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return [];
  return buildRpcList({
    rpc_url: (data as { rpc_url?: string | null }).rpc_url,
    rpc_urls: ((data as { rpc_urls?: unknown }).rpc_urls as string[] | null) ?? null,
  });
}

/** Get a provider pointed at the GYDS node, or null when the node is unreachable. */
export async function getGydsProvider(): Promise<ethers.JsonRpcProvider | null> {
  const urls = await loadRpcList();
  if (urls.length === 0) return null;
  return getProviderWithFallback(urls);
}

async function rawCall(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message || "RPC error");
  return json?.result;
}

/** Live health snapshot of the GYDS node for the admin chain status page. */
export async function getChainStatus(): Promise<ChainStatus> {
  const started = Date.now();
  const urls = await loadRpcList();
  if (urls.length === 0) {
    return { online: false, checkedAt: Date.now(), error: "No GYDS node URL is configured." };
  }

  for (const url of urls) {
    try {
      const [chainId, blockHex, gasHex] = await Promise.all([
        rawCall(url, "eth_chainId"),
        rawCall(url, "eth_blockNumber"),
        rawCall(url, "eth_gasPrice").catch(() => null),
      ]);

      let pending: number | undefined;
      try {
        const block = await rawCall(url, "eth_getBlockByNumber", ["pending", false]);
        pending = Array.isArray(block?.transactions) ? block.transactions.length : undefined;
      } catch {
        pending = undefined;
      }

      let peerCount: number | undefined;
      try {
        const peers = await rawCall(url, "net_peerCount");
        peerCount = peers ? Number(BigInt(peers)) : undefined;
      } catch {
        peerCount = undefined;
      }

      return {
        online: true,
        rpcUrl: url,
        chainId: chainId ? BigInt(chainId).toString() : undefined,
        blockNumber: blockHex ? Number(BigInt(blockHex)) : undefined,
        gasPriceGwei: gasHex ? Number(BigInt(gasHex)) / 1e9 : undefined,
        pendingTransactions: pending,
        peerCount,
        latencyMs: Date.now() - started,
        checkedAt: Date.now(),
      };
    } catch (err) {
      // try the next URL in the chain
      if (url === urls[urls.length - 1]) {
        return {
          online: false,
          rpcUrl: url,
          latencyMs: Date.now() - started,
          checkedAt: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  return { online: false, checkedAt: Date.now(), error: "No GYDS node responded." };
}

/**
 * Attach the current chain block number (and optional on-chain hash) to a
 * completed ledger transaction, so dashboard rows can be matched against the
 * chain. Silently does nothing when the node is unreachable.
 */
export async function anchorTransactionToChain(
  transactionId: string,
  txHash?: string,
): Promise<number | null> {
  try {
    const urls = await loadRpcList();
    for (const url of urls) {
      try {
        const blockHex = await rawCall(url, "eth_blockNumber");
        const blockNumber = Number(BigInt(blockHex));
        await supabase.rpc("record_chain_receipt", {
          _transaction_id: transactionId,
          _block_number: blockNumber,
          _tx_hash: txHash ?? null,
          _status: txHash ? "confirmed" : "anchored",
        });
        return blockNumber;
      } catch {
        /* try next url */
      }
    }
  } catch {
    /* node unreachable — transfer stays off-chain */
  }
  return null;
}
