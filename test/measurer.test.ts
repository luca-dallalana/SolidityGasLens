import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAnvil, type AnvilHandle } from "../src/anvilManager.js";
import { compileSource } from "../src/compiler.js";
import { deployContract, measureGas } from "../src/measurer.js";
import { parseFunctions } from "../src/parser.js";

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

describe("measurer", () => {
  let anvil: AnvilHandle;

  beforeAll(async () => {
    const port = await freePort();
    anvil = await startAnvil(port, 5000);
  }, 15_000);

  afterAll(() => {
    anvil?.stop();
  });

  it("deploys and measures gas for public/external functions, skipping reverts", async () => {
    const source = fs.readFileSync(fixture, "utf8");
    const artifact = compileSource(fixture, source)!;
    const functions = parseFunctions(fixture);

    const address = await deployContract(anvil.rpcUrl, artifact);
    const measurements = await measureGas(anvil.rpcUrl, address, artifact, functions);

    const names = measurements.map((m) => m.functionName).sort();
    // transfer() reverts on the zero-value path in some solc versions' revert
    // checks; the rest never revert on zero-value input, so at minimum those
    // must be measured, including array and fixed-size bytes params.
    expect(names).toEqual(
      expect.arrayContaining(["getValue", "setValue", "sumAmounts", "hashOf"]),
    );

    for (const m of measurements) {
      expect(m.gas).toBeGreaterThan(0);
      expect(m.baseGas).toBeGreaterThan(0);
      expect(m.executionGas).toBeGreaterThanOrEqual(0);
      expect(m.gas).toBe(m.baseGas + m.executionGas);
    }
  }, 20_000);
});
