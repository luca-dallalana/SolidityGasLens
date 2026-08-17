export interface Parameter {
  name: string;
  type: string;
}

export interface FunctionSignature {
  name: string;
  params: Parameter[];
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  isPublic: boolean;
  isExternal: boolean;
}

export interface GasMeasurement {
  functionName: string;
  gas: number;
  baseGas: number;
  executionGas: number;
  inputsUsed: Record<string, string>;
  timestamp: number;
}

export interface GasCache {
  [fileHash: string]: {
    [functionName: string]: GasMeasurement;
  };
}

export interface PipelineResult {
  measurements: GasMeasurement[];
  errors: string[];
  duration: number;
}

export interface CompiledArtifact {
  abi: unknown[];
  bytecode: string;
}
