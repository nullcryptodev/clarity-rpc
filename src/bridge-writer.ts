/**
 * Bridge write path.
 *
 * Three functions for the bridge bootstrap flow, plus the shared
 * submit-and-optionally-wait plumbing (reused from `dex-writer`).
 *
 * The three transactions are:
 *
 *   bridgeRegisterChain    — governance. Registers a source chain
 *                            on Clarity and (adopt-or-create) the
 *                            wrapped token. Requires a quorum of
 *                            validator signatures over the
 *                            registration blob.
 *
 *   registerBridgeWatcher  — per-watcher. Locks the watcher's stake
 *                            and adds them to the active set for a
 *                            chain. Single-signer, authorized by
 *                            the caller's own transaction signature.
 *
 *   unregisterBridgeWatcher — per-watcher. Starts the unbonding.
 *                            Single-signer.
 *
 * The bridge client's read surface (`BridgeClient`) answers "is the
 * chain registered?" and "am I a watcher for this chain?"; a UI
 * calls those first and only offers the write if the answer is "no".
 */

import type { RpcClient } from "./client.js";
import type { HashHex } from "./types.js";
import type { SignerFn } from "./builder.js";
import { TxBuilder } from "./builder.js";
import type { WriteOptions, SubmitOptions, SubmitResult } from "./dex-writer.js";

// =============================================================== RegisterChain

export interface BridgeRegisterChainArgs {
  /** The source chain id. For BTC, 0x42544331n. */
  sourceChainId: bigint;

  /**
   * The free token id the wrapped token will occupy. The chain
   * has no "allocate for me" sentinel: `BridgeChainRegistration`
   * requires a non-zero id, and the executor honours it. If a
   * token exists at that id already, it's adopted (wCCX); if not,
   * a new token is created there (wBTC).
   *
   * On regtest after wCCX, the next free id is `2`.
   */
  wrappedTokenId: number;

  /** 32-byte commitment to (chain_id, asset_id). */
  fingerprint: Uint8Array;

  sourceDecimals: number;
  clarityDecimals: number;
  confirmationDepth: number;
  destinationBlobMinLen: number;
  destinationBlobMaxLen: number;
  enabled: boolean;
  activeWatcherMin: number;

  /**
   * The governance signature block. Signatures are over
   * `Blake2b("brgr" || serializeState(registration))`.
   * `signerIndices` are the positions in the sorted active
   * validator set.
   */
  signerIndices: number[];
  signatures: Uint8Array[];
}

