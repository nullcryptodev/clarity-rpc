/**
 * Formatting helpers. All numeric inputs are hex strings; all
 * arithmetic uses BigInt until the final string conversion.
 */

import type { HexString } from "./types.js";
import {
  CHAIN_ID_MAINNET,
  CHAIN_ID_TESTNET,
  CHAIN_ID_REGTEST,
} from "./rewards.js";

const CLRTY_DECIMALS = BigInt(5);
const CLRTY_SCALE = BigInt(100_000);

export function hexToBigInt(hex: HexString): bigint {
  return BigInt(hex.startsWith("0x") ? hex : "0x" + hex);
}

export function bigIntToHex(n: bigint): HexString {
  return "0x" + n.toString(16);
}

export function formatClrty(raw: HexString, maxFrac = 5): string {
  const v = hexToBigInt(raw);
  const whole = v / CLRTY_SCALE;
  const frac = v % CLRTY_SCALE;
  if (frac === BigInt(0)) return whole.toLocaleString();

  const fracStr = frac.toString().padStart(Number(CLRTY_DECIMALS), "0");
  const trimmed = fracStr.slice(0, maxFrac).replace(/0+$/, "");
  return trimmed.length === 0
    ? whole.toLocaleString()
    : `${whole.toLocaleString()}.${trimmed}`;
}

export function formatClrtyWithSymbol(raw: HexString, maxFrac = 5): string {
  return `${formatClrty(raw, maxFrac)} CLRTY`;
}

export function formatCount(raw: HexString): string {
  return hexToBigInt(raw).toLocaleString();
}

export function shortHash(hash: string, head = 10, tail = 8): string {
  if (hash.length <= head + tail + 2) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function shortAddress(addr: string, head = 10, tail = 6): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function blockTime(timestampMs: HexString): Date {
  return new Date(Number(hexToBigInt(timestampMs)));
}

export function timeAgo(timestampMs: HexString): string {
  const ms = Number(hexToBigInt(timestampMs));
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function networkNameFromChainId(chainId: number | HexString): string {
  const id =
    typeof chainId === "number" ? chainId : Number(hexToBigInt(chainId));
  switch (id) {
    case CHAIN_ID_MAINNET:
      return "Mainnet";
    case CHAIN_ID_TESTNET:
      return "Testnet";
    case CHAIN_ID_REGTEST:
      return "Regtest";
    default:
      return `Chain 0x${id.toString(16)}`;
  }
}

/**
 * NFTs have zero decimals by construction (each is a shadow token with
 * maxSupply 1). The shadow token's balance is therefore either 0 or 1;
 * it is displayed as a whole count, not a fractional amount.
 */
export function formatNftAmount(raw: HexString): string {
  return hexToBigInt(raw).toString();
}

/**
 * A collection's reward rate is in atomic units of the reward token per
 * epoch. Format it in the reward token's decimals, not CLRTY's, when
 * you know what token that is.
 */
export function formatRewardRate(
  raw: HexString,
  rewardTokenDecimals: number,
): string {
  const v = hexToBigInt(raw);
  const scale = BigInt(10) ** BigInt(rewardTokenDecimals);
  const whole = v / scale;
  const frac = v % scale;
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = frac
    .toString()
    .padStart(rewardTokenDecimals, "0")
    .replace(/0+$/, "");
  return fracStr.length === 0
    ? whole.toLocaleString()
    : `${whole.toLocaleString()}.${fracStr}`;
}

/**
 * The order book's `price` is scaled by BOOK_PRICE_SCALE. Callers who
 * want a human ratio should pass the scale in; there's no default
 * because the scale is a chain constant the client shouldn't hardcode.
 */
export function formatPrice(
  raw: HexString,
  priceScale: HexString,
  maxFrac = 8,
): string {
  const p = hexToBigInt(raw);
  const s = hexToBigInt(priceScale);
  if (s === BigInt(0)) return "0";
  // Compute p / s with maxFrac digits of precision.
  const scaleOut = BigInt(10) ** BigInt(maxFrac);
  const scaled = (p * scaleOut) / s;
  const whole = scaled / scaleOut;
  const frac = scaled % scaleOut;
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = frac
    .toString()
    .padStart(maxFrac, "0")
    .replace(/0+$/, "");
  return fracStr.length === 0
    ? whole.toLocaleString()
    : `${whole.toLocaleString()}.${fracStr}`;
}