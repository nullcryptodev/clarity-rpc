import { describe, expect, it } from "vitest";
import { TxBuilder, UnsignedTx } from "../builder.js";

//  The public test wallet from the handover session. These keys are
//  deliberately compromised (the wallet was published as a fixture).
//  Never use them for real funds.
const PUBLIC_WALLET_ADDRESS =
  "ccx7Bnyv4AtgNaFLLCFNLVNASeUpmXWznUxPTg7J8HCP1UWqA9RkTNZDv25TgE4oWi9HJVWQ3dyujU69TKRN9CPc2ecJHSP6C9";
const PUBLIC_WALLET_SPEND_KEY_HEX =
  "ae78d56739808611955b1e4d39f999e57f6c400b567f552303214f17b9b8f202";
const PUBLIC_WALLET_VIEW_KEY_HEX =
  "d32114d492519416167c51e74d8d6e27c2591f06824c22340c3596e9bdcbce00";

function publicWalletBlob(): Uint8Array {
  const hex = PUBLIC_WALLET_SPEND_KEY_HEX + PUBLIC_WALLET_VIEW_KEY_HEX;
  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

//  The burner is a Clarity address — the `from` field of the burn.
//  Same test address the existing builder tests use.
const BURNER =
  "rclrty1qzjrjdw68zqmxa744ewv7sstgdstlxw9yx7llhtz9nwmf5r74fetumsykpj";

const CCX_CHAIN_ID = 0x43435831n;

function base() {
  return {
    from: BURNER,
    fee: 100_000n,
    nonce: 0n,
    chainId: 0x434c5247n,
  };
}

describe("TxBuilder.bridgeBurn", () => {
  it("produces a bridge_burn UnsignedTx", () => {
    const tx = TxBuilder.bridgeBurn({
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
      destinationBlob: publicWalletBlob(),
      destinationAddress: PUBLIC_WALLET_ADDRESS,
      amount: 50_000n,
    });
    expect(tx).toBeInstanceOf(UnsignedTx);
    expect(tx.typeName).toBe("bridge_burn");
  });

  it("rejects a non-64-byte destination blob", () => {
    expect(() =>
      TxBuilder.bridgeBurn({
        ...base(),
        sourceChainId: CCX_CHAIN_ID,
        destinationBlob: new Uint8Array(63),
        destinationAddress: PUBLIC_WALLET_ADDRESS,
        amount: 50_000n,
      }),
    ).toThrow(/64 bytes/);

    expect(() =>
      TxBuilder.bridgeBurn({
        ...base(),
        sourceChainId: CCX_CHAIN_ID,
        destinationBlob: new Uint8Array(65),
        destinationAddress: PUBLIC_WALLET_ADDRESS,
        amount: 50_000n,
      }),
    ).toThrow(/64 bytes/);
  });

  it("rejects an empty destination address", () => {
    expect(() =>
      TxBuilder.bridgeBurn({
        ...base(),
        sourceChainId: CCX_CHAIN_ID,
        destinationBlob: publicWalletBlob(),
        destinationAddress: "",
        amount: 50_000n,
      }),
    ).toThrow(/destinationAddress/);
  });

  it("encodes source_chain_id, blob, address, and amount in the payload", () => {
    //  Payload layout (bytes):
    //    [0..8)    source_chain_id (LE)
    //    [8]       blob_len (0x40 = 64)
    //    [9..73)   destination_blob
    //    [73]      addr_len (0x62 = 98 for the CCX address)
    //    [74..172) destination_address (ASCII, 98 bytes)
    //    [172..180) amount (LE)
    //
    //  In hex-character terms (two per byte), the payload is 360
    //  characters long.
    const amount = 50_000n;
    const tx = TxBuilder.bridgeBurn({
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
      destinationBlob: publicWalletBlob(),
      destinationAddress: PUBLIC_WALLET_ADDRESS,
      amount,
    });

    const hex = tx.toHex();
    const payload = extractPayload(hex);

    //  source_chain_id, little-endian.
    expect(payload.slice(0, 16)).toBe("3158434300000000");

    //  blob_len = 64.
    expect(payload.slice(16, 18)).toBe("40");

    //  blob = spend ‖ view.
    expect(payload.slice(18, 18 + 128)).toBe(
      PUBLIC_WALLET_SPEND_KEY_HEX + PUBLIC_WALLET_VIEW_KEY_HEX,
    );

    //  addr_len = 98.
    expect(payload.slice(18 + 128, 18 + 128 + 2)).toBe("62");

    //  destination_address as ASCII, hex-encoded.
    const expectedAddrHex = Buffer.from(
      PUBLIC_WALLET_ADDRESS,
      "ascii",
    ).toString("hex");
    expect(payload.slice(18 + 128 + 2, 18 + 128 + 2 + 196)).toBe(
      expectedAddrHex,
    );

    //  amount is the last 8 bytes of the payload.
    const expectedAmountHex = Buffer.alloc(8);
    expectedAmountHex.writeBigUInt64LE(amount);
    expect(payload.slice(-16)).toBe(expectedAmountHex.toString("hex"));

    //  Sanity: the payload is exactly 180 bytes (360 hex characters).
    expect(payload.length).toBe(360);
  });

  it("is deterministic for the same inputs", () => {
    const args = {
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
      destinationBlob: publicWalletBlob(),
      destinationAddress: PUBLIC_WALLET_ADDRESS,
      amount: 50_000n,
    };
    expect(TxBuilder.bridgeBurn(args).toHex()).toBe(
      TxBuilder.bridgeBurn(args).toHex(),
    );
  });

  it("produces a signing hash of 32 bytes", () => {
    const tx = TxBuilder.bridgeBurn({
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
      destinationBlob: publicWalletBlob(),
      destinationAddress: PUBLIC_WALLET_ADDRESS,
      amount: 50_000n,
    });
    expect(tx.signingHash().length).toBe(32);
  });
});

describe("TxBuilder.registerBridgeWatcher", () => {
  it("produces a register_bridge_watcher UnsignedTx", () => {
    const tx = TxBuilder.registerBridgeWatcher({
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
      stake: 1_000_000n,
    });
    expect(tx.typeName).toBe("register_bridge_watcher");
  });

  it("encodes source_chain_id and stake in the payload", () => {
    const stake = 1_000_000n;
    const tx = TxBuilder.registerBridgeWatcher({
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
      stake,
    });

    const payload = extractPayload(tx.toHex());

    expect(payload.slice(0, 16)).toBe("3158434300000000");

    const expectedStakeHex = Buffer.alloc(8);
    expectedStakeHex.writeBigUInt64LE(stake);
    expect(payload.slice(16)).toBe(expectedStakeHex.toString("hex"));
  });
});

describe("TxBuilder.unregisterBridgeWatcher", () => {
  it("produces an unregister_bridge_watcher UnsignedTx", () => {
    const tx = TxBuilder.unregisterBridgeWatcher({
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
    });
    expect(tx.typeName).toBe("unregister_bridge_watcher");
  });

  it("encodes source_chain_id as the only payload field", () => {
    const tx = TxBuilder.unregisterBridgeWatcher({
      ...base(),
      sourceChainId: CCX_CHAIN_ID,
    });

    const payload = extractPayload(tx.toHex());
    expect(payload).toBe("3158434300000000");
  });
});

/**
 *  Extract the payload bytes (as a hex string) from a serialized
 *  unsigned transaction.
 *
 *  The body layout (from builder.ts) is:
 *
 *    u16   version
 *    u64   chain_id
 *    u8    type_code
 *    u64   nonce
 *    u64   valid_until_height
 *    bytes from                  (32)
 *    bytes to                    (32)
 *    u32   token_id
 *    u64   amount
 *    u64   fee
 *    u32   payload_len
 *    bytes payload
 *
 *  So the payload starts at byte offset
 *  2+8+1+8+8+32+32+4+8+8+4 = 115 of the body, and is
 *  `payload_len` bytes long.
 *
 *  `toHex()` of an UnsignedTx is `"0x"` + the body's hex. The
 *  signature is not part of an UnsignedTx.
 */
function extractPayload(hex: string): string {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;

  const payloadLenOffsetBytes = 2 + 8 + 1 + 8 + 8 + 32 + 32 + 4 + 8 + 8;
  const payloadLenHex = body.slice(
    payloadLenOffsetBytes * 2,
    payloadLenOffsetBytes * 2 + 8,
  );
  const payloadLen = parseInt(payloadLenHex, 16);

  const payloadStartBytes = payloadLenOffsetBytes + 4;
  return body.slice(
    payloadStartBytes * 2,
    (payloadStartBytes + payloadLen) * 2,
  );
}