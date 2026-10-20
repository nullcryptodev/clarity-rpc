import type { RpcClient } from "./client.js";
import type { Bech32mAddress, HashHex, HexString } from "./types.js";
import type {
  ActiveWatchersResponse,
  BridgeAckAttestationsResponse,
  BridgeAttestationsForDepositResponse,
  BridgeChainRegistration,
  BridgeConsumedResponse,
  BridgeEvent,
  BridgeEventKind,
  BridgeEventsResponse,
  BridgeStats,
  BridgeWatcher,
  BridgeWatcherIdResponse,
  BridgeWithdrawal,
  PendingWithdrawal,
  PendingWithdrawalsResponse,
} from "./bridge-types.js";
import { hexToBigInt, bigIntToHex } from "./format.js";

const EVENT_KIND_CODES: Record<BridgeEventKind, number> = {
  mint: 0,
  burn: 1,
  ack_attest: 2,
  ack_withdrawal: 3,
};

export interface ParsedBridgeWithdrawal {
  withdrawalId: bigint;
  sourceChainId: bigint;
  wrappedTokenId: bigint;
  burner: Bech32mAddress;
  amount: bigint;
  destinationBlob: Uint8Array;
  destinationAddress: string;
  createdAtHeight: bigint;
  isReleased: boolean;
  releaseTxHash: HashHex | null;
  releaseHeight: bigint;
  releasedAtHeight: bigint;
  releasedByWatcherId: bigint;
}

export interface ParsedPendingWithdrawal extends ParsedBridgeWithdrawal {
  ackAttestationCount: bigint;
  activeWatcherCount: bigint;
  ackQuorum: bigint;
  ackQuorumReached: boolean;
}

export interface ParsedBridgeStats {
  sourceChainId: bigint;
  initialized: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
  totalReleased: bigint;
  depositCount: bigint;
  withdrawalCount: bigint;
  releasedWithdrawalCount: bigint;
  lastMintHeight: bigint;
  lastBurnHeight: bigint;
  lastReleaseHeight: bigint;
  registeredAtHeight: bigint;
  outstandingLiability: bigint;
  wrappedSupply: bigint;
  supplyConsistent: boolean;
}

export interface ParsedBridgeEvent {
  kind: BridgeEventKind;
  sourceChainId: bigint;
  blockHeight: bigint;
  txIndexInBlock: number;
  txHash: HashHex;
  sourceTxHash: HashHex | null;
  sourceOutputIndex: number;
  withdrawalId: bigint;
  actor: Bech32mAddress;
  amount: bigint;
  counterparty: bigint;
}

export interface BridgeEventPage {
  sourceChainId: bigint;
  fromHeight: bigint;
  count: bigint;
  offset: bigint;
  limit: bigint;
  total: bigint;
  events: ParsedBridgeEvent[];
}

