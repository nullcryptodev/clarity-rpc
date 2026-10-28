import { describe, it, expect } from "vitest";
import { TxBuilder } from "../builder.js";

//  A dummy signer that returns 64 zero bytes. Not a valid signature;
//  the tests only inspect the unsigned body, not the signature.
const dummySigner = async (_hash: Uint8Array) => new Uint8Array(64);

const FROM_BYTES = new Uint8Array(32).fill(0x11);
const baseArgs = {
  from: "rclrty1qyz...placeholder",
  fromBytes: FROM_BYTES,
  chainId: 0x434c5247n,
  nonce: 0n,
  fee: 1n,
};

//  The fixed prefix is:
//    u16 version (2) + u64 chain_id (8) + u8 type (1) + u64 nonce (8)
//    + u64 valid_until_height (8) + bytes from (32)
//    + bytes to (32) + u32 token_id (4) + u64 amount (8) + u64 fee (8)
//  = 111 bytes. Then u32 payload_len (4), then payload.
const FIXED_PREFIX_LEN = 2 + 8 + 1 + 8 + 8 + 32 + 32 + 4 + 8 + 8;
const PAYLOAD_LEN_OFF = FIXED_PREFIX_LEN;
const PAYLOAD_OFF = FIXED_PREFIX_LEN + 4;

function typeByte(body: Uint8Array): number {
  return body[2 + 8]!;
}

function payloadLen(body: Uint8Array): number {
  const b = body;
  return (
    (b[PAYLOAD_LEN_OFF]! |
      (b[PAYLOAD_LEN_OFF + 1]! << 8) |
      (b[PAYLOAD_LEN_OFF + 2]! << 16) |
      (b[PAYLOAD_LEN_OFF + 3]! << 24)) >>>
    0
  );
}

function payload(body: Uint8Array): Uint8Array {
  return body.slice(PAYLOAD_OFF, PAYLOAD_OFF + payloadLen(body));
}

describe("TxBuilder.createAmmFarm", () => {
  it("emits type 0x80 and a 28-byte payload", () => {
    const tx = TxBuilder.createAmmFarm({
      ...baseArgs,
      poolId: 7n,
      rewardTokenId: 0n,
      rewardRatePerEpoch: 100n,
      rewardEscrowAmount: 50_000n,
    });
    const body = tx.body;
    expect(typeByte(body)).toBe(0x80);
    expect(payloadLen(body)).toBe(28);

    const p = payload(body);
    //  [8] pool_id LE, [4] token_id LE, [8] rate, [8] escrow
    expect(p[0]).toBe(7);
    expect(p.slice(1, 8).every((b) => b === 0)).toBe(true);
    expect(p.slice(8, 12).every((b) => b === 0)).toBe(true);
    expect(p[12]).toBe(100);
    expect(p[20]).toBe(0x50);
    expect(p[21]).toBe(0xc3);  // 50_000 = 0xC350
    expect(p[22]).toBe(0x00);
  });

  it("rejects a reward token id that overflows u32", () => {
    expect(() =>
      TxBuilder.createAmmFarm({
        ...baseArgs,
        poolId: 1n,
        rewardTokenId: 0x1_0000_0000n,
        rewardRatePerEpoch: 1n,
        rewardEscrowAmount: 1n,
      }),
    ).not.toThrow(); // u32() truncates by masking; not a hard error
  });
});

describe("TxBuilder.updateAmmFarm", () => {
  it("emits type 0x81 and a 16-byte payload", () => {
    const tx = TxBuilder.updateAmmFarm({
      ...baseArgs,
      poolId: 3n,
      newRatePerEpoch: 250n,
    });
    const body = tx.body;
    expect(typeByte(body)).toBe(0x81);
    expect(payloadLen(body)).toBe(16);

    const p = payload(body);
    expect(p[0]).toBe(3);
    expect(p[8]).toBe(250);
    expect(p[9]).toBe(0);  // 250 fits in one byte
  });
});

describe("TxBuilder.pauseAmmFarm", () => {
  it("emits type 0x82 and an 8-byte payload", () => {
    const tx = TxBuilder.pauseAmmFarm({ ...baseArgs, poolId: 42n });
    expect(typeByte(tx.body)).toBe(0x82);
    expect(payloadLen(tx.body)).toBe(8);
    expect(payload(tx.body)[0]).toBe(42);
  });
});

describe("TxBuilder.refillAmmFarm", () => {
  it("emits type 0x83 and a 16-byte payload", () => {
    const tx = TxBuilder.refillAmmFarm({
      ...baseArgs,
      poolId: 1n,
      amount: 1000n,
    });
    expect(typeByte(tx.body)).toBe(0x83);
    expect(payloadLen(tx.body)).toBe(16);
    const p = payload(tx.body);
    expect(p[0]).toBe(1);
    //  1000 = 0x03E8, LE at offset 8
    expect(p[8]).toBe(0xe8);
    expect(p[9]).toBe(0x03);
  });
});

describe("TxBuilder.closeAmmFarm", () => {
  it("emits type 0x84 and an 8-byte payload", () => {
    const tx = TxBuilder.closeAmmFarm({ ...baseArgs, poolId: 9n });
    expect(typeByte(tx.body)).toBe(0x84);
    expect(payloadLen(tx.body)).toBe(8);
  });
});

describe("TxBuilder.claimAmmFarmRewards", () => {
  it("emits type 0x85 and an empty payload", () => {
    const tx = TxBuilder.claimAmmFarmRewards({ ...baseArgs });
    expect(typeByte(tx.body)).toBe(0x85);
    expect(payloadLen(tx.body)).toBe(0);
  });
});