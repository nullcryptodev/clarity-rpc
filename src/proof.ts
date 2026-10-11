/**
 * State Merkle proof verification.
 *
 * The node hands back a serialized proof plus the state root it was
 * computed against. This module checks the proof against the root,
 * so a client doesn't have to trust the node blindly.
 *
 * The proof format matches the node's `State::Proof::serialize`:
 *
 *   u8    version
 *   u8    key_type
 *   u32   key_len
 *   bytes key
 *   u8    value_present
 *   u32   value_len   (only if value_present=1)
 *   bytes value       (only if value_present=1)
 *   u32   sibling_count
 *   { u8 side; bytes[32] hash } * sibling_count
 *
 * The tree is a standard binary Merkle tree over lexicographically
 * ordered leaves. A leaf's preimage is `SHA-256(0x00 || key || value)`;
 * an internal node's preimage is `SHA-256(0x01 || left || right)`.
 * Empty subtrees use the all-zero hash. This matches the node's
 * `State::SparseMerkleTree`.
 */

import type { HashHex, HexString, ProofResponse } from "./types.js";

export interface DecodedProof {
  version: number;
  keyType: number;
  key: Uint8Array;
  value: Uint8Array | null;
  siblings: Array<{ side: 0 | 1; hash: Uint8Array }>;
}

export interface VerifyProofOptions {
  /** The root the proof should verify against. */
  expectedRoot: HashHex;
  /**
   * Optional value to check the proof against. When supplied, the
   * proof must demonstrate inclusion of exactly this value. When
   * omitted, the proof is checked for internal consistency only.
   */
  expectedValue?: Uint8Array;
}

// ------------------------------------------------------------- Public

export function decodeProof(proofHex: HexString): DecodedProof {
  const bytes = hexToBytes(proofHex);
  let o = 0;

  const version = bytes[o++]!;
  const keyType = bytes[o++]!;

  const keyLen = readU32(bytes, o);
  o += 4;
  const key = bytes.slice(o, o + keyLen);
  o += keyLen;

  const valuePresent = bytes[o++]!;
  let value: Uint8Array | null = null;
  if (valuePresent) {
    const valueLen = readU32(bytes, o);
    o += 4;
    value = bytes.slice(o, o + valueLen);
    o += valueLen;
  }

  const siblingCount = readU32(bytes, o);
  o += 4;

  const siblings: DecodedProof["siblings"] = [];
  for (let i = 0; i < siblingCount; i++) {
    const side = bytes[o++]! as 0 | 1;
    const hash = bytes.slice(o, o + 32);
    o += 32;
    siblings.push({ side, hash });
  }

  return { version, keyType, key, value, siblings };
}

/**
 * Verify a proof response against a state root. Returns true when the
 * proof is internally consistent and, if `expectedValue` is given,
 * demonstrates inclusion of that value.
 *
 * Synchronous. Uses a pure-JS SHA-256 so it works in browsers and
 * workers without WebCrypto.
 */
export function verifyProof(
  proof: ProofResponse | HexString,
  opts: VerifyProofOptions,
): boolean {
  const proofHex = typeof proof === "string" ? proof : proof.proof;
  if (!proofHex) return false;

  let decoded: DecodedProof;
  try {
    decoded = decodeProof(proofHex);
  } catch {
    return false;
  }

  const expectedRoot = hexToBytes(opts.expectedRoot);

  // Leaf hash.
  const leafPreimage = concat(
    new Uint8Array([0x00]),
    decoded.key,
    decoded.value ?? new Uint8Array(0),
  );
  let current = sha256Sync(leafPreimage);

  // Walk siblings up to the root.
  for (const { side, hash } of decoded.siblings) {
    const preimage = new Uint8Array(65);
    preimage[0] = 0x01;
    if (side === 0) {
      preimage.set(current, 1);
      preimage.set(hash, 33);
    } else {
      preimage.set(hash, 1);
      preimage.set(current, 33);
    }
    current = sha256Sync(preimage);
  }

  // Compare.
  if (!bytesEqual(current, expectedRoot)) return false;

  if (opts.expectedValue) {
    if (!decoded.value) return false;
    if (!bytesEqual(decoded.value, opts.expectedValue)) return false;
  }

  return true;
}

// ------------------------------------------------------------- Internals

function hexToBytes(hex: HexString): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (s.length % 2 !== 0) throw new Error("odd-length hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.substr(i * 2, 2), 16);
  }
  return out;
}

function readU32(b: Uint8Array, o: number): number {
  return (
    (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0
  );
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// Reuse the same pure-JS SHA-256 as the builder. Kept here so
// `proof.ts` can be imported without pulling in the entire builder.
function sha256Sync(msg: Uint8Array): Uint8Array {
  try {
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    return new Uint8Array(nodeCrypto.createHash("sha256").update(msg).digest());
  } catch {
    return sha256PureJs(msg);
  }
}

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
  const paddedLen = ((len + 8) >> 6) + 1;
  const padded = new Uint8Array(paddedLen * 64);
  padded.set(msg);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen * 64 - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen * 64 - 8, Math.floor(bitLen / 0x100000000), false);
  const W = new Uint32Array(64);
  for (let block = 0; block < paddedLen; block++) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(block * 64 + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((W[i - 15]! >>> 7) | (W[i - 15]! << 25)) ^ ((W[i - 15]! >>> 18) | (W[i - 15]! << 14)) ^ (W[i - 15]! >>> 3);
      const s1 = ((W[i - 2]! >>> 17) | (W[i - 2]! << 15)) ^ ((W[i - 2]! >>> 19) | (W[i - 2]! << 13)) ^ (W[i - 2]! >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e! >>> 6) | (e! << 26)) ^ ((e! >>> 11) | (e! << 21)) ^ ((e! >>> 25) | (e! << 7));
      const ch = (e! & f!) ^ (~e! & g!);
      const t1 = (h! + S1 + ch + K[i]! + W[i]!) >>> 0;
      const S0 = ((a! >>> 2) | (a! << 30)) ^ ((a! >>> 13) | (a! << 19)) ^ ((a! >>> 22) | (a! << 10));
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d! + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a!) >>> 0; H[1] = (H[1]! + b!) >>> 0; H[2] = (H[2]! + c!) >>> 0; H[3] = (H[3]! + d!) >>> 0;
    H[4] = (H[4]! + e!) >>> 0; H[5] = (H[5]! + f!) >>> 0; H[6] = (H[6]! + g!) >>> 0; H[7] = (H[7]! + h!) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i]!, false);
  return out;
}