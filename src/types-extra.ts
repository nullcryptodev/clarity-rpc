/**
 * Response shapes for the newer methods. These complement `types.ts`
 * and are only consumed through the client, but live in a shared file
 * so both the client and downstream consumers can import them.
 */

import type {
  Bech32mAddress,
  Fill,
  HashHex,
  HexString,
  NftCollection,
  NftInfo,
  OrderBook,
  Transaction,
  Validator,
} from "./types.js";

export interface ChainStats {
  height: HexString;
  chain_id: HexString;
  epoch: HexString;
  total_transactions: HexString;
  total_fees_lifetime: HexString;
  total_supply: HexString;
  total_staked: HexString;
  staker_count: HexString;
  current_pot: HexString;
  unique_addresses: HexString;
  unique_tokens: HexString;
  unique_validators: HexString;
  unique_pools: HexString;
  genesis_timestamp_ms: HexString;
}

export interface StakingInfo {
  last_effective_apy_bps: HexString;
  base_bps: HexString;
  activity_bonus_bps: HexString;
  pot_bonus_bps: HexString;
  total_staked: HexString;
  staker_count: HexString;
  current_pot: HexString;
  activity_txs_in_window: HexString;
  avg_tx_per_block: HexString;
  epoch: HexString;
  epoch_start_height: HexString;
  next_epoch_height: HexString;
  blocks_until_next_epoch: HexString;
}

export interface FeeStats {
  total_fees_lifetime: HexString;
  fees_last_epoch: HexString;
  fees_last_24h: HexString;
  avg_fee_per_block: HexString;
  avg_fee_per_transaction: HexString;
  total_transactions: HexString;
}

export interface PotInfo {
  current_pot: HexString;
  pot_high_threshold: HexString;
  pot_fill_bps_of_high: HexString;
  total_to_pot: HexString;
  total_pot_distributed: HexString;
  last_effective_apy_bps: HexString;
  epoch: HexString;
  epoch_start_height: HexString;
  next_epoch_height: HexString;
  blocks_until_payout: HexString;
}

export interface BlockStats {
  from_height: HexString;
  to_height: HexString;
  block_count: HexString;
  total_transactions: HexString;
  total_fees: HexString;
}

export interface EpochInfo {
  epoch: HexString;
  epoch_start_height: HexString;
  next_epoch_height: HexString;
  current_height: HexString;
  blocks_until_next_epoch: HexString;
  rotation_interval: HexString;
}

export interface EpochSchedule {
  rotation_interval: HexString;
  unbonding_period: HexString;
  emergency_rotation_rounds: HexString;
  active_set_min: HexString;
  active_set_max: HexString;
  current_epoch: HexString;
  epoch_start_height: HexString;
}

export interface AddressStats {
  address: Bech32mAddress;
  balance: HexString;
  nonce: HexString;
  staked: HexString;
  pending_rewards: HexString;
  staking_opted_out: boolean;
  token_count: HexString;
  position_count: HexString;
  order_count: HexString;
  is_validator: boolean;
  validator_id: HexString;
}

export interface TxWithLocation {
  tx: Transaction;
  block_hash: HashHex;
  block_height: HexString;
  index: number;
}

export interface BlockRef {
  height: HexString;
  block_hash: HashHex;
}

export interface TxCount {
  total_transactions: HexString;
  epoch_transactions: HexString;
  current_epoch: HexString;
}

export interface MempoolEntry {
  tx: Transaction;
  fee_rate: HexString;
  added_ms: HexString;
  size: HexString;
  tier: "priority" | "standard";
}

export interface TokenBalancePair {
  token_id: HexString;
  balance: HexString;
}

export interface HolderEntry {
  address: Bech32mAddress;
  balance: HexString;
}

export interface AddressListEntry {
  address: Bech32mAddress;
  balance: HexString;
  nonce: HexString;
}

export interface ValidatorListResponse {
  validators: Validator[];
  count: HexString;
  total: HexString;
}

export interface ValidatorWithBlocks extends Validator {
  recent_blocks: BlockRef[];
}

export interface ActiveSetResponse {
  ids: HexString[];
  size: HexString;
  quorum: HexString;
}

export interface HealthResponse {
  ok: boolean;
  height: HexString;
  peers: HexString;
  is_validator: boolean;
}

export interface ChainIdResponse {
  chain_id: HexString;
}

export interface BlockNumberResponse {
  height: HexString;
}

