import { describe, expect, it } from "vitest";
import { RpcClient } from "../client.js";
import type { RpcTransport } from "../transport.js";

//  A transport stub that records the (method, params) pairs the
//  client sends. No HTTP, no JSON — just a call log.
function makeRecorder(): {
  transport: RpcTransport;
  calls: Array<{ method: string; params: unknown }>;
} {
  const calls: Array<{ method: string; params: unknown }> = [];
  const transport: RpcTransport = {
    send<T>(method: string, params: unknown): Promise<T> {
      calls.push({ method, params });
      return Promise.resolve(undefined as unknown as T);
    },
    close: async () => { },
  };
  return { transport, calls };
}

const SOURCE_CHAIN_ID = "0x43435831";

describe("RpcClient bridge methods", () => {
  it("getBridgeChainRegistration sends source_chain_id", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeChainRegistration(SOURCE_CHAIN_ID);

    expect(calls).toEqual([
      {
        method: "getBridgeChainRegistration",
        params: { source_chain_id: SOURCE_CHAIN_ID },
      },
    ]);
  });

  it("getBridgeConsumed sends snake_case field names", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeConsumed({
      sourceChainId: SOURCE_CHAIN_ID,
      sourceTxHash:
        "0xaa00000000000000000000000000000000000000000000000000000000000000",
      sourceOutputIndex: 3,
    });

    expect(calls).toEqual([
      {
        method: "getBridgeConsumed",
        params: {
          source_chain_id: SOURCE_CHAIN_ID,
          source_tx_hash:
            "0xaa00000000000000000000000000000000000000000000000000000000000000",
          source_output_index: 3,
        },
      },
    ]);
  });

  it("getBridgeWithdrawal sends withdrawal_id", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeWithdrawal("0x1");

    expect(calls[0]).toEqual({
      method: "getBridgeWithdrawal",
      params: { withdrawal_id: "0x1" },
    });
  });

  it("getActiveWatchers omits height when not provided", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getActiveWatchers(SOURCE_CHAIN_ID);

    expect(calls[0]).toEqual({
      method: "getActiveWatchers",
      params: { source_chain_id: SOURCE_CHAIN_ID },
    });
  });

  it("getActiveWatchers includes height when provided", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getActiveWatchers(SOURCE_CHAIN_ID, "0x2a");

    expect(calls[0]).toEqual({
      method: "getActiveWatchers",
      params: { source_chain_id: SOURCE_CHAIN_ID, height: "0x2a" },
    });
  });

  it("getBridgeWatcherIdByAddress sends address", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });
    const address = "rclrty1qzjrjdw68zqmxa744ewv7sstgdstlxw9yx7llhtz9nwmf5r74fetumsykpj";

    await client.getBridgeWatcherIdByAddress(address);

    expect(calls[0]).toEqual({
      method: "getBridgeWatcherIdByAddress",
      params: { address },
    });
  });

  it("getBridgeAttestations sends per-deposit form when three fields are present", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeAttestations({
      sourceChainId: SOURCE_CHAIN_ID,
      sourceTxHash:
        "0xaa00000000000000000000000000000000000000000000000000000000000000",
      sourceOutputIndex: 0,
    });

    expect(calls[0]!.method).toBe("getBridgeAttestations");
    expect(calls[0]!.params).toMatchObject({
      source_chain_id: SOURCE_CHAIN_ID,
      source_tx_hash: expect.any(String),
      source_output_index: 0,
    });
  });

  it("getBridgeAttestations sends page form when no deposit fields are present", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeAttestations({ limit: 10, offset: 20 });

    expect(calls[0]).toEqual({
      method: "getBridgeAttestations",
      params: { limit: 10, offset: 20 },
    });
  });

  it("getBridgeAckAttestations sends per-withdrawal form", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeAckAttestations({ withdrawalId: "0x1" });

    expect(calls[0]).toEqual({
      method: "getBridgeAckAttestations",
      params: { withdrawal_id: "0x1" },
    });
  });

  it("getBridgeAckAttestations sends page form", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeAckAttestations({ limit: 5 });

    expect(calls[0]).toEqual({
      method: "getBridgeAckAttestations",
      params: { limit: 5 },
    });
  });

  it("getPendingWithdrawals forwards optional from_height", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getPendingWithdrawals({
      fromHeight: "0x2a",
      limit: 10,
    });

    expect(calls[0]).toEqual({
      method: "getPendingWithdrawals",
      params: { from_height: "0x2a", limit: 10 },
    });
  });

  it("getPendingWithdrawals omits undefined fields", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getPendingWithdrawals();

    expect(calls[0]).toEqual({
      method: "getPendingWithdrawals",
      params: {},
    });
  });

  it("getBridgeStats sends source_chain_id", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeStats(SOURCE_CHAIN_ID);

    expect(calls[0]).toEqual({
      method: "getBridgeStats",
      params: { source_chain_id: SOURCE_CHAIN_ID },
    });
  });

  it("getBridgeEvents forwards kind as a string name", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeEvents({
      sourceChainId: SOURCE_CHAIN_ID,
      fromHeight: "0x2a",
      kind: "burn",
      limit: 20,
    });

    expect(calls[0]).toEqual({
      method: "getBridgeEvents",
      params: {
        source_chain_id: SOURCE_CHAIN_ID,
        from_height: "0x2a",
        kind: "burn",
        limit: 20,
      },
    });
  });

  it("getBridgeEvents omits the kind filter when absent", async () => {
    const { transport, calls } = makeRecorder();
    const client = new RpcClient({ transport });

    await client.getBridgeEvents({ sourceChainId: SOURCE_CHAIN_ID });

    expect(calls[0]).toEqual({
      method: "getBridgeEvents",
      params: { source_chain_id: SOURCE_CHAIN_ID },
    });
  });
});