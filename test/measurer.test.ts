import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAnvil, type AnvilHandle } from "../src/anvilManager.js";
import { compileSource } from "../src/compiler.js";
import { extractTestInputs } from "../src/foundryMode.js";
import { deployContract, measureGas } from "../src/measurer.js";
import { parseFunctions } from "../src/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "Sample.sol");
const testFixture = path.join(__dirname, "fixtures", "Sample.t.sol");

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
    // deposit() reverts on the zero-value path (require(amount > 0)); the
    // rest never revert on zero-value input, so at minimum those must be
    // measured, including array and fixed-size bytes params.
    expect(names).toEqual(
      expect.arrayContaining(["getValue", "setValue", "sumAmounts", "hashOf", "transfer"]),
    );
    expect(names).not.toContain("deposit");

    for (const m of measurements) {
      expect(m.gas).toBeGreaterThan(0);
      expect(m.baseGas).toBeGreaterThan(0);
      expect(m.executionGas).toBeGreaterThanOrEqual(0);
      expect(m.gas).toBe(m.baseGas + m.executionGas);
    }
  }, 20_000);

  it("uses foundry-extracted inputs instead of zero-values when provided", async () => {
    const source = fs.readFileSync(fixture, "utf8");
    const artifact = compileSource(fixture, source)!;
    const functions = parseFunctions(fixture);
    const overrides = extractTestInputs(testFixture, functions);

    const address = await deployContract(anvil.rpcUrl, artifact);
    const measurements = await measureGas(anvil.rpcUrl, address, artifact, functions, overrides);

    const setValue = measurements.find((m) => m.functionName === "setValue")!;
    expect(setValue.inputsUsed.newValue).toBe("42");

    const transfer = measurements.find((m) => m.functionName === "transfer")!;
    expect(transfer.inputsUsed.to).toBe("0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef");
    expect(transfer.inputsUsed.amount).toBe("100");

    // The actual payoff: deposit() reverts and is skipped under zero-value
    // inputs (asserted above), but is measurable once given a real amount
    // extracted from the Foundry test.
    const deposit = measurements.find((m) => m.functionName === "deposit");
    expect(deposit).toBeDefined();
    expect(deposit!.inputsUsed.amount).toBe("5");
    expect(deposit!.gas).toBeGreaterThan(0);
  }, 20_000);
});
