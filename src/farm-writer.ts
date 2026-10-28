/**
 * AMM farming write path.
 *
 * One function per farm operation. Each:
 *
 *   1. Fetches the caller's current nonce.
 *   2. Builds and signs a transaction with the caller's signer.
 *   3. Submits it via sendRawTransaction.
 *   4. Optionally polls for the receipt.
 *
 * Fee is the caller's responsibility, same as the DEX write path.
 */

import type { RpcClient } from "./client.js";
import type { Bech32mAddress } from "./types.js";
import type { SignerFn } from "./builder.js";
import { TxBuilder } from "./builder.js";
import type {
  ReceiptSummary,
  SubmitOptions,
  SubmitResult,
  WriteOptions,
} from "./dex-writer.js";

// =============================================================== Create

export interface CreateAmmFarmArgs {
  poolId: bigint;
  rewardTokenId: bigint;
  rewardRatePerEpoch: bigint;
  rewardEscrowAmount: bigint;
}

export async function submitCreateAmmFarm(
  rpc: RpcClient,
  opts: WriteOptions,
  args: CreateAmmFarmArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.createAmmFarm({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    poolId: args.poolId,
    rewardTokenId: args.rewardTokenId,
    rewardRatePerEpoch: args.rewardRatePerEpoch,
    rewardEscrowAmount: args.rewardEscrowAmount,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== Update

export interface UpdateAmmFarmArgs {
  poolId: bigint;
  newRatePerEpoch: bigint;
}

export async function submitUpdateAmmFarm(
  rpc: RpcClient,
  opts: WriteOptions,
  args: UpdateAmmFarmArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.updateAmmFarm({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    poolId: args.poolId,
    newRatePerEpoch: args.newRatePerEpoch,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== Pause

export interface PauseAmmFarmArgs {
  poolId: bigint;
}

export async function submitPauseAmmFarm(
  rpc: RpcClient,
  opts: WriteOptions,
  args: PauseAmmFarmArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.pauseAmmFarm({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    poolId: args.poolId,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== Refill

export interface RefillAmmFarmArgs {
  poolId: bigint;
  amount: bigint;
}

export async function submitRefillAmmFarm(
  rpc: RpcClient,
  opts: WriteOptions,
  args: RefillAmmFarmArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.refillAmmFarm({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    poolId: args.poolId,
    amount: args.amount,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== Close

export interface CloseAmmFarmArgs {
  poolId: bigint;
}

export async function submitCloseAmmFarm(
  rpc: RpcClient,
  opts: WriteOptions,
  args: CloseAmmFarmArgs,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.closeAmmFarm({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
    poolId: args.poolId,
  });
  return await signSubmitWait(rpc, unsigned, opts.signer, submit);
}

// =============================================================== Claim

export type ClaimAmmFarmRewardsArgs = Record<string, never>;

export async function submitClaimAmmFarmRewards(
  rpc: RpcClient,
  opts: WriteOptions,
  _args: ClaimAmmFarmRewardsArgs = {},
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const nonce = await fetchNonce(rpc, opts.from);
  const unsigned = TxBuilder.claimAmmFarmRewards({
    from: opts.from,
    fromBytes: opts.fromBytes,
    chainId: opts.chainId,
    nonce,
    fee: opts.fee,
    validUntilHeight: opts.validUntilHeight,
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
  unsigned: ReturnType<typeof TxBuilder.createAmmFarm>,
  signer: SignerFn,
  submit?: SubmitOptions,
): Promise<SubmitResult> {
  const signed = await unsigned.sign(signer);
  const hex = signed.toHex();

  let sendResult: { tx_hash: string; accepted: true };
  try {
    sendResult = await rpc.sendRawTransaction(hex);
  } catch (e) {
    throw new Error(
      `node rejected transaction: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const txid = sendResult.tx_hash;
  if (!submit?.wait) return { txid };

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
  txid: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<ReceiptSummary> {
  const deadline = Date.now() + timeoutMs;
  for (; ;) {
    try {
      const raw = (await rpc.getTransactionReceipt(txid)) as any;
      const r =
        raw && typeof raw === "object" && "receipt" in raw
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