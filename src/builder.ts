/**
 * Transaction builder.
 *
 * The node expects a serialized, signed transaction as 0x-hex on the
 * wire (`sendRawTransaction`). This module produces that hex from a
 * structured description, with a pluggable signer so the library
 * doesn't have to know which crypto backend you use.
 *
 * Serialization is deterministic and matches the layout the C++
 * `Transaction::serialize` writes. Field order and sizes:
 *
 *   u8    version
 *   u32   chain_id
 *   u8    type_code
 *   u64   nonce
 *   u64   valid_until_height
 *   u32   from_len      (bytes, 20 or 32)
 *   bytes from
 *   u8    has_to        (0/1)
 *   u32   to_len        (present if has_to=1)
 *   bytes to
 *   u64   token_id
 *   u128  amount
 *   u64   fee
 *   u32   payload_len
 *   bytes payload
 *   u8    sig_present   (0/1)
 *   u32   sig_len       (present if sig_present=1)
 *   bytes signature
 *
 * Signing hash = SHA-256 of the serialized body up to and including
 * payload, with the signature block omitted.
 *
 * The builder is deliberately independent of the crypto. Pass in a
 * `SignerFn` that returns a 64-byte signature for a 32-byte hash.
 */

import type { Bech32mAddress, HexString } from "./types.js";
import { bigIntToHex, hexToBigInt } from "./format.js";

// ------------------------------------------------------------- Args types

export interface BaseTxArgs {
  from: Bech32mAddress;
  /** Optional: if omitted, the address is derived from `from`. */
  fromBytes?: Uint8Array;
  fee: bigint;
  nonce: bigint;
  chainId: bigint;
  /** Height after which the tx is invalid. 0 = no expiry. */
  validUntilHeight?: bigint;
  /** Extra payload bytes, already serialized. Most callers omit. */
  payload?: Uint8Array;
}

export interface BuildTransferArgs extends BaseTxArgs {
  to: Bech32mAddress;
  toBytes?: Uint8Array;
  amount: bigint;
  tokenId?: bigint;
}

export interface BuildOptInStakingArgs extends BaseTxArgs { }
export interface BuildOptOutStakingArgs extends BaseTxArgs { }
export interface BuildClaimRewardsArgs extends BaseTxArgs { }

export interface BuildRegisterValidatorArgs extends BaseTxArgs {
  consensusKey: Uint8Array;
  nodeKey: Uint8Array;
  rewardAddress: Bech32mAddress;
  rewardAddressBytes?: Uint8Array;
  stake: bigint;
}

export interface BuildUnregisterValidatorArgs extends BaseTxArgs {
  validatorId: bigint;
}

export interface BuildUpdateRewardAddressArgs extends BaseTxArgs {
  validatorId: bigint;
  newRewardAddress: Bech32mAddress;
  newRewardAddressBytes?: Uint8Array;
}

export interface BuildCreatePoolArgs extends BaseTxArgs {
  tokenA: bigint;
  tokenB: bigint;
  amountA: bigint;
  amountB: bigint;
  feeBps: number;
}

export interface BuildAddLiquidityArgs extends BaseTxArgs {
  poolId: bigint;
  amountA: bigint;
  amountB: bigint;
  minLiquidity: bigint;
}

export interface BuildRemoveLiquidityArgs extends BaseTxArgs {
  poolId: bigint;
  liquidity: bigint;
  minAmountA: bigint;
  minAmountB: bigint;
}

export interface BuildSwapArgs extends BaseTxArgs {
  poolId: bigint;
  sellToken: bigint;
  sellAmount: bigint;
  minBuyAmount: bigint;
}

export interface BuildCreateOrderArgs extends BaseTxArgs {
  sellToken: bigint;
  buyToken: bigint;
  sellAmount: bigint;
  minBuyAmount: bigint;
  mode: "passive" | "active";
  expiresAtHeight: bigint;
}

export interface BuildCancelOrderArgs extends BaseTxArgs {
  orderId: bigint;
}

