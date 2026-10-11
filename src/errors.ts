/**
 * Error codes mirrored from the C++ `ErrorCode` enum. Keep in sync
 * with `Rpc/Methods.cpp` (or wherever the enum lives). The numeric
 * values matter: clients switch on them.
 *
 * The JSON-RPC standard codes (-327xx / -326xx) are fixed by the
 * spec. The domain codes below are ours.
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
    return this.code <= -32000 && this.code > -32100;
  }

  /** True for spec-defined parse / request errors. */
  get isProtocol(): boolean {
    return this.code <= -32600 && this.code >= -32700;
  }
}

export const ErrorCodes = {
  // JSON-RPC spec
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,

  // Transport / server
  Unauthorized: -32001,
  RateLimited: -32002,
  HttpError: -32000,

  // Domain
  TxMalformed: -33001,
  TransactionNotFound: -33002,
  ReceiptNotFound: -33003,
  BlockNotFound: -33004,
  ChainReadInternal: -33005,
  StateReadInternal: -33006,
  ConsensusReadInternal: -33007,
  ProofVersionUnavailable: -33008,
  ProofNotAvailable: -33009,
  ValidatorNotFound: -33010,
  TokenNotFound: -33011,
  PoolNotFound: -33012,
  OrderNotFound: -33013,
} as const;

export type ErrorCodeName = keyof typeof ErrorCodes;

const NOT_FOUND_CODES = new Set<number>([
  ErrorCodes.TransactionNotFound,
  ErrorCodes.ReceiptNotFound,
  ErrorCodes.BlockNotFound,
  ErrorCodes.ValidatorNotFound,
  ErrorCodes.TokenNotFound,
  ErrorCodes.PoolNotFound,
  ErrorCodes.OrderNotFound,
]);

/** Map a numeric code back to its name, for logs and diagnostics. */
export function errorCodeName(code: number): ErrorCodeName | "unknown" {
  for (const [name, value] of Object.entries(ErrorCodes)) {
    if (value === code) return name as ErrorCodeName;
  }
  return "unknown";
}