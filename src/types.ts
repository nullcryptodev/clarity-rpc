/**
 * Wire conventions, mirrored from the node's RPC surface.
 *
 *   HexString  - "0x"-prefixed lowercase hex, no leading zeros.
 *                Zero = "0x0". Used for anything that could exceed
 *                2^53: balances, fees, stake, heights, nonces,
 *                token IDs, reserves, supplies, amounts, hashes,
 *                signatures, public keys, byte blobs.
 *   Bech32m    - "clrty1…" | "tclrty1…" | "rclrty1…".
 *   number     - JSON number. Only for counts, small enums, bps.
 *   boolean    - JSON boolean.
 */

export type HexString = string;
export type Bech32mAddress = string;
export type HashHex = string;
export type PublicKeyHex = string;
export type SignatureHex = string;
export type BlockHeight = HexString;

// --------------------------------------------------------------- Account

export interface Account {
  address: Bech32mAddress;
  nonce: HexString;
  balance: HexString;
  staked: HexString;
  pending_rewards: HexString;
  last_reward_epoch: HexString;
  staker_since_height: HexString;
  created_at_height: HexString;
  staking_opted_out: boolean;
  is_empty: boolean;
  total_value: HexString;
}

// --------------------------------------------------------------- Block

export interface BlockHeader {
  hash: HashHex;
  version: number;
  chain_id: number;
  height: HexString;
  parent_hash: HashHex;
  timestamp_ms: HexString;
  proposer: Bech32mAddress;
  epoch: HexString;
  rotation_index: HexString;
  commit_round: HexString;
  emergency_rotation: HexString;
  state_root: HashHex;
  tx_root: HashHex;
  receipts_root: HashHex;
  validator_set_root: HashHex;
  total_fees: HexString;
  tx_count: number;
  active_validator_count: number;
}

export interface QuorumSignature {
  signer_index: number;
  signature: SignatureHex;
}

export interface Block extends BlockHeader {
  transactions: Transaction[] | HashHex[];
  participants: HexString[];
  quorum_signatures: QuorumSignature[];
}

// --------------------------------------------------------------- Tx

export type TxTypeName =
  | "transfer"
  | "opt_in_staking"
  | "opt_out_staking"
  | "claim_rewards"
  | "register_validator"
  | "unregister_validator"
  | "update_reward_address"
  | "create_pool"
  | "add_liquidity"
  | "remove_liquidity"
  | "swap"
  | "create_order"
  | "cancel_order"
  | "create_token"
  | "mint_token"
  | "burn_token"
  | "update_token_meta"
  | "block_reward"
  | "order_expired"
  | "slash"
  | "bridge_mint"
  | "bridge_burn"
  | "bridge_attest"
  | "bridge_register_chain"
  | "bridge_ack_withdrawal"
  | "bridge_pause"
  | "bridge_unpause"
  | "register_bridge_watcher"
  | "unregister_bridge_watcher"
  | "bridge_ack_attest"
  | (string & {});

export interface Transaction {
  hash: HashHex;
  version: number;
  chain_id: HexString;
  type: TxTypeName;
  type_code: number;
  nonce: HexString;
  valid_until_height: HexString;
  from: Bech32mAddress;
  to: Bech32mAddress | null;
  token_id: HexString;
  amount: HexString;
  fee: HexString;
  payload: HexString;
  payload_size: number;
  signature: SignatureHex;
}

export interface TransactionWithLocation {
  tx: Transaction;
  status: "pending" | "confirmed";
  block_hash: HashHex | null;
  block_height: HexString | null;
  index: number | null;
}

// --------------------------------------------------------------- Receipt

export interface Receipt {
  status: "success" | "failure";
  status_code: number;
  fee_paid: HexString;
  tx_hash: HashHex;
  block_hash: HashHex;
  block_height: HexString;
  index: number;
}

// --------------------------------------------------------------- Validator

export interface Validator {
  id: HexString;
  reward_address: Bech32mAddress;
  consensus_key: PublicKeyHex;
  node_key: PublicKeyHex;
  owner: Bech32mAddress;
  registered_at_height: HexString;
  stake: HexString;
  uptime_score: number;
  last_ping_height: HexString;
  last_seen_height: HexString;
  reward_multiplier: number;
  infraction_count: number;
  last_infraction_height: HexString;
  total_blocks_produced: HexString;
  total_rewards_earned: HexString;
  epochs_active: HexString;
  is_seed: boolean;
  is_active: boolean;
  became_active_at: HexString;
  last_active_at: HexString;
  can_be_active: boolean;
  meets_stake_req: boolean;
  is_offline: boolean;
}

// --------------------------------------------------------------- Token

export type BackingModel = "unbacked" | "backed" | "hybrid";

export interface TokenInfo {
  id: HexString;
  name: string;
  symbol: string;
  decimals: number;
  creator: Bech32mAddress | null;
  backing: BackingModel;
  backing_code: number;
  max_supply: HexString;
  royalty_bps: number;
  fingerprint: HashHex | null;
  is_native: boolean;
  is_bridged: boolean;
}

// --------------------------------------------------------------- AMM

