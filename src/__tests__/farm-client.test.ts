import { describe, it, expect, vi } from "vitest";
import { FarmClient } from "../farm-client.js";
import type { RpcClient } from "../client.js";

//  A minimal RpcClient stub — only the methods the FarmClient
//  actually calls. The FarmClient takes an RpcClient, so as long as
//  these methods exist and return the shapes the node produces,
//  the client works.
function stubRpc(overrides: Partial<RpcClient> = {}): RpcClient {
  const base = {
    getAmmFarm: vi.fn(),
    getAllAmmFarms: vi.fn(),
    getAmmFarmAccrual: vi.fn(),
    getAmmPositionAccrualsForOwner: vi.fn(),
    getAmmFarmStats: vi.fn(),
  };
  return { ...base, ...overrides } as unknown as RpcClient;
}

describe("FarmClient", () => {
  it("getAmmFarm forwards the pool id as hex and parses the result", async () => {
    const raw = {
      pool_id: "0x7",
      creator: "rclrty1qqqq...",
      reward_token_id: "0x0",
      reward_rate_per_epoch: "0x64",
      reward_escrow_remaining: "0xc350",
      reward_paused: false,
      rps_per_share: "0x0",
      created_at_height: "0x1",
      reward_escrow_balance: "0xc350",
      pool_total_liquidity: "0x3e8",
      is_active: true,
      epochs_remaining: "0x1f4",
      escrow_address: "rclrty1qqqq...",
    };
    const rpc = stubRpc({ getAmmFarm: vi.fn().mockResolvedValue(raw) });
    const farm = new FarmClient(rpc);

    const parsed = await farm.getAmmFarm(7n);
    expect(rpc.getAmmFarm).toHaveBeenCalledWith("0x7");
    expect(parsed.poolId).toBe(7n);
    expect(parsed.rewardRatePerEpoch).toBe(100n);
    expect(parsed.rewardEscrowBalance).toBe(50_000n);
    expect(parsed.isActive).toBe(true);
    expect(parsed.epochsRemaining).toBe(500n);
  });

  it("getAllAmmFarms pages and parses", async () => {
    const raw = {
      count: "0x1",
      offset: "0x0",
      limit: "0x32",
      total: "0x1",
      farms: [
        {
          pool_id: "0x1",
          creator: "rclrty1qqqq...",
          reward_token_id: "0x0",
          reward_rate_per_epoch: "0x1",
          reward_escrow_remaining: "0x1",
          reward_paused: false,
          rps_per_share: "0x0",
          created_at_height: "0x1",
          reward_escrow_balance: "0x1",
          pool_total_liquidity: "0x1",
          is_active: true,
          epochs_remaining: "0x1",
          escrow_address: "rclrty1qqqq...",
        },
      ],
    };
    const rpc = stubRpc({ getAllAmmFarms: vi.fn().mockResolvedValue(raw) });
    const farm = new FarmClient(rpc);

    const page = await farm.getAllAmmFarms({ limit: 10, offset: 0 });
    expect(page.count).toBe(1n);
    expect(page.total).toBe(1n);
    expect(page.farms).toHaveLength(1);
    expect(page.farms[0]!.poolId).toBe(1n);
  });

  it("getAmmFarmAccrual parses the computed accrual", async () => {
    const raw = {
      pool_id: "0x1",
      position_id: "0x2",
      position_liquidity: "0x3e8",
      reward_token_id: "0x0",
      exists: false,
      last_rps: "0x0",
      current_rps: "0x2540be400",  // 10^10
      accrued_unclaimed: "0x3e8",   // 1000
      farm_paused: false,
    };
    const rpc = stubRpc({
      getAmmFarmAccrual: vi.fn().mockResolvedValue(raw),
    });
    const farm = new FarmClient(rpc);

    const a = await farm.getAmmFarmAccrual(1n, 2n);
    expect(rpc.getAmmFarmAccrual).toHaveBeenCalledWith("0x1", "0x2");
    expect(a.exists).toBe(false);
    expect(a.accruedUnclaimed).toBe(1000n);
    expect(a.currentRps).toBe(10_000_000_000n);
  });

  it("getAmmFarmStats parses the per-token breakdown", async () => {
    const raw = {
      height: "0x64",
      total_farms: "0x2",
      active_farms: "0x1",
      paused_farms: "0x1",
      escrow_by_token: [
        { token_id: "0x0", escrow_total: "0x3e8" },
        { token_id: "0x50", escrow_total: "0x1f4" },
      ],
    };
    const rpc = stubRpc({ getAmmFarmStats: vi.fn().mockResolvedValue(raw) });
    const farm = new FarmClient(rpc);

    const s = await farm.getAmmFarmStats();
    expect(s.totalFarms).toBe(2n);
    expect(s.escrowByToken).toHaveLength(2);
    expect(s.escrowByToken[0]!.tokenId).toBe(0n);
    expect(s.escrowByToken[1]!.escrowTotal).toBe(500n);
  });
});