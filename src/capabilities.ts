/**
 * Capability probing.
 *
 * The node exposes `getMethods`, which returns a map of category to
 * method names. A client that wants to render UI conditionally, or
 * an exporter that wants to run a subset of checks, can probe once
 * at startup and cache the result.
 *
 * The probe is tolerant: if `getMethods` isn't supported, it falls
 * back to a small hard-coded set based on what a v1 node ships.
 */

import type { RpcClient } from "./client.js";

export interface Capabilities {
  /** Map from category name to the set of method names in that category. */
  byCategory: Record<string, Set<string>>;
  /** Flat set of every method name the node advertises. */
  all: Set<string>;
  /** Whether `getMethods` succeeded; false means the fallback was used. */
  probed: boolean;
}

const FALLBACK_METHODS: Record<string, string[]> = {
  chain: [
    "chainId", "blockNumber", "getBlockByNumber", "getBlockByHash",
    "getBlockHeaderByNumber", "getBlocksRange", "getBlocksByProducer",
    "getBlockStats", "getChainStats", "getEpochInfo", "getEpochSchedule",
    "getRecentBlocks", "getStateRoot",
  ],
  state: [
    "getBalance", "getAccount", "getNonce", "getTokensForAddress",
    "getPositionsForAddress", "getOrdersForAddress",
    "getTransactionsForAddress", "getStakingInfo", "getAddressStats",
    "getAddressList", "getProof",
  ],
  tokens: [
    "getTokenInfo", "getTokenSupply", "getAllTokens", "getTokenHolders",
    "getTokenTransfers", "getTokensByCreator",
  ],
  nfts: [
    "getNft", "getNftsForOwner", "getNftsForCollection",
    "getCollection", "getAllCollections",
  ],
  amm: [
    "getPool", "getPosition", "getPositionByOwner", "getAllPools",
    "getPoolsForToken", "getPositionsForPool",
  ],
  orders: [
    "getOrder", "getOrdersExpiringAt", "getAllOrders", "getOrdersByPair",
    "getOrderBook", "getOrderFills", "getPairTrades",
  ],
  transactions: [
    "sendRawTransaction", "getTransactionByHash", "getTransactionReceipt",
    "simulateTransaction", "getRecentTransactions", "getAllTransactions",
    "getTransactionsByType", "getTxCount",
  ],
  mempool: ["getMempoolStats", "getMempoolTx", "getMempoolList"],
  consensus: [
    "getValidators", "getValidator", "getValidatorByAddress",
    "getValidatorStats", "getActiveSet", "getConsensusState",
  ],
  metrics: ["getFeeStats", "getPotInfo"],
  node: [
    "ping", "status", "health", "getPeers", "getConfig", "getMethods",
    "web3_clientVersion", "net_version", "net_peerCount", "net_listening",
  ],
};

export async function probeCapabilities(
  client: RpcClient,
): Promise<Capabilities> {
  try {
    const raw = await client.getMethods();
    const byCategory: Record<string, Set<string>> = {};
    const all = new Set<string>();
    for (const [category, methods] of Object.entries(raw)) {
      const set = new Set(methods);
      byCategory[category] = set;
      for (const m of methods) all.add(m);
    }
    return { byCategory, all, probed: true };
  } catch {
    return buildFallback();
  }
}

export function hasMethod(caps: Capabilities, method: string): boolean {
  return caps.all.has(method);
}

function buildFallback(): Capabilities {
  const byCategory: Record<string, Set<string>> = {};
  const all = new Set<string>();
  for (const [category, methods] of Object.entries(FALLBACK_METHODS)) {
    byCategory[category] = new Set(methods);
    for (const m of methods) all.add(m);
  }
  return { byCategory, all, probed: false };
}