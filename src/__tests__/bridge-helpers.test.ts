import { describe, expect, it, vi } from "vitest";
import {
  findExistingRelease,
  paymentIdFor,
  paymentIdHex,
} from "../bridge-helpers.js";
import type { RpcClient } from "../client.js";

const CUSTODY_ADDRESS =
  "ccx7Bnyv4AtgNaFLLCFNLVNASeUpmXWznUxPTg7J8HCP1UWqA9RkTNZDv25TgE4oWi9HJVWQ3dyujU69TKRN9CPc2ecJHSP6C9";

//  A 32-byte hash, as hex without the 0x prefix. Built
//  programmatically so the length is obviously correct: "5a150e"
//  (6 chars) + 58 zeroes = 64 hex characters.
const TX_HASH_HEX = "5a150e" + "0".repeat(58);

describe("paymentIdFor", () => {
  it("is 32 bytes", () => {
    expect(paymentIdFor(1n).length).toBe(32);
  });

  it("is deterministic", () => {
    expect(paymentIdFor(1n)).toEqual(paymentIdFor(1n));
  });

  it("differs for different withdrawal IDs", () => {
    expect(paymentIdFor(1n)).not.toEqual(paymentIdFor(2n));
  });

  it("returns 0x-prefixed hex with 64 digits", () => {
    const hex = paymentIdHex(1n);
    expect(hex.startsWith("0x")).toBe(true);
    expect(hex.length).toBe(66);
  });
});

describe("findExistingRelease", () => {
  it("returns the first release tx hash found", async () => {
    const rpc = {
      call: vi.fn().mockResolvedValue({
        items: [{ transactionHashes: [TX_HASH_HEX] }],
      }),
    } as unknown as RpcClient;

    const out = await findExistingRelease(rpc, 1n, CUSTODY_ADDRESS);

    expect(out).not.toBeNull();
    expect(out!.txHash).toBe("0x" + TX_HASH_HEX);
  });

  it("returns null when no items are present", async () => {
    const rpc = {
      call: vi.fn().mockResolvedValue({}),
    } as unknown as RpcClient;

    const out = await findExistingRelease(rpc, 1n, CUSTODY_ADDRESS);

    expect(out).toBeNull();
  });

  it("returns null when items are empty", async () => {
    const rpc = {
      call: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as RpcClient;

    const out = await findExistingRelease(rpc, 1n, CUSTODY_ADDRESS);

    expect(out).toBeNull();
  });

  it("returns null when the items have no transactionHashes", async () => {
    const rpc = {
      call: vi.fn().mockResolvedValue({
        items: [{ transactionHashes: [] }],
      }),
    } as unknown as RpcClient;

    const out = await findExistingRelease(rpc, 1n, CUSTODY_ADDRESS);

    expect(out).toBeNull();
  });

  it("calls getTransactionHashes with the payment ID, address, and blockCount", async () => {
    const call = vi.fn().mockResolvedValue({ items: [] });
    const rpc = { call } as unknown as RpcClient;

    await findExistingRelease(rpc, 7n, CUSTODY_ADDRESS, 500);

    expect(call).toHaveBeenCalledWith(
      "getTransactionHashes",
      expect.objectContaining({
        paymentId: expect.stringMatching(/^[0-9a-f]{64}$/),
        addresses: [CUSTODY_ADDRESS],
        blockCount: 500,
      }),
    );
  });

  it("propagates transport errors (wallet down is not 'no release')", async () => {
    const rpc = {
      call: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    } as unknown as RpcClient;

    await expect(
      findExistingRelease(rpc, 1n, CUSTODY_ADDRESS),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});