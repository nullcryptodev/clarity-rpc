/**
 * Fetch a state proof from the node and verify it locally.
 */

import { RpcClient, verifyProof, ErrorCodes, RpcError } from "@claritychain/rpc";

const client = new RpcClient({
  url: process.env.CLARITY_RPC_URL ?? "http://127.0.0.1:9633",
});

const keyBytes = process.env.CLARITY_KEY_BYTES ?? "0x" + "00".repeat(32);

try {
  const proof = await client.getProof({
    key_type: 0,
    key_bytes: keyBytes,
    version: "current",
  });

  console.log("status:", proof.status);
  console.log("root:  ", proof.state_root);
  console.log("proof: ", proof.proof?.slice(0, 40) + "…");

  if (!proof.proof) {
    console.log("no proof payload");
    process.exit(0);
  }

  const ok = verifyProof(proof, { expectedRoot: proof.state_root });
  console.log("verifies:", ok);

  if (!ok) process.exit(1);
} catch (err) {
  if (RpcError.is(err)) {
    if (err.code === ErrorCodes.ProofNotAvailable) {
      console.log("key not present at this version (non-inclusion)");
      process.exit(0);
    }
    console.error(`rpc ${err.code}: ${err.message}`);
  }
  throw err;
}