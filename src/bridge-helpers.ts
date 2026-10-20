import { blake2b256 } from "./crypto.js";
import type { RpcClient } from "./client.js";
import type { Bech32mAddress, HashHex } from "./types.js";

/**
 * The bridge's payment ID for a withdrawal:
 *
 *   Blake2b("back" || LE64(withdrawal_id))
 *
 * The 4-byte "back" domain tag is what makes the ack-attestation
 * signature and the release's payment ID the same preimage. The C++
 * side computes the same value in CcxAdapter::submit_release.
 */
export function paymentIdFor(withdrawalId: bigint): Uint8Array {
  const domain = new TextEncoder().encode("back");
  const id = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    id[i] = Number((withdrawalId >> BigInt(i * 8)) & 0xffn);
  }
  const input = new Uint8Array(domain.length + id.length);
  input.set(domain, 0);
  input.set(id, domain.length);
  return blake2b256(input);
}

export function paymentIdHex(withdrawalId: bigint): HashHex {
  const bytes = paymentIdFor(withdrawalId);
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export interface ExistingRelease {
  txHash: HashHex;
}

/**
 * Check whether a peer has already released this withdrawal by
 * querying the source chain's wallet for transactions with this
 * withdrawal's payment ID. This is the double-release idempotency
 * check from §7.4.3 of the whitepaper, on the client side.
 *
 * `sourceRpc` is the *source chain's* wallet RPC client, not a
 * Clarity client. It must be pointed at the wallet daemon that holds
 * the custody key for the source chain (CCX, in the reference
 * deployment).
 *
 * Returns `null` when no release with this payment ID is visible.
 * Throws on transport failure; a caller that wants to distinguish
 * "definitely no release" from "wallet down" should catch.
 *
 * The `blockCount` parameter bounds the wallet scan; a wallet that
 * has pruned history beyond this window will not find a peer's
 * release even if it exists.
 */
export async function findExistingRelease(
  sourceRpc: RpcClient,
  withdrawalId: bigint,
  custodyAddress: Bech32mAddress,
  blockCount = 200,
): Promise<ExistingRelease | null> {
  const pid = paymentIdHex(withdrawalId);

  // The source chain's wallet RPC. This is a `getTransactionHashes`
  // call against the wallet, not against Clarity.
  const raw = await sourceRpc.call<{
    items?: Array<{ transactionHashes?: string[] }>;
  }>("getTransactionHashes", {
    paymentId: pid.slice(2),
    addresses: [custodyAddress],
    blockCount,
  });

  if (!raw?.items) return null;
  for (const item of raw.items) {
    if (item.transactionHashes && item.transactionHashes.length > 0) {
      return { txHash: "0x" + item.transactionHashes[0] };
    }
  }
  return null;
}