/**
 * Watch every new block from a local node and print the header.
 *
 * Run with:
 *   npx tsx examples/watch-blocks.ts
 *   CLARITY_RPC_URL=http://127.0.0.1:9633 npx tsx examples/watch-blocks.ts
 */

import { BlockWatcher, RpcClient, DEFAULT_RPC_URL, formatCount, timeAgo } from "@claritychain/rpc";

const url = process.env.CLARITY_RPC_URL ?? DEFAULT_RPC_URL;
const client = new RpcClient({ url });
const watcher = new BlockWatcher(client, { intervalMs: 1000, batchSize: 50 });

watcher.on("block", (h) => {
  const n = BigInt(h.height).toString();
  console.log(
    `#${n.padStart(8)} ${h.hash.slice(0, 18)}…  ` +
    `txs=${String(h.tx_count).padStart(3)}  ` +
    `fees=${formatCount(h.total_fees)}  ` +
    `${timeAgo(h.timestamp_ms)}`,
  );
});

watcher.on("error", (e) => console.error("[watcher]", e));

console.log(`Watching ${url} for new blocks (Ctrl-C to stop)`);
await watcher.start();

process.on("SIGINT", () => {
  watcher.stop();
  process.exit(0);
});