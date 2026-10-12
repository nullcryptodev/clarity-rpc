/**
 * DEX UI helpers.
 *
 * Pure functions that take parsed DEX types and return
 * display-ready values or computed decisions. Nothing here talks to
 * the RPC; everything takes already-fetched data.
 *
 * The functions fall into four groups:
 *
 *   Routing   — pick the best of several pools for a given swap.
 *   Quoting   — compute what a swap / add / remove will yield,
 *               in the same terms the executor uses.
 *   Formatting — turn a raw typed value into a display string.
 *   Book math — aggregate order book levels with running totals.
 *
 * Any function that returns a number the user will see should be
 * treated as load-bearing. Where the chain floors, this floors.
 * Where the chain special-cases, this special-cases.
 */

import type {
  DexOrder,
  DexOrderBook,
  DexOrderBookLevel,
  DexPool,
  DexPosition,
} from "./dex-types.js";
import {
  BOOK_PRICE_SCALE,
  applySlippage,
  computeEffectivePrice,
  computeSwapOutput,
  formatPrice,
  lpShareBps,
  lpTokensForDeposit,
  reservesForRemoval,
  swapOutputForPool,
} from "./dex-maths.js";
import { formatClrty } from "./format.js";

// =============================================================== Routing

export interface BestPoolResult {
  pool: DexPool;
  /** Expected output of the swap, in the buy token's atomic units. */
  output: bigint;
  /** Effective price, scaled by BOOK_PRICE_SCALE. */
  effectivePrice: bigint;
}

/**
 * Given several candidate pools, pick the one that yields the most
 * output for a given input. Returns null if no pool can route the
 * swap (none contain both tokens, or all have zero reserves on the
 * relevant side).
 *
 * The caller is expected to have filtered `pools` to those that
 * contain both the sell and buy tokens; a pool that doesn't is
 * skipped without penalty.
 */
export function bestPoolForSwap(
  pools: DexPool[],
  sellTokenId: bigint,
  amountIn: bigint,
): BestPoolResult | null {
  let best: BestPoolResult | null = null;

  for (const pool of pools) {
    const output = swapOutputForPool(pool, sellTokenId, amountIn);
    if (output === null || output === 0n) continue;

    if (best === null || output > best.output) {
      //  Determine reserves in the swap's direction for the effective
      //  price. `swapOutputForPool` already picked the right side;
      //  we recompute here so the caller gets the price alongside the
      //  output without a second lookup.
      const [reserveIn, reserveOut] =
        sellTokenId === pool.tokenA
          ? [pool.reserveA, pool.reserveB]
          : [pool.reserveB, pool.reserveA];
      best = {
        pool,
        output,
        effectivePrice: computeEffectivePrice(
          reserveIn,
          reserveOut,
          pool.feeBps,
          amountIn,
        ),
      };
    }
  }

  return best;
}

/**
 * The tokens a swap would need to send and receive. A convenience
 * that reads the sell token out of a pool and returns the other side.
 * Returns null if the pool doesn't contain the sell token.
 */
export function counterpartToken(
  pool: DexPool,
  sellTokenId: bigint,
): bigint | null {
  if (sellTokenId === pool.tokenA) return pool.tokenB;
  if (sellTokenId === pool.tokenB) return pool.tokenA;
  return null;
}

// =============================================================== Quoting

export interface SwapQuote {
  poolId: bigint;
  sellToken: bigint;
  buyToken: bigint;
  amountIn: bigint;
  /** Expected output, floored, matching executeSwap. */
  amountOut: bigint;
  /** Minimum output after applying the caller's slippage tolerance. */
  minAmountOut: bigint;
  /** Effective price of the swap, scaled by BOOK_PRICE_SCALE. */
  effectivePrice: bigint;
  /** The pool's fee in basis points, for display. */
  feeBps: number;
}

