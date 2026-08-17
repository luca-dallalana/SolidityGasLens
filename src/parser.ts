import fs from "node:fs";
import parser from "@solidity-parser/parser";
import type {
  FunctionDefinition,
  TypeName,
  VariableDeclaration,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { FunctionSignature, Parameter } from "./types.js";

function typeToString(typeName: TypeName | null): string {
  if (!typeName) return "unknown";
  switch (typeName.type) {
    case "ElementaryTypeName":
      return typeName.name;
    case "UserDefinedTypeName":
      return typeName.namePath;
    case "ArrayTypeName":
      return `${typeToString(typeName.baseTypeName)}[]`;
    case "Mapping":
      return `mapping(${typeToString(typeName.keyType)} => ${typeToString(typeName.valueType)})`;
    case "FunctionTypeName":
      return "function";
    default:
      return "unknown";
  }
}

function toParameter(decl: VariableDeclaration): Parameter {
  return {
    name: decl.name ?? "",
    type: typeToString(decl.typeName),
  };
}

function toSignature(fn: FunctionDefinition): FunctionSignature | null {
  if (!fn.name || !fn.loc) return null;
  return {
    name: fn.name,
    params: fn.parameters.map(toParameter),
    startLine: fn.loc.start.line,
    endLine: fn.loc.end.line,
    startCol: fn.loc.start.column,
    endCol: fn.loc.end.column,
    isPublic: fn.visibility === "public" || fn.visibility === "default",
    isExternal: fn.visibility === "external",
  };
}

export function parseFunctions(filePath: string): FunctionSignature[] {
  let source: string;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.error(`gas-lens: failed to read ${filePath}`, err);
    return [];
  }

  let ast;
  try {
    ast = parser.parse(source, { loc: true, range: false });
  } catch (err) {
    console.error(`gas-lens: failed to parse ${filePath}`, err);
    return [];
  }

  const signatures: FunctionSignature[] = [];
  parser.visit(ast, {
    FunctionDefinition(node: FunctionDefinition) {
      const sig = toSignature(node);
      if (sig && (sig.isPublic || sig.isExternal)) {
        signatures.push(sig);
      }
    },
  });

  return signatures;
}
