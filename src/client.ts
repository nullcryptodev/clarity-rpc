/**
 * The typed RPC client. One method per RPC handler, named to match
 * the handler with the `clrty_` prefix removed.
 *
 * All numeric values that could exceed 2^53 stay as hex strings on
 * the wire. This client does not coerce them; that's the caller's
 * job via `hexToBigInt`.
 */

import { HttpTransport } from "./transport-http.js";
import type { RpcTransport } from "./transport.js";
import type {
  Account,
  AmmPool,
  AmmPosition,
  Bech32mAddress,
  Block,
  BlockHeader,
  ConsensusState,
  HashHex,
  HexString,
  MempoolStats,
  NftCollection,
  NftInfo,
  NodeStatus,
  Order,
  OrderBook,
  ProofResponse,
  Receipt,
  TokenInfo,
  Transaction,
  TransactionWithLocation,
  Validator,
} from "./types.js";

import type {
  AddressListResponse,
  AddressStats,
  AllCollectionsResponse,
  AllOrdersResponse,
  AllPoolsResponse,
  AllTokensResponse,
  BlocksByProducerResponse,
  BlocksRangeResponse,
  BlockStats,
  ChainStats,
  ChainIdResponse,
  EpochInfo,
  EpochSchedule,
  FeeStats,
  HealthResponse,
  MempoolListResponse,
  NftForOwnerResponse,
  NftsForCollectionResponse,
  OrderFillsResponse,
  OrdersByPairResponse,
  OrdersExpiringAtResponse,
  PairTradesResponse,
  PeersResponse,
  PoolsForTokenResponse,
  PositionsForPoolResponse,
  PositionsForAddressResponse,
  PotInfo,
  RecentBlocksResponse,
  RecentTransactionsResponse,
  SendTxResponse,
  SimulateResponse,
  StakingInfo,
  StateRootResponse,
  TokenHoldersResponse,
  TokenSupplyResponse,
  TokensByCreatorResponse,
  TokensForAddressResponse,
  TokenTransfersResponse,
  TxCount,
  ValidatorListResponse,
  ValidatorWithBlocks,
} from "./types-extra.js";

export const DEFAULT_RPC_URL = "http://127.0.0.1:9633";

export interface RpcClientOptions {
  url?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  transport?: RpcTransport;
}

function toHexParam(v: HexString | number): HexString {
  return typeof v === "number" ? "0x" + v.toString(16) : v;
}

function toHex(n: number | bigint): HexString {
  return "0x" + n.toString(16);
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (a.aborted || b.aborted) {
    ctrl.abort();
  } else {
    a.addEventListener("abort", onAbort, { once: true });
    b.addEventListener("abort", onAbort, { once: true });
  }
  return ctrl.signal;
}

export class RpcClient {
  private readonly transport: RpcTransport;
  private readonly timeoutMs: number;

  constructor(opts: RpcClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.transport =
      opts.transport ??
      new HttpTransport({ url: opts.url ?? DEFAULT_RPC_URL, headers: opts.headers });
  }

  /** Low-level escape hatch. Prefer the typed methods below. */
  async call<T>(
    method: string,
    params: unknown = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const composed = signal
      ? mergeSignals(signal, controller.signal)
      : controller.signal;

    try {
      return await this.transport.send<T>(method, params, composed);
    } finally {
      clearTimeout(timer);
    }
  }

  close(): void {
    void this.transport.close?.();
  }

  // ============================================================== Chain

  chainId(): Promise<ChainIdResponse> {
    return this.call("chainId");
  }

  blockNumber(): Promise<{ height: HexString }> {
    return this.call("blockNumber");
  }

  getBlockByNumber(
    height: HexString | number,
    full = false,
  ): Promise<Block> {
    return this.call("getBlockByNumber", {
      height: toHexParam(height),
      full,
    });
  }

  getBlockByHash(hash: HashHex, full = false): Promise<Block> {
    return this.call("getBlockByHash", { hash, full });
  }

  getBlockHeaderByNumber(
    height: HexString | number,
  ): Promise<BlockHeader> {
    return this.call("getBlockHeaderByNumber", {
      height: toHexParam(height),
    });
  }