/**
 * Quote a swap. `slippageBps` is the caller's tolerance, in basis
 * points. A typical UI default is 50 (0.5%).
 *
 * Throws if the pool doesn't contain the sell token, or if the
 * computed output is zero (which happens when the input is dust
 * relative to the pool).
 */
export function quoteSwap(
  pool: DexPool,
  sellTokenId: bigint,
  amountIn: bigint,
  slippageBps: number,
): SwapQuote {
  const buyToken = counterpartToken(pool, sellTokenId);
  if (buyToken === null) {
    throw new Error(
      `pool ${pool.id} does not contain token ${sellTokenId}`,
    );
  }

  const [reserveIn, reserveOut] =
    sellTokenId === pool.tokenA
      ? [pool.reserveA, pool.reserveB]
      : [pool.reserveB, pool.reserveA];

  const amountOut = computeSwapOutput(
    reserveIn,
    reserveOut,
    pool.feeBps,
    amountIn,
  );
  if (amountOut === 0n) {
    throw new Error("swap would produce zero output");
  }

  return {
    poolId: pool.id,
    sellToken: sellTokenId,
    buyToken,
    amountIn,
    amountOut,
    minAmountOut: applySlippage(amountOut, slippageBps),
    effectivePrice: computeEffectivePrice(
      reserveIn,
      reserveOut,
      pool.feeBps,
      amountIn,
    ),
    feeBps: pool.feeBps,
  };
}

export interface AddLiquidityQuote {
  /** LP tokens that will be minted for this deposit. */
  lpTokens: bigint;
  /** The user's share of the pool after the deposit, in basis points. */
  resultingShareBps: number;
  /**
   * Ratio of the deposit that goes into each side. If the deposit is
   * unbalanced, the excess on the heavier side is effectively
   * donated to the pool; this is the warning a UI should surface.
   */
  isBalanced: boolean;
  /** Suggested amounts that would be perfectly proportional. */
  suggestedA: bigint;
  suggestedB: bigint;
}

/**
 * Quote an add-liquidity. The caller provides the pool and the
 * amounts they intend to deposit. If the deposit is unbalanced
 * relative to the pool's reserves, the LP is credited at the lesser
 * ratio — this quote computes what they'd actually receive.
 */
export function quoteAddLiquidity(
  pool: DexPool,
  amountA: bigint,
  amountB: bigint,
): AddLiquidityQuote {
  const lpTokens = lpTokensForDeposit(pool, amountA, amountB);

  //  Share after the deposit: (user LP) / (total + minted).
  const newTotal = pool.totalLiquidity + lpTokens;
  const resultingShareBps =
    newTotal === 0n ? 0 : Number((lpTokens * 10_000n) / newTotal);

  //  A deposit is balanced if amountA/amountB ≈ reserveA/reserveB.
  //  We use the LP-token formula to check: if both sides would mint
  //  the same number of LP tokens, the ratio is exact.
  let isBalanced = true;
  let suggestedA = amountA;
  let suggestedB = amountB;
  if (pool.reserveA > 0n && pool.reserveB > 0n) {
    //  If we hold amountA fixed, what amountB would be proportional?
    suggestedB = (amountA * pool.reserveB) / pool.reserveA;
    //  If we hold amountB fixed, what amountA would be proportional?
    suggestedA = (amountB * pool.reserveA) / pool.reserveB;

    //  Balanced iff both sides mint the same LP amount. One atomic
    //  unit of slack is allowed for integer rounding.
    const shareA = (amountA * pool.totalLiquidity) / pool.reserveA;
    const shareB = (amountB * pool.totalLiquidity) / pool.reserveB;
    const diff = shareA > shareB ? shareA - shareB : shareB - shareA;
    isBalanced = diff <= 1n;
  }

  return { lpTokens, resultingShareBps, isBalanced, suggestedA, suggestedB };
}

export interface RemoveLiquidityQuote {
  /** Reserves the user will receive, in each token's atomic units. */
  amountA: bigint;
  amountB: bigint;
  /** True if this removal empties the pool's entire LP supply. */
  isFullDrain: boolean;
}