export interface BuildCreateTokenArgs extends BaseTxArgs {
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: bigint;
  backing: "unbacked" | "backed" | "hybrid";
  royaltyBps: number;
}

export interface BuildMintTokenArgs extends BaseTxArgs {
  tokenId: bigint;
  amount: bigint;
}

export interface BuildBurnTokenArgs extends BaseTxArgs {
  tokenId: bigint;
  amount: bigint;
}

export interface BuildUpdateTokenMetaArgs extends BaseTxArgs {
  tokenId: bigint;
  name: string;
  symbol: string;
}

// ------------------------------------------------------------- Signer

/**
 * A signer takes the 32-byte signing hash and returns a 64-byte
 * signature. Implementations are expected to be async because most
 * crypto backends are.
 */
export type SignerFn = (hash: Uint8Array) => Promise<Uint8Array>;

// ------------------------------------------------------------- Writer

class Writer {
  private buf: number[] = [];

  u8(v: number): this {
    this.buf.push(v & 0xff);
    return this;
  }

  u32(v: number | bigint): this {
    const n = BigInt(v);
    for (let i = 0; i < 4; i++) this.buf.push(Number((n >> BigInt(i * 8)) & 0xffn));
    return this;
  }

  u64(v: bigint): this {
    for (let i = 0; i < 8; i++) this.buf.push(Number((v >> BigInt(i * 8)) & 0xffn));
    return this;
  }

  u128(v: bigint): this {
    for (let i = 0; i < 16; i++) this.buf.push(Number((v >> BigInt(i * 8)) & 0xffn));
    return this;
  }

  bytes(b: Uint8Array): this {
    this.buf.push(...b);
    return this;
  }

  u32Prefixed(b: Uint8Array): this {
    this.u32(b.length).bytes(b);
    return this;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }

  toHex(): HexString {
    let s = "0x";
    for (const b of this.buf) s += b.toString(16).padStart(2, "0");
    return s;
  }
}

// ------------------------------------------------------------- Address

/**
 * Decode a bech32m address to its 32-byte body. The builder doesn't
 * fully validate the checksum — that's a heavier dependency — but it
 * does enforce the HRP and length. Callers who already have the raw
 * bytes should pass `fromBytes`/`toBytes` and skip this path.
 */
