/**
 * DEX-aware typed model.
 *
 * The wire format is hex strings for anything that could exceed 2^53.
 * This module converts those to `bigint` once, at the boundary, so
 * every consumer above it works with numbers that can actually be
 * computed on. The conversion happens exactly here and nowhere else.
 *
 * These types mirror the on-chain `AmmPool`, `AmmPosition`, `Order`,
 * `OrderBook`, and `Fill` structs. Field names match the C++ side so
 * a diff between this file and the header is meaningful.
 */

import type {
  AmmPool,
  AmmPosition,
  Bech32mAddress,
  Fill,
  HexString,
  Order,
  OrderBook,
  OrderBookLevel,
  OrderCondition,
} from "./types.js";
import { hexToBigInt } from "./format.js";

// --------------------------------------------------------------- Pool

export interface DexPool {
  id: bigint;
  creator: Bech32mAddress;
  tokenA: bigint;
  tokenB: bigint;
  reserveA: bigint;
  reserveB: bigint;
  totalLiquidity: bigint;
  feeBps: number;
  createdAtHeight: bigint;
  active: boolean;
  /** reserveA * reserveB, as a 128-bit value. */
  k: bigint;
}

export function parsePool(raw: AmmPool): DexPool {
  return {
    id: hexToBigInt(raw.id),
    creator: raw.creator,
    tokenA: hexToBigInt(raw.token_a),
    tokenB: hexToBigInt(raw.token_b),
    reserveA: hexToBigInt(raw.reserve_a),
    reserveB: hexToBigInt(raw.reserve_b),
    totalLiquidity: hexToBigInt(raw.total_liquidity),
    feeBps: raw.fee_bps,
    createdAtHeight: hexToBigInt(raw.created_at_height),
    active: raw.active,
    k: hexToBigInt(raw.k),
  };
}

// --------------------------------------------------------------- Position

export interface DexPosition {
  id: bigint;
  owner: Bech32mAddress;
  poolId: bigint;
  liquidity: bigint;
  createdAtHeight: bigint;
  /** Present only if the pool was known when the position was parsed. */
  shareBps?: number;
}

export function parsePosition(
  raw: AmmPosition,
  pool?: DexPool,
): DexPosition {
  const out: DexPosition = {
    id: hexToBigInt(raw.id),
    owner: raw.owner,
    poolId: hexToBigInt(raw.pool_id),
    liquidity: hexToBigInt(raw.liquidity),
    createdAtHeight: hexToBigInt(raw.created_at_height),
  };
  //  Prefer the server's share_bps when present; otherwise derive
  //  it from the pool if we have one.
  if (typeof raw.share_bps === "number") {
    out.shareBps = raw.share_bps;
  } else if (pool && pool.totalLiquidity > 0n) {
    out.shareBps = Number((out.liquidity * 10_000n) / pool.totalLiquidity);
  }
  return out;
}

// --------------------------------------------------------------- Order

export type DexOrderMode = "passive" | "active";

export type DexOrderConditionType =
  | "expires_at_height"
  | "price_above"
  | "price_below"
  | "volume_below"
  | "balance_below"
  | "invalid";

export interface DexOrderCondition {
  type: DexOrderConditionType;
  typeCode: number;
  param1: bigint;
  param2: bigint;
  description: string;
}

export interface DexOrder {
  id: bigint;
  owner: Bech32mAddress;
  mode: DexOrderMode;
  sellToken: bigint;
  buyToken: bigint;
  sellAmount: bigint;
  minBuyAmount: bigint;
  filledAmount: bigint;
  remainingAmount: bigint;
  createdAtHeight: bigint;
  expiresAtHeight: bigint;
  isFullyFilled: boolean;
  conditions: DexOrderCondition[];
}

function parseCondition(raw: OrderCondition): DexOrderCondition {
  return {
    type: raw.type as DexOrderConditionType,
    typeCode: raw.type_code,
    param1: hexToBigInt(raw.param1),
    param2: hexToBigInt(raw.param2),
    description: raw.description,
  };
}

export function parseOrder(raw: Order): DexOrder {
  return {
    id: hexToBigInt(raw.id),
    owner: raw.owner,
    mode: raw.mode,
    sellToken: hexToBigInt(raw.sell_token),
    buyToken: hexToBigInt(raw.buy_token),
    sellAmount: hexToBigInt(raw.sell_amount),
    minBuyAmount: hexToBigInt(raw.min_buy_amount),
    filledAmount: hexToBigInt(raw.filled_amount),
    remainingAmount: hexToBigInt(raw.remaining_amount),
    createdAtHeight: hexToBigInt(raw.created_at_height),
    expiresAtHeight: hexToBigInt(raw.order_expires_at_height),
    isFullyFilled: raw.is_fully_filled,
    conditions: raw.conditions.map(parseCondition),
  };
}

// --------------------------------------------------------------- Order book

export interface DexOrderBookLevel {
  /** quote per base, scaled by BOOK_PRICE_SCALE */
  price: bigint;
  totalBase: bigint;
  orderCount: number;
}

export interface DexOrderBook {
  baseToken: bigint;
  quoteToken: bigint;
  priceScale: bigint;
  bids: DexOrderBookLevel[];
  asks: DexOrderBookLevel[];
}

function parseLevel(raw: OrderBookLevel): DexOrderBookLevel {
  return {
    price: hexToBigInt(raw.price),
    totalBase: hexToBigInt(raw.total_base),
    orderCount: Number(hexToBigInt(raw.order_count)),
  };
}

export function parseOrderBook(raw: OrderBook): DexOrderBook {
  return {
    baseToken: hexToBigInt(raw.base_token),
    quoteToken: hexToBigInt(raw.quote_token),
    priceScale: hexToBigInt(raw.price_scale),
    bids: raw.bids.map(parseLevel),
    asks: raw.asks.map(parseLevel),
  };
}

// --------------------------------------------------------------- Fill

export interface DexFill {
  source: "limit" | "amm";
  sourceCode: number;
  makerOrderId: bigint;
  takerOrderId: bigint;
  poolId: bigint;
  baseToken: bigint;
  quoteToken: bigint;
  qtyBase: bigint;
  qtyQuote: bigint;
  /** quote per base, scaled by BOOK_PRICE_SCALE */
  price: bigint;
  height: bigint;
  txIndexInBlock: number;
}

export function parseFill(raw: Fill): DexFill {
  return {
    source: raw.source,
    sourceCode: raw.source_code,
    makerOrderId: hexToBigInt(raw.maker_order_id),
    takerOrderId: hexToBigInt(raw.taker_order_id),
    poolId: hexToBigInt(raw.pool_id),
    baseToken: hexToBigInt(raw.base_token),
    quoteToken: hexToBigInt(raw.quote_token),
    qtyBase: hexToBigInt(raw.qty_base),
    qtyQuote: hexToBigInt(raw.qty_quote),
    price: hexToBigInt(raw.price),
    height: hexToBigInt(raw.height),
    txIndexInBlock: raw.tx_index_in_block,
  };
}