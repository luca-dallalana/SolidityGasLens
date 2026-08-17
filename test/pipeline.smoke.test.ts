import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAnvil, type AnvilHandle } from "../src/anvilManager.js";
import { updateCache, diffMeasurement } from "../src/cache.js";
import { compileSource } from "../src/compiler.js";
import { deployContract, measureGas } from "../src/measurer.js";
import { parseFunctions } from "../src/parser.js";
import { formatGas } from "../src/utils.js";
import type { GasCache } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "Sample.sol");

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function runPipeline(cache: GasCache) {
  const source = fs.readFileSync(fixture, "utf8");
  const fileHash = crypto.createHash("sha256").update(source).digest("hex");

  const artifact = compileSource(fixture, source);
  expect(artifact).not.toBeNull();

  const functions = parseFunctions(fixture);
  expect(functions.length).toBeGreaterThan(0);

  const address = await deployContract(anvilHandle.rpcUrl, artifact!);
  const measurements = await measureGas(anvilHandle.rpcUrl, address, artifact!, functions);
  expect(measurements.length).toBeGreaterThan(0);

  for (const m of measurements) {
    console.log(`gas-lens smoke: ${m.functionName} => ${formatGas(m.gas)} gas`);
    const diff = diffMeasurement(cache, fileHash, m);
    console.log(`gas-lens smoke:   diff => ${diff}`);
  }

  return { fileHash, measurements, updatedCache: updateCache(cache, fileHash, measurements) };
}

let anvilHandle: AnvilHandle;

describe("pipeline smoke test", () => {
  beforeAll(async () => {
    const port = await freePort();
    anvilHandle = await startAnvil(port, 5000);
  }, 15_000);

  afterAll(() => {
    anvilHandle?.stop();
  });

  it("runs parse -> compile -> deploy -> measure -> cache end to end", async () => {
    const { measurements, updatedCache } = await runPipeline({});
    for (const m of measurements) {
      expect(m.gas).toBeGreaterThan(0);
    }

    // Second run against an unchanged file: compiler cache hits (no recompile
    // needed, verified in compiler.test.ts), and the gas diff must read as
    // unchanged since nothing about the contract or inputs changed.
    const second = await runPipeline(updatedCache);
    for (const m of second.measurements) {
      expect(diffMeasurement(updatedCache, second.fileHash, m)).toBe("unchanged");
    }
  }, 30_000);
});
