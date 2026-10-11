/**
 * Polling helpers.
 *
 * The RPC surface is request/response; the node does not push events.
 * Watchers poll on an interval and emit only new items, tracking the
 * last-seen height or hash so a re-poll doesn't duplicate.
 *
 * All watchers are EventEmitters. `error` is always emitted on
 * failure; the watcher keeps running unless `stop()` is called.
 */

import { EventEmitter } from "node:events";
import type { RpcClient } from "./client.js";
import type { BlockHeader, HashHex, HexString } from "./types.js";
import type { TxWithLocation } from "./types-extra.js";
import { hexToBigInt } from "./format.js";
import { RpcError, ErrorCodes } from "./errors.js";

// ------------------------------------------------------------- BlockWatcher

export interface BlockWatcherOptions {
  intervalMs?: number;
  fromHeight?: HexString | number;
  batchSize?: number;
}

export class BlockWatcher extends EventEmitter {
  private last: bigint | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;

  constructor(
    private readonly client: RpcClient,
    private readonly opts: BlockWatcherOptions = {},
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const tip = hexToBigInt((await this.client.blockNumber()).height);
      this.last =
        this.opts.fromHeight !== undefined
          ? hexToBigInt(toHexParam(this.opts.fromHeight)) - BigInt(1)
          : tip;
    } catch (err) {
      this.emit("error", err);
      // Still schedule ticks — the node might be temporarily unreachable.
    }

    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private tick = async (): Promise<void> => {
    if (this.stopped) return;
    try {
      const tip = hexToBigInt((await this.client.blockNumber()).height);
      if (this.last !== null && this.last < tip) {
        const batch = BigInt(this.opts.batchSize ?? 200);
        const from = this.last + BigInt(1);
        const remaining = tip - from + BigInt(1);
        const take = remaining > batch ? batch : remaining;
        const to = from + take - BigInt(1);

        const { blocks } = await this.client.getBlocksRange(
          "0x" + from.toString(16),
          Number(take),
          "asc",
        );
        for (const h of blocks) this.emit("block", h);
        this.last = to;
      }
    } catch (err) {
      this.emit("error", err);
    } finally {
      if (!this.stopped) {
        this.timer = setTimeout(this.tick, this.opts.intervalMs ?? 1000);
      }
    }
  };
}

// ------------------------------------------------------------- TxWatcher

export interface TxWatcherOptions {
  intervalMs?: number;
  limit?: number;
  typeCode?: number;
}

export class TxWatcher extends EventEmitter {
  private seen = new Set<string>();
  private primed = false;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;

  constructor(
    private readonly client: RpcClient,
    private readonly opts: TxWatcherOptions = {},
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.poll();
      this.primed = true;
    } catch (err) {
      this.emit("error", err);
      // Do not set primed — the next successful poll is still a seed.
    }

    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(this.tick, this.opts.intervalMs ?? 1500);
  }

  private tick = async (): Promise<void> => {
    if (this.stopped) return;
    try {
      await this.poll();
    } catch (err) {
      this.emit("error", err);
    } finally {
      this.scheduleNext();
    }
  };

  private async poll(): Promise<void> {
    const { transactions } = await this.client.getRecentTransactions(
      this.opts.limit ?? 50,
      this.opts.typeCode,
    );
    for (const t of transactions) {
      if (this.seen.has(t.tx.hash)) continue;
      this.seen.add(t.tx.hash);
      if (this.primed) this.emit("tx", t);
    }
    // Bound the set. 10k hashes is tiny.
    if (this.seen.size > 10_000) {
      const keep = [...this.seen].slice(-5_000);
      this.seen = new Set(keep);
    }
  }
}

// ------------------------------------------------------------- waitForConfirmations

export interface WaitForConfirmationsOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export async function waitForConfirmations(
  client: RpcClient,
  hash: HashHex,
  confirmations: number,
  opts: WaitForConfirmationsOptions = {},
): Promise<{ height: bigint }> {
  const timeoutAt = Date.now() + (opts.timeoutMs ?? 5 * 60_000);
  const interval = opts.intervalMs ?? 1000;


  while (Date.now() < timeoutAt) {
    try {
      const loc = await client.getTransactionByHash(hash);
      if (loc.status === "confirmed" && loc.block_height) {
        const tip = hexToBigInt((await client.blockNumber()).height);
        const h = hexToBigInt(loc.block_height);
        if (tip - h + BigInt(1) >= BigInt(confirmations)) {
          return { height: h };
        }
      }
    } catch (err) {
      if (RpcError.is(err) && err.code === ErrorCodes.TransactionNotFound) {
        // expected — keep waiting
      } else {
        throw err;  // transport / auth / protocol — surface immediately
      }
    }
    await sleep(interval);
  }
  throw new Error(`timed out waiting for ${confirmations} confirmation(s)`);
}

// ------------------------------------------------------------- Internals

function toHexParam(v: HexString | number): HexString {
  return typeof v === "number" ? "0x" + v.toString(16) : v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ------------------------------------------------------------- Unused export guard

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _KeepBlockHeader = BlockHeader;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _KeepTxWithLocation = TxWithLocation;