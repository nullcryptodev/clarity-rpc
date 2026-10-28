/**
 * AMM-farming-aware typed model.
 *
 * Mirrors the dex-types.ts pattern: the wire format is hex strings
 * for anything that could exceed 2^53, and this module converts
 * those to `bigint` once, at the boundary. Every consumer above it
 * works with numbers that can actually be computed on.
 *
 * Field names match the C++ side (`AmmFarmSchedule`,
 * `AmmPositionAccrual`) so a diff between this file and the header
 * is meaningful.
 */

import type {
  AmmFarmAccrualRaw,
  AmmFarmEscrowByTokenRaw,
  AmmFarmScheduleRaw,
  AmmFarmStatsRaw,
  Bech32mAddress,
} from "./types.js";
import { hexToBigInt } from "./format.js";

/**
 * The scale of the RPS accumulator. Mirrors `FARM_RPS_SCALE` in
 * `Core/AmmFarmTypes.h`. Any comparison against `rpsPerShare` or
 * `lastRps` should be done in this scale.
 */
export const FARM_RPS_SCALE = 10_000_000_000n;

// --------------------------------------------------------------- Schedule

export interface ParsedAmmFarm {
  poolId: bigint;
  creator: Bech32mAddress;
  rewardTokenId: bigint;
  rewardRatePerEpoch: bigint;
  rewardEscrowRemaining: bigint;
  rewardPaused: boolean;
  rpsPerShare: bigint;
  createdAtHeight: bigint;

  // ---- Derived ----

  /** Authoritative custody balance, from the node. */
  rewardEscrowBalance: bigint;
  /** Pool's current total_liquidity; 0 if the pool is gone. */
  poolTotalLiquidity: bigint;
  isActive: boolean;
  epochsRemaining: bigint;
  escrowAddress: Bech32mAddress;
}

export function parseFarm(raw: AmmFarmScheduleRaw): ParsedAmmFarm {
  return {
    poolId: hexToBigInt(raw.pool_id),
    creator: raw.creator,
    rewardTokenId: hexToBigInt(raw.reward_token_id),
    rewardRatePerEpoch: hexToBigInt(raw.reward_rate_per_epoch),
    rewardEscrowRemaining: hexToBigInt(raw.reward_escrow_remaining),
    rewardPaused: raw.reward_paused,
    rpsPerShare: hexToBigInt(raw.rps_per_share),
    createdAtHeight: hexToBigInt(raw.created_at_height),

    rewardEscrowBalance: hexToBigInt(raw.reward_escrow_balance),
    poolTotalLiquidity: hexToBigInt(raw.pool_total_liquidity),
    isActive: raw.is_active,
    epochsRemaining: hexToBigInt(raw.epochs_remaining),
    escrowAddress: raw.escrow_address,
  };
}

// --------------------------------------------------------------- Accrual

export interface ParsedAmmFarmAccrual {
  poolId: bigint;
  positionId: bigint;
  positionLiquidity: bigint;
  rewardTokenId: bigint;
  exists: boolean;
  lastRps: bigint;
  currentRps: bigint;
  accruedUnclaimed: bigint;
  farmPaused: boolean;
}

export function parseFarmAccrual(
  raw: AmmFarmAccrualRaw,
): ParsedAmmFarmAccrual {
  return {
    poolId: hexToBigInt(raw.pool_id),
    positionId: hexToBigInt(raw.position_id),
    positionLiquidity: hexToBigInt(raw.position_liquidity),
    rewardTokenId: hexToBigInt(raw.reward_token_id),
    exists: raw.exists,
    lastRps: hexToBigInt(raw.last_rps),
    currentRps: hexToBigInt(raw.current_rps),
    accruedUnclaimed: hexToBigInt(raw.accrued_unclaimed),
    farmPaused: raw.farm_paused,
  };
}

// --------------------------------------------------------------- Stats

export interface ParsedAmmFarmEscrowByToken {
  tokenId: bigint;
  escrowTotal: bigint;
}

export interface ParsedAmmFarmStats {
  height: bigint;
  totalFarms: bigint;
  activeFarms: bigint;
  pausedFarms: bigint;
  escrowByToken: ParsedAmmFarmEscrowByToken[];
}

function parseEscrowByToken(
  raw: AmmFarmEscrowByTokenRaw,
): ParsedAmmFarmEscrowByToken {
  return {
    tokenId: hexToBigInt(raw.token_id),
    escrowTotal: hexToBigInt(raw.escrow_total),
  };
}

export function parseFarmStats(raw: AmmFarmStatsRaw): ParsedAmmFarmStats {
  return {
    height: hexToBigInt(raw.height),
    totalFarms: hexToBigInt(raw.total_farms),
    activeFarms: hexToBigInt(raw.active_farms),
    pausedFarms: hexToBigInt(raw.paused_farms),
    escrowByToken: raw.escrow_by_token.map(parseEscrowByToken),
  };
}