/**
 * Quote a remove-liquidity. `lpAmount` is the number of LP tokens to
 * remove; pass the position's full `liquidity` for a full removal.
 *
 * Uses the same math the executor uses, including the last-LP drain
 * special case where the full reserves are credited regardless of
 * rounding.
 */
export function quoteRemoveLiquidity(
  pool: DexPool,
  lpAmount: bigint,
): RemoveLiquidityQuote {
  const { reserveA, reserveB } = reservesForRemoval(pool, lpAmount);
  return {
    amountA: reserveA,
    amountB: reserveB,
    isFullDrain: lpAmount === pool.totalLiquidity,
  };
}

// =============================================================== Formatting

export interface PoolDisplay {
  id: string;
  creator: string;
  tokenA: string;
  tokenB: string;
  reserveA: string;
  reserveB: string;
  /** Spot price, human-readable, with 10 significant digits. */
  spotPrice: string;
  /** Fee, as a percentage string ("0.30%"). */
  feePercent: string;
  /** True if the pool has zero liquidity on either side. */
  isEmpty: boolean;
}

/**
 * Turn a pool into a display object. The reserves and spot price
 * are formatted as decimal strings; the token ids are hex.
 *
 * The caller is responsible for mapping token ids to symbols; this
 * function only knows the pool.
 */
export function formatPool(pool: DexPool): PoolDisplay {
  return {
    id: "0x" + pool.id.toString(16),
    creator: pool.creator,
    tokenA: "0x" + pool.tokenA.toString(16),
    tokenB: "0x" + pool.tokenB.toString(16),
    reserveA: pool.reserveA.toString(),
    reserveB: pool.reserveB.toString(),
    spotPrice: formatPrice(spotPriceScaledForDisplay(pool), BOOK_PRICE_SCALE, 8),
    feePercent: `${(pool.feeBps / 100).toFixed(2)}%`,
    isEmpty: pool.reserveA === 0n || pool.reserveB === 0n,
  };
}

/**
 * Internal: `spotPriceScaled` lives in dex-math, but I don't want
 * formatPool to import from two modules. Re-derive it here so the
 * dependency edge stays one-way.
 */
function spotPriceScaledForDisplay(pool: DexPool): bigint {
  if (pool.reserveA === 0n) return 0n;
  return (pool.reserveB * BOOK_PRICE_SCALE) / pool.reserveA;
}

export interface PositionDisplay {
  id: string;
  owner: string;
  poolId: string;
  liquidity: string;
  shareBps: number;
  sharePercent: string;
}

export function formatPosition(
  position: DexPosition,
  pool?: DexPool,
): PositionDisplay {
  const shareBps =
    typeof position.shareBps === "number"
      ? position.shareBps
      : pool
        ? lpShareBps(position, pool)
        : 0;
  return {
    id: "0x" + position.id.toString(16),
    owner: position.owner,
    poolId: "0x" + position.poolId.toString(16),
    liquidity: position.liquidity.toString(),
    shareBps,
    sharePercent: `${(shareBps / 100).toFixed(2)}%`,
  };
}

export interface OrderDisplay {
  id: string;
  owner: string;
  mode: "passive" | "active";
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  filledAmount: string;
  remainingAmount: string;
  /** Limit price, quote per base, scaled. */
  limitPrice: string;
  isFullyFilled: boolean;
  expiresAtHeight: string;
}

/**
 * Turn an order into a display object. The limit price is the
 * canonical `minBuyAmount / sellAmount` ratio, scaled by
 * BOOK_PRICE_SCALE for consistency with the pool's spot price.
 */
