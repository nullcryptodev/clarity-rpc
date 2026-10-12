/**
 * Public entry point for `@claritychain/rpc`.
 *
 * Everything a consumer needs is re-exported here. Internal helpers
 * that are not part of the stable surface are not exported.
 */

// Client and transports
export { RpcClient, DEFAULT_RPC_URL } from "./client.js";
export type { RpcClientOptions } from "./client.js";
export type { RpcTransport } from "./transport.js";
export { HttpTransport } from "./transport-http.js";
export type { HttpTransportOptions } from "./transport-http.js";
export { WsTransport } from "./transport-ws.js";
export type { WsTransportOptions } from "./transport-ws.js";

// Errors
export { RpcError, ErrorCodes } from "./errors.js";
export type { ErrorCodeName } from "./errors.js";

// Types
export * from "./types.js";
export * from "./types-extra.js";

// Formatting
export {
  hexToBigInt,
  bigIntToHex,
  formatClrty,
  formatClrtyWithSymbol,
  formatCount,
  shortHash,
  shortAddress,
  blockTime,
  timeAgo,
  networkNameFromChainId,
} from "./format.js";

// Rewards constants
export {
  ATOMIC_UNITS_PER_COIN,
  DECIMALS,
  BLOCK_REWARD,
  MAX_BPS,
  REWARD_SPLIT,
  APY_BASE_BPS,
  APY_ACTIVITY_MAX_BPS,
  APY_POT_BONUS_MAX_BPS,
  APY_MAX_BPS,
  AUTO_STAKE_THRESHOLD,
  BALANCE_BONUS_THRESHOLD,
  BALANCE_BONUS_BPS,
  VALIDATOR_MIN_STAKE,
  ACTIVE_SET_MIN,
  ACTIVE_SET_MAX,
  ACTIVE_SET_DEFAULT,
  ROTATION_INTERVAL,
  NOMINAL_BLOCK_SECONDS,
  SECONDS_PER_EPOCH,
  SECONDS_PER_YEAR,
  POT_LOW_EPOCHS,
  POT_HIGH_EPOCHS,
  POT_MAX_EPOCHS,
  UNBONDING_PERIOD,
  EMERGENCY_ROTATION_ROUNDS,
  CHAIN_ID_MAINNET,
  CHAIN_ID_TESTNET,
  CHAIN_ID_REGTEST,
  potFillBps,
  formatApyBps,
} from "./rewards.js";

// Labels
export { TX_TYPE_LABELS, humanTypeName } from "./labels.js";

// Polling
export {
  BlockWatcher,
  TxWatcher,
  waitForConfirmations,
} from "./poll.js";
export type {
  BlockWatcherOptions,
  TxWatcherOptions,
} from "./poll.js";

// Builder
export { TxBuilder, UnsignedTx, SignedTx } from "./builder.js";
export type {
  BuildTransferArgs,
  BuildOptInStakingArgs,
  BuildOptOutStakingArgs,
  BuildClaimRewardsArgs,
  BuildRegisterValidatorArgs,
  BuildUnregisterValidatorArgs,
  BuildUpdateRewardAddressArgs,
  BuildCreatePoolArgs,
  BuildAddLiquidityArgs,
  BuildRemoveLiquidityArgs,
  BuildSwapArgs,
  BuildCreateOrderArgs,
  BuildCancelOrderArgs,
  BuildCreateTokenArgs,
  BuildMintTokenArgs,
  BuildBurnTokenArgs,
  BuildUpdateTokenMetaArgs,
  SignerFn,
} from "./builder.js";

// DEX
export {
  parsePool,
  parsePosition,
  parseOrder,
  parseOrderBook,
  parseFill,
} from "./dex-types.js";
export type {
  DexPool,
  DexPosition,
  DexOrder,
  DexOrderMode,
  DexOrderCondition,
  DexOrderConditionType,
  DexOrderBook,
  DexOrderBookLevel,
  DexFill,
} from "./dex-types.js";

export {
  BOOK_PRICE_SCALE,
  spotPriceScaled,
  canonicalReserves,
  computeSwapOutput,
  swapOutputForPool,
  computeEffectivePrice,
  lpTokensForDeposit,
  reservesForRemoval,
  lpShareBps,
  applySlippage,
  formatPrice,
} from "./dex-maths.js";

export { DexClient } from "./dex-client.js";
export type {
  Page,
  PoolPage,
  PositionPage,
  OrderPage,
  FillPage,
  TradePage,
} from "./dex-client.js";
export {
  bestPoolForSwap,
  counterpartToken,
  quoteSwap,
  quoteAddLiquidity,
  quoteRemoveLiquidity,
  formatPool,
  formatPosition,
  formatOrder,
  formatTokenAmount,
  aggregateOrderBook,
  midPrice,
} from "./dex-helpers.js";
export type {
  BestPoolResult,
  SwapQuote,
  AddLiquidityQuote,
  RemoveLiquidityQuote,
  PoolDisplay,
  PositionDisplay,
  OrderDisplay,
  AggregatedBookLevel,
  AggregatedBook,
} from "./dex-helpers.js";

// DEX write path
export {
  submitSwap,
  submitAddLiquidity,
  submitRemoveLiquidity,
  submitCreatePool,
} from "./dex-writer.js";
export type {
  WriteOptions,
  SubmitOptions,
  SubmitResult,
  ReceiptSummary,
  SwapArgs,
  SwapArgsWithSlippage,
  AddLiquidityArgs,
  RemoveLiquidityArgs,
  CreatePoolArgs,
} from "./dex-writer.js";

// Proofs
export { verifyProof, decodeProof } from "./proof.js";
export type { VerifyProofOptions } from "./proof.js";

// Capabilities
export { probeCapabilities, hasMethod } from "./capabilities.js";
export type { Capabilities } from "./capabilities.js";