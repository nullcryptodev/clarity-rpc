/**
 * Transaction builder.
 *
 * Produces the wire bytes the node expects from a structured
 * description, and signs them with a pluggable signer so the library
 * doesn't have to know which crypto backend you use.
 *
 * Wire layout (matches Core::Transaction::serializeForSigning):
 *
 *   u16   version
 *   u64   chain_id
 *   u8    type_code
 *   u64   nonce
 *   u64   valid_until_height
 *   bytes from                  (32, fixed — no length prefix)
 *   bytes to                    (32, fixed — no length prefix)
 *   u32   token_id
 *   u64   amount
 *   u64   fee
 *   u32   payload_len
 *   bytes payload
 *
 * Then serialize() appends:
 *
 *   bytes signature             (64, fixed — no length prefix)
 *
 * Signing hash: Blake2b-256("CLRTY_TX_V1" || body), where `body`
 * is everything above the signature.
 *
 * The `amount`, `fee`, `token_id`, and the payload are what
 * distinguish the transaction types. Type-specific payload layouts
 * are written by the per-type helpers below; they match the C++
 * `TransactionExecutor::execute*` readers exactly.
 */

import { blake2b256 } from "./crypto.js";
import type { Bech32mAddress, HexString } from "./types.js";

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
}

//  Every per-type arg type now mirrors the corresponding
//  `Build*Params` struct in the C++ `TransactionBuilder.h`. Fields
//  that go in the fixed part of the transaction are named after
//  the C++ field (`tokenId`, `amount`, `to`); fields that go in the
//  payload are named after the C++ payload field.

export interface BuildTransferArgs extends BaseTxArgs {
  to: Bech32mAddress;
  toBytes?: Uint8Array;
  tokenId?: bigint;
  amount: bigint;
}

export interface BuildOptInStakingArgs extends BaseTxArgs { }
export interface BuildOptOutStakingArgs extends BaseTxArgs { }
export interface BuildClaimRewardsArgs extends BaseTxArgs { }

export interface BuildRegisterValidatorArgs extends BaseTxArgs {
  /** 32 bytes. */
  nodeKey: Uint8Array;
  stake: bigint;
}

export interface BuildUnregisterValidatorArgs extends BaseTxArgs { }

export interface BuildUpdateRewardAddressArgs extends BaseTxArgs {
  newRewardAddress: Bech32mAddress;
  newRewardAddressBytes?: Uint8Array;
}

export interface BuildRotateConsensusKeyArgs extends BaseTxArgs {
  /** 32 bytes. */
  newConsensusKey: Uint8Array;
}

export interface BuildCreatePoolArgs extends BaseTxArgs {
  tokenA: bigint;
  amountA: bigint;
  tokenB: bigint;
  amountB: bigint;
  feeBps: number;
}

export interface BuildAddLiquidityArgs extends BaseTxArgs {
  poolId: bigint;
  tokenIn: bigint;
  amountIn: bigint;
  amountOther: bigint;
}

export interface BuildRemoveLiquidityArgs extends BaseTxArgs {
  positionId: bigint;
  /** 0 = remove the whole position. */
  amount: bigint;
}

export interface BuildSwapArgs extends BaseTxArgs {
  poolId: bigint;
  tokenIn: bigint;
  amountIn: bigint;
  minAmountOut: bigint;
  to: Bech32mAddress;
  toBytes?: Uint8Array;
}

export interface BuildCreateOrderArgs extends BaseTxArgs {
  sellToken: bigint;
  sellAmount: bigint;
  buyToken: bigint;
  minBuyAmount: bigint;
  mode: "passive" | "active";
  poolId: bigint;
  expiresAtHeight: bigint;
  /** Up to 8 conditions, each 13 bytes on the wire. */
  conditions?: OrderConditionArg[];
}

export interface OrderConditionArg {
  type:
  | "expires_at_height"
  | "price_above"
  | "price_below"
  | "volume_below"
  | "balance_below";
  param1: bigint;
  param2: number;
}