export async function submitBridgeRegisterChain(
  rpc: RpcClient,
  opts: WriteOptions,
  args: BridgeRegisterChainArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await rpc.getNonce(opts.from).then((r) => BigInt(r.nonce));
  const unsigned = TxBuilder.bridgeRegisterChain({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    sourceChainId: args.sourceChainId,
    wrappedTokenId: args.wrappedTokenId,
    fingerprint: args.fingerprint,
    sourceDecimals: args.sourceDecimals,
    clarityDecimals: args.clarityDecimals,
    confirmationDepth: args.confirmationDepth,
    destinationBlobMinLen: args.destinationBlobMinLen,
    destinationBlobMaxLen: args.destinationBlobMaxLen,
    enabled: args.enabled,
    activeWatcherMin: args.activeWatcherMin,
    signerIndices: args.signerIndices,
    signatures: args.signatures,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== RegisterWatcher

export interface RegisterBridgeWatcherArgs {
  sourceChainId: bigint;
  /** Must be >= BRIDGE_WATCHER_MIN_STAKE (== VALIDATOR_MIN_STAKE). */
  stake: bigint;
}

export async function submitRegisterBridgeWatcher(
  rpc: RpcClient,
  opts: WriteOptions,
  args: RegisterBridgeWatcherArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await rpc.getNonce(opts.from).then((r) => BigInt(r.nonce));
  const unsigned = TxBuilder.registerBridgeWatcher({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    sourceChainId: args.sourceChainId,
    stake: args.stake,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== UnregisterWatcher

export interface UnregisterBridgeWatcherArgs {
  sourceChainId: bigint;
}

export async function submitUnregisterBridgeWatcher(
  rpc: RpcClient,
  opts: WriteOptions,
  args: UnregisterBridgeWatcherArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await rpc.getNonce(opts.from).then((r) => BigInt(r.nonce));
  const unsigned = TxBuilder.unregisterBridgeWatcher({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    sourceChainId: args.sourceChainId,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== Pipeline

/**
 * Sign, submit, optionally wait. Same shape as `dex-writer.ts`,
 * duplicated here so the bridge writer doesn't depend on the DEX
 * module's private helpers. If `signSubmitWait` and
 * `pollForReceipt` are already exported from `dex-writer.ts`
 * (they aren't in the version I have), prefer importing them; a
 * small refactor moves them to a shared `writer-common.ts` and
 * both writers import from there.
 */
async function signSubmitWait(
  rpc: RpcClient,
  unsigned: ReturnType<typeof TxBuilder.bridgeRegisterChain>,
  signer: SignerFn,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const signed = await unsigned.sign(signer);
  const hex = signed.toHex();

  let sendResult: { tx_hash: HashHex; accepted: true };
  try {
    sendResult = await rpc.sendRawTransaction(hex);
  } catch (e) {
    throw new Error(
      `node rejected transaction: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const txid = sendResult.tx_hash;

  if (!submit?.wait) {
    return { txid };
  }

  const receipt = await pollForReceipt(
    rpc,
    txid,
    submit.waitTimeoutMs ?? 60_000,
    submit.pollIntervalMs ?? 1_000,
  );
  return { txid, receipt };
}

async function pollForReceipt(
  rpc: RpcClient,
  txid: HashHex,
  timeoutMs: number,
  intervalMs: number,
): Promise<{
  status: "success" | "failure";
  feePaid: bigint;
  blockHeight: bigint;
  blockHash: HashHex;
  raw: unknown;
}> {
  const deadline = Date.now() + timeoutMs;

  for (; ;) {
    try {
      const raw = (await rpc.getTransactionReceipt(txid)) as any;
      const r = (raw && typeof raw === "object" && "receipt" in raw)
        ? (raw as any).receipt
        : raw;

      return {
        status: r.status === "success" ? "success" : "failure",
        feePaid: BigInt(r.fee_paid),
        blockHeight: BigInt(r.block_height),
        blockHash: r.block_hash,
        raw: r,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("not found") && !msg.includes("ReceiptNotFound")) {
        throw e;
      }
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `transaction ${txid} was not confirmed within ${timeoutMs}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// =============================================================== Burn

export interface BridgeBurnArgs {
  /** The source chain this burn targets. CCX is 0x43435831n, BTC is 0x42544331n. */
  sourceChainId: bigint;
  /**
   * The 64-byte (spend ‖ view) destination blob, exactly as the
   * chain stores it. For CCX that's the pair of 32-byte public
   * keys; for a scriptPubKey chain (Bitcoin) it's the scriptPubKey
   * bytes. The chain's `BridgeBurn` executor validates the length
   * against `destination_blob_min_len` / `_max_len` from the
   * registration, and the destination address is the string form
   * the release path will hand to the source chain.
   *
   * If you have the destination address as a string, the adapter
   * on the daemon side is the one that knows the decode; the
   * webwallet needs both fields because the chain records both
   * verbatim. For CCX the blob is `base58_decode(spend ‖ view)`
   * minus the prefix and checksum; the wallet's address decoder
   * exposes that as a helper (see `decodeDestinationBlob` in
   * bridge-helpers.ts — if it doesn't exist yet, that's the
   * small follow-up).
   */
  destinationBlob: Uint8Array;
  /** The string form of the same destination. */
  destinationAddress: string;
  /** Amount in Clarity atomic units. */
  amount: bigint;
}

export async function submitBridgeBurn(
  rpc: RpcClient,
  opts: WriteOptions,
  args: BridgeBurnArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  //  Client-side validation before the network call. The chain
  //  validates the same things (destination blob length against
  //  the registration's bounds, destination address non-empty,
  //  amount non-zero, token balance sufficient), but failing here
  //  gives the caller a clear error instead of a mempool rejection.
  if (args.destinationAddress.length === 0) {
    throw new Error("destinationAddress must not be empty");
  }
  if (args.destinationAddress.length > 255) {
    throw new Error("destinationAddress exceeds 255 bytes");
  }
  if (args.amount === 0n) {
    throw new Error("amount must be greater than zero");
  }

  const nonce = await rpc.getNonce(opts.from).then((r) => BigInt(r.nonce));
  const unsigned = TxBuilder.bridgeBurn({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    sourceChainId: args.sourceChainId,
    destinationBlob: args.destinationBlob,
    destinationAddress: args.destinationAddress,
    amount: args.amount,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}