export interface StateRootResponse {
  height: HexString;
  state_root: HashHex;
}

export interface BalanceResponse {
  address: Bech32mAddress;
  token_id: HexString;
  balance: HexString;
}

export interface NonceResponse {
  address: Bech32mAddress;
  nonce: HexString;
}

export interface TokenSupplyResponse {
  token_id: HexString;
  supply: HexString;
}

export interface SendTxResponse {
  tx_hash: HashHex;
  accepted: true;
}

export interface SimulateResponse extends ReceiptLike {
  tx_hash: HashHex;
  height: HexString;
}

interface ReceiptLike {
  status: "success" | "failure";
  status_code: number;
  fee_paid: HexString;
}

export interface RecentTransactionsResponse {
  count: HexString;
  transactions: TxWithLocation[];
}

export interface RecentBlocksResponse {
  count: HexString;
  blocks: import("./types.js").BlockHeader[];
}

export interface BlocksRangeResponse {
  count: HexString;
  start: HexString;
  order: "asc" | "desc";
  blocks: import("./types.js").BlockHeader[];
}

export interface BlocksByProducerResponse {
  proposer: Bech32mAddress;
  count: HexString;
  blocks: BlockRef[];
}

export interface TokensForAddressResponse {
  address: Bech32mAddress;
  count: HexString;
  tokens: TokenBalancePair[];
}

export interface PositionsForAddressResponse {
  address: Bech32mAddress;
  count: HexString;
  positions: import("./types.js").AmmPosition[];
}

export interface OrdersForAddressResponse {
  address: Bech32mAddress;
  count: HexString;
  orders: import("./types.js").Order[];
}

export interface TransactionsForAddressResponse {
  address: Bech32mAddress;
  count: HexString;
  transactions: TxWithLocation[];
}

export interface AllTokensResponse {
  count: HexString;
  offset: HexString;
  limit: HexString;
  tokens: import("./types.js").TokenInfo[];
}

export interface TokenHoldersResponse {
  token_id: HexString;
  count: HexString;
  total_holders: HexString;
  holders: HolderEntry[];
}

export interface TokenTransfersResponse {
  token_id: HexString;
  count: HexString;
  transfers: TxWithLocation[];
}

export interface TokensByCreatorResponse {
  creator: Bech32mAddress;
  count: HexString;
  tokens: import("./types.js").TokenInfo[];
}

export interface AllPoolsResponse {
  count: HexString;
  offset: HexString;
  limit: HexString;
  pools: import("./types.js").AmmPool[];
}

export interface PoolsForTokenResponse {
  count: HexString;
  pools: import("./types.js").AmmPool[];
}

export interface PositionsForPoolResponse {
  pool_id: HexString;
  count: HexString;
  total: HexString;
  positions: import("./types.js").AmmPosition[];
}

export interface AllOrdersResponse {
  count: HexString;
  offset: HexString;
  limit: HexString;
  orders: import("./types.js").Order[];
}

export interface OrdersByPairResponse {
  sell_token: HexString;
  buy_token: HexString;
  count: HexString;
  offset: HexString;
  limit: HexString;
  orders: import("./types.js").Order[];
}

export interface OrdersExpiringAtResponse {
  height: HexString;
  count: HexString;
  order_ids: HexString[];
}

export interface AddressListResponse {
  count: HexString;
  offset: HexString;
  limit: HexString;
  addresses: AddressListEntry[];
}

export interface MempoolListResponse {
  count: HexString;
  total: HexString;
  order_by: "fee" | "time";
  transactions: MempoolEntry[];
}

export interface PeersResponse {
  count: HexString;
  peers: import("./types.js").Peer[];
}

// --------------------------------------------------------------- NFTs

export interface NftForOwnerResponse {
  address: Bech32mAddress;
  count: HexString;
  offset: HexString;
  limit: HexString;
  nfts: NftInfo[];
}

export interface NftsForCollectionResponse {
  collection_id: HexString;
  count: HexString;
  offset: HexString;
  limit: HexString;
  nfts: NftInfo[];
}

export interface AllCollectionsResponse {
  count: HexString;
  offset: HexString;
  limit: HexString;
  collections: NftCollection[];
}

// --------------------------------------------------------------- Order book

export interface OrderFillsResponse {
  order_id: HexString;
  count: HexString;
  fills: Fill[];
}

export interface PairTradesResponse {
  base_token: HexString;
  quote_token: HexString;
  count: HexString;
  trades: Fill[];
}