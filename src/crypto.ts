import { blake2b } from "blakejs";

/**
 * Blake2b-256 over the input. Matches Crypto::blake2b(..., 32) on
 * the C++ side.
 */
export function blake2b256(input: Uint8Array): Uint8Array {
  return blake2b(input, undefined, 32);
}