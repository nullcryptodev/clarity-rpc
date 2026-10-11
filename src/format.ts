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