import crypto from "node:crypto";
import path from "node:path";
import solc from "solc";
import type { CompiledArtifact } from "./types.js";

const cache = new Map<string, CompiledArtifact | null>();

function hashSource(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex");
}

export function compileSource(
  filePath: string,
  source: string,
): CompiledArtifact | null {
  const hash = hashSource(source);
  if (cache.has(hash)) {
    return cache.get(hash) ?? null;
  }

  const fileName = path.basename(filePath);
  const input = {
    language: "Solidity",
    sources: {
      [fileName]: { content: source },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  let output: any;
  try {
    output = JSON.parse(solc.compile(JSON.stringify(input)));
  } catch (err) {
    console.error(`gas-lens: solc compile threw for ${filePath}`, err);
    cache.set(hash, null);
    return null;
  }

  const fatalErrors = (output.errors ?? []).filter(
    (e: { severity: string }) => e.severity === "error",
  );
  if (fatalErrors.length > 0) {
    console.error(`gas-lens: compile errors in ${filePath}`, fatalErrors);
    cache.set(hash, null);
    return null;
  }

  const contracts = output.contracts?.[fileName];
  const contractName = contracts ? Object.keys(contracts)[0] : undefined;
  if (!contracts || !contractName) {
    console.error(`gas-lens: no contract output for ${filePath}`);
    cache.set(hash, null);
    return null;
  }

  const artifact: CompiledArtifact = {
    abi: contracts[contractName].abi,
    bytecode: `0x${contracts[contractName].evm.bytecode.object}`,
  };
  cache.set(hash, artifact);
  return artifact;
}