function hexBytes(s: HexString): Uint8Array {
  const clean = s.startsWith("0x") ? s.slice(2) : s;
  if (clean.length % 2 !== 0) throw new Error(`odd-length hex: ${s}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function parseWithdrawal(raw: BridgeWithdrawal): ParsedBridgeWithdrawal {
  return {
    withdrawalId: hexToBigInt(raw.withdrawal_id),
    sourceChainId: hexToBigInt(raw.source_chain_id),
    wrappedTokenId: hexToBigInt(raw.wrapped_token_id),
    burner: raw.burner,
    amount: hexToBigInt(raw.amount),
    destinationBlob: hexBytes(raw.destination_blob),
    destinationAddress: raw.destination_address,
    createdAtHeight: hexToBigInt(raw.created_at_height),
    isReleased: raw.is_released,
    releaseTxHash: raw.release_tx_hash,
    releaseHeight: hexToBigInt(raw.release_height),
    releasedAtHeight: hexToBigInt(raw.released_at_height),
    releasedByWatcherId: hexToBigInt(raw.released_by_watcher_id),
  };
}

function parsePendingWithdrawal(
  raw: PendingWithdrawal,
): ParsedPendingWithdrawal {
  return {
    ...parseWithdrawal(raw),
    ackAttestationCount: hexToBigInt(raw.ack_attestation_count),
    activeWatcherCount: hexToBigInt(raw.active_watcher_count),
    ackQuorum: hexToBigInt(raw.ack_quorum),
    ackQuorumReached: raw.ack_quorum_reached,
  };
}

function parseStats(raw: BridgeStats): ParsedBridgeStats {
  return {
    sourceChainId: hexToBigInt(raw.source_chain_id),
    initialized: raw.initialized,
    totalMinted: hexToBigInt(raw.total_minted),
    totalBurned: hexToBigInt(raw.total_burned),
    totalReleased: hexToBigInt(raw.total_released),
    depositCount: hexToBigInt(raw.deposit_count),
    withdrawalCount: hexToBigInt(raw.withdrawal_count),
    releasedWithdrawalCount: hexToBigInt(raw.released_withdrawal_count),
    lastMintHeight: hexToBigInt(raw.last_mint_height),
    lastBurnHeight: hexToBigInt(raw.last_burn_height),
    lastReleaseHeight: hexToBigInt(raw.last_release_height),
    registeredAtHeight: hexToBigInt(raw.registered_at_height),
    outstandingLiability: hexToBigInt(raw.outstanding_liability),
    wrappedSupply: hexToBigInt(raw.wrapped_supply),
    supplyConsistent: raw.supply_consistent,
  };
}

function parseEvent(raw: BridgeEvent): ParsedBridgeEvent {
  return {
    kind: raw.kind,
    sourceChainId: hexToBigInt(raw.source_chain_id),
    blockHeight: hexToBigInt(raw.block_height),
    txIndexInBlock: raw.tx_index_in_block,
    txHash: raw.tx_hash,
    sourceTxHash: raw.source_tx_hash,
    sourceOutputIndex: Number(hexToBigInt(raw.source_output_index)),
    withdrawalId: hexToBigInt(raw.withdrawal_id),
    actor: raw.actor,
    amount: hexToBigInt(raw.amount),
    counterparty: hexToBigInt(raw.counterparty),
  };
}

export class BridgeClient {
  constructor(private readonly rpc: RpcClient) { }

  // ---- Reads -------------------------------------------------------

  async getChainRegistration(
    sourceChainId: bigint,
  ): Promise<BridgeChainRegistration> {
    return this.rpc.getBridgeChainRegistration(bigIntToHex(sourceChainId));
  }

  async getConsumed(
    sourceChainId: bigint,
    sourceTxHash: HashHex,
    sourceOutputIndex: number,
  ): Promise<{ consumed: boolean; mintHeight?: bigint }> {
    const raw = await this.rpc.getBridgeConsumed({
      sourceChainId: bigIntToHex(sourceChainId),
      sourceTxHash,
      sourceOutputIndex,
    });
    return {
      consumed: raw.consumed,
      ...(raw.mint_height !== undefined
        ? { mintHeight: hexToBigInt(raw.mint_height) }
        : {}),
    };
  }

  async getWithdrawal(withdrawalId: bigint): Promise<ParsedBridgeWithdrawal> {
    const raw = await this.rpc.getBridgeWithdrawal(
      bigIntToHex(withdrawalId),
    );
    return parseWithdrawal(raw);
  }

  async getActiveWatchers(
    sourceChainId: bigint,
    height?: bigint,
  ): Promise<{ sourceChainId: bigint; height: bigint; watchers: BridgeWatcher[] }> {
    const raw: ActiveWatchersResponse = await this.rpc.getActiveWatchers(
      bigIntToHex(sourceChainId),
      height !== undefined ? bigIntToHex(height) : undefined,
    );
    return {
      sourceChainId: hexToBigInt(raw.source_chain_id),
      height: hexToBigInt(raw.height),
      watchers: raw.watchers,
    };
  }

  async getWatcherIdByAddress(
    address: Bech32mAddress,
  ): Promise<BridgeWatcherIdResponse> {
    return this.rpc.getBridgeWatcherIdByAddress(address);
  }

  async getAttestationsForDeposit(
    sourceChainId: bigint,
    sourceTxHash: HashHex,
    sourceOutputIndex: number,
  ): Promise<BridgeAttestationsForDepositResponse> {
    return this.rpc.getBridgeAttestations({
      sourceChainId: bigIntToHex(sourceChainId),
      sourceTxHash,
      sourceOutputIndex,
    }) as Promise<BridgeAttestationsForDepositResponse>;
  }

  async getAckAttestations(
    withdrawalId: bigint,
  ): Promise<BridgeAckAttestationsResponse> {
    return this.rpc.getBridgeAckAttestations({
      withdrawalId: bigIntToHex(withdrawalId),
    }) as Promise<BridgeAckAttestationsResponse>;
  }

  async getPendingWithdrawals(opts?: {
    fromHeight?: bigint;
    limit?: number;
    offset?: number;
  }): Promise<{
    height: bigint;
    count: bigint;
    offset: bigint;
    limit: bigint;
    withdrawals: ParsedPendingWithdrawal[];
  }> {
    const raw: PendingWithdrawalsResponse =
      await this.rpc.getPendingWithdrawals({
        fromHeight:
          opts?.fromHeight !== undefined
            ? bigIntToHex(opts.fromHeight)
            : undefined,
        limit: opts?.limit,
        offset: opts?.offset,
      });
    return {
      height: hexToBigInt(raw.height),
      count: hexToBigInt(raw.count),
      offset: hexToBigInt(raw.offset),
      limit: hexToBigInt(raw.limit),
      withdrawals: raw.withdrawals.map(parsePendingWithdrawal),
    };
  }

  async getStats(sourceChainId: bigint): Promise<ParsedBridgeStats> {
    const raw = await this.rpc.getBridgeStats(bigIntToHex(sourceChainId));
    return parseStats(raw);
  }

  async getEvents(opts: {
    sourceChainId: bigint;
    fromHeight?: bigint;
    kind?: BridgeEventKind;
    limit?: number;
    offset?: number;
  }): Promise<BridgeEventPage> {
    if (opts.kind !== undefined && !(opts.kind in EVENT_KIND_CODES)) {
      throw new Error(
        `unknown bridge event kind: ${opts.kind} (expected one of ` +
        `${Object.keys(EVENT_KIND_CODES).join(", ")})`,
      );
    }
    const raw: BridgeEventsResponse = await this.rpc.getBridgeEvents({
      sourceChainId: bigIntToHex(opts.sourceChainId),
      fromHeight:
        opts.fromHeight !== undefined ? bigIntToHex(opts.fromHeight) : undefined,
      kind: opts.kind,
      limit: opts.limit,
      offset: opts.offset,
    });
    return {
      sourceChainId: hexToBigInt(raw.source_chain_id),
      fromHeight: hexToBigInt(raw.from_height),
      count: hexToBigInt(raw.count),
      offset: hexToBigInt(raw.offset),
      limit: hexToBigInt(raw.limit),
      total: hexToBigInt(raw.total),
      events: raw.events.map(parseEvent),
    };
  }
}