/**
 * Error codes mirrored from the C++ `ErrorCode` enum in
 * `Rpc/JsonRpcError.h`. Keep in sync with that file — the numeric
 * values matter: clients switch on them.
 *
 * The JSON-RPC spec codes (-327xx / -326xx) are fixed by the spec.
 * The domain codes are ours. They are stable forever; a new failure
 * mode gets a new code, an old code is never reused.
 */

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }

  static is(err: unknown): err is RpcError {
    return err instanceof RpcError;
  }

  /** True when the error is a "not found" style domain error. */
  get isNotFound(): boolean {
    return NOT_FOUND_CODES.has(this.code);
  }

  /** True for transport-level / server-level errors, not domain. */
  get isTransport(): boolean {
    return this.code === ErrorCodes.ServerError;
  }

  /** True for spec-defined parse / request errors. */
  get isProtocol(): boolean {
    return this.code <= -32600 && this.code >= -32700;
  }
}

export const ErrorCodes = {
  // JSON-RPC 2.0 reserved
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,

  // Server-defined reserved
  ServerError: -32000,

  // Tx submission (1000..1049)
  TxMalformed: 1000,
  TxTooLarge: 1001,
  TxBadSignature: 1002,
  TxWrongChain: 1003,
  TxExpired: 1004,
  TxNonceTooLow: 1005,
  TxNonceConflict: 1006,
  TxFeeTooLow: 1007,
  TxFeeTooHigh: 1008,
  TxInsufficientFunds: 1009,
  TxPoolFull: 1010,
  TxSubmitInternal: 1011,
  TxPrecondition: 1012,

  // State lookup (1050..1099)
  AccountNotFound: 1050,
  TokenNotFound: 1051,
  ValidatorNotFound: 1052,
  PoolNotFound: 1053,
  OrderNotFound: 1054,
  ReceiptNotFound: 1055,
  StateReadInternal: 1056,
  ProofVersionUnavailable: 1057,
  ProofNotAvailable: 1058,
  NftNotFound: 1059,
  NftCollectionNotFound: 1060,

  // Chain lookup (1100..1149)
  BlockNotFound: 1100,
  TransactionNotFound: 1101,
  HistoricalQueryNotSupported: 1102,
  ChainReadInternal: 1103,

  // Consensus (1150..1199)
  ConsensusReadInternal: 1150,

  // AMM / order (1200..1249)
  AmmPoolEmpty: 1200,
  AmmSlippageTooHigh: 1201,

  // Admin / auth (1250..1299)
  Unauthorized: 1250,
  RateLimited: 1251,

  // Client-side only. Never sent by the node; used by the HTTP
  // transport when a request fails before a JSON-RPC response
  // arrives.
  HttpError: -32000,
} as const;

export type ErrorCodeName = keyof typeof ErrorCodes;

const NOT_FOUND_CODES = new Set<number>([
  ErrorCodes.AccountNotFound,
  ErrorCodes.TokenNotFound,
  ErrorCodes.ValidatorNotFound,
  ErrorCodes.PoolNotFound,
  ErrorCodes.OrderNotFound,
  ErrorCodes.ReceiptNotFound,
  ErrorCodes.NftNotFound,
  ErrorCodes.NftCollectionNotFound,
  ErrorCodes.BlockNotFound,
  ErrorCodes.TransactionNotFound,
]);

/** Map a numeric code back to its name, for logs and diagnostics. */
export function errorCodeName(code: number): ErrorCodeName | "unknown" {
  for (const [name, value] of Object.entries(ErrorCodes)) {
    if (value === code) return name as ErrorCodeName;
  }
  return "unknown";
}

/**
 * One-line English for a code, suitable for a tooltip or a log line.
 * Mirrors the client-side `humanError` in the C++ tool and the
 * server-side `errorCodeMessage`.
 */
export function humanError(code: number): string | undefined {
  switch (code) {
    case ErrorCodes.TxMalformed:
      return "the transaction bytes could not be decoded or are structurally invalid";
    case ErrorCodes.TxTooLarge:
      return "the transaction exceeds the maximum serialized size";
    case ErrorCodes.TxBadSignature:
      return "the signature doesn't verify against the sender's key";
    case ErrorCodes.TxWrongChain:
      return "the transaction's chain_id doesn't match this node's";
    case ErrorCodes.TxExpired:
      return "the transaction's valid_until_height has already passed";
    case ErrorCodes.TxNonceTooLow:
      return "the nonce is below the account's current nonce; a pending transaction for this address is likely blocking";
    case ErrorCodes.TxNonceConflict:
      return "another transaction with this nonce is already in the mempool";
    case ErrorCodes.TxFeeTooLow:
      return "the fee rate is below the mempool's minimum";
    case ErrorCodes.TxFeeTooHigh:
      return "the fee rate is above the mempool's maximum";
    case ErrorCodes.TxInsufficientFunds:
      return "the sender doesn't hold enough of the amount plus the fee";
    case ErrorCodes.TxPoolFull:
      return "the mempool is full and this transaction wasn't competitive";
    case ErrorCodes.TxPrecondition:
      return "the transaction can't apply at the current chain tip (the token may not exist, you may not be its creator, or a supply cap would be exceeded)";
    case ErrorCodes.TokenNotFound:
      return "no token exists with that id";
    case ErrorCodes.NftNotFound:
      return "no NFT exists with that id";
    case ErrorCodes.NftCollectionNotFound:
      return "no NFT collection exists with that id";
    default:
      return undefined;
  }
}