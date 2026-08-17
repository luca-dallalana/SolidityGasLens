import type { GasCache, GasMeasurement } from "./types.js";

export type GasDiff = "increase" | "decrease" | "unchanged" | "new";

const THRESHOLD_PERCENT = 5;

export function diffMeasurement(
  cache: GasCache,
  fileHash: string,
  measurement: GasMeasurement,
): GasDiff {
  const previous = cache[fileHash]?.[measurement.functionName];
  if (!previous) return "new";

  const deltaPercent = ((measurement.gas - previous.gas) / previous.gas) * 100;
  if (deltaPercent > THRESHOLD_PERCENT) return "increase";
  if (deltaPercent < -THRESHOLD_PERCENT) return "decrease";
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
