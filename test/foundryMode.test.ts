import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractTestInputs } from "../src/foundryMode.js";
import { parseFunctions } from "../src/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleFixture = path.join(__dirname, "fixtures", "Sample.sol");
const testFixture = path.join(__dirname, "fixtures", "Sample.t.sol");

function writeTempTestFile(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gas-lens-foundry-"));
  const filePath = path.join(dir, "Temp.t.sol");
  fs.writeFileSync(filePath, source);
  return filePath;
}

describe("extractTestInputs", () => {
  const functions = parseFunctions(sampleFixture);

  it("extracts a plain numeric literal argument", () => {
    const result = extractTestInputs(testFixture, functions);
    expect(result.setValue).toEqual([42n]);
  });

  it("extracts an address(...) cast argument alongside a plain literal", () => {
    const result = extractTestInputs(testFixture, functions);
    expect(result.transfer).toEqual([
      "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
      100n,
    ]);
  });

  it("returns nothing for a function never called with literals in the fixture", () => {
    const result = extractTestInputs(testFixture, functions);
    expect(result.getValue).toBeUndefined();
    expect(result.hashOf).toBeUndefined();
  });

  it("extracts a plain numeric literal for a guarded function", () => {
    const result = extractTestInputs(testFixture, functions);
    expect(result.deposit).toEqual([5n]);
  });

  it("returns an empty object for a file that fails to parse", () => {
    const result = extractTestInputs(
      path.join(__dirname, "fixtures", "does-not-exist.t.sol"),
      functions,
    );
    expect(result).toEqual({});
  });

  it("rejects a subdenominated numeric literal (e.g. 1 ether) rather than extracting the raw magnitude", () => {
    const filePath = writeTempTestFile(`
      pragma solidity ^0.8.20;
      contract T {
        function testDeposit() public {
          sample.deposit(1 ether);
        }
      }
    `);
    const target = [{ name: "deposit", params: [{ name: "amount", type: "uint256" }] }] as any;
    expect(extractTestInputs(filePath, target)).toEqual({});
  });

  it("rejects a non-cast single-argument wrapper call rather than unwrapping it like a cast", () => {
    const filePath = writeTempTestFile(`
      pragma solidity ^0.8.20;
      contract T {
        function testDeposit() public {
          sample.deposit(double(21));
        }
      }
    `);
    const target = [{ name: "deposit", params: [{ name: "amount", type: "uint256" }] }] as any;
    expect(extractTestInputs(filePath, target)).toEqual({});
  });
});
