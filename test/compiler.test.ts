import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { compileSource } from "../src/compiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "Sample.sol");
const source = fs.readFileSync(fixture, "utf8");

describe("compileSource", () => {
  it("compiles valid Solidity to an ABI + bytecode artifact", () => {
    const artifact = compileSource(fixture, source);
    expect(artifact).not.toBeNull();
    expect(Array.isArray(artifact!.abi)).toBe(true);
    expect(artifact!.bytecode.startsWith("0x")).toBe(true);
    expect(artifact!.bytecode.length).toBeGreaterThan(2);
  });

  it("returns null and logs on invalid Solidity", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const artifact = compileSource(
      "Broken.sol",
      "pragma solidity ^0.8.20; contract Broken { function f( { } }",
    );
    expect(artifact).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("uses the in-memory cache on a repeat compile of unchanged source", () => {
    const first = compileSource(fixture, source);
    const second = compileSource(fixture, source);
    expect(second).toBe(first);
  });
});
