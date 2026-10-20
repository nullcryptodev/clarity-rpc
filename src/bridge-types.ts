import type { Bech32mAddress, HashHex, HexString } from "./types.js";

export interface BridgeChainRegistration {
  source_chain_id: HexString;
  wrapped_token_id: HexString;
  fingerprint: HashHex;
  source_decimals: number;
  clarity_decimals: number;
  confirmation_depth: HexString;
  destination_blob_min_len: HexString;
  destination_blob_max_len: HexString;
  enabled: boolean;
  active_watcher_min: HexString;
}

export interface BridgeConsumedResponse {
  consumed: boolean;
  mint_height?: HexString;
}

export interface BridgeWithdrawal {
  withdrawal_id: HexString;
  source_chain_id: HexString;
  wrapped_token_id: HexString;
  burner: Bech32mAddress;
  amount: HexString;
  destination_blob: HexString;
  destination_address: string;
  created_at_height: HexString;
  well_formed: boolean;
  is_released: boolean;
  release_tx_hash: HashHex | null;
  release_height: HexString;
  released_at_height: HexString;
  released_by_watcher_id: HexString;
}

export interface BridgeWatcher {
  watcher_id: HexString;
  validator_id: HexString;
  source_chain_id: HexString;
  reward_address: Bech32mAddress;
  stake: HexString;
  registered_at_height: HexString;
  is_active: boolean;
}

export interface BridgeWatcherIdResponse {
  watcher_id: HexString;
  validator_id: HexString;
  source_chain_id: HexString;
  reward_address: Bech32mAddress;
  stake: HexString;
  registered_at_height: HexString;
  is_active: boolean;
}

export interface ActiveWatchersResponse {
  source_chain_id: HexString;
  height: HexString;
  count: HexString;
  watchers: BridgeWatcher[];
}

export interface BridgeAttestation {
  validator_id: HexString;
  signer_index: HexString;
  destination: Bech32mAddress;
  amount: HexString;
  attested_at_height: HexString;
  signature: HexString;
}

export interface BridgeAttestationsForDepositResponse {
  source_chain_id: HexString;
  source_tx_hash: HashHex;
  source_output_index: HexString;
  count: HexString;
  attestations: BridgeAttestation[];
}

export interface BridgeAttestationsPageResponse {
  count: HexString;
  offset: HexString;
  limit: HexString;
  total: HexString;
  attestations: (BridgeAttestation & {
    source_chain_id: HexString;
    source_tx_hash: HashHex;
    source_output_index: HexString;
  })[];
}

export interface BridgeAckAttestation {
  validator_id: HexString;
  signer_index: HexString;
  attested_at_height: HexString;
  signature: HexString;
}

export interface BridgeAckAttestationsResponse {
  withdrawal_id: HexString;
  count: HexString;
  attestations: BridgeAckAttestation[];
}

export interface BridgeAckAttestationsPageResponse {
  count: HexString;
  offset: HexString;
  limit: HexString;
  total: HexString;
  attestations: (BridgeAckAttestation & { withdrawal_id: HexString })[];
}

export type PendingWithdrawal = BridgeWithdrawal & {
  ack_attestation_count: HexString;
  active_watcher_count: HexString;
  ack_quorum: HexString;
  ack_quorum_reached: boolean;
};

export interface PendingWithdrawalsResponse {
  height: HexString;
  from_height: HexString;
  count: HexString;
  offset: HexString;
  limit: HexString;
  withdrawals: PendingWithdrawal[];
}

export interface BridgeStats {
  source_chain_id: HexString;
  initialized: boolean;
  total_minted: HexString;
  total_burned: HexString;
  total_released: HexString;
  deposit_count: HexString;
  withdrawal_count: HexString;
  released_withdrawal_count: HexString;
  last_mint_height: HexString;
  last_burn_height: HexString;
  last_release_height: HexString;
  registered_at_height: HexString;
  outstanding_liability: HexString;
  wrapped_supply: HexString;
  supply_consistent: boolean;
}

export type BridgeEventKind = "mint" | "burn" | "ack_attest" | "ack_withdrawal";

export interface BridgeEvent {
  kind: BridgeEventKind;
  kind_code: number;
  source_chain_id: HexString;
  block_height: HexString;
  tx_index_in_block: number;
  tx_hash: HashHex;
  source_tx_hash: HashHex | null;
  source_output_index: HexString;
  withdrawal_id: HexString;
  actor: Bech32mAddress;
  amount: HexString;
  counterparty: HexString;
}

export interface BridgeEventsResponse {
  source_chain_id: HexString;
  from_height: HexString;
  count: HexString;
  offset: HexString;
  limit: HexString;
  total: HexString;
  events: BridgeEvent[];
}