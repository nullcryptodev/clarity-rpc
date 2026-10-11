/**
 * Build, sign, and broadcast a transfer.
 *
 * The signer here is a stub — replace `signWithYourKey` with whatever
 * crypto backend you actually use. The library only requires that the
 * signer returns 64 bytes for a 32-byte hash.
 */

import {
  RpcClient,
  TxBuilder,
  waitForConfirmations,
  formatClrtyWithSymbol,
} from "@claritychain/rpc";

const client = new RpcClient({
  url: process.env.CLARITY_RPC_URL ?? "http://127.0.0.1:9633",
});

const FROM = process.env.CLARITY_FROM!;
const TO = process.env.CLARITY_TO!;
const AMOUNT = BigInt(process.env.CLARITY_AMOUNT ?? "100000"); // atomic units
const FEE = BigInt(process.env.CLARITY_FEE ?? "1000");

if (!FROM || !TO) {
  console.error("set CLARITY_FROM and CLARITY_TO");
  process.exit(1);
}

// 1. Fetch the current nonce and chain id.
const [acct, chain] = await Promise.all([
  client.getAccount(FROM),
  client.chainId(),
]);

// 2. Build the transaction.
const unsigned = TxBuilder.transfer({
  from: FROM,
  to: TO,
  amount: AMOUNT,
  fee: FEE,
  nonce: BigInt(acct.nonce),
  chainId: BigInt(chain.chain_id),
});

// 3. Sign it. Replace this with your real signer.
const signed = await unsigned.sign(async (hash) => signWithYourKey(hash));

console.log(`broadcasting ${formatClrtyWithSymbol("0x" + AMOUNT.toString(16))}`);
console.log(`txid: ${signed.hash()}`);

// 4. Broadcast.
const res = await client.sendRawTransaction(signed.toHex());
console.log("accepted:", res.tx_hash);

// 5. Wait for confirmations.
const { height } = await waitForConfirmations(client, res.tx_hash, 3);
console.log(`confirmed at height ${height}`);

// ------------------------------------------------------------- stub signer

async function signWithYourKey(_hash: Uint8Array): Promise<Uint8Array> {
  // Replace with ed25519 / secp256k1 / whatever Clarity uses.
  // The library only cares that the return value is 64 bytes.
  throw new Error("implement signWithYourKey");
}