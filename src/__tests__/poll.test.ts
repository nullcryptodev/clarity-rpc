import { describe, expect, it, vi, afterEach } from "vitest";
import { BlockWatcher, TxWatcher, waitForConfirmations } from "../poll.js";
import type { RpcClient } from "../client.js";
import { RpcError, ErrorCodes } from "../errors.js";

// Minimal client stub. Only the methods poll.ts actually calls.

function makeClient(overrides: Partial<RpcClient> = {}): RpcClient {
  return {
    blockNumber: vi.fn().mockResolvedValue({ height: "0x0" }),
    getBlocksRange: vi.fn().mockResolvedValue({
      blocks: [], count: "0x0", start: "0x0", order: "asc",
    }),
    getRecentTransactions: vi.fn().mockResolvedValue({
      transactions: [], count: "0x0",
    }),
    // The node throws RpcError(TransactionNotFound), not a bare Error.
    // Mocking it faithfully is what lets waitForConfirmations
    // distinguish "keep waiting" from "surface this".
    getTransactionByHash: vi
      .fn()
      .mockRejectedValue(
        new RpcError(
          ErrorCodes.TransactionNotFound,
          "transaction not found",
        ),
      ),
    ...overrides,
  } as unknown as RpcClient;
}


afterEach(() => {
  vi.useRealTimers();
});

describe("BlockWatcher", () => {
  it("emits nothing when the tip hasn't moved", async () => {
    const client = makeClient();
    const w = new BlockWatcher(client, { intervalMs: 10 });
    const seen: unknown[] = [];
    w.on("block", (b) => seen.push(b));
    await w.start();
    await new Promise((r) => setTimeout(r, 30));
    w.stop();
    expect(seen).toHaveLength(0);
  });

  it("emits each new block once, oldest first", async () => {
    const headers = [
      { height: "0x1", hash: "0xaa" },
      { height: "0x2", hash: "0xbb" },
    ];
    const client = makeClient({
      blockNumber: vi.fn().mockResolvedValue({ height: "0x2" }),
      getBlocksRange: vi.fn().mockResolvedValue({
        blocks: headers, count: "0x2", start: "0x1", order: "asc",
      }),
    });
    const w = new BlockWatcher(client, { fromHeight: 1, intervalMs: 10 });
    const seen: string[] = [];
    w.on("block", (b: any) => seen.push(b.hash));
    await w.start();
    await new Promise((r) => setTimeout(r, 20));
    w.stop();
    expect(seen).toContain("0xaa");
    expect(seen).toContain("0xbb");
  });

  it("surfaces errors via the 'error' event and keeps going", async () => {
    const client = makeClient({
      blockNumber: vi
        .fn()
        .mockResolvedValueOnce({ height: "0x0" })     // start() succeeds
        .mockRejectedValueOnce(new Error("boom"))      // first tick fails
        .mockResolvedValue({ height: "0x0" }),         // subsequent ticks succeed
    });
    const w = new BlockWatcher(client, { intervalMs: 5 });
    const errs: Error[] = [];
    w.on("error", (e) => errs.push(e));
    await w.start();
    await new Promise((r) => setTimeout(r, 30));
    w.stop();
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe("TxWatcher", () => {
  it("does not emit on the priming poll", async () => {
    const client = makeClient({
      getRecentTransactions: vi.fn().mockResolvedValue({
        transactions: [{ tx: { hash: "0x1" } }],
        count: "0x1",
      }),
    });
    const w = new TxWatcher(client, { intervalMs: 10 });
    const seen: string[] = [];
    w.on("tx", (t: any) => seen.push(t.tx.hash));
    await w.start();
    w.stop();
    expect(seen).toHaveLength(0);
  });

  it("emits new txs after priming", async () => {
    let calls = 0;
    const client = makeClient({
      getRecentTransactions: vi.fn().mockImplementation(async () => {
        calls++;
        return {
          transactions:
            calls === 1
              ? [{ tx: { hash: "0x1" } }]
              : [{ tx: { hash: "0x1" } }, { tx: { hash: "0x2" } }],
          count: "0x2",
        };
      }),
    });
    const w = new TxWatcher(client, { intervalMs: 10 });
    const seen: string[] = [];
    w.on("tx", (t: any) => seen.push(t.tx.hash));
    await w.start();
    await new Promise((r) => setTimeout(r, 25));
    w.stop();
    expect(seen).toContain("0x2");
    expect(seen.filter((h) => h === "0x1")).toHaveLength(0);
  });
});

describe("waitForConfirmations", () => {
  it("returns once enough confirmations are seen", async () => {
    const client = makeClient({
      blockNumber: vi.fn().mockResolvedValue({ height: "0x10" }),
      getTransactionByHash: vi.fn().mockResolvedValue({
        status: "confirmed",
        block_height: "0x5",
      }),
    });
    const out = await waitForConfirmations(client, "0xabc" as any, 3, {
      intervalMs: 5,
      timeoutMs: 500,
    });
    expect(out.height).toBe(BigInt(5));
  });

  it("throws on timeout", async () => {
    const client = makeClient();
    await expect(
      waitForConfirmations(client, "0xabc" as any, 3, {
        intervalMs: 5,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/timed out/);
  });
});