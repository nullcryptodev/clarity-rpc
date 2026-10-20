import { describe, expect, it, vi } from "vitest";
import { BridgeClient } from "../bridge-client.js";
import type { RpcClient } from "../client.js";

//  A stubbed RpcClient. Only the bridge methods are populated; the
//  facade never calls anything else. The hex strings the stubs return
//  are the exact wire shapes the node emits — including the ones that
//  look like numbers (ack_attestation_count, ack_quorum, etc.) but are
//  hex-encoded strings, which is the entire point of the facade.

const SOURCE_CHAIN_ID_HEX = "0x43435831";
const SOURCE_CHAIN_ID_BIGINT = 0x43435831n;

const WITHDRAWAL_UNRELEASED = {
  withdrawal_id: "0x1",
  source_chain_id: SOURCE_CHAIN_ID_HEX,
  wrapped_token_id: "0x1",
  burner: "rclrty1qzjrjdw68zqmxa744ewv7sstgdstlxw9yx7llhtz9nwmf5r74fetumsykpj",
  amount: "0x186a0",
  destination_blob:
    "0x" +
    "ae78d56739808611955b1e4d39f999e57f6c400b567f552303214f17b9b8f202" +
    "d32114d492519416167c51e74d8d6e27c2591f06824c22340c3596e9bdcbce00",
  destination_address:
    "ccx7Bnyv4AtgNaFLLCFNLVNASeUpmXWznUxPTg7J8HCP1UWqA9RkTNZDv25TgE4oWi9HJVWQ3dyujU69TKRN9CPc2ecJHSP6C9",
  created_at_height: "0x2a",
  well_formed: true,
  is_released: false,
  release_tx_hash: null,
  release_height: "0x0",
  released_at_height: "0x0",
  released_by_watcher_id: "0x0",
};

const WITHDRAWAL_RELEASED = {
  ...WITHDRAWAL_UNRELEASED,
  is_released: true,
  release_tx_hash:
    "0x5a150e000000000000000000000000000000000000000000000000000000000000",
  release_height: "0x214d4e",
  released_at_height: "0x2c",
  released_by_watcher_id: "0x1",
};

function makeClient(overrides: Partial<RpcClient> = {}): RpcClient {
  return {
    getBridgeChainRegistration: vi.fn(),
    getBridgeConsumed: vi.fn(),
    getBridgeWithdrawal: vi.fn(),
    getActiveWatchers: vi.fn(),
    getBridgeWatcherIdByAddress: vi.fn(),
    getBridgeAttestations: vi.fn(),
    getBridgeAckAttestations: vi.fn(),
    getPendingWithdrawals: vi.fn(),
    getBridgeStats: vi.fn(),
    getBridgeEvents: vi.fn(),
    ...overrides,
  } as unknown as RpcClient;
}

describe("BridgeClient.getWithdrawal", () => {
  it("parses hex-numeric fields to bigint", async () => {
    const rpc = makeClient({
      getBridgeWithdrawal: vi
        .fn()
        .mockResolvedValue(WITHDRAWAL_UNRELEASED),
    });
    const bridge = new BridgeClient(rpc);

    const w = await bridge.getWithdrawal(1n);

    expect(w.withdrawalId).toBe(1n);
    expect(w.sourceChainId).toBe(SOURCE_CHAIN_ID_BIGINT);
    expect(w.wrappedTokenId).toBe(1n);
    expect(w.amount).toBe(100000n);
    expect(w.createdAtHeight).toBe(42n);
    expect(w.releaseHeight).toBe(0n);
    expect(w.releasedAtHeight).toBe(0n);
    expect(w.releasedByWatcherId).toBe(0n);
    expect(w.isReleased).toBe(false);
    expect(w.releaseTxHash).toBeNull();
  });

  it("decodes destination_blob to 64 bytes", async () => {
    const rpc = makeClient({
      getBridgeWithdrawal: vi.fn().mockResolvedValue(WITHDRAWAL_UNRELEASED),
    });
    const bridge = new BridgeClient(rpc);

    const w = await bridge.getWithdrawal(1n);

    expect(w.destinationBlob).toBeInstanceOf(Uint8Array);
    expect(w.destinationBlob.length).toBe(64);
    // First 32 bytes are the spend key; next 32 are the view key.
    expect(Buffer.from(w.destinationBlob.slice(0, 32)).toString("hex")).toBe(
      "ae78d56739808611955b1e4d39f999e57f6c400b567f552303214f17b9b8f202",
    );
    expect(Buffer.from(w.destinationBlob.slice(32, 64)).toString("hex")).toBe(
      "d32114d492519416167c51e74d8d6e27c2591f06824c22340c3596e9bdcbce00",
    );
  });

  it("passes the destination_address through verbatim", async () => {
    const rpc = makeClient({
      getBridgeWithdrawal: vi.fn().mockResolvedValue(WITHDRAWAL_UNRELEASED),
    });
    const bridge = new BridgeClient(rpc);

    const w = await bridge.getWithdrawal(1n);

    expect(w.destinationAddress).toBe(
      WITHDRAWAL_UNRELEASED.destination_address,
    );
  });

  it("reports a released withdrawal with the release fields populated", async () => {
    const rpc = makeClient({
      getBridgeWithdrawal: vi.fn().mockResolvedValue(WITHDRAWAL_RELEASED),
    });
    const bridge = new BridgeClient(rpc);

    const w = await bridge.getWithdrawal(1n);

    expect(w.isReleased).toBe(true);
    expect(w.releaseTxHash).toBe(WITHDRAWAL_RELEASED.release_tx_hash);
    expect(w.releaseHeight).toBe(0x214d4en);
    expect(w.releasedAtHeight).toBe(44n);
    expect(w.releasedByWatcherId).toBe(1n);
  });
});

