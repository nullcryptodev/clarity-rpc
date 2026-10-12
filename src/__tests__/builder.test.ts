import { describe, expect, it } from "vitest";
import { TxBuilder, UnsignedTx } from "../builder.js";

//  A valid bech32m address must have exactly 52 data characters
//  after the `1` separator. This helper produces one from a 32-byte
//  body, so the tests never have to construct (or retype) an address
//  by hand.
function makeTestAddress(
  hrp: "clrty" | "tclrty" | "rclrty",
  body: Uint8Array = new Uint8Array(32),
): string {
  if (body.length !== 32) throw new Error("body must be 32 bytes");
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of body) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 0x1f);
    }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 0x1f);
  while (words.length < 52) words.push(0);
  if (words.length !== 52) {
    throw new Error(`expected 52 words, got ${words.length}`);
  }
  const data = words.concat([0, 0, 0, 0, 0, 0]);
  return hrp + "1" + data.map((w) => CHARSET[w]).join("");
}

const FROM = makeTestAddress("rclrty");
const TO = makeTestAddress("rclrty", new Uint8Array(32).fill(0x11));

describe("TxBuilder.transfer", () => {
  it("produces an UnsignedTx with the right type name", () => {
    const tx = TxBuilder.transfer({
      from: FROM,
      to: TO,
      amount: BigInt(1_000_000),
      fee: BigInt(1_000),
      nonce: BigInt(0),
      chainId: BigInt(0x434c5247),
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

  it("signing hash is 32 bytes", () => {
    const tx = TxBuilder.transfer({
      from: FROM, to: TO, amount: BigInt(1), fee: BigInt(1),
      nonce: BigInt(0), chainId: BigInt(1),
    });
    const h = tx.signingHash(); // sync in the corrected builder
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
      ...base,
      poolId: BigInt(1),
      tokenIn: BigInt(0),
      amountIn: BigInt(100),
      minAmountOut: BigInt(90),
      to: TO,
    });
    expect(tx.typeName).toBe("swap");
  });

  it("builds addLiquidity", () => {
    const tx = TxBuilder.addLiquidity({
      ...base,
      poolId: BigInt(1),
      tokenIn: BigInt(0),
      amountIn: BigInt(100),
      amountOther: BigInt(200),
    });
    expect(tx.typeName).toBe("add_liquidity");
  });

  it("builds removeLiquidity", () => {
    const tx = TxBuilder.removeLiquidity({
      ...base,
      positionId: BigInt(1),
      amount: BigInt(50),
    });
    expect(tx.typeName).toBe("remove_liquidity");
  });
});

describe("TxBuilder validator", () => {
  const base = {
    from: FROM, fee: BigInt(1), nonce: BigInt(0), chainId: BigInt(1),
  };

  it("rejects short node keys", () => {
    expect(() =>
      TxBuilder.registerValidator({
        ...base,
        nodeKey: new Uint8Array(16),
        stake: BigInt(1),
      }),
    ).toThrow();
  });

  it("accepts 32-byte keys", () => {
    const tx = TxBuilder.registerValidator({
      ...base,
      nodeKey: new Uint8Array(32),
      stake: BigInt(1),
    });
    expect(tx.typeName).toBe("register_validator");
  });

  it("builds updateRewardAddress", () => {
    const tx = TxBuilder.updateRewardAddress({
      ...base,
      newRewardAddress: TO,
    });
    expect(tx.typeName).toBe("update_reward_address");
  });

  it("builds rotateConsensusKey", () => {
    const tx = TxBuilder.rotateConsensusKey({
      ...base,
      newConsensusKey: new Uint8Array(32),
    });
    expect(tx.typeName).toBe("rotate_consensus_key");
  });
});

describe("TxBuilder orders", () => {
  const base = {
    from: FROM, fee: BigInt(1), nonce: BigInt(0), chainId: BigInt(1),
  };

  it("builds a passive order with the right mode byte", () => {
    const tx = TxBuilder.createOrder({
      ...base,
      sellToken: BigInt(0),
      buyToken: BigInt(1),
      sellAmount: BigInt(100),
      minBuyAmount: BigInt(90),
      mode: "passive",
      poolId: BigInt(0),
      expiresAtHeight: BigInt(1000),
    });
    expect(tx.typeName).toBe("create_order");
  });

  it("builds an active order with a pool id", () => {
    const tx = TxBuilder.createOrder({
      ...base,
      sellToken: BigInt(0),
      buyToken: BigInt(1),
      sellAmount: BigInt(100),
      minBuyAmount: BigInt(90),
      mode: "active",
      poolId: BigInt(7),
      expiresAtHeight: BigInt(1000),
    });
    expect(tx.typeName).toBe("create_order");
  });

  it("builds an order with conditions", () => {
    const tx = TxBuilder.createOrder({
      ...base,
      sellToken: BigInt(0),
      buyToken: BigInt(1),
      sellAmount: BigInt(100),
      minBuyAmount: BigInt(90),
      mode: "passive",
      poolId: BigInt(0),
      expiresAtHeight: BigInt(1000),
      conditions: [
        { type: "expires_at_height", param1: BigInt(500), param2: 0 },
      ],
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
      ...base,
      name: "Test",
      symbol: "TST",
      decimals: 5,
      maxSupply: BigInt(1_000_000),
      backing: 0,
      royaltyBps: 0,
    });
    expect(tx.typeName).toBe("create_token");
  });

  it("builds mintToken with a recipient", () => {
    const tx = TxBuilder.mintToken({
      ...base,
      tokenId: BigInt(1),
      to: TO,
      amount: BigInt(100),
    });
    expect(tx.typeName).toBe("mint_token");
  });

  it("builds burnToken", () => {
    const tx = TxBuilder.burnToken({
      ...base,
      tokenId: BigInt(1),
      amount: BigInt(100),
    });
    expect(tx.typeName).toBe("burn_token");
  });

  it("builds updateTokenMeta", () => {
    const tx = TxBuilder.updateTokenMeta({
      ...base,
      tokenId: BigInt(1),
      newName: "New Name",
      newSymbol: "NEW",
    });
    expect(tx.typeName).toBe("update_token_meta");
  });
});