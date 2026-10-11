import { describe, expect, it } from "vitest";
import {
  bigIntToHex,
  formatClrty,
  formatClrtyWithSymbol,
  formatCount,
  hexToBigInt,
  networkNameFromChainId,
  shortAddress,
  shortHash,
  timeAgo,
} from "../format.js";
import {
  CHAIN_ID_MAINNET,
  CHAIN_ID_REGTEST,
  CHAIN_ID_TESTNET,
  formatApyBps,
  potFillBps,
  REWARD_SPLIT,
  ROTATION_INTERVAL,
  BLOCK_REWARD,
  MAX_BPS,
  POT_HIGH_EPOCHS,
} from "../rewards.js";

describe("hexToBigInt / bigIntToHex", () => {
  it("round-trips", () => {
    const n = BigInt("123456789012345678901234567890");
    expect(hexToBigInt(bigIntToHex(n))).toBe(n);
  });

  it("accepts hex without 0x prefix", () => {
    expect(hexToBigInt("ff")).toBe(BigInt(255));
  });
});

describe("formatClrty", () => {
  it("formats a whole number", () => {
    expect(formatClrty("0x1e8480")).toBe("20");
  });

  it("formats with fractional part", () => {
    expect(formatClrty("0x1e8481")).toBe("20.00001");
  });

  it("formats zero", () => {
    expect(formatClrty("0x0")).toBe("0");
  });

  it("respects maxFrac", () => {
    expect(formatClrty("0x1e8481", 2)).toBe("20");
  });
});

describe("formatClrtyWithSymbol", () => {
  it("appends the ticker", () => {
    expect(formatClrtyWithSymbol("0x1e8480")).toBe("20 CLRTY");
  });
});

describe("formatCount", () => {
  it("formats a count with locale separators", () => {
    expect(formatCount("0x4e20")).toMatch(/20[,.]000/);
  });
});

describe("shortHash / shortAddress", () => {
  it("truncates long hashes", () => {
    const h = "0x" + "a".repeat(64);
    expect(shortHash(h)).toBe("0xaaaaaaaa…aaaaaaaa");
  });

  it("leaves short strings intact", () => {
    expect(shortHash("0xabc")).toBe("0xabc");
  });

  it("truncates long addresses", () => {
    const a = "clrty1" + "q".repeat(50);
    expect(shortAddress(a).includes("…")).toBe(true);
  });
});

describe("timeAgo", () => {
  it("formats recent times", () => {
    const now = BigInt(Date.now());
    expect(timeAgo(bigIntToHex(now))).toBe("just now");
  });

  it("formats minutes ago", () => {
    const t = BigInt(Date.now() - 120_000);
    expect(timeAgo(bigIntToHex(t))).toMatch(/2 minutes ago/);
  });
});

describe("networkNameFromChainId", () => {
  it("maps mainnet", () => {
    expect(networkNameFromChainId(CHAIN_ID_MAINNET)).toBe("Mainnet");
  });
  it("maps testnet", () => {
    expect(networkNameFromChainId(CHAIN_ID_TESTNET)).toBe("Testnet");
  });
  it("maps regtest", () => {
    expect(networkNameFromChainId(CHAIN_ID_REGTEST)).toBe("Regtest");
  });
  it("falls back for unknown", () => {
    expect(networkNameFromChainId(0xdead)).toBe("Chain 0xdead");
  });
});

describe("REWARD_SPLIT", () => {
  it("totals the block reward", () => {
    const { stakerPool, validatorPool } = REWARD_SPLIT;
    expect(stakerPool + validatorPool).toBe(BLOCK_REWARD);
  });

  it("splits the validator pool 20/80", () => {
    const { validatorPool, producerBonus, setShare } = REWARD_SPLIT;
    expect(producerBonus + setShare).toBe(validatorPool);
  });

  it("keeps everything within MAX_BPS", () => {
    expect(REWARD_SPLIT.stakerPool * MAX_BPS).toBe(BLOCK_REWARD * BigInt(4000));
  });
});

describe("formatApyBps", () => {
  it("formats integer bps", () => {
    expect(formatApyBps(1300)).toBe("13.00%");
  });
  it("formats BigInt bps", () => {
    expect(formatApyBps(BigInt(500))).toBe("5.00%");
  });
});

describe("potFillBps", () => {
  it("returns 0 for an empty pot", () => {
    expect(potFillBps(BigInt(0))).toBe(0);
  });

  it("returns 10000 at exactly POT_HIGH", () => {
    const poolBaseline =
      (((BLOCK_REWARD * BigInt(4000)) / MAX_BPS) * ROTATION_INTERVAL);
    const potHigh = poolBaseline * POT_HIGH_EPOCHS;
    expect(potFillBps(potHigh)).toBe(10_000);
  });
});