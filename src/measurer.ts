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

async function tryMeasure(
  provider: InstanceType<typeof ethers.JsonRpcProvider>,
  iface: InstanceType<typeof ethers.Interface>,
  contractAddress: string,
  fnName: string,
  args: unknown[],
): Promise<{ gas: bigint; data: string } | undefined> {
  try {
    const data = iface.encodeFunctionData(fnName, args);
    const gas = await provider.estimateGas({ to: contractAddress, data });
    return { gas, data };
  } catch {
    return undefined;
  }
}

export async function measureGas(
  rpcUrl: string,
  contractAddress: string,
  artifact: CompiledArtifact,
  functions: FunctionSignature[],
  inputOverrides?: Record<string, unknown[]>,
): Promise<GasMeasurement[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const iface = new ethers.Interface(artifact.abi as any);
  const measurements: GasMeasurement[] = [];

  for (const fn of functions) {
    const zeroValueArgs = fn.params.map((p) => zeroValueFor(p.type));
    const override = inputOverrides?.[fn.name];
    const candidates =
      override && override.length === fn.params.length
        ? [override, zeroValueArgs]
        : [zeroValueArgs];

    let result: { gas: bigint; data: string } | undefined;
    let args: unknown[] = zeroValueArgs;
    for (const candidate of candidates) {
      result = await tryMeasure(provider, iface, contractAddress, fn.name, candidate);
      if (result) {
        args = candidate;
        break;
      }
    }
    // Function not in the ABI, or reverts under every candidate input - skip.
    if (!result) continue;

    const baseGas = intrinsicGas(result.data);
    const inputsUsed: Record<string, string> = {};
    fn.params.forEach((p, i) => {
      inputsUsed[p.name || `arg${i}`] = String(args[i]);
    });

    measurements.push({
      functionName: fn.name,
      gas: Number(result.gas),
      baseGas,
      executionGas: Number(result.gas) - baseGas,
      inputsUsed,
      timestamp: Date.now(),
    });
  }

  return measurements;
}
