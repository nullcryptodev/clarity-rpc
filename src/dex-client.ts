/**
 * The DEX facade.
 *
 * Wraps the low-level `RpcClient` with typed methods that return
 * parsed values. Every method maps 1:1 to an RPC method the node
 * already exposes; there is no caching, no pagination state, no
 * retry logic. Those concerns belong in the consumer.
 *
 * The point of this layer is to be the only place where the hex-to-
 * bigint conversion happens for DEX responses. A caller who uses
 * `DexClient` never sees a hex string.
 */

import type { RpcClient } from "./client.js";
import type { Bech32mAddress } from "./types.js";
import type {
  DexFill,
  DexOrder,
  DexOrderBook,
  DexPool,
  DexPosition,
} from "./dex-types.js";
import {
  parseFill,
  parseOrder,
  parseOrderBook,
  parsePool,
  parsePosition,
} from "./dex-types.js";
import { hexToBigInt, bigIntToHex } from "./format.js";

export interface Page {
  count: bigint;
  offset: bigint;
  limit: bigint;
}

export interface PoolPage extends Page {
  pools: DexPool[];
}

export interface PositionPage {
  count: bigint;
  total: bigint;
  positions: DexPosition[];
}

export interface OrderPage extends Page {
  orders: DexOrder[];
}

export interface FillPage {
  count: bigint;
  fills: DexFill[];
}

export interface TradePage {
  count: bigint;
  trades: DexFill[];
}

export class DexClient {
  constructor(private readonly rpc: RpcClient) { }

  // ---- AMM ----------------------------------------------------------

  async getPool(poolId: bigint): Promise<DexPool> {
    const raw = await this.rpc.getPool(bigIntToHex(poolId));
    return parsePool(raw);
  }

  async getAllPools(opts?: { limit?: number; offset?: number }): Promise<PoolPage> {
    const raw = await this.rpc.getAllPools(opts?.limit, opts?.offset);
    return {
      pools: raw.pools.map(parsePool),
      count: hexToBigInt(raw.count),
      offset: hexToBigInt(raw.offset),
      limit: hexToBigInt(raw.limit),
    };
  }

  async getPoolsForToken(tokenId: bigint): Promise<DexPool[]> {
    const raw = await this.rpc.getPoolsForToken(bigIntToHex(tokenId));
    return raw.pools.map(parsePool);
  }

  async getPosition(positionId: bigint): Promise<DexPosition> {
    const raw = await this.rpc.getPosition(bigIntToHex(positionId));
    return parsePosition(raw);
  }

  async getPositionByOwner(
    owner: Bech32mAddress,
    poolId: bigint,
  ): Promise<DexPosition> {
    const raw = await this.rpc.getPositionByOwner(owner, bigIntToHex(poolId));
    return parsePosition(raw);
  }

  async getPositionsForPool(
    poolId: bigint,
    limit = 50,
  ): Promise<PositionPage> {
    const raw = await this.rpc.getPositionsForPool(bigIntToHex(poolId), limit);
    return {
      positions: raw.positions.map((p) => parsePosition(p)),
      count: hexToBigInt(raw.count),
      total: hexToBigInt(raw.total),
    };
  }

  // ---- Orders -------------------------------------------------------

  async getOrder(orderId: bigint): Promise<DexOrder> {
    const raw = await this.rpc.getOrder(bigIntToHex(orderId));
    return parseOrder(raw);
  }

  async getAllOrders(opts?: {
    limit?: number;
    offset?: number;
    includeFilled?: boolean;
  }): Promise<OrderPage> {
    const raw = await this.rpc.getAllOrders(
      opts?.limit,
      opts?.offset,
      opts?.includeFilled,
    );
    return {
      orders: raw.orders.map(parseOrder),
      count: hexToBigInt(raw.count),
      offset: hexToBigInt(raw.offset),
      limit: hexToBigInt(raw.limit),
    };
  }

  async getOrdersByPair(
    sellToken: bigint,
    buyToken: bigint,
    opts?: { limit?: number; offset?: number },
  ): Promise<OrderPage & { sellToken: bigint; buyToken: bigint }> {
    const raw = await this.rpc.getOrdersByPair(
      bigIntToHex(sellToken),
      bigIntToHex(buyToken),
      opts?.limit,
      opts?.offset,
    );
    return {
      sellToken: hexToBigInt(raw.sell_token),
      buyToken: hexToBigInt(raw.buy_token),
      orders: raw.orders.map(parseOrder),
      count: hexToBigInt(raw.count),
      offset: hexToBigInt(raw.offset),
      limit: hexToBigInt(raw.limit),
    };
  }

  async getOrderBook(
    baseToken: bigint,
    quoteToken: bigint,
    depth = 20,
  ): Promise<DexOrderBook> {
    const raw = await this.rpc.getOrderBook(
      bigIntToHex(baseToken),
      bigIntToHex(quoteToken),
      depth,
    );
    return parseOrderBook(raw);
  }

  async getOrderFills(orderId: bigint, limit = 100): Promise<FillPage> {
    const raw = await this.rpc.getOrderFills(bigIntToHex(orderId), limit);
    return {
      fills: raw.fills.map(parseFill),
      count: hexToBigInt(raw.count),
    };
  }

  async getPairTrades(
    baseToken: bigint,
    quoteToken: bigint,
    limit = 100,
  ): Promise<TradePage> {
    const raw = await this.rpc.getPairTrades(
      bigIntToHex(baseToken),
      bigIntToHex(quoteToken),
      limit,
    );
    return {
      trades: raw.trades.map(parseFill),
      count: hexToBigInt(raw.count),
    };
  }
}