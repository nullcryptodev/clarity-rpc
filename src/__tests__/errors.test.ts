import { describe, expect, it } from "vitest";
import { RpcError, ErrorCodes, errorCodeName } from "../errors.js";

describe("RpcError", () => {
  it("carries code, message, and data", () => {
    const err = new RpcError(ErrorCodes.BlockNotFound, "no block", { height: "0x1" });
    expect(err.code).toBe(ErrorCodes.BlockNotFound);
    expect(err.message).toBe("no block");
    expect(err.data).toEqual({ height: "0x1" });
    expect(err.name).toBe("RpcError");
  });

  it("is an Error", () => {
    expect(new RpcError(0, "x")).toBeInstanceOf(Error);
  });

  it("identifies not-found codes", () => {
    expect(new RpcError(ErrorCodes.BlockNotFound, "x").isNotFound).toBe(true);
    expect(new RpcError(ErrorCodes.InternalError, "x").isNotFound).toBe(false);
  });

  it("identifies transport codes", () => {
    expect(new RpcError(ErrorCodes.HttpError, "x").isTransport).toBe(true);
    expect(new RpcError(ErrorCodes.BlockNotFound, "x").isTransport).toBe(false);
  });

  it("identifies protocol codes", () => {
    expect(new RpcError(ErrorCodes.InvalidParams, "x").isProtocol).toBe(true);
    expect(new RpcError(ErrorCodes.BlockNotFound, "x").isProtocol).toBe(false);
  });

  it("RpcError.is narrows", () => {
    const e: unknown = new RpcError(0, "x");
    expect(RpcError.is(e)).toBe(true);
    expect(RpcError.is(new Error("x"))).toBe(false);
  });
});

describe("errorCodeName", () => {
  it("maps known codes back to names", () => {
    expect(errorCodeName(ErrorCodes.BlockNotFound)).toBe("BlockNotFound");
    expect(errorCodeName(ErrorCodes.InvalidParams)).toBe("InvalidParams");
  });
  it("returns 'unknown' for unrecognized codes", () => {
    expect(errorCodeName(-99999)).toBe("unknown");
  });
});