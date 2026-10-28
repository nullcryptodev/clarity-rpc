/**
 * AMM farming UI helpers.
 *
 * Pure functions over the parsed farm types. Nothing here talks to
 * the RPC. The accrual math mirrors `settleAmmFarmAccrual` in
 * `Core/TransactionExecutor.cpp` exactly — a client can display the
 * same number the chain will credit, without a round-trip.
 *
 * Where the chain floors, this floors. Where the chain saturates,
 * this saturates.
 */

import type {
  ParsedAmmFarm,
  ParsedAmmFarmAccrual,
  ParsedAmmFarmStats,
} from "./farm-types.js";
import { FARM_RPS_SCALE } from "./farm-types.js";
import { formatTokenAmount } from "./dex-helpers.js";
import { formatClrtyWithSymbol } from "./format.js";

// =============================================================== Accrual math

/**
 * Compute the unclaimed accrual for a position from its last
 * settle and the farm's current RPS.
 *
 * Mirrors `settleAmmFarmAccrual`:
 *
 *   accrued = (current_rps - last_rps) * liquidity / FARM_RPS_SCALE
 *
 * Returns `0n` when `current_rps <= last_rps` (no new accrual, or a
 * corrupted `last_rps` — the chain would also credit nothing).
 *
 * This function is the client-side counterpart of the number the
 * node emits in `ParsedAmmFarmAccrual.accruedUnclaimed`. Use it
 * when you have `lastRps` and `currentRps` from different sources
 * (e.g. you cached an earlier read) or when you want to preview
 * what a `claim_amm_farm_rewards` would credit before submitting.
 */
export function computeAccruedRewards(
  lastRps: bigint,
  currentRps: bigint,
  liquidity: bigint,
): bigint {
  if (currentRps <= lastRps) return 0n;
  if (liquidity === 0n) return 0n;
  return ((currentRps - lastRps) * liquidity) / FARM_RPS_SCALE;
}

/**
 * How many full epochs the escrow can cover at the current rate.
 * Floored, matching the node's `epochs_remaining` derived field.
 * Returns 0 when the rate is zero (a zero-rate farm emits nothing
 * regardless of escrow).
 */
export function epochsRemaining(
  escrowBalance: bigint,
  ratePerEpoch: bigint,
): bigint {
  if (ratePerEpoch === 0n) return 0n;
  return escrowBalance / ratePerEpoch;
}

/**
 * The same predicate the C++ `AmmFarmSchedule::isActive()` uses:
 * has a positive rate, is not paused, and has non-zero escrow.
 *
 * Use this to gate UI actions: a "Pause" button should be hidden
 * when the farm is already paused; a "Refill" button should be
 * prominent when the farm is inactive.
 */
export function isFarmActive(farm: ParsedAmmFarm): boolean {
  return !farm.rewardPaused && farm.rewardRatePerEpoch > 0n && farm.rewardEscrowBalance > 0n;
}

// =============================================================== Formatting

export interface FarmDisplay {
  poolId: string;
  creator: string;
  rewardTokenId: string;
  /** Human-readable rate, e.g. "10 CLRTY" or "10.5 RWD". */
  ratePerEpoch: string;
  /** Human-readable escrow, in the reward token's units. */
  escrow: string;
  /** Human-readable escrow in epochs, e.g. "100 epochs". */
  runway: string;
  paused: boolean;
  active: boolean;
  /** Escrow custody address, for a "view on explorer" link. */
  escrowAddress: string;
}

/**
 * Format a farm schedule for display. `rewardDecimals` is the
 * reward token's decimals (0 for CLRTY's 5), used to scale the
 * rate and escrow. `rewardSymbol` is the token's symbol, or
 * "CLRTY" if you have nothing better.
 *
 * The `runway` field is the number of full epochs the escrow can
 * cover; a UI that wants wall-clock time multiplies by
 * `SECONDS_PER_EPOCH` from the rewards constants.
 */
export function formatFarm(
  farm: ParsedAmmFarm,
  rewardDecimals: number,
  rewardSymbol: string,
): FarmDisplay {
  const rateStr = formatTokenAmount(farm.rewardRatePerEpoch, rewardDecimals);
  const escrowStr = formatTokenAmount(farm.rewardEscrowBalance, rewardDecimals);
  const runwayEpochs = epochsRemaining(
    farm.rewardEscrowBalance,
    farm.rewardRatePerEpoch,
  );

  return {
    poolId: "0x" + farm.poolId.toString(16),
    creator: farm.creator,
    rewardTokenId: "0x" + farm.rewardTokenId.toString(16),
    ratePerEpoch: `${rateStr} ${rewardSymbol}`,
    escrow: `${escrowStr} ${rewardSymbol}`,
    runway: `${runwayEpochs.toString()} epochs`,
    paused: farm.rewardPaused,
    active: isFarmActive(farm),
    escrowAddress: farm.escrowAddress,
  };
}

export interface AccrualDisplay {
  poolId: string;
  positionId: string;
  positionLiquidity: string;
  /** Human-readable unclaimed reward, in the reward token's units. */
  unclaimed: string;
  /** True if the position has never settled. */
  neverSettled: boolean;
  /** True if the farm is paused (no new accrual will land). */
  farmPaused: boolean;
}

export function formatAccrual(
  accrual: ParsedAmmFarmAccrual,
  rewardDecimals: number,
  rewardSymbol: string,
): AccrualDisplay {
  return {
    poolId: "0x" + accrual.poolId.toString(16),
    positionId: "0x" + accrual.positionId.toString(16),
    positionLiquidity: accrual.positionLiquidity.toString(),
    unclaimed: `${formatTokenAmount(accrual.accruedUnclaimed, rewardDecimals)} ${rewardSymbol}`,
    neverSettled: !accrual.exists,
    farmPaused: accrual.farmPaused,
  };
}

export interface FarmStatsDisplay {
  totalFarms: string;
  activeFarms: string;
  pausedFarms: string;
  /** Each entry carries the token symbol if the caller can supply it. */
  escrowByToken: Array<{ tokenId: string; escrow: string; symbol?: string }>;
}

/**
 * Format the aggregate stats. If `symbols` is provided, each entry
 * carries the display symbol; otherwise the symbol is omitted and
 * the caller's UI can resolve it from the token id.
 */
export function formatFarmStats(
  stats: ParsedAmmFarmStats,
  symbols?: Map<bigint, { symbol: string; decimals: number }>,
): FarmStatsDisplay {
  return {
    totalFarms: stats.totalFarms.toString(),
    activeFarms: stats.activeFarms.toString(),
    pausedFarms: stats.pausedFarms.toString(),
    escrowByToken: stats.escrowByToken.map((e) => {
      const info = symbols?.get(e.tokenId);
      if (info) {
        return {
          tokenId: "0x" + e.tokenId.toString(16),
          escrow: `${formatTokenAmount(e.escrowTotal, info.decimals)} ${info.symbol}`,
          symbol: info.symbol,
        };
      }
      return {
        tokenId: "0x" + e.tokenId.toString(16),
        escrow: e.escrowTotal.toString(),
      };
    }),
  };
}