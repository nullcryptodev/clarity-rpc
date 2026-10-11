import { describe, expect, it } from "vitest";
import { TxBuilder, UnsignedTx } from "../builder.js";

const FROM = "clrty1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const TO = "clrty1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

describe("TxBuilder.transfer", () => {
  it("produces an UnsignedTx with the right type name", () => {
    const tx = TxBuilder.transfer({
      from: FROM,
      to: TO,
      amount: BigInt(1_000_000),
      fee: BigInt(1_000),
      nonce: BigInt(0),
      chainId: BigInt(0x434c5254),
    });
    expect(tx).toBeInstanceOf(UnsignedTx);
    expect(tx.typeName).toBe("transfer");
  });

  it("serializes to deterministic hex", () => {
    const a = TxBuilder.transfer({
      from: FROM, to: TO, amount: BigInt(1), fee: BigInt(1),
      nonce: BigInt(0), chainId: BigInt(1),
    });
    const b = TxBuilder.transfer({
      from: FROM, to: TO, amount: BigInt(1), fee: BigInt(1),
      nonce: BigInt(0), chainId: BigInt(1),
    });
    expect(a.toHex()).toBe(b.toHex());
  });

  it("signing hash is 32 bytes", async () => {
    const tx = TxBuilder.transfer({
      from: FROM, to: TO, amount: BigInt(1), fee: BigInt(1),
      nonce: BigInt(0), chainId: BigInt(1),
    });
    const h = await tx.signingHash();
    expect(h.length).toBe(32);
  });

  it("signs and produces a signed tx with the right hex layout", async () => {
    const tx = TxBuilder.transfer({
      from: FROM, to: TO, amount: BigInt(1), fee: BigInt(1),
      nonce: BigInt(0), chainId: BigInt(1),
    });
    const sig = new Uint8Array(64).fill(0xab);
    const signed = await tx.sign(async () => sig);
    const hex = signed.toHex();
    expect(hex.startsWith("0x")).toBe(true);
    expect(hex).toContain("ab".repeat(64));
  });

  it("rejects a short signature from the signer", async () => {
    const tx = TxBuilder.transfer({
      from: FROM, to: TO, amount: BigInt(1), fee: BigInt(1),
      nonce: BigInt(0), chainId: BigInt(1),
    });
    await expect(tx.sign(async () => new Uint8Array(32))).rejects.toThrow();
  });
});

describe("TxBuilder.optInStaking / optOutStaking / claimRewards", () => {
  const base = {
    from: FROM, fee: BigInt(1), nonce: BigInt(0), chainId: BigInt(1),
  };
  it("builds opt-in", () => expect(TxBuilder.optInStaking(base).typeName).toBe("opt_in_staking"));
  it("builds opt-out", () => expect(TxBuilder.optOutStaking(base).typeName).toBe("opt_out_staking"));
  it("builds claim", () => expect(TxBuilder.claimRewards(base).typeName).toBe("claim_rewards"));
});

describe("TxBuilder AMM", () => {
  const base = {
    from: FROM, fee: BigInt(1), nonce: BigInt(0), chainId: BigInt(1),
  };
  it("builds createPool", () => {
    const tx = TxBuilder.createPool({
      ...base, tokenA: BigInt(0), tokenB: BigInt(1),
      amountA: BigInt(100), amountB: BigInt(200), feeBps: 30,
    });
    expect(tx.typeName).toBe("create_pool");
  });
  it("builds swap", () => {
    const tx = TxBuilder.swap({
      ...base, poolId: BigInt(1), sellToken: BigInt(0),
      sellAmount: BigInt(100), minBuyAmount: BigInt(90),
    });
    expect(tx.typeName).toBe("swap");
  });
});

describe("TxBuilder validator", () => {
  const base = {
    from: FROM, fee: BigInt(1), nonce: BigInt(0), chainId: BigInt(1),
  };
  it("rejects short consensus keys", () => {
    expect(() =>
      TxBuilder.registerValidator({
        ...base,
        consensusKey: new Uint8Array(16),
        nodeKey: new Uint8Array(32),
        rewardAddress: TO,
        stake: BigInt(1),
      }),
    ).toThrow();
  });
  it("accepts 32-byte keys", () => {
    const tx = TxBuilder.registerValidator({
      ...base,
      consensusKey: new Uint8Array(32),
      nodeKey: new Uint8Array(32),
      rewardAddress: TO,
      stake: BigInt(1),
    });
    expect(tx.typeName).toBe("register_validator");
  });
});

describe("TxBuilder orders", () => {
  const base = {
    from: FROM, fee: BigInt(1), nonce: BigInt(0), chainId: BigInt(1),
  };
  it("builds createOrder with the right mode byte", () => {
    const tx = TxBuilder.createOrder({
      ...base, sellToken: BigInt(0), buyToken: BigInt(1),
      sellAmount: BigInt(100), minBuyAmount: BigInt(90),
      mode: "active", expiresAtHeight: BigInt(1000),
    });
    expect(tx.typeName).toBe("create_order");
  });
  it("builds cancelOrder", () => {
    const tx = TxBuilder.cancelOrder({ ...base, orderId: BigInt(1) });
    expect(tx.typeName).toBe("cancel_order");
  });
});

describe("TxBuilder tokens", () => {
  const base = {
    from: FROM, fee: BigInt(1), nonce: BigInt(0), chainId: BigInt(1),
  };
  it("builds createToken", () => {
    const tx = TxBuilder.createToken({
      ...base, name: "Test", symbol: "TST", decimals: 5,
      maxSupply: BigInt(1_000_000), backing: "unbacked", royaltyBps: 0,
    });
    expect(tx.typeName).toBe("create_token");
  });
  it("builds mintToken", () => {
    const tx = TxBuilder.mintToken({ ...base, tokenId: BigInt(1), amount: BigInt(100) });
    expect(tx.typeName).toBe("mint_token");
  });
  it("builds burnToken", () => {
    const tx = TxBuilder.burnToken({ ...base, tokenId: BigInt(1), amount: BigInt(100) });
    expect(tx.typeName).toBe("burn_token");
  });
});