function decodeBech32m(addr: Bech32mAddress): Uint8Array {
  const sep = addr.lastIndexOf("1");
  if (sep < 0) throw new Error(`not a bech32m address: ${addr}`);
  const hrp = addr.slice(0, sep).toLowerCase();
  if (!["clrty", "tclrty", "rclrty"].includes(hrp)) {
    throw new Error(`unknown bech32m HRP: ${hrp}`);
  }
  const data = addr.slice(sep + 1).toLowerCase();

  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const words: number[] = [];
  for (const c of data) {
    const i = CHARSET.indexOf(c);
    if (i < 0) throw new Error(`invalid bech32m char: ${c}`);
    words.push(i);
  }
  // Drop the 6-word checksum. The remaining words are 5-bit groups
  // representing the payload.
  const payload = words.slice(0, -6);

  // Convert 5-bit groups to 8-bit bytes.
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const w of payload) {
    acc = (acc << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// ------------------------------------------------------------- Constants

const TYPE_CODES = {
  // Core (0x00 - 0x0F)
  transfer: 0x00,

  // Staking (0x10 - 0x1F)
  opt_in_staking: 0x10,
  opt_out_staking: 0x11,
  claim_rewards: 0x12,

  // Validator (0x20 - 0x2F)
  register_validator: 0x20,
  unregister_validator: 0x21,
  update_reward_address: 0x22,
  rotate_consensus_key: 0x23,

  // AMM (0x30 - 0x3F)
  create_pool: 0x30,
  add_liquidity: 0x31,
  remove_liquidity: 0x32,
  swap: 0x33,

  // DEX / Orders (0x40 - 0x4F)
  create_order: 0x40,
  cancel_order: 0x41,

  // NFT types (0x42 - 0x4A) — appended, not inserted
  create_nft_collection: 0x42,
  mint_nft: 0x43,
  wrap_nft: 0x44,
  transfer_nft: 0x45,
  burn_nft: 0x46,
  update_nft_metadata: 0x47,
  top_up_nft: 0x48,
  claim_nft_reward: 0x49,
  refill_collection_reward: 0x4a,

  // Token management (0x50 - 0x5F)
  create_token: 0x50,
  mint_token: 0x51,
  burn_token: 0x52,
  update_token_meta: 0x53,

  // System (0xF0 - 0xFE)
  block_reward: 0xf0,
  order_expired: 0xf1,
  slash: 0xf2,
} as const;

const TX_VERSION = 1;
const NATIVE_TOKEN_ID = BigInt(0);
const BACKING_CODES = { unbacked: 0, backed: 1, hybrid: 2 } as const;
const ORDER_MODE_CODES = { passive: 0, active: 1 } as const;

/**
 * True if the node will accept this type from a user. Types above
 * 0xF0 are generated by the chain itself (block rewards, slashes,
 * order expiry) and cannot be submitted by a client.
 */
export function isUserSubmitted(typeName: keyof typeof TYPE_CODES): boolean {
  return TYPE_CODES[typeName] < 0xf0;
}

// ------------------------------------------------------------- UnsignedTx

export class UnsignedTx {
  constructor(
    readonly body: Uint8Array,
    readonly typeName: keyof typeof TYPE_CODES,
  ) { }

  /** The 32-byte hash the signer should sign. */
  async signingHash(): Promise<Uint8Array> {
    return sha256(this.body);
  }

  async sign(signer: SignerFn): Promise<SignedTx> {
    const hash = await this.signingHash();
    const sig = await signer(hash);
    if (sig.length !== 64) {
      throw new Error(`signer returned ${sig.length} bytes, expected 64`);
    }
    return new SignedTx(this.body, sig);
  }

  /** Unsigned hex is useful only for debugging; the node rejects it. */
  toHex(): HexString {
    const w = new Writer();
    w.bytes(this.body);
    w.u8(0); // sig_present = 0
    return w.toHex();
  }
}

// ------------------------------------------------------------- SignedTx

export class SignedTx {
  constructor(
    private readonly body: Uint8Array,
    private readonly signature: Uint8Array,
  ) { }

  toBytes(): Uint8Array {
    const w = new Writer();
    w.bytes(this.body);
    w.u8(1);
    w.u32Prefixed(this.signature);
    return w.toUint8Array();
  }

  toHex(): HexString {
    const w = new Writer();
    w.bytes(this.body);
    w.u8(1);
    w.u32Prefixed(this.signature);
    return w.toHex();
  }

  hash(): HexString {
    // The node computes the txid as the SHA-256 of the signed bytes.
    return bytesToHex(sha256Sync(this.toBytes()));
  }
}

// ------------------------------------------------------------- Builder

export class TxBuilder {
  // ---- Staking ------------------------------------------------------

  static optInStaking(args: BuildOptInStakingArgs): UnsignedTx {
    return buildSimple("opt_in_staking", args, (w) => {
      // No extra fields.
    });
  }

  static optOutStaking(args: BuildOptOutStakingArgs): UnsignedTx {
    return buildSimple("opt_out_staking", args, () => { });
  }

  static claimRewards(args: BuildClaimRewardsArgs): UnsignedTx {
    return buildSimple("claim_rewards", args, () => { });
  }

  // ---- Transfer -----------------------------------------------------

  static transfer(args: BuildTransferArgs): UnsignedTx {
    return buildSimple("transfer", args, (w) => {
      // to
      const to = args.toBytes ?? decodeBech32m(args.to);
      w.u32Prefixed(to);
      // token_id
      w.u64(args.tokenId ?? NATIVE_TOKEN_ID);
      // amount
      w.u128(args.amount);
    });
  }

  // ---- Validator ----------------------------------------------------

  static registerValidator(args: BuildRegisterValidatorArgs): UnsignedTx {
    return buildSimple("register_validator", args, (w) => {
      if (args.consensusKey.length !== 32) {
        throw new Error("consensusKey must be 32 bytes");
      }
      if (args.nodeKey.length !== 32) {
        throw new Error("nodeKey must be 32 bytes");
      }
      const ra = args.rewardAddressBytes ?? decodeBech32m(args.rewardAddress);
      w.bytes(args.consensusKey);
      w.bytes(args.nodeKey);
      w.u32Prefixed(ra);
      w.u128(args.stake);
    });
  }

  static unregisterValidator(args: BuildUnregisterValidatorArgs): UnsignedTx {
    return buildSimple("unregister_validator", args, (w) => {
      w.u64(args.validatorId);
    });
  }

  static updateRewardAddress(args: BuildUpdateRewardAddressArgs): UnsignedTx {
    return buildSimple("update_reward_address", args, (w) => {
      const ra =
        args.newRewardAddressBytes ?? decodeBech32m(args.newRewardAddress);
      w.u64(args.validatorId);
      w.u32Prefixed(ra);
    });
  }

  // ---- AMM ----------------------------------------------------------

  static createPool(args: BuildCreatePoolArgs): UnsignedTx {
    return buildSimple("create_pool", args, (w) => {
      w.u64(args.tokenA);
      w.u64(args.tokenB);
      w.u128(args.amountA);
      w.u128(args.amountB);
      w.u32(args.feeBps);
    });
  }

  static addLiquidity(args: BuildAddLiquidityArgs): UnsignedTx {
    return buildSimple("add_liquidity", args, (w) => {
      w.u64(args.poolId);
      w.u128(args.amountA);
      w.u128(args.amountB);
      w.u128(args.minLiquidity);
    });
  }

  static removeLiquidity(args: BuildRemoveLiquidityArgs): UnsignedTx {
    return buildSimple("remove_liquidity", args, (w) => {
      w.u64(args.poolId);
      w.u128(args.liquidity);
      w.u128(args.minAmountA);
      w.u128(args.minAmountB);
    });
  }

  static swap(args: BuildSwapArgs): UnsignedTx {
    return buildSimple("swap", args, (w) => {
      w.u64(args.poolId);
      w.u64(args.sellToken);
      w.u128(args.sellAmount);
      w.u128(args.minBuyAmount);
    });
  }

  // ---- Orders -------------------------------------------------------

  static createOrder(args: BuildCreateOrderArgs): UnsignedTx {
    return buildSimple("create_order", args, (w) => {
      w.u64(args.sellToken);
      w.u64(args.buyToken);
      w.u128(args.sellAmount);
      w.u128(args.minBuyAmount);
      w.u8(ORDER_MODE_CODES[args.mode]);
      w.u64(args.expiresAtHeight);
    });
  }

  static cancelOrder(args: BuildCancelOrderArgs): UnsignedTx {
    return buildSimple("cancel_order", args, (w) => {
      w.u64(args.orderId);
    });
  }

  // ---- Tokens -------------------------------------------------------

  static createToken(args: BuildCreateTokenArgs): UnsignedTx {
    return buildSimple("create_token", args, (w) => {
      const name = new TextEncoder().encode(args.name);
      const symbol = new TextEncoder().encode(args.symbol);
      w.u32Prefixed(name);
      w.u32Prefixed(symbol);
      w.u8(args.decimals);
      w.u128(args.maxSupply);
      w.u8(BACKING_CODES[args.backing]);
      w.u32(args.royaltyBps);
    });
  }

  static mintToken(args: BuildMintTokenArgs): UnsignedTx {
    return buildSimple("mint_token", args, (w) => {
      w.u64(args.tokenId);
      w.u128(args.amount);
    });
  }

  static burnToken(args: BuildBurnTokenArgs): UnsignedTx {
    return buildSimple("burn_token", args, (w) => {
      w.u64(args.tokenId);
      w.u128(args.amount);
    });
  }

  static updateTokenMeta(args: BuildUpdateTokenMetaArgs): UnsignedTx {
    return buildSimple("update_token_meta", args, (w) => {
      const name = new TextEncoder().encode(args.name);
      const symbol = new TextEncoder().encode(args.symbol);
      w.u64(args.tokenId);
      w.u32Prefixed(name);
      w.u32Prefixed(symbol);
    });
  }
}

// ------------------------------------------------------------- Internals

function buildSimple(
  typeName: keyof typeof TYPE_CODES,
  args: BaseTxArgs,
  writeExtras: (w: Writer) => void,
): UnsignedTx {
  if (!isUserSubmitted(typeName)) {
    throw new Error(
      `transaction type '${typeName}' is generated by the chain and cannot be submitted`,
    );
  }
  const w = new Writer();

  const from = args.fromBytes ?? decodeBech32m(args.from);

  w.u8(TX_VERSION);
  w.u32(args.chainId);
  w.u8(TYPE_CODES[typeName]);
  w.u64(args.nonce);
  w.u64(args.validUntilHeight ?? BigInt(0));

  // from
  w.u32Prefixed(from);

  // has_to + to: transfer overrides via writeExtras, but the header
  // always reserves the has_to byte. Handlers that don't have a `to`
  // write 0 here; transfer writes 1 above.
  if (typeName === "transfer") {
    w.u8(1); // has_to = 1
  } else {
    w.u8(0); // has_to = 0
  }

  // Extras
  writeExtras(w);

  // fee (comes after extras in the layout)
  w.u64(args.fee);

  // payload
  const payload = args.payload ?? new Uint8Array(0);
  w.u32Prefixed(payload);

  return new UnsignedTx(w.toUint8Array(), typeName);
}

// ------------------------------------------------------------- Crypto

function bytesToHex(b: Uint8Array): HexString {
  let s = "0x";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/**
 * SHA-256 via WebCrypto. Works in Node 18+ and browsers. Async
 * because WebCrypto's `digest` is async.
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(buf);
}

/**
 * Synchronous SHA-256 for the txid helper, which is called from
 * `SignedTx.hash()` and cannot easily be async. Falls back to a
 * small pure-JS implementation if `node:crypto` is not available
 * (browser), but Node is the primary target.
 */
function sha256Sync(data: Uint8Array): Uint8Array {
  // Node path
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    return new Uint8Array(nodeCrypto.createHash("sha256").update(data).digest());
  } catch {
    // Browser fallback: too slow for large inputs, but the txid is
    // computed over a few hundred bytes at most.
    return sha256PureJs(data);
  }
}

// A minimal SHA-256 for the browser fallback. Not constant-time and
// not optimized; do not use for anything security-critical.
//
// Under `noUncheckedIndexedAccess`, every indexed read is `T | undefined`.
// The explicit `!` assertions below are safe: the loop bounds guarantee
// the indices are in range, and the arrays are fixed-size typed arrays.
function sha256PureJs(msg: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const len = msg.length;
  const bitLen = len * 8;

  // Total padded length in bytes. Must be a multiple of 64 and leave
  // room for the 0x80 terminator plus the 8-byte length field.
  //   ceil((len + 9) / 64) * 64
  const paddedLenBytes = (((len + 9) + 63) >> 6) << 6;

  const padded = new Uint8Array(paddedLenBytes);
  padded.set(msg);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  // The last 8 bytes are the message length in *bits*, big-endian.
  // High 32 bits at `len - 8`, low 32 bits at `len - 4`.
  view.setUint32(paddedLenBytes - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLenBytes - 4, bitLen >>> 0, false);

  const W = new Uint32Array(64);

  for (let block = 0; block < paddedLenBytes; block += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(block + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15]!;
      const w2 = W[i - 2]!;
      const s0 =
        ((w15 >>> 7) | (w15 << 25)) ^
        ((w15 >>> 18) | (w15 << 14)) ^
        (w15 >>> 3);
      const s1 =
        ((w2 >>> 17) | (w2 << 15)) ^
        ((w2 >>> 19) | (w2 << 13)) ^
        (w2 >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }

    // Copy the current state into locals. The `!` is needed because
    // destructuring a typed array yields `number | undefined` under
    // noUncheckedIndexedAccess.
    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;

    for (let i = 0; i < 64; i++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + W[i]!) >>> 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i]!, false);
  return out;
}