/**
 * DEX write path.
 *
 * Four functions, one per AMM operation, plus the shared
 * submit-and-optionally-wait plumbing. Each function:
 *
 *   1. Fetches the caller's current nonce.
 *   2. Builds and signs a transaction with the caller's signer.
 *   3. Submits it via sendRawTransaction.
 *   4. Optionally polls for the receipt.
 *
 * The fee is the caller's responsibility. This chain has no gas
 * estimation; a fee is a flat amount paid to the block producer,
 * and the mempool's minimum varies. A typical UI will offer a fee
 * selector with a small default (e.g. 1000 atomic units, matching
 * the wallet CLI's default) and let the user override.
 *
 * Every function throws on failure. The caller is expected to
 * catch and display. Errors carry a message suitable for a UI.
 */

import type { RpcClient } from "./client.js";
import type { Bech32mAddress, HashHex } from "./types.js";
import type { SignerFn } from "./builder.js";
import { TxBuilder } from "./builder.js";
import { applySlippage, computeSwapOutput } from "./dex-maths.js";
import type { DexPool } from "./dex-types.js";

// =============================================================== Common

export interface WriteOptions {
  /** The account paying for and authorizing the transaction. */
  from: Bech32mAddress;
  /** Optional pre-decoded 32-byte body of `from`. */
  fromBytes?: Uint8Array;
  chainId: bigint;
  /** Flat fee in atomic units. */
  fee: bigint;
  /** Signer for the transaction's signing hash. */
  signer: SignerFn;
  /** If set, the transaction is invalid after this height. 0 = no expiry. */
  validUntilHeight?: bigint;
}

export interface SubmitOptions {
  /** If true, poll for a receipt after submitting. Default false. */
  wait?: boolean;
  /** Polling timeout in milliseconds. Default 60_000. */
  waitTimeoutMs?: number;
  /** Polling interval in milliseconds. Default 1_000. */
  pollIntervalMs?: number;
}

export interface SubmitResult {
  txid: HashHex;
  /** Present only when `wait: true` and the transaction confirmed. */
  receipt?: ReceiptSummary;
}

export interface ReceiptSummary {
  status: "success" | "failure";
  feePaid: bigint;
  blockHeight: bigint;
  blockHash: HashHex;
  /** Raw receipt JSON, for callers that want the fills and other details. */
  raw: unknown;
}

// =============================================================== Entry points

export interface SwapArgs {
  poolId: bigint;
  tokenIn: bigint;
  amountIn: bigint;
  /**
   * Slippage protection. Either supply an explicit `minAmountOut`
   * (advanced) or a `slippageBps` and let the helper compute it from
   * the pool's current reserves (recommended).
   */
  minAmountOut: bigint;
  to: Bech32mAddress;
  toBytes?: Uint8Array;
}

export interface SwapArgsWithSlippage {
  poolId: bigint;
  tokenIn: bigint;
  amountIn: bigint;
  /**
   * Slippage tolerance in basis points. A typical default is 50
   * (0.5%). The helper computes the quote from the pool's current
   * reserves and derives `minAmountOut` from it.
   */
  slippageBps: number;
  /** The pool whose reserves are used for the quote. */
  pool: DexPool;
  to: Bech32mAddress;
  toBytes?: Uint8Array;
}

/**
 * Submit a swap. Two call shapes:
 *
 *   submitSwap(rpc, opts, { minAmountOut, ... })        — explicit min
 *   submitSwap(rpc, opts, { slippageBps, pool, ... })   — computed min
 *
 * The second form is what a UI wants: the pool's current reserves
 * give the quote, and slippageBps bounds how much the price is
 * allowed to move before the swap is rejected.
 */
export async function submitSwap(
  rpc: RpcClient,
  opts: WriteOptions,
  args: SwapArgs | SwapArgsWithSlippage,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  let minAmountOut: bigint;
  if ("minAmountOut" in args) {
    minAmountOut = args.minAmountOut;
  } else {
    //  Compute the quote from the pool's reserves. If the pool doesn't
    //  contain the sell token, this throws — which is the right failure
    //  mode: the caller gave a pool that can't route the swap.
    const [reserveIn, reserveOut] =
      args.tokenIn === args.pool.tokenA
        ? [args.pool.reserveA, args.pool.reserveB]
        : [args.pool.reserveB, args.pool.reserveA];
    const expected = computeSwapOutput(
      reserveIn,
      reserveOut,
      args.pool.feeBps,
      args.amountIn,
    );
    if (expected === 0n) {
      throw new Error("swap would produce zero output");
    }
    minAmountOut = applySlippage(expected, args.slippageBps);
  }

  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.swap({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    poolId: args.poolId,
    tokenIn: args.tokenIn,
    amountIn: args.amountIn,
    minAmountOut,
    to: args.to,
    toBytes: args.toBytes,
  });

  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

export interface AddLiquidityArgs {
  poolId: bigint;
  tokenIn: bigint;
  amountIn: bigint;
  amountOther: bigint;
}

export async function submitAddLiquidity(
  rpc: RpcClient,
  opts: WriteOptions,
  args: AddLiquidityArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.addLiquidity({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    poolId: args.poolId,
    tokenIn: args.tokenIn,
    amountIn: args.amountIn,
    amountOther: args.amountOther,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

export interface RemoveLiquidityArgs {
  positionId: bigint;
  /** 0 = remove the whole position. */
  amount: bigint;
}

export async function submitRemoveLiquidity(
  rpc: RpcClient,
  opts: WriteOptions,
  args: RemoveLiquidityArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.removeLiquidity({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    positionId: args.positionId,
    amount: args.amount,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

export interface CreatePoolArgs {
  tokenA: bigint;
  amountA: bigint;
  tokenB: bigint;
  amountB: bigint;
  feeBps: number;
}

export async function submitCreatePool(
  rpc: RpcClient,
  opts: WriteOptions,
  args: CreatePoolArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.createPool({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    tokenA: args.tokenA,
    amountA: args.amountA,
    tokenB: args.tokenB,
    amountB: args.amountB,
    feeBps: args.feeBps,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== Pipeline

async function fetchNonce(
  rpc: RpcClient,
  from: Bech32mAddress,
): Promise<bigint> {
  const { nonce } = await rpc.getNonce(from);
  return BigInt(nonce);
}

async function signSubmitWait(
  rpc: RpcClient,
  unsigned: ReturnType<typeof TxBuilder.swap>,
  signer: SignerFn,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const signed = await unsigned.sign(signer);
  const hex = signed.toHex();

  let sendResult: { tx_hash: HashHex; accepted: true };
  try {
    sendResult = await rpc.sendRawTransaction(hex);
  } catch (e) {
    //  The RPC layer throws on rejection. Wrap the message so a UI
    //  can show something useful without knowing RPC error codes.
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
): Promise<ReceiptSummary> {
  const deadline = Date.now() + timeoutMs;

  for (; ;) {
    try {
      const raw = (await rpc.getTransactionReceipt(txid)) as any;
      //  The node's getTransactionReceipt returns a receipt object;
      //  the client's typed wrapper may or may not unwrap it. This
      //  handles both shapes.
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
      //  Not yet confirmed. The RPC throws ReceiptNotFound while the
      //  transaction is still in the mempool. Other errors are real.
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
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}