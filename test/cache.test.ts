import { describe, expect, it } from "vitest";
import { diffMeasurement, updateCache } from "../src/cache.js";
import type { GasCache, GasMeasurement } from "../src/types.js";

function measurement(gas: number): GasMeasurement {
  return {
    functionName: "setValue",
    gas,
    baseGas: 21000,
    executionGas: gas - 21000,
    inputsUsed: {},
    timestamp: Date.now(),
  };
}

describe("cache", () => {
  it("classifies a first-time measurement as new", () => {
    const cache: GasCache = {};
    expect(diffMeasurement(cache, "hash1", measurement(30000))).toBe("new");
  });

  it("classifies a >5% increase", () => {
    const cache: GasCache = { hash1: { setValue: measurement(30000) } };
    expect(diffMeasurement(cache, "hash1", measurement(33000))).toBe("increase");
  });

  it("classifies a >5% decrease", () => {
    const cache: GasCache = { hash1: { setValue: measurement(30000) } };
    expect(diffMeasurement(cache, "hash1", measurement(27000))).toBe("decrease");
  });

  it("classifies a change within the threshold as unchanged", () => {
    const cache: GasCache = { hash1: { setValue: measurement(30000) } };
    expect(diffMeasurement(cache, "hash1", measurement(30500))).toBe("unchanged");
  });

  it("updateCache stores measurements keyed by file hash and function name", () => {
    const cache: GasCache = {};
    const updated = updateCache(cache, "hash1", [measurement(30000)]);
    expect(updated.hash1.setValue.gas).toBe(30000);
    // original cache object is untouched
    expect(cache).toEqual({});
  });
});
