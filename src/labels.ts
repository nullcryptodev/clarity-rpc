/**
 * Human-readable labels for the transaction type names the C++ encoder
 * emits. The wire format is the lowercased snake_case C++ enum name;
 * this maps them to display strings. Unknown types pass through
 * unchanged so a future type doesn't break the UI.
 */

export const TX_TYPE_LABELS: Record<string, string> = {
  transfer: "Transfer",
  opt_in_staking: "Stake",
  opt_out_staking: "Unstake",
  claim_rewards: "Claim",
  register_validator: "Register Validator",
  unregister_validator: "Unregister Validator",
  update_reward_address: "Update Reward",
  create_pool: "Create Pool",
  add_liquidity: "Add Liquidity",
  remove_liquidity: "Remove Liquidity",
  swap: "Swap",
  create_order: "Create Order",
  cancel_order: "Cancel Order",
  create_token: "Create Token",
  mint_token: "Mint",
  burn_token: "Burn",
  update_token_meta: "Update Token",
  block_reward: "Block Reward",
  order_expired: "Order Expired",
  slash: "Slash",
  create_nft_collection: "Create NFT Collection",
  mint_nft: "Mint NFT",
  wrap_nft: "Wrap NFT",
  transfer_nft: "Transfer NFT",
  burn_nft: "Burn NFT",
  update_nft_metadata: "Update NFT Metadata",
  top_up_nft: "Top Up NFT",
  claim_nft_reward: "Claim NFT Reward",
  refill_collection_reward: "Refill Collection Reward",
};

export function humanTypeName(t: string): string {
  return TX_TYPE_LABELS[t] ?? t;
}