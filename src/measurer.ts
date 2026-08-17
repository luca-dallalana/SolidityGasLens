import { ethers } from "ethers";
import type { CompiledArtifact, FunctionSignature, GasMeasurement } from "./types.js";

const ZERO_ADDRESS_PLACEHOLDER = "0x0000000000000000000000000000000000000001";

function zeroValueFor(type: string): unknown {
  if (type.endsWith("[]")) return [];
  if (type === "address") return ZERO_ADDRESS_PLACEHOLDER;
  if (type === "bool") return false;
  if (type === "string") return "";
  const fixedBytes = type.match(/^bytes(\d+)$/);
  if (fixedBytes) return "0x" + "00".repeat(Number(fixedBytes[1]));
  if (type === "bytes") return "0x";
  if (type.startsWith("uint") || type.startsWith("int")) return 0n;
  return 0n;
}

/** Intrinsic tx cost: 21000 base + calldata byte cost. The rest of the estimate is execution. */
function intrinsicGas(data: string): number {
  const bytes = ethers.getBytes(data);
  let calldataCost = 0;
  for (const byte of bytes) {
    calldataCost += byte === 0 ? 4 : 16;
  }
  return 21000 + calldataCost;
}

export async function deployContract(
  rpcUrl: string,
  artifact: CompiledArtifact,
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = await provider.getSigner(0);
  const factory = new ethers.ContractFactory(artifact.abi as any, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract.getAddress();
}

export async function measureGas(
  rpcUrl: string,
  contractAddress: string,
  artifact: CompiledArtifact,
  functions: FunctionSignature[],
): Promise<GasMeasurement[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const iface = new ethers.Interface(artifact.abi as any);
  const measurements: GasMeasurement[] = [];

  for (const fn of functions) {
    const args = fn.params.map((p) => zeroValueFor(p.type));
    let data: string;
    try {
      data = iface.encodeFunctionData(fn.name, args);
    } catch {
      // Function not present in the ABI (e.g. overload mismatch) - skip.
      continue;
    }

    let gas: bigint;
    try {
      gas = await provider.estimateGas({ to: contractAddress, data });
    } catch {
      // Reverts on zero-value input are expected and skipped silently.
      continue;
    }

    const baseGas = intrinsicGas(data);
    const inputsUsed: Record<string, string> = {};
    fn.params.forEach((p, i) => {
      inputsUsed[p.name || `arg${i}`] = String(args[i]);
    });

    measurements.push({
      functionName: fn.name,
      gas: Number(gas),
      baseGas,
      executionGas: Number(gas) - baseGas,
      inputsUsed,
      timestamp: Date.now(),
    });
  }

  return measurements;
}
