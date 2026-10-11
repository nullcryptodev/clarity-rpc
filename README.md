# @claritychain/rpc

TypeScript client, transaction builder, and tooling for the Clarity
(CLRTY) JSON-RPC node.

- **Typed client** for every method on the RPC surface
- **Transaction builder** with pluggable signing
- **Merkle proof verification** against a state root
- **HTTP and WebSocket transports** behind one interface
- **Polling watchers** for blocks and transactions
- **Capability probing** via `getMethods()`
- **BigInt-safe** — everything over 2^53 stays hex until you format it

## Install

```sh
npm install @claritychain/rpc
# optional, for WebSocket transport:
npm install ws
```

Node 18+ required (uses the global `fetch` and `AbortController`).

## Quick start

```ts
import { RpcClient, DEFAULT_RPC_URL } from "@claritychain/rpc";

const client = new RpcClient({ url: DEFAULT_RPC_URL });

const status = await client.status();
console.log("height:", status.height);
console.log("peers:", status.peer_count);
console.log("validators:", (await client.getActiveSet()).size);
```

## Watching new blocks

```ts
import { RpcClient, BlockWatcher } from "@claritychain/rpc";

const client = new RpcClient();
const watcher = new BlockWatcher(client, { intervalMs: 1000 });

watcher.on("block", (header) => {
  console.log(`#${BigInt(header.height)} ${header.hash.slice(0, 18)}…`);
});
watcher.on("error", console.error);
watcher.start();

// later
watcher.stop();
```

## Building and signing a transfer

```ts
import { RpcClient, TxBuilder } from "@claritychain/rpc";

const client = new RpcClient();

const unsigned = await TxBuilder.transfer({
  from: "clrty1…",
  to: "clrty1…",
  amount: 1_000_000n,       // 10 CLRTY in atomic units
  fee: 1_000n,
  nonce: 0n,
  chainId: await client.chainId().then((r) => BigInt(r.chain_id)),
});

const signed = await unsigned.sign(async (hash) => {
  // return 64-byte signature hex for `hash`
});

await client.sendRawTransaction(signed.toHex());
```

## Verifying a state proof

```ts
import { RpcClient, verifyProof } from "@claritychain/rpc";

const client = new RpcClient();
const proof = await client.getProof({
  key_type: 0,
  key_bytes: "0x…",
  version: "current",
});

const ok = verifyProof(proof, { expectedRoot: proof.state_root });
console.log("proof verifies:", ok);
```

## License

MIT — see [LICENSE](./LICENSE.md).