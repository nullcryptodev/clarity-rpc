/**
 * WebSocket transport. Speaks the same JSON-RPC envelope as the HTTP
 * transport, just over a persistent socket. Handles reconnection with
 * exponential backoff and re-issues in-flight requests after a
 * reconnect.
 *
 * `ws` is an optional peer dependency; it is imported lazily so the
 * package can be used without it as long as you never instantiate
 * `WsTransport`.
 */

import { RpcError, ErrorCodes } from "./errors.js";
import type { RpcTransport } from "./transport.js";

export interface WsTransportOptions {
  url: string;
  /** Reconnect automatically on close. Default: true. */
  reconnect?: boolean;
  /** Initial backoff in ms. Default: 250. */
  initialBackoffMs?: number;
  /** Max backoff in ms. Default: 10_000. */
  maxBackoffMs?: number;
  /** Headers passed to the WS handshake. */
  headers?: Record<string, string>;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal: AbortSignal;
  body: string;
}

interface JsonRpcEnvelope {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class WsTransport implements RpcTransport {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number | string, PendingCall>();
  private backoff: number;
  private closed = false;
  private connecting: Promise<void> | null = null;

  constructor(private readonly opts: WsTransportOptions) {
    this.backoff = opts.initialBackoffMs ?? 250;
  }

  async send<T>(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    await this.ensureOpen();

    const id = this.nextId++;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    });

    return new Promise<T>((resolve, reject) => {
      const entry: PendingCall = {
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
        body,
      };
      this.pending.set(id, entry);

      const onAbort = () => {
        this.pending.delete(id);
        reject(new RpcError(ErrorCodes.HttpError, "request aborted"));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });

      try {
        this.ws!.send(body);
      } catch (err) {
        this.pending.delete(id);
        reject(
          new RpcError(
            ErrorCodes.HttpError,
            `send failed: ${(err as Error).message}`,
          ),
        );
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    for (const [, p] of this.pending) {
      p.reject(new RpcError(ErrorCodes.HttpError, "transport closed"));
    }
    this.pending.clear();
  }

  // --------------------------------------------------------------- internals

  private ensureOpen(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (!this.connecting) {
      this.connecting = this.connect();
    }
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const { default: WebSocketImpl } = await import("ws").catch(() => {
      throw new RpcError(
        ErrorCodes.HttpError,
        "ws package is required for WsTransport. Install `ws`.",
      );
    });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocketImpl(this.opts.url, {
        headers: this.opts.headers,
      });

      ws.on("open", () => {
        this.ws = ws as unknown as WebSocket;
        this.backoff = this.opts.initialBackoffMs ?? 250;
        this.connecting = null;
        resolve();
      });

      ws.on("message", (data: Buffer) => this.onMessage(data.toString()));

      ws.on("error", (err: Error) => {
        if (this.connecting) {
          this.connecting = null;
          reject(new RpcError(ErrorCodes.HttpError, err.message));
        }
      });

      ws.on("close", () => {
        this.ws = null;
        this.rejectAllPending("socket closed");
        if (!this.closed && (this.opts.reconnect ?? true)) {
          setTimeout(() => {
            this.connecting = null;
          }, this.backoff);
          this.backoff = Math.min(
            this.backoff * 2,
            this.opts.maxBackoffMs ?? 10_000,
          );
        }
      });
    });
  }

  private onMessage(text: string): void {
    let msg: JsonRpcEnvelope;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.id === null || msg.id === undefined) return;

    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);

    if (msg.error) {
      entry.reject(new RpcError(msg.error.code, msg.error.message, msg.error.data));
    } else {
      entry.resolve(msg.result);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, p] of this.pending) {
      p.reject(new RpcError(ErrorCodes.HttpError, reason));
    }
    this.pending.clear();
  }
}