/**
 * The AMM farming facade.
 *
 * Wraps the low-level `RpcClient` with typed methods that return
 * parsed values. Every method maps 1:1 to an RPC method the node
 * exposes; there is no caching, no pagination state, no retry logic.
 *
 * This class is a peer of `DexClient`, not a member of it: farming
 * is a distinct feature with its own pool-adjacent records and its
 * own write transactions, and folding it into `DexClient` would grow
 * that class by five read methods and six write methods.
 */

import type { RpcClient } from "./client.js";
import type { Bech32mAddress } from "./types.js";
import type {
  ParsedAmmFarm,
  ParsedAmmFarmAccrual,
  ParsedAmmFarmStats,
} from "./farm-types.js";
import {
  parseFarm,
  parseFarmAccrual,
  parseFarmStats,
} from "./farm-types.js";
import { hexToBigInt, bigIntToHex } from "./format.js";

export interface FarmPage {
  count: bigint;
  offset: bigint;
  limit: bigint;
  total: bigint;
  farms: ParsedAmmFarm[];
}

export class FarmClient {
  constructor(private readonly rpc: RpcClient) { }

  // ---- Reads -------------------------------------------------------

  /**
   * Fetch one pool's farm schedule. Throws `RpcError` with
   * `AmmFarmNotFound` if the pool has no farm.
   */
  async getAmmFarm(poolId: bigint): Promise<ParsedAmmFarm> {
    const raw = await this.rpc.getAmmFarm(bigIntToHex(poolId));
    return parseFarm(raw);
  }

  /**
   * List every farm on the chain, paged. The default limit is the
   * node's default (50); pass `{ limit, offset }` to override.
   */
  async getAllAmmFarms(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<FarmPage> {
    const raw = await this.rpc.getAllAmmFarms(opts?.limit, opts?.offset);
    return {
      farms: raw.farms.map(parseFarm),
      count: hexToBigInt(raw.count),
      offset: hexToBigInt(raw.offset),
      limit: hexToBigInt(raw.limit),
      total: hexToBigInt(raw.total),
    };
  }

  /**
   * Fetch one position's accrual against a farm. The `exists` field
   * distinguishes "the companion record is present" from "the
   * position has never settled"; the accrual is computed either way
   * (an absent record means `last_rps = 0`, which is correct because
   * the farm also started at 0).
   */
  async getAmmFarmAccrual(
    poolId: bigint,
    positionId: bigint,
  ): Promise<ParsedAmmFarmAccrual> {
    const raw = await this.rpc.getAmmFarmAccrual(
      bigIntToHex(poolId),
      bigIntToHex(positionId),
    );
    return parseFarmAccrual(raw);
  }

  /**
   * Every farm accrual for a given owner. One entry per position on
   * a farmed pool; positions on unfarmed pools are omitted by the
   * node. The default `limit` is 100.
   */
  async getAmmPositionAccrualsForOwner(
    owner: Bech32mAddress,
    opts?: { limit?: number },
  ): Promise<{ accruals: ParsedAmmFarmAccrual[]; count: bigint }> {
    const raw = await this.rpc.getAmmPositionAccrualsForOwner(
      owner,
      opts?.limit,
    );
    return {
      accruals: raw.accruals.map(parseFarmAccrual),
      count: hexToBigInt(raw.count),
    };
  }

  /**
   * Node-wide aggregates: total farms, active, paused, and a
   * per-token breakdown of the total escrow locked.
   */
  async getAmmFarmStats(): Promise<ParsedAmmFarmStats> {
    const raw = await this.rpc.getAmmFarmStats();
    return parseFarmStats(raw);
  }
}