/**
 * HTTP transport. Uses the global `fetch`, so no dependencies and no
 * polyfills for Node 18+. The JSON-RPC envelope is standard: one
 * request per call, no batching.
 */

import { RpcError, ErrorCodes } from "./errors.js";
import type { RpcTransport } from "./transport.js";

export interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
  /** Max concurrent in-flight requests. Default: unlimited. */
  maxConcurrent?: number;
}

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number | string;
  result: T;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

export class HttpTransport implements RpcTransport {
  private nextId = 1;
  private inFlight = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly opts: HttpTransportOptions) { }

  async send<T>(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    await this.acquire();
    try {
      return await this.dispatch<T>(method, params, signal);
    } finally {
      this.release();
    }
  }

  private async dispatch<T>(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    const id = this.nextId++;

    const body = {
      jsonrpc: "2.0" as const,
      id,
      method,
      params: params ?? {},
    };

    let res: Response;
    try {
      res = await fetch(this.opts.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.opts.headers ?? {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new RpcError(ErrorCodes.HttpError, "request aborted");
      }
      throw new RpcError(
        ErrorCodes.HttpError,
        `transport failure: ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      throw new RpcError(
        ErrorCodes.HttpError,
        `HTTP ${res.status} ${res.statusText}`,
      );
    }

    let json: JsonRpcResponse<T>;
    try {
      json = (await res.json()) as JsonRpcResponse<T>;
    } catch (err) {
      throw new RpcError(
        ErrorCodes.ParseError,
        `invalid JSON in response: ${(err as Error).message}`,
      );
    }

    if ("error" in json && json.error) {
      throw new RpcError(json.error.code, json.error.message, json.error.data);
    }

    return (json as JsonRpcSuccess<T>).result;
  }

  private acquire(): Promise<void> {
    const max = this.opts.maxConcurrent;
    if (!max || this.inFlight < max) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.inFlight++;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight--;
    const next = this.queue.shift();
    if (next) next();
  }

  close(): void {
    this.queue.length = 0;
  }
}