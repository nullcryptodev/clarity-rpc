/**
 * A tiny Prometheus-friendly exporter. Prints a metrics snapshot to
 * stdout as JSON. In production you would wire this to `prom-client`
 * or an HTTP server.
 */

import { RpcClient, formatClrty } from "@claritychain/rpc";

const client = new RpcClient({
  url: process.env.CLARITY_RPC_URL ?? "http://127.0.0.1:9633",
});

async function snapshot() {
  const [status, chain, staking, fees] = await Promise.all([
    client.status(),
    client.getChainStats(),
    client.getStakingInfo(),
    client.getFeeStats(),
  ]);

  return {
    height: BigInt(status.height).toString(),
    peers: BigInt(status.peer_count).toString(),
    mempool_size: BigInt(status.mempool_size).toString(),
    supply: formatClrty(chain.total_supply),
    staked: formatClrty(chain.total_staked),
    stakers: BigInt(chain.staker_count).toString(),
    apy_bps: BigInt(staking.last_effective_apy_bps).toString(),
    total_fees: formatClrty(fees.total_fees_lifetime),
    total_txs: BigInt(fees.total_transactions).toString(),
  };
}

const s = await snapshot();
console.log(JSON.stringify(s, null, 2));