import fs from "node:fs";
import parser from "@solidity-parser/parser";
import type { FunctionCall } from "@solidity-parser/parser/dist/src/ast-types.js";
import type { FunctionSignature } from "./types.js";

type LiteralNode =
  | { type: "NumberLiteral"; number: string; subdenomination: string | null }
  | { type: "StringLiteral"; value: string }
  | { type: "BooleanLiteral"; value: boolean }
  | { type: "HexLiteral"; value: string };

const ELEMENTARY_TYPE_NAME = /^(address|payable|bool|string|bytes\d*|uint\d*|int\d*)$/;

function isElementaryCast(node: FunctionCall): node is FunctionCall & {
  expression: { type: "Identifier"; name: string };
  arguments: [unknown];
} {
  return (
    node.expression.type === "Identifier" &&
    ELEMENTARY_TYPE_NAME.test(node.expression.name) &&
    node.arguments.length === 1
  );
}

function resolveArg(node: unknown, solidityType: string): unknown {
  const n = node as { type: string };

  if (n.type === "FunctionCall" && isElementaryCast(node as FunctionCall)) {
    // Single-level cast unwrap, e.g. address(0x...) or bytes32(hex"...").
    return resolveArg((node as FunctionCall).arguments[0], solidityType);
  }

  if (solidityType === "bool" && n.type === "BooleanLiteral") {
    return (n as LiteralNode & { type: "BooleanLiteral" }).value;
  }

  if (solidityType === "string" && n.type === "StringLiteral") {
    return (n as LiteralNode & { type: "StringLiteral" }).value;
  }

  if (
    (solidityType === "address" || solidityType.startsWith("bytes")) &&
    n.type === "HexLiteral"
  ) {
    return "0x" + (n as LiteralNode & { type: "HexLiteral" }).value;
  }

  if (
    (solidityType === "address" || solidityType.startsWith("bytes")) &&
    n.type === "NumberLiteral"
  ) {
    const raw = (n as LiteralNode & { type: "NumberLiteral" }).number;
    return raw.startsWith("0x") ? raw : undefined;
  }

  if (
    (solidityType.startsWith("uint") || solidityType.startsWith("int")) &&
    n.type === "NumberLiteral"
  ) {
    const literal = n as LiteralNode & { type: "NumberLiteral" };
    // Subdenominations (1 ether, 5 days, ...) need unit-aware conversion we
    // don't do - reject rather than silently returning the raw magnitude.
    if (literal.subdenomination !== null) return undefined;
    try {
      return BigInt(literal.number);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function calledName(node: FunctionCall): string | undefined {
  if (node.expression.type === "Identifier") return node.expression.name;
  if (node.expression.type === "MemberAccess") return node.expression.memberName;
  return undefined;
}

export function extractTestInputs(
  testFilePath: string,
  functions: FunctionSignature[],
): Record<string, unknown[]> {
  let source: string;
  try {
    source = fs.readFileSync(testFilePath, "utf8");
  } catch {
    return {};
  }

  let ast;
  try {
    ast = parser.parse(source, { loc: false, range: false });
  } catch {
    return {};
  }

  const byName = new Map(functions.map((f) => [f.name, f]));
  const result: Record<string, unknown[]> = {};

  parser.visit(ast, {
    FunctionCall(node: FunctionCall) {
      const name = calledName(node);
      if (!name || result[name]) return;

      const fn = byName.get(name);
      if (!fn || node.arguments.length !== fn.params.length) return;

      const resolved: unknown[] = [];
      for (let i = 0; i < node.arguments.length; i++) {
        const value = resolveArg(node.arguments[i], fn.params[i].type);
        if (value === undefined) return;
        resolved.push(value);
      }

      result[name] = resolved;
    },
  });

  return result;
}