export interface BuildCancelOrderArgs extends BaseTxArgs {
  orderId: bigint;
}

export interface BuildCreateTokenArgs extends BaseTxArgs {
  name: string;
  symbol: string;
  decimals: number;
  backing: 0 | 1;
  maxSupply: bigint;
  royaltyBps: number;
  /** Optional 32-byte content hash, for bridged tokens. */
  fingerprint?: Uint8Array;
}

export interface BuildMintTokenArgs extends BaseTxArgs {
  tokenId: bigint;
  to: Bech32mAddress;
  toBytes?: Uint8Array;
  amount: bigint;
}

export interface BuildBurnTokenArgs extends BaseTxArgs {
  tokenId: bigint;
  amount: bigint;
}

export interface BuildUpdateTokenMetaArgs extends BaseTxArgs {
  tokenId: bigint;
  /** Empty string = no change. */
  newName?: string;
  /** Empty string = no change. */
  newSymbol?: string;
  /** 0 = no change. */
  newRoyaltyBps?: number;
}

export interface BuildBridgeBurnArgs extends BaseTxArgs {
  /** The source chain this burn targets. For CCX, 0x43435831n. */
  sourceChainId: bigint;
  /** The 64-byte (spend ‖ view) pubkey pair. */
  destinationBlob: Uint8Array;
  /** The base58 form of the same pair. */
  destinationAddress: string;
  amount: bigint;
}

export interface BuildRegisterBridgeWatcherArgs extends BaseTxArgs {
  sourceChainId: bigint;
  stake: bigint;
}

export interface BuildUnregisterBridgeWatcherArgs extends BaseTxArgs {
  sourceChainId: bigint;
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

  u16(v: number): this {
    this.buf.push(v & 0xff, (v >> 8) & 0xff);
    return this;
  }

  u32(v: number | bigint): this {
    const n = BigInt(v);
    for (let i = 0; i < 4; i++) {
      this.buf.push(Number((n >> BigInt(i * 8)) & 0xffn));
    }
    return this;
  }

  u64(v: bigint): this {
    for (let i = 0; i < 8; i++) {
      this.buf.push(Number((v >> BigInt(i * 8)) & 0xffn));
    }
    return this;
  }

  bytes(b: Uint8Array): this {
    this.buf.push(...b);
    return this;
  }

  /** 32-byte fixed field, no length prefix. Pads or truncates. */
  fixed32(b: Uint8Array): this {
    if (b.length > 32) throw new Error("fixed32: input too long");
    this.buf.push(...b);
    for (let i = b.length; i < 32; i++) this.buf.push(0);
    return this;
  }

  u8PrefixedString(s: string, maxLen: number): this {
    const bytes = new TextEncoder().encode(s);
    if (bytes.length > maxLen) {
      throw new Error(`string exceeds max length ${maxLen}`);
    }
    if (maxLen <= 255) {
      this.u8(bytes.length).bytes(bytes);
    } else {
      this.u16(bytes.length).bytes(bytes);
    }
    return this;
  }

  u8Prefixed(b: Uint8Array): this {
    if (b.length > 255) throw new Error("u8Prefixed: input too long");
    this.u8(b.length).bytes(b);
    return this;
  }

