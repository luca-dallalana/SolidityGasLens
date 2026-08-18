import type { GasCache, GasMeasurement } from "./types.js";

export type GasDiff = "increase" | "decrease" | "unchanged" | "new";

export function diffMeasurement(
  cache: GasCache,
  fileHash: string,
  measurement: GasMeasurement,
  thresholds: { increase?: number; decrease?: number } = {},
): GasDiff {
  const previous = cache[fileHash]?.[measurement.functionName];
  if (!previous) return "new";

  const increaseThreshold = thresholds.increase ?? 5;
  const decreaseThreshold = thresholds.decrease ?? 5;

  const deltaPercent = ((measurement.gas - previous.gas) / previous.gas) * 100;
  if (deltaPercent > increaseThreshold) return "increase";
  if (deltaPercent < -decreaseThreshold) return "decrease";
  return "unchanged";
}

export function updateCache(
  cache: GasCache,
  fileHash: string,
  measurements: GasMeasurement[],
): GasCache {
  const forFile = { ...(cache[fileHash] ?? {}) };
  for (const measurement of measurements) {
    forFile[measurement.functionName] = measurement;
  }
  return { ...cache, [fileHash]: forFile };
}