describe("BridgeClient.getPendingWithdrawals", () => {
  //  The wire returns ack_attestation_count, active_watcher_count,
  //  and ack_quorum as hex STRINGS, not JSON numbers. This is the
  //  behavior the facade exists to hide.
  const PENDING = {
    height: "0x2c",
    from_height: "0x0",
    count: "0x1",
    offset: "0x0",
    limit: "0x64",
    withdrawals: [
      {
        ...WITHDRAWAL_UNRELEASED,
        ack_attestation_count: "0x2",
        active_watcher_count: "0x2",
        ack_quorum: "0x2",
        ack_quorum_reached: true,
      },
    ],
  };

  it("parses ack fields to bigint, not number", async () => {
    const rpc = makeClient({
      getPendingWithdrawals: vi.fn().mockResolvedValue(PENDING),
    });
    const bridge = new BridgeClient(rpc);

    const page = await bridge.getPendingWithdrawals();

    expect(page.count).toBe(1n);
    expect(page.height).toBe(44n);
    expect(page.withdrawals).toHaveLength(1);

    const w = page.withdrawals[0]!;
    expect(w.ackAttestationCount).toBe(2n);
    expect(w.activeWatcherCount).toBe(2n);
    expect(w.ackQuorum).toBe(2n);
    expect(w.ackQuorumReached).toBe(true);
  });

  it("forwards from_height as a hex string", async () => {
    const rpc = makeClient({
      getPendingWithdrawals: vi.fn().mockResolvedValue(PENDING),
    });
    const bridge = new BridgeClient(rpc);

    await bridge.getPendingWithdrawals({ fromHeight: 42n, limit: 10 });

    expect(rpc.getPendingWithdrawals).toHaveBeenCalledWith({
      fromHeight: "0x2a",
      limit: 10,
      offset: undefined,
    });
  });
});

describe("BridgeClient.getStats", () => {
  const STATS = {
    source_chain_id: SOURCE_CHAIN_ID_HEX,
    initialized: true,
    total_minted: "0x186a0",
    total_burned: "0xc350",
    total_released: "0xc350",
    deposit_count: "0x1",
    withdrawal_count: "0x1",
    released_withdrawal_count: "0x1",
    last_mint_height: "0x8",
    last_burn_height: "0x2a",
    last_release_height: "0x2c",
    registered_at_height: "0x1",
    outstanding_liability: "0x0",
    wrapped_supply: "0x0",
    supply_consistent: true,
  };

  it("parses all numeric fields to bigint", async () => {
    const rpc = makeClient({
      getBridgeStats: vi.fn().mockResolvedValue(STATS),
    });
    const bridge = new BridgeClient(rpc);

    const s = await bridge.getStats(SOURCE_CHAIN_ID_BIGINT);

    expect(s.sourceChainId).toBe(SOURCE_CHAIN_ID_BIGINT);
    expect(s.initialized).toBe(true);
    expect(s.totalMinted).toBe(100000n);
    expect(s.totalBurned).toBe(50000n);
    expect(s.totalReleased).toBe(50000n);
    expect(s.outstandingLiability).toBe(0n);
    expect(s.wrappedSupply).toBe(0n);
    expect(s.supplyConsistent).toBe(true);
  });

  it("reports supply_consistent: false verbatim", async () => {
    const rpc = makeClient({
      getBridgeStats: vi.fn().mockResolvedValue({
        ...STATS,
        supply_consistent: false,
      }),
    });
    const bridge = new BridgeClient(rpc);

    const s = await bridge.getStats(SOURCE_CHAIN_ID_BIGINT);

    expect(s.supplyConsistent).toBe(false);
  });
});