  u16Prefixed(b: Uint8Array): this {
    if (b.length > 65535) throw new Error("u16Prefixed: input too long");
    this.u16(b.length).bytes(b);
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
 * The witness version byte that precedes the public key in every
 * CLRTY address payload. Matches ADDRESS_WITNESS_VERSION in the
 * C++ WalletTypes.h.
 */
const ADDRESS_WITNESS_VERSION = 0x00;
const ADDRESS_PUBKEY_LENGTH = 32;

/**
 * Decode a bech32m address to its 32-byte public key body.
 *
 * A CLRTY address encodes 33 bytes: a 1-byte witness version
 * followed by the 32-byte public key. The transaction format uses
 * only the pubkey, so this function strips the witness version
 * after validating it.
 *
 * The builder doesn't validate the checksum — that's a heavier
 * dependency — but it does enforce the HRP, the payload length,
 * and the witness version. Callers who already have the raw bytes
 * should pass `fromBytes`/`toBytes` and skip this path.
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
  // Drop the 6-word checksum.
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

  const expectedLength = 1 + ADDRESS_PUBKEY_LENGTH;
  if (bytes.length !== expectedLength) {
    throw new Error(
      `bech32m address decodes to ${bytes.length} bytes, expected ${expectedLength}`,
    );
  }
  if (bytes[0] !== ADDRESS_WITNESS_VERSION) {
    throw new Error(
      `bech32m address has witness version 0x${bytes[0]!.toString(16).padStart(2, "0")}, ` +
      `expected 0x${ADDRESS_WITNESS_VERSION.toString(16).padStart(2, "0")}`,
    );
  }

  return new Uint8Array(bytes.slice(1));
}

// ------------------------------------------------------------- Constants

const TYPE_CODES = {
  transfer: 0x00,

  opt_in_staking: 0x10,
  opt_out_staking: 0x11,
  claim_rewards: 0x12,

  register_validator: 0x20,
  unregister_validator: 0x21,
  update_reward_address: 0x22,
  rotate_consensus_key: 0x23,

  create_pool: 0x30,
  add_liquidity: 0x31,
  remove_liquidity: 0x32,
  swap: 0x33,

  create_order: 0x40,
  cancel_order: 0x41,

  create_nft_collection: 0x42,
  mint_nft: 0x43,
  wrap_nft: 0x44,
  transfer_nft: 0x45,
  burn_nft: 0x46,
  update_nft_metadata: 0x47,
  top_up_nft: 0x48,
  claim_nft_reward: 0x49,
  refill_collection_reward: 0x4a,

  create_token: 0x50,
  mint_token: 0x51,
  burn_token: 0x52,
  update_token_meta: 0x53,

  bridge_mint: 0x70,
  bridge_burn: 0x71,
  bridge_attest: 0x72,
  bridge_register_chain: 0x73,
  bridge_ack_withdrawal: 0x74,
  bridge_pause: 0x75,
  bridge_unpause: 0x76,
  register_bridge_watcher: 0x77,
  unregister_bridge_watcher: 0x78,
  bridge_ack_attest: 0x7a,

  block_reward: 0xf0,
  order_expired: 0xf1,
  slash: 0xf2,
} as const;

const TX_VERSION = 1;
const NATIVE_TOKEN_ID = 0n;

const ORDER_MODE_CODES: Record<"passive" | "active", number> = {
  passive: 0,
  active: 1,
};

const BACKING_CODES: Record<"unbacked" | "backed", number> = {
  unbacked: 0,
  backed: 1,
};

const CONDITION_TYPE_CODES: Record<string, number> = {
  expires_at_height: 0x01,
  price_above: 0x02,
  price_below: 0x03,
  volume_below: 0x04,
  balance_below: 0x05,
};

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
  signingHash(): Uint8Array {
    //  Domain-separated Blake2b-256, matching Core::Transaction::signingHash().
    const DOMAIN = "CLRTY_TX_V1";
    const domainBytes = new TextEncoder().encode(DOMAIN);
    const input = new Uint8Array(domainBytes.length + this.body.length);
    input.set(domainBytes, 0);
    input.set(this.body, domainBytes.length);
    return blake2b256(input);
  }

  async sign(signer: SignerFn): Promise<SignedTx> {
    const hash = this.signingHash();
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
    w.bytes(this.signature);
    return w.toUint8Array();
  }

  toHex(): HexString {
    const w = new Writer();
    w.bytes(this.body);
    w.bytes(this.signature);
    return w.toHex();
  }

  hash(): HexString {
    // The txid is the signing hash: Blake2b-256 of the domain tag and
    // the body, not the full signed bytes. Matches Core::Transaction::txid().
    const DOMAIN = "CLRTY_TX_V1";
    const domainBytes = new TextEncoder().encode(DOMAIN);
    const input = new Uint8Array(domainBytes.length + this.body.length);
    input.set(domainBytes, 0);
    input.set(this.body, domainBytes.length);
    return bytesToHex(blake2b256(input));
  }
}

// ------------------------------------------------------------- Builder

export class TxBuilder {
  // ---- Staking ------------------------------------------------------

  static optInStaking(args: BuildOptInStakingArgs): UnsignedTx {
    return buildTx("opt_in_staking", args, 0n, 0n);
  }

  static optOutStaking(args: BuildOptOutStakingArgs): UnsignedTx {
    return buildTx("opt_out_staking", args, 0n, 0n);
  }

  static claimRewards(args: BuildClaimRewardsArgs): UnsignedTx {
    return buildTx("claim_rewards", args, 0n, 0n);
  }

  // ---- Transfer -----------------------------------------------------

  static transfer(args: BuildTransferArgs): UnsignedTx {
    const to = args.toBytes ?? decodeBech32m(args.to);
    return buildTx("transfer", args, args.tokenId ?? NATIVE_TOKEN_ID, args.amount, to);
  }

  // ---- Validator ----------------------------------------------------

  static registerValidator(args: BuildRegisterValidatorArgs): UnsignedTx {
    if (args.nodeKey.length !== 32) {
      throw new Error("nodeKey must be 32 bytes");
    }
    return buildTx(
      "register_validator",
      args,
      NATIVE_TOKEN_ID,
      args.stake,
      undefined,
      (w) => w.bytes(args.nodeKey),
    );
  }

  static unregisterValidator(_args: BuildUnregisterValidatorArgs): UnsignedTx {
    return buildTx("unregister_validator", _args, 0n, 0n);
  }

  static updateRewardAddress(args: BuildUpdateRewardAddressArgs): UnsignedTx {
    const ra = args.newRewardAddressBytes ?? decodeBech32m(args.newRewardAddress);
    if (ra.length !== 32) {
      throw new Error("newRewardAddress must decode to 32 bytes");
    }
    return buildTx(
      "update_reward_address",
      args,
      NATIVE_TOKEN_ID,
      0n,
      undefined,
      (w) => w.bytes(ra),
    );
  }

  static rotateConsensusKey(args: BuildRotateConsensusKeyArgs): UnsignedTx {
    if (args.newConsensusKey.length !== 32) {
      throw new Error("newConsensusKey must be 32 bytes");
    }
    return buildTx(
      "rotate_consensus_key",
      args,
      NATIVE_TOKEN_ID,
      0n,
      undefined,
      (w) => w.bytes(args.newConsensusKey),
    );
  }

  // ---- AMM ----------------------------------------------------------
  //
  //  Payload layouts match the executor:
  //    create_pool:     u32 token_b + u64 amount_b + u16 fee_bps
  //    add_liquidity:   u64 pool_id + u64 amount_b
  //    remove_liquidity: u64 position_id + u64 amount
  //    swap:            u64 pool_id + u64 min_amount_out

  static createPool(args: BuildCreatePoolArgs): UnsignedTx {
    return buildTx(
      "create_pool",
      args,
      args.tokenA,
      args.amountA,
      undefined,
      (w) => {
        w.u32(args.tokenB);
        w.u64(args.amountB);
        w.u16(args.feeBps);
      },
    );
  }

  static addLiquidity(args: BuildAddLiquidityArgs): UnsignedTx {
    return buildTx(
      "add_liquidity",
      args,
      args.tokenIn,
      args.amountIn,
      undefined,
      (w) => {
        w.u64(args.poolId);
        w.u64(args.amountOther);
      },
    );
  }

  static removeLiquidity(args: BuildRemoveLiquidityArgs): UnsignedTx {
    return buildTx(
      "remove_liquidity",
      args,
      NATIVE_TOKEN_ID,
      0n,
      undefined,
      (w) => {
        w.u64(args.positionId);
        w.u64(args.amount);
      },
    );
  }

  static swap(args: BuildSwapArgs): UnsignedTx {
    const to = args.toBytes ?? decodeBech32m(args.to);
    return buildTx(
      "swap",
      args,
      args.tokenIn,
      args.amountIn,
      to,
      (w) => {
        w.u64(args.poolId);
        w.u64(args.minAmountOut);
      },
    );
  }

  // ---- Orders -------------------------------------------------------

  static createOrder(args: BuildCreateOrderArgs): UnsignedTx {
    const conditions = args.conditions ?? [];
    if (conditions.length > 8) {
      throw new Error("at most 8 conditions are allowed");
    }
    return buildTx(
      "create_order",
      args,
      args.sellToken,
      args.sellAmount,
      undefined,
      (w) => {
        w.u32(args.buyToken);
        w.u64(args.minBuyAmount);
        w.u8(ORDER_MODE_CODES[args.mode]);
        w.u32(args.poolId);
        w.u64(args.expiresAtHeight);
        w.u8(conditions.length);
        for (const c of conditions) {
          const code = CONDITION_TYPE_CODES[c.type];
          if (code === undefined) {
            throw new Error(`unknown condition type: ${c.type}`);
          }
          w.u8(code);
          w.u64(c.param1);
          w.u32(c.param2);
        }
      },
    );
  }

  static cancelOrder(args: BuildCancelOrderArgs): UnsignedTx {
    return buildTx(
      "cancel_order",
      args,
      NATIVE_TOKEN_ID,
      0n,
      undefined,
      (w) => w.u64(args.orderId),
    );
  }

  // ---- Tokens -------------------------------------------------------
  //
  //  Payload layouts match executeCreateToken, executeMintToken,
  //  executeBurnToken, executeUpdateTokenMeta:
  //    create_token:     u8 decimals + u8 backing
  //                      + u8 name_len + name
  //                      + u8 symbol_len + symbol
  //                      + u64 max_supply
  //                      + u16 royalty_bps
  //                      + u8 has_fingerprint [+ 32-byte fingerprint]
  //    mint_token:       (empty; token_id and amount in fixed fields)
  //    burn_token:       (empty)
  //    update_token_meta: u8 name_len + name
  //                       + u8 symbol_len + symbol
  //                       + u16 royalty_bps

  static createToken(args: BuildCreateTokenArgs): UnsignedTx {
    return buildTx("create_token", args, NATIVE_TOKEN_ID, 0n, undefined, (w) => {
      w.u8(args.decimals);
      w.u8(BACKING_CODES[args.backing === 1 ? "backed" : "unbacked"]);

      const nameBytes = new TextEncoder().encode(args.name);
      if (nameBytes.length > 255) {
        throw new Error("name exceeds 255 bytes");
      }
      w.u8(nameBytes.length).bytes(nameBytes);

      const symbolBytes = new TextEncoder().encode(args.symbol);
      if (symbolBytes.length > 255) {
        throw new Error("symbol exceeds 255 bytes");
      }
      w.u8(symbolBytes.length).bytes(symbolBytes);

      w.u64(args.maxSupply);
      w.u16(args.royaltyBps);

      if (args.fingerprint) {
        if (args.fingerprint.length !== 32) {
          throw new Error("fingerprint must be 32 bytes");
        }
        w.u8(1).bytes(args.fingerprint);
      } else {
        w.u8(0);
      }
    });
  }

  static mintToken(args: BuildMintTokenArgs): UnsignedTx {
    const to = args.toBytes ?? decodeBech32m(args.to);
    return buildTx("mint_token", args, args.tokenId, args.amount, to);
  }

  static burnToken(args: BuildBurnTokenArgs): UnsignedTx {
    return buildTx("burn_token", args, args.tokenId, args.amount);
  }

  static updateTokenMeta(args: BuildUpdateTokenMetaArgs): UnsignedTx {
    return buildTx(
      "update_token_meta",
      args,
      args.tokenId,
      0n,
      undefined,
      (w) => {
        const nameBytes = new TextEncoder().encode(args.newName ?? "");
        if (nameBytes.length > 255) {
          throw new Error("newName exceeds 255 bytes");
        }
        w.u8(nameBytes.length).bytes(nameBytes);

        const symbolBytes = new TextEncoder().encode(args.newSymbol ?? "");
        if (symbolBytes.length > 255) {
          throw new Error("newSymbol exceeds 255 bytes");
        }
        w.u8(symbolBytes.length).bytes(symbolBytes);

        w.u16(args.newRoyaltyBps ?? 0);
      },
    );
  }

  static bridgeBurn(args: BuildBridgeBurnArgs): UnsignedTx {
    if (args.destinationBlob.length !== 64) {
      throw new Error(
        `destinationBlob must be 64 bytes, got ${args.destinationBlob.length}`,
      );
    }
    if (args.destinationAddress.length === 0) {
      throw new Error("destinationAddress must not be empty");
    }
    const addrBytes = new TextEncoder().encode(args.destinationAddress);
    if (addrBytes.length > 255) {
      throw new Error("destinationAddress exceeds 255 bytes");
    }
    return buildTx(
      "bridge_burn",
      args,
      NATIVE_TOKEN_ID,
      args.amount,
      undefined,
      (w) => {
        w.u64(args.sourceChainId);
        w.u8Prefixed(args.destinationBlob);
        w.u8(addrBytes.length).bytes(addrBytes);
        w.u64(args.amount);
      },
    );
  }

  static registerBridgeWatcher(
    args: BuildRegisterBridgeWatcherArgs,
  ): UnsignedTx {
    return buildTx(
      "register_bridge_watcher",
      args,
      NATIVE_TOKEN_ID,
      0n,
      undefined,
      (w) => {
        w.u64(args.sourceChainId);
        w.u64(args.stake);
      },
    );
  }

  static unregisterBridgeWatcher(
    args: BuildUnregisterBridgeWatcherArgs,
  ): UnsignedTx {
    return buildTx(
      "unregister_bridge_watcher",
      args,
      NATIVE_TOKEN_ID,
      0n,
      undefined,
      (w) => w.u64(args.sourceChainId),
    );
  }
}

// ------------------------------------------------------------- Internals

function buildTx(
  typeName: keyof typeof TYPE_CODES,
  args: BaseTxArgs,
  tokenId: bigint,
  amount: bigint,
  to?: Uint8Array,
  writeExtras?: (w: Writer) => void,
): UnsignedTx {
  if (!isUserSubmitted(typeName)) {
    throw new Error(
      `transaction type '${typeName}' is generated by the chain and cannot be submitted`,
    );
  }
  const w = new Writer();
  const from = args.fromBytes ?? decodeBech32m(args.from);
  if (from.length !== 32) {
    throw new Error("from must decode to 32 bytes");
  }

  w.u16(TX_VERSION);
  w.u64(args.chainId);
  w.u8(TYPE_CODES[typeName]);
  w.u64(args.nonce);
  w.u64(args.validUntilHeight ?? 0n);
  w.fixed32(from);
  w.fixed32(to ?? new Uint8Array(32));
  w.u32(tokenId);
  w.u64(amount);
  w.u64(args.fee);

  // Payload
  const payloadWriter = new Writer();
  if (writeExtras) writeExtras(payloadWriter);
  const payload = payloadWriter.toUint8Array();
  w.u32(payload.length);
  w.bytes(payload);

  return new UnsignedTx(w.toUint8Array(), typeName);
}


// ------------------------------------------------------------- Helpers

function bytesToHex(b: Uint8Array): HexString {
  let s = "0x";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}