  getStateRoot(height: HexString | number): Promise<StateRootResponse> {
    return this.call("getStateRoot", { height: toHexParam(height) });
  }

  getRecentBlocks(limit = 10): Promise<RecentBlocksResponse> {
    return this.call("getRecentBlocks", { limit });
  }

  getBlocksRange(
    start: HexString | number,
    count = 50,
    order: "asc" | "desc" = "desc",
  ): Promise<BlocksRangeResponse> {
    return this.call("getBlocksRange", {
      start: toHexParam(start),
      count,
      order,
    });
  }

  getBlocksByProducer(
    address: Bech32mAddress,
    limit = 50,
  ): Promise<BlocksByProducerResponse> {
    return this.call("getBlocksByProducer", { address, limit });
  }

  getBlockStats(
    fromHeight: HexString | number,
    toHeight: HexString | number,
  ): Promise<BlockStats> {
    return this.call("getBlockStats", {
      from_height: toHexParam(fromHeight),
      to_height: toHexParam(toHeight),
    });
  }

  getChainStats(): Promise<ChainStats> {
    return this.call("getChainStats");
  }

  getEpochInfo(): Promise<EpochInfo> {
    return this.call("getEpochInfo");
  }

  getEpochSchedule(): Promise<EpochSchedule> {
    return this.call("getEpochSchedule");
  }

  // ============================================================== State

  getBalance(
    address: Bech32mAddress,
    tokenId?: HexString,
  ): Promise<{ address: Bech32mAddress; token_id: HexString; balance: HexString }> {
    return this.call("getBalance", {
      address,
      ...(tokenId ? { token_id: tokenId } : {}),
    });
  }

  getAccount(address: Bech32mAddress): Promise<Account> {
    return this.call("getAccount", { address });
  }

  getNonce(
    address: Bech32mAddress,
  ): Promise<{ address: Bech32mAddress; nonce: HexString }> {
    return this.call("getNonce", { address });
  }

  getTokensForAddress(
    address: Bech32mAddress,
  ): Promise<TokensForAddressResponse> {
    return this.call("getTokensForAddress", { address });
  }

  getPositionsForAddress(
    address: Bech32mAddress,
  ): Promise<PositionsForAddressResponse> {
    return this.call("getPositionsForAddress", { address });
  }

  getOrdersForAddress(
    address: Bech32mAddress,
    includeFilled = false,
  ): Promise<{ address: Bech32mAddress; count: HexString; orders: Order[] }> {
    return this.call("getOrdersForAddress", {
      address,
      include_filled: includeFilled,
    });
  }

  getTransactionsForAddress(
    address: Bech32mAddress,
    limit = 50,
  ): Promise<{
    address: Bech32mAddress;
    count: HexString;
    transactions: import("./types-extra.js").TxWithLocation[];
  }> {
    return this.call("getTransactionsForAddress", { address, limit });
  }

  getStakingInfo(): Promise<StakingInfo> {
    return this.call("getStakingInfo");
  }

  getAddressStats(address: Bech32mAddress): Promise<AddressStats> {
    return this.call("getAddressStats", { address });
  }

  getAddressList(limit = 50, offset = 0): Promise<AddressListResponse> {
    return this.call("getAddressList", { limit, offset });
  }

  getProof(args: {
    key_type: number;
    key_bytes: HexString;
    version?: HexString | "current";
  }): Promise<ProofResponse> {
    return this.call("getProof", args);
  }

  // ============================================================== Tokens

  getTokenInfo(tokenId: HexString): Promise<TokenInfo> {
    return this.call("getTokenInfo", { token_id: tokenId });
  }

  getTokenSupply(tokenId: HexString): Promise<TokenSupplyResponse> {
    return this.call("getTokenSupply", { token_id: tokenId });
  }

  getAllTokens(limit = 50, offset = 0): Promise<AllTokensResponse> {
    return this.call("getAllTokens", { limit, offset });
  }

  getTokenHolders(
    tokenId: HexString,
    limit = 50,
  ): Promise<TokenHoldersResponse> {
    return this.call("getTokenHolders", { token_id: tokenId, limit });
  }