describe("BridgeClient.getEvents", () => {
  const EVENT_MINT = {
    kind: "mint" as const,
    kind_code: 0,
    source_chain_id: SOURCE_CHAIN_ID_HEX,
    block_height: "0x8",
    tx_index_in_block: 0,
    tx_hash:
      "0xee6d1512000000000000000000000000000000000000000000000000000000000000",
    source_tx_hash:
      "0xa9cec100000000000000000000000000000000000000000000000000000000000000",
    source_output_index: "0x0",
    withdrawal_id: "0x0",
    actor: "rclrty1qzjrjdw68zqmxa744ewv7sstgdstlxw9yx7llhtz9nwmf5r74fetumsykpj",
    amount: "0x186a0",
    counterparty: "0x0",
  };

  const EVENT_BURN = {
    ...EVENT_MINT,
    kind: "burn" as const,
    kind_code: 1,
    block_height: "0x2a",
    tx_index_in_block: 1,
    tx_hash:
      "0xeb00000000000000000000000000000000000000000000000000000000000000",
    source_tx_hash: null,
    withdrawal_id: "0x1",
    counterparty: "0x0",
  };

  it("parses event fields to bigint and preserves hashes", async () => {
    const rpc = makeClient({
      getBridgeEvents: vi.fn().mockResolvedValue({
        source_chain_id: SOURCE_CHAIN_ID_HEX,
        from_height: "0x0",
        count: "0x2",
        offset: "0x0",
        limit: "0x14",
        total: "0x2",
        events: [EVENT_MINT, EVENT_BURN],
      }),
    });
    const bridge = new BridgeClient(rpc);

    const page = await bridge.getEvents({
      sourceChainId: SOURCE_CHAIN_ID_BIGINT,
    });

    expect(page.total).toBe(2n);
    expect(page.events).toHaveLength(2);

    const mint = page.events[0]!;
    expect(mint.kind).toBe("mint");
    expect(mint.blockHeight).toBe(8n);
    expect(mint.txHash).toBe(EVENT_MINT.tx_hash);
    expect(mint.sourceTxHash).toBe(EVENT_MINT.source_tx_hash);
    expect(mint.withdrawalId).toBe(0n);
    expect(mint.amount).toBe(100000n);

    const burn = page.events[1]!;
    expect(burn.kind).toBe("burn");
    expect(burn.sourceTxHash).toBeNull();
    expect(burn.withdrawalId).toBe(1n);
  });

  it("rejects an unknown kind before hitting the RPC", async () => {
    const rpc = makeClient({
      getBridgeEvents: vi.fn(),
    });
    const bridge = new BridgeClient(rpc);

    await expect(
      // The facade's parameter is typed, but a JavaScript caller can
      // pass anything. The runtime check is what protects them.
      (bridge.getEvents as any)({
        sourceChainId: SOURCE_CHAIN_ID_BIGINT,
        kind: "mint_nft",
      }),
    ).rejects.toThrow(/unknown bridge event kind/);

    expect(rpc.getBridgeEvents).not.toHaveBeenCalled();
  });

  it("forwards the kind filter as a name, not a code", async () => {
    const rpc = makeClient({
      getBridgeEvents: vi.fn().mockResolvedValue({
        source_chain_id: SOURCE_CHAIN_ID_HEX,
        from_height: "0x0",
        count: "0x1",
        offset: "0x0",
        limit: "0x14",
        total: "0x1",
        events: [EVENT_BURN],
      }),
    });
    const bridge = new BridgeClient(rpc);

    await bridge.getEvents({
      sourceChainId: SOURCE_CHAIN_ID_BIGINT,
      kind: "burn",
    });

    expect(rpc.getBridgeEvents).toHaveBeenCalledWith({
      sourceChainId: "0x43435831",
      kind: "burn",
    });
  });
});