import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFunctions } from "../src/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "Sample.sol");

describe("parseFunctions", () => {
  it("extracts only public and external functions", () => {
    const sigs = parseFunctions(fixture);
    const names = sigs.map((s) => s.name).sort();
    expect(names).toEqual([
      "getValue",
      "hashOf",
      "setValue",
      "sumAmounts",
      "transfer",
    ]);
  });

  it("captures parameter names and types", () => {
    const sigs = parseFunctions(fixture);
    const transfer = sigs.find((s) => s.name === "transfer")!;
    expect(transfer.params).toEqual([
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ]);
    expect(transfer.isExternal).toBe(true);
    expect(transfer.isPublic).toBe(false);
  });

  it("returns line/column ranges", () => {
    const sigs = parseFunctions(fixture);
    const setValue = sigs.find((s) => s.name === "setValue")!;
    expect(setValue.startLine).toBeGreaterThan(0);
    expect(setValue.endLine).toBeGreaterThanOrEqual(setValue.startLine);
  });

  it("returns an empty array for a file that fails to parse", () => {
    const badFile = path.join(__dirname, "fixtures", "does-not-exist.sol");
    expect(parseFunctions(badFile)).toEqual([]);
  });
});