export interface AmmPool {
  id: HexString;
  creator: Bech32mAddress;
  token_a: HexString;
  token_b: HexString;
  reserve_a: HexString;
  reserve_b: HexString;
  total_liquidity: HexString;
  fee_bps: number;
  created_at_height: HexString;
  active: boolean;
  k: HexString;
}

export interface AmmPosition {
  id: HexString;
  owner: Bech32mAddress;
  pool_id: HexString;
  liquidity: HexString;
  created_at_height: HexString;
  share_bps?: number;
}

// --------------------------------------------------------------- Order

export type OrderMode = "passive" | "active";
export type OrderConditionType =
  | "expires_at_height"
  | "price_above"
  | "price_below"
  | "volume_below"
  | "balance_below"
  | "invalid";

export interface OrderCondition {
  type: OrderConditionType;
  type_code: number;
  param1: HexString;
  param2: HexString;
  description: string;
}

export interface Order {
  id: HexString;
  owner: Bech32mAddress;
  mode: OrderMode;
  mode_code: number;
  sell_token: HexString;
  buy_token: HexString;
  sell_amount: HexString;
  min_buy_amount: HexString;
  filled_amount: HexString;
  remaining_amount: HexString;
  created_at_height: HexString;
  order_expires_at_height: HexString;
  is_fully_filled: boolean;
  condition_count: number;
  conditions: OrderCondition[];
}

// --------------------------------------------------------------- Node

export interface NodeStatus {
  height: HexString;
  best_peer_height: HexString;
  peer_count: HexString;
  mempool_size: HexString;
  mempool_bytes: HexString;
  is_validator: boolean;
  validator_id: HexString;
  consensus_height: HexString;
  consensus_round: HexString;
  consensus_step: string;
  network: string;
  chain_id: HexString;
  running: boolean;
  state_root: HashHex;
}

export interface ConsensusState {
  height: HexString;
  round: HexString;
  step: string;
  is_validator: boolean;
  validator_id: HexString;
  chain_height: HexString;
  best_peer_height: HexString;
}

export interface MempoolStats {
  total_txs: HexString;
  priority_txs: HexString;
  standard_txs: HexString;
  total_bytes: HexString;
  min_fee_rate: HexString;
  max_fee_rate: HexString;
  avg_fee_rate: HexString;
}

export interface Peer {
  id: HexString;
  ip: string;
  port: number;
  direction: "inbound" | "outbound";
  state: string;
  best_height: HexString;
  agent: string;
  connected_at_ms: HexString;
  last_recv_ms: HexString;
  last_send_ms: HexString;
  misbehaviors: HexString;
}

// --------------------------------------------------------------- Proof

export type ProofStatus =
  | "ok"
  | "key_not_found"
  | "version_unavailable"
  | "malformed";

export interface ProofResponse {
  status: ProofStatus;
  state_root: HashHex;
  version: HexString;
  proof?: HexString;
}

// --------------------------------------------------------------- NFT

/**
 * An NFT. Every NFT is also a token (maxSupply 1, decimals 0), so the
 * DEX, AMM, and reward layer see it as an ordinary token of that
 * shape. The `shadow_token_id` is that token's id.
 */
export interface NftInfo {
  id: HexString;
  owner: Bech32mAddress;
  creator: Bech32mAddress;
  shadow_token_id: HexString;
  /** "0x0" for a standalone NFT. */
  underlying_token_id: HexString;
  /** "0x0" for a standalone NFT. */
  wrapped_amount: HexString;
  /** "0x0" for an NFT that is not in a collection. */
  collection_id: HexString;
  metadata_hash: HashHex | null;
  metadata_uri: string;
  frozen: boolean;
  last_accrual_height: HexString;
  /**
   * Accrued but unclaimed reward, in atomic units of the collection's
   * reward token. Settled into the owner's `pending_rewards` account
   * field by the epoch-boundary processor; claimed via the standard
   * `claim_rewards` transaction, which clears `pending_rewards`
   * regardless of whether the accrual was staker or NFT.
   */
  accrued_owed: HexString;
  created_at_height: HexString;
  /** Present only when the NFT is wrapped. */
  custody_address?: Bech32mAddress;
}

export interface NftCollection {
  id: HexString;
  creator: Bech32mAddress;
  name: string;
  symbol: string;
  base_uri: string;
  /** "0x0" for a collection with no reward schedule. */
  reward_token_id: HexString;
  reward_rate_per_epoch: HexString;
  reward_escrow_remaining: HexString;
  reward_paused: boolean;
  created_at_height: HexString;
  minted_count: HexString;
  /** Present only when the collection has a reward schedule. */
  escrow_address?: Bech32mAddress;
}

// --------------------------------------------------------------- Order book

export interface OrderBookLevel {
  price: HexString;
  total_base: HexString;
  order_count: HexString;
}

export interface OrderBook {
  base_token: HexString;
  quote_token: HexString;
  /** The canonical-price scale. See `formatPrice`. */
  price_scale: HexString;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface Fill {
  source: "limit" | "amm";
  source_code: number;
  maker_order_id: HexString;
  taker_order_id: HexString;
  pool_id: HexString;
  base_token: HexString;
  quote_token: HexString;
  qty_base: HexString;
  qty_quote: HexString;
  price: HexString;
  height: HexString;
  tx_index_in_block: number;
}