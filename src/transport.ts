/**
 * A transport is a single async function that takes a JSON-RPC method
 * name and its params and returns the decoded result. Implementations
 * may use HTTP, WebSocket, IPC, or an in-memory fake for tests.
 *
 * The signal is always provided by the client and must be honored.
 */

export interface RpcTransport {
  send<T>(method: string, params: unknown, signal: AbortSignal): Promise<T>;
  /** Optional hook called when the client is disposed. */
  close?(): void | Promise<void>;
}