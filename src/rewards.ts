/**
 * Reward constants mirrored from the node's `GlobalConfig.h` and
 * `RewardTypes.h`. If the C++ side changes, this file must change
 * with it — there is no runtime bridge and no version handshake.
 *
 * All arithmetic uses BigInt to avoid precision loss above 2^53.
 */

import { bigIntToHex } from "./format.js";

// ------------------------------------------------------------- Currency

export const ATOMIC_UNITS_PER_COIN = BigInt(100_000);
export const DECIMALS = 5;

// ------------------------------------------------------------- Block reward

export const BLOCK_REWARD = ATOMIC_UNITS_PER_COIN * BigInt(10);

// ------------------------------------------------------------- Splits

const STAKER_SHARE_BPS = BigInt(4000);
const VALIDATOR_SHARE_BPS = BigInt(6000);
const PRODUCER_BONUS_BPS = BigInt(2000);
const SET_SHARE_BPS = BigInt(8000);

export const MAX_BPS = BigInt(10_000);

export const REWARD_SPLIT = (() => {
  const stakerPool = (BLOCK_REWARD * STAKER_SHARE_BPS) / MAX_BPS;
  const validatorPool = (BLOCK_REWARD * VALIDATOR_SHARE_BPS) / MAX_BPS;
  const producerBonus = (validatorPool * PRODUCER_BONUS_BPS) / MAX_BPS;
  const setShare = (validatorPool * SET_SHARE_BPS) / MAX_BPS;

  return {
    total: BLOCK_REWARD,
    stakerPool,
    validatorPool,
    producerBonus,
    setShare,
  };
})();

// ------------------------------------------------------------- APY

export const APY_BASE_BPS = BigInt(500);
export const APY_ACTIVITY_MAX_BPS = BigInt(500);
export const APY_POT_BONUS_MAX_BPS = BigInt(300);
export const APY_MAX_BPS =
  APY_BASE_BPS + APY_ACTIVITY_MAX_BPS + APY_POT_BONUS_MAX_BPS;

// ------------------------------------------------------------- Staking

export const AUTO_STAKE_THRESHOLD = ATOMIC_UNITS_PER_COIN * BigInt(100);
export const BALANCE_BONUS_THRESHOLD = ATOMIC_UNITS_PER_COIN * BigInt(1000);
export const BALANCE_BONUS_BPS = BigInt(300);

// ------------------------------------------------------------- Validator

export const VALIDATOR_MIN_STAKE = ATOMIC_UNITS_PER_COIN * BigInt(1000);
export const ACTIVE_SET_MIN = 2;
export const ACTIVE_SET_MAX = 100;
export const ACTIVE_SET_DEFAULT = 11;

// ------------------------------------------------------------- Timing

export const ROTATION_INTERVAL = BigInt(60);
export const NOMINAL_BLOCK_SECONDS = BigInt(1);
export const SECONDS_PER_EPOCH = ROTATION_INTERVAL * NOMINAL_BLOCK_SECONDS;
export const SECONDS_PER_YEAR = BigInt(31_556_952);

const SECONDS_PER_WEEK = BigInt(7 * 24 * 3600);
const SECONDS_PER_MONTH = BigInt(30 * 24 * 3600);
const SECONDS_PER_QUARTER = BigInt(90 * 24 * 3600);

export const POT_LOW_EPOCHS = SECONDS_PER_WEEK / SECONDS_PER_EPOCH;
export const POT_HIGH_EPOCHS = SECONDS_PER_MONTH / SECONDS_PER_EPOCH;
export const POT_MAX_EPOCHS = SECONDS_PER_QUARTER / SECONDS_PER_EPOCH;

export const UNBONDING_PERIOD = BigInt(2) * ROTATION_INTERVAL;
export const EMERGENCY_ROTATION_ROUNDS = BigInt(30);

// ------------------------------------------------------------- Chain IDs

export const CHAIN_ID_MAINNET = 0x434c5254;
export const CHAIN_ID_TESTNET = 0x434c5454;
export const CHAIN_ID_REGTEST = 0x434c5247;

// ------------------------------------------------------------- Helpers

export function potFillBps(pot: bigint): number {
  const poolBaseline =
    (((BLOCK_REWARD * STAKER_SHARE_BPS) / MAX_BPS) * ROTATION_INTERVAL);
  const potHigh = poolBaseline * POT_HIGH_EPOCHS;
  if (potHigh === BigInt(0)) return 0;
  const bps = (pot * BigInt(10_000)) / potHigh;
  return Number(bps);
}

export function formatApyBps(bps: bigint | number): string {
  const n = typeof bps === "bigint" ? Number(bps) : bps;
  return `${(n / 100).toFixed(2)}%`;
}

export { bigIntToHex };