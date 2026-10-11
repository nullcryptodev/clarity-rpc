/**
 * Smoke test against a real node. Run manually:
 *
 *   CLARITY_RPC_URL=http://127.0.0.1:9633 npx tsx scripts/smoke.ts
 *
 * Exits non-zero on the first failure. Not part of `npm test` because
 * it requires a live node.
 */

import {
  RpcClient,
  BlockWatcher,
  probeCapabilities,
  formatClrty,
  DEFAULT_RPC_URL,
} from "@claritychain/rpc";

const url = process.env.CLARITY_RPC_URL ?? DEFAULT_RPC_URL;
const client = new RpcClient({ url, timeoutMs: 5000 });

const steps: Array<[string, () => Promise<unknown>]> = [
  ["ping", () => client.ping()],
  ["chainId", () => client.chainId()],
  ["blockNumber", () => client.blockNumber()],
  ["status", () => client.status()],
  ["getChainStats", () => client.getChainStats()],
  ["getEpochInfo", () => client.getEpochInfo()],
  ["getFeeStats", () => client.getFeeStats()],
  ["getPotInfo", () => client.getPotInfo()],
  ["getActiveSet", () => client.getActiveSet()],
  ["getRecentBlocks", () => client.getRecentBlocks(5)],
  ["getRecentTransactions", () => client.getRecentTransactions(5)],
  ["getMempoolStats", () => client.getMempoolStats()],
  ["getAllTokens", () => client.getAllTokens(5)],
  ["getAllPools", () => client.getAllPools(5)],
  ["getAllOrders", () => client.getAllOrders(5)],
];

console.log(`Smoke test against ${url}\n`);

let failed = 0;
for (const [name, fn] of steps) {
  try {
    const t0 = Date.now();
    const out = await fn();
    const ms = Date.now() - t0;
    const summary = summarize(out);
    console.log(`  ok   ${name.padEnd(22)} ${ms.toString().padStart(5)}ms  ${summary}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name.padEnd(22)} ${(err as Error).message}`);
  }
}

// Capabilities
try {
  const caps = await probeCapabilities(client);
  console.log(`\n  capabilities: ${caps.all.size} methods (probed=${caps.probed})`);
} catch (err) {
  console.log(`  FAIL capabilities       ${(err as Error).message}`);
  failed++;
}

// Watcher: start and stop quickly.
try {
  const w = new BlockWatcher(client, { intervalMs: 500 });
  await w.start();
  await new Promise((r) => setTimeout(r, 600));
  w.stop();
  console.log("  ok   BlockWatcher       started and stopped");
} catch (err) {
  console.log(`  FAIL BlockWatcher       ${(err as Error).message}`);
  failed++;
}

console.log();
if (failed > 0) {
  console.error(`${failed} step(s) failed`);
  process.exit(1);
}
console.log("all steps passed");

// ------------------------------------------------------------- helpers

function summarize(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    return `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""}}`;
  }
  return String(v);
}

// silence unused-import warnings
void formatClrty;