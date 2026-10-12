/**
 * DEX arithmetic.
 *
 * Every function here mirrors a computation the on-chain executor
 * performs. Where the executor uses `unsigned __int128` to avoid
 * overflow, these functions use `bigint`, which is unbounded. Where
 * the executor floors, these functions floor. Where the executor
 * special-cases (the last-LP drain, the zero-reserve cases), these
 * functions do too.
 *
 * The point is that a client can compute exactly what the chain will
 * do, without a round-trip, and without divergence. If a function
 * here ever disagrees with its C++ counterpart, one of them is wrong
 * and the client is lying to its users.
 */

import type { DexPool, DexPosition } from "./dex-types.js";

/**
 * The canonical price scale used by the order book. Mirrors
 * Core::OrderBook::BOOK_PRICE_SCALE.
 */
export const BOOK_PRICE_SCALE = 10_000_000_000n;

/** Basis-point denominator. Mirrors Core::MAX_BPS. */
const BPS_DENOM = 10_000n;

// --------------------------------------------------------------- Price

/**
 * Spot price of a pool in the canonical frame (quote per base),
 * scaled by BOOK_PRICE_SCALE.
 *
 * The canonical frame is determined by the token ids: base is
 * `min(tokenA, tokenB)`, quote is the other. For a pool whose
 * `tokenA < tokenB`, `reserveA` is the base reserve and `reserveB`
 * is the quote reserve; the price is `reserveB * SCALE / reserveA`.
 *
 * If the pool has zero reserves on either side, the price is
 * undefined and this returns 0n.
 */
export function spotPriceScaled(pool: DexPool): bigint {
  if (pool.reserveA === 0n) return 0n;
  return (pool.reserveB * BOOK_PRICE_SCALE) / pool.reserveA;
}

/**
 * The pool's reserves in the canonical frame. `base` and `quote`
 * follow from the token ordering.
 */
export function canonicalReserves(pool: DexPool): {
  baseToken: bigint;
  quoteToken: bigint;
  reserveBase: bigint;
  reserveQuote: bigint;
} {
  //  The parser stores tokenA/tokenB as they came off the wire,
  //  and the executor canonicalizes at creation, so tokenA < tokenB
  //  is guaranteed. But defensive code is cheaper than a bug.
  if (pool.tokenA < pool.tokenB) {
    return {
      baseToken: pool.tokenA,
      quoteToken: pool.tokenB,
      reserveBase: pool.reserveA,
      reserveQuote: pool.reserveB,
    };
  }
  return {
    baseToken: pool.tokenB,
    quoteToken: pool.tokenA,
    reserveBase: pool.reserveB,
    reserveQuote: pool.reserveA,
  };
}

// --------------------------------------------------------------- Swap

/**
 * Output of a swap for a given input, mirroring
 * TransactionExecutor::executeSwap exactly.
 *
 * `reserveIn` is the pool's reserve of the token being sold;
 * `reserveOut` is the reserve of the token being bought.
 * `amountIn` is the gross input, before the fee.
 *
 * The result is floored, which favors the pool by at most one
 * atomic unit.
 */
export function computeSwapOutput(
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number,
  amountIn: bigint,
): bigint {
  if (reserveIn === 0n || reserveOut === 0n || amountIn === 0n) return 0n;

  const amountInWithFee = (amountIn * (BPS_DENOM - BigInt(feeBps))) / BPS_DENOM;
  if (amountInWithFee === 0n) return 0n;

  const numerator = reserveOut * amountInWithFee;
  const denominator = reserveIn + amountInWithFee;
  if (denominator === 0n) return 0n;

  return numerator / denominator;
}

/**
 * Convenience: swap output for a given pool and input token id.
 * Returns null if the pool does not contain the token.
 */
export function swapOutputForPool(
  pool: DexPool,
  sellTokenId: bigint,
  amountIn: bigint,
): bigint | null {
  if (sellTokenId === pool.tokenA) {
    return computeSwapOutput(pool.reserveA, pool.reserveB, pool.feeBps, amountIn);
  }
  if (sellTokenId === pool.tokenB) {
    return computeSwapOutput(pool.reserveB, pool.reserveA, pool.feeBps, amountIn);
  }
  return null;
}

/**
 * Effective price of a swap: output per input, scaled by
 * BOOK_PRICE_SCALE. Mirrors ActiveRouter::computeEffectivePrice.
 */
export function computeEffectivePrice(
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number,
  amountIn: bigint,
): bigint {
  if (amountIn === 0n) return 0n;
  const out = computeSwapOutput(reserveIn, reserveOut, feeBps, amountIn);
  if (out === 0n) return 0n;
  return (out * BOOK_PRICE_SCALE) / amountIn;
}

// --------------------------------------------------------------- Liquidity

/**
 * LP tokens minted for a deposit into an existing pool. Mirrors the
 * `min(share_a, share_b)` computation in executeAddLiquidity.
 *
 * An unbalanced deposit is credited at the lesser ratio; the excess
 * is effectively donated to the pool.
 */
export function lpTokensForDeposit(
  pool: DexPool,
  amountA: bigint,
  amountB: bigint,
): bigint {
  if (pool.reserveA === 0n || pool.reserveB === 0n) return 0n;
  const shareA = (amountA * pool.totalLiquidity) / pool.reserveA;
  const shareB = (amountB * pool.totalLiquidity) / pool.reserveB;
  return shareA < shareB ? shareA : shareB;
}

/**
 * Reserves a position can withdraw for a given LP token amount.
 * Mirrors executeRemoveLiquidity, including the last-LP drain
 * special case: if the removal empties the pool's entire LP supply,
 * the position receives the full reserves, regardless of rounding.
 */
export function reservesForRemoval(
  pool: DexPool,
  lpAmount: bigint,
): { reserveA: bigint; reserveB: bigint } {
  if (pool.totalLiquidity === 0n) {
    return { reserveA: 0n, reserveB: 0n };
  }
  if (lpAmount === pool.totalLiquidity) {
    return { reserveA: pool.reserveA, reserveB: pool.reserveB };
  }
  return {
    reserveA: (lpAmount * pool.reserveA) / pool.totalLiquidity,
    reserveB: (lpAmount * pool.reserveB) / pool.totalLiquidity,
  };
}

/**
 * LP share of a position, in basis points. Rounded down.
 */
export function lpShareBps(position: DexPosition, pool: DexPool): number {
  if (pool.totalLiquidity === 0n) return 0;
  return Number((position.liquidity * BPS_DENOM) / pool.totalLiquidity);
}

// --------------------------------------------------------------- Slippage

/**
 * The minimum output a caller should accept for a given expected
 * output and slippage tolerance in basis points.
 *
 * `slippageBps = 50` means "accept up to 0.5% less than the quote".
 * The result is floored, which biases slightly toward the trader
 * (a smaller minimum is easier to satisfy).
 */
export function applySlippage(
  expectedOut: bigint,
  slippageBps: number,
): bigint {
  if (slippageBps < 0 || slippageBps > 10_000) {
    throw new Error("slippageBps must be 0..10000");
  }
  return (expectedOut * (BPS_DENOM - BigInt(slippageBps))) / BPS_DENOM;
}

// --------------------------------------------------------------- Formatting

/**
 * Format a scaled price as a decimal string with `decimals` places.
 * The input is a raw bigint scaled by `scale`; the output is a
 * human-readable string.
 *
 * Example: formatPrice(15_0000000000n, 10_000_000_000n, 6)
 *          -> "1.500000"
 */
export function formatPrice(
  scaled: bigint,
  scale: bigint,
  decimals: number,
): string {
  const whole = scaled / scale;
  const fraction = scaled % scale;
  if (decimals === 0) return whole.toString();

  //  Truncate or pad the fractional part to `decimals` places.
  const fracDigits = scale.toString().length - 1; // log10(scale)
  let frac = fraction.toString().padStart(fracDigits, "0");
  if (frac.length > decimals) frac = frac.slice(0, decimals);
  return `${whole}.${frac}`;
}