export function formatOrder(order: DexOrder): OrderDisplay {
  let limitPrice = 0n;
  if (order.sellAmount > 0n) {
    limitPrice = (order.minBuyAmount * BOOK_PRICE_SCALE) / order.sellAmount;
  }
  return {
    id: "0x" + order.id.toString(16),
    owner: order.owner,
    mode: order.mode,
    sellToken: "0x" + order.sellToken.toString(16),
    buyToken: "0x" + order.buyToken.toString(16),
    sellAmount: order.sellAmount.toString(),
    filledAmount: order.filledAmount.toString(),
    remainingAmount: order.remainingAmount.toString(),
    limitPrice: limitPrice.toString(),
    isFullyFilled: order.isFullyFilled,
    expiresAtHeight: order.expiresAtHeight.toString(),
  };
}

/**
 * Format a raw scaled price as a decimal string with the given
 * number of decimal places. Re-exported so consumers of the
 * helpers don't need a second import from dex-math.
 */
export { formatPrice };

/**
 * Format an atomic amount as a whole-token string, using the
 * token's decimals.
 *
 * This is the bigint-input counterpart to `formatClrty`, which
 * takes a hex string because it's designed for RPC responses.
 * The DEX helpers work with bigints, so they use this function.
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();

  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) return whole.toString();

  const fracStr = fraction.toString().padStart(decimals, "0");
  return `${whole}.${fracStr}`;
}

// =============================================================== Order book

export interface AggregatedBookLevel extends DexOrderBookLevel {
  /** Running total of base across this level and all better levels. */
  cumulativeBase: bigint;
  /** Running total of quote across this level and all better levels. */
  cumulativeQuote: bigint;
}

export interface AggregatedBook {
  baseToken: bigint;
  quoteToken: bigint;
  priceScale: bigint;
  bids: AggregatedBookLevel[];
  asks: AggregatedBookLevel[];
  /** Best bid, or null if the bid side is empty. */
  bestBid: DexOrderBookLevel | null;
  /** Best ask, or null if the ask side is empty. */
  bestAsk: DexOrderBookLevel | null;
  /**
   * Spread in the canonical frame, or null if either side is empty.
   * Positive when the best bid is below the best ask (a normal book);
   * negative when the book is crossed.
   */
  spread: bigint | null;
}

/**
 * Aggregate an order book with running totals, which is what a
 * depth chart wants.
 *
 * Note: "best bid" is the highest price, "best ask" is the lowest.
 * The RPC returns both sides best-first, so the first element of
 * each array is already the best.
 */
export function aggregateOrderBook(book: DexOrderBook): AggregatedBook {
  const bids = aggregateSide(book.bids);
  const asks = aggregateSide(book.asks);
  const bestBid = book.bids.length > 0 ? book.bids[0]! : null;
  const bestAsk = book.asks.length > 0 ? book.asks[0]! : null;

  let spread: bigint | null = null;
  if (bestBid !== null && bestAsk !== null) {
    spread = bestAsk.price - bestBid.price;
  }

  return {
    baseToken: book.baseToken,
    quoteToken: book.quoteToken,
    priceScale: book.priceScale,
    bids,
    asks,
    bestBid,
    bestAsk,
    spread,
  };
}

function aggregateSide(levels: DexOrderBookLevel[]): AggregatedBookLevel[] {
  const out: AggregatedBookLevel[] = [];
  let cumBase = 0n;
  let cumQuote = 0n;
  for (const level of levels) {
    cumBase += level.totalBase;
    //  Cumulative quote = cumulative base * this level's price. This
    //  is exact for each level individually but accumulates rounding
    //  error across levels if we instead summed level-by-level. Since
    //  price is scaled, the math here is (cumBase * price) / scale.
    cumQuote = (cumBase * level.price) / BOOK_PRICE_SCALE;
    out.push({
      ...level,
      cumulativeBase: cumBase,
      cumulativeQuote: cumQuote,
    });
  }
  return out;
}

// =============================================================== Mid price

/**
 * Mid price of a book, in the canonical frame, scaled. Null if
 * either side is empty. Useful for a UI's "last price" display.
 */
export function midPrice(book: AggregatedBook): bigint | null {
  if (book.bestBid === null || book.bestAsk === null) return null;
  return (book.bestBid.price + book.bestAsk.price) / 2n;
}