  getTokenTransfers(
    tokenId: HexString,
    limit = 50,
  ): Promise<TokenTransfersResponse> {
    return this.call("getTokenTransfers", { token_id: tokenId, limit });
  }

  getTokensByCreator(
    address: Bech32mAddress,
    limit = 50,
  ): Promise<TokensByCreatorResponse> {
    return this.call("getTokensByCreator", { address, limit });
  }

  // ============================================================== Tx

  sendRawTransaction(txHex: HexString): Promise<SendTxResponse> {
    return this.call("sendRawTransaction", { tx: txHex });
  }

  getTransactionByHash(
    hash: HashHex,
  ): Promise<TransactionWithLocation> {
    return this.call("getTransactionByHash", { hash });
  }

  getTransactionReceipt(hash: HashHex): Promise<Receipt> {
    return this.call("getTransactionReceipt", { hash });
  }

  simulateTransaction(txHex: HexString): Promise<SimulateResponse> {
    return this.call("simulateTransaction", { tx: txHex });
  }

  getRecentTransactions(
    limit = 10,
    typeCode?: number,
  ): Promise<RecentTransactionsResponse> {
    return this.call("getRecentTransactions", {
      limit,
      ...(typeCode !== undefined ? { type_code: typeCode } : {}),
    });
  }

  getTxCount(): Promise<TxCount> {
    return this.call("getTxCount");
  }

  getAllTransactions(
    limit = 50,
    typeCode?: number,
  ): Promise<RecentTransactionsResponse> {
    return this.call("getAllTransactions", {
      limit,
      ...(typeCode !== undefined ? { type_code: typeCode } : {}),
    });
  }

  getTransactionsByType(
    typeCode: number,
    limit = 50,
  ): Promise<RecentTransactionsResponse> {
    return this.call("getTransactionsByType", {
      type_code: toHexParam(typeCode),
      limit,
    });
  }

  // ============================================================== Mempool

  getMempoolStats(): Promise<MempoolStats> {
    return this.call("getMempoolStats");
  }

  getMempoolTx(hash: HashHex): Promise<Transaction | null> {
    return this.call("getMempoolTx", { hash });
  }

  getMempoolList(
    limit = 50,
    orderBy: "fee" | "time" = "fee",
  ): Promise<MempoolListResponse> {
    return this.call("getMempoolList", { limit, order_by: orderBy });
  }

  // ============================================================== Consensus

  async getValidators(
    activeOnly = false,
    limit = 100,
    offset = 0,
  ): Promise<ValidatorListResponse> {
    const raw = await this.call<Validator[] | ValidatorListResponse>(
      "getValidators",
      { active_only: activeOnly, limit, offset },
    );

    if (Array.isArray(raw)) {
      const count = raw.length;
      return { validators: raw, count: toHex(count), total: toHex(count) };
    }
    return raw;
  }

  getValidator(id: HexString): Promise<Validator> {
    return this.call("getValidator", { id });
  }

  getValidatorByAddress(address: Bech32mAddress): Promise<Validator> {
    return this.call("getValidatorByAddress", { address });
  }

  getValidatorStats(id: HexString): Promise<ValidatorWithBlocks> {
    return this.call("getValidatorStats", { id });
  }

  getActiveSet(): Promise<{
    ids: HexString[];
    size: HexString;
    quorum: HexString;
  }> {
    return this.call("getActiveSet");
  }

  getConsensusState(): Promise<ConsensusState> {
    return this.call("getConsensusState");
  }

  // ============================================================== AMM

  getPool(poolId: HexString): Promise<AmmPool> {
    return this.call("getPool", { pool_id: poolId });
  }

  getPosition(positionId: HexString): Promise<AmmPosition> {
    return this.call("getPosition", { position_id: positionId });
  }

  getPositionByOwner(
    address: Bech32mAddress,
    poolId: HexString,
  ): Promise<AmmPosition> {
    return this.call("getPositionByOwner", { address, pool_id: poolId });
  }

  getAllPools(limit = 50, offset = 0): Promise<AllPoolsResponse> {
    return this.call("getAllPools", { limit, offset });
  }

  getPoolsForToken(tokenId: HexString): Promise<PoolsForTokenResponse> {
    return this.call("getPoolsForToken", { token_id: tokenId });
  }

  getPositionsForPool(
    poolId: HexString,
    limit = 50,
  ): Promise<PositionsForPoolResponse> {
    return this.call("getPositionsForPool", { pool_id: poolId, limit });
  }

  // ============================================================== Orders

  getOrder(orderId: HexString): Promise<Order> {
    return this.call("getOrder", { order_id: orderId });
  }

  getOrdersExpiringAt(
    height: HexString | number,
  ): Promise<OrdersExpiringAtResponse> {
    return this.call("getOrdersExpiringAt", { height: toHexParam(height) });
  }

  getAllOrders(
    limit = 50,
    offset = 0,
    includeFilled = false,
  ): Promise<AllOrdersResponse> {
    return this.call("getAllOrders", {
      limit,
      offset,
      include_filled: includeFilled,
    });
  }

  getOrdersByPair(
    sellToken: HexString,
    buyToken: HexString,
    limit = 50,
    offset = 0,
  ): Promise<OrdersByPairResponse> {
    return this.call("getOrdersByPair", {
      sell_token: sellToken,
      buy_token: buyToken,
      limit,
      offset,
    });
  }

  getOrderBook(
    baseToken: HexString,
    quoteToken: HexString,
    depth = 20,
  ): Promise<OrderBook> {
    return this.call("getOrderBook", {
      base_token: baseToken,
      quote_token: quoteToken,
      depth,
    });
  }

  getOrderFills(
    orderId: HexString,
    limit = 100,
  ): Promise<OrderFillsResponse> {
    return this.call("getOrderFills", { order_id: orderId, limit });
  }

  getPairTrades(
    baseToken: HexString,
    quoteToken: HexString,
    limit = 100,
  ): Promise<PairTradesResponse> {
    return this.call("getPairTrades", {
      base_token: baseToken,
      quote_token: quoteToken,
      limit,
    });
  }

  // ============================================================== NFTs

  getNft(nftId: HexString): Promise<NftInfo> {
    return this.call("getNft", { nft_id: nftId });
  }

  getNftsForOwner(
    address: Bech32mAddress,
    limit = 50,
    offset = 0,
  ): Promise<NftForOwnerResponse> {
    return this.call("getNftsForOwner", { address, limit, offset });
  }

  getNftsForCollection(
    collectionId: HexString,
    limit = 50,
    offset = 0,
  ): Promise<NftsForCollectionResponse> {
    return this.call("getNftsForCollection", {
      collection_id: collectionId,
      limit,
      offset,
    });
  }

  getCollection(collectionId: HexString): Promise<NftCollection> {
    return this.call("getCollection", { collection_id: collectionId });
  }

  getAllCollections(
    limit = 50,
    offset = 0,
  ): Promise<AllCollectionsResponse> {
    return this.call("getAllCollections", { limit, offset });
  }

  // ============================================================== Metrics

  getFeeStats(): Promise<FeeStats> {
    return this.call("getFeeStats");
  }

  getPotInfo(): Promise<PotInfo> {
    return this.call("getPotInfo");
  }

  // ============================================================== Node

  ping(): Promise<string> {
    return this.call("ping");
  }

  status(): Promise<NodeStatus> {
    return this.call("status");
  }

  health(): Promise<HealthResponse> {
    return this.call("health");
  }

  getPeers(): Promise<PeersResponse> {
    return this.call("getPeers");
  }

  getConfig(): Promise<Record<string, unknown>> {
    return this.call("getConfig");
  }

  getMethods(): Promise<Record<string, string[]>> {
    return this.call("getMethods");
  }

  // ============================================================== ETH shims

  web3ClientVersion(): Promise<string> {
    return this.call("web3_clientVersion");
  }

  netVersion(): Promise<string> {
    return this.call("net_version");
  }

  netPeerCount(): Promise<HexString> {
    return this.call("net_peerCount");
  }

  netListening(): Promise<boolean> {
    return this.call("net_listening");
  }
}