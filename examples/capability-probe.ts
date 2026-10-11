/**
 * Probe a node for what it supports and print the capabilities map.
 * Useful for building UIs that hide methods the node doesn't have.
 */

import { RpcClient, probeCapabilities, hasMethod } from "@claritychain/rpc";

const client = new RpcClient({
  url: process.env.CLARITY_RPC_URL ?? "http://127.0.0.1:9633",
});

const caps = await probeCapabilities(client);
console.log(`probed: ${caps.probed}  total methods: ${caps.all.size}`);

for (const [category, methods] of Object.entries(caps.byCategory)) {
  console.log(`\n${category} (${methods.size})`);
  for (const m of [...methods].sort()) console.log(`  ${m}`);
}

console.log("\nchecks:");
console.log("  getProof        ", hasMethod(caps, "getProof"));
console.log("  simulateTransaction", hasMethod(caps, "simulateTransaction"));
console.log("  getMempoolList  ", hasMethod(caps, "getMempoolList"));