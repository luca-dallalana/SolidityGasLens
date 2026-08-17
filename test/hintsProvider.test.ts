import { beforeEach, describe, expect, it, vi } from "vitest";

class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

class Range {
  constructor(
    public start: Position,
    public end: Position,
  ) {}
}

class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose() {} };
  };
  fire(e: T) {
    for (const listener of this.listeners) listener(e);
  }
}

class InlayHint {
  tooltip?: unknown;
  paddingLeft?: boolean;
  constructor(
    public position: Position,
    public label: string,
    public kind?: number,
  ) {}
}

class MarkdownString {
  constructor(public value: string) {}
}

const InlayHintKind = { Type: 1, Parameter: 2 };

vi.mock("vscode", () => ({ Position, Range, EventEmitter, InlayHint, MarkdownString, InlayHintKind }));

vi.mock("../src/parser.js", () => ({
  parseFunctions: vi.fn(() => [
    { name: "setValue", params: [], startLine: 5, endLine: 5, startCol: 0, endCol: 0, isPublic: true, isExternal: false },
  ]),
}));

const { GasHintsProvider } = await import("../src/hintsProvider.js");
const { hashSource } = await import("../src/utils.js");

function makeDoc(uriStr: string, text: string) {
  return {
    uri: { toString: () => uriStr, fsPath: "/fake/Sample.sol" },
    getText: () => text,
    fileName: "/fake/Sample.sol",
    lineAt: (n: number) => ({ range: { end: new Position(n, 999) } }),
  } as any;
}

function measurement(gas: number) {
  return {
    functionName: "setValue",
    gas,
    baseGas: 21000,
    executionGas: gas - 21000,
    inputsUsed: {},
    timestamp: Date.now(),
  };
}

const fullRange = new Range(new Position(0, 0), new Position(1000, 0)) as any;

describe("GasHintsProvider", () => {
  let provider: InstanceType<typeof GasHintsProvider>;

  beforeEach(() => {
    provider = new GasHintsProvider();
  });

  it("renders a hint with the formatted gas label after recordMeasurement", () => {
    const doc = makeDoc("file:///Sample.sol", "contract A {}");
    provider.recordMeasurement(doc.uri, hashSource("contract A {}"), [measurement(23916)]);

    const hints = provider.provideInlayHints(doc, fullRange, {} as any);
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toContain("23,916 gas");
  });

  it("shows the increase glyph when a later measurement on a new hash costs more", () => {
    const doc = makeDoc("file:///Sample.sol", "contract A { uint x; }");
    provider.recordMeasurement(doc.uri, hashSource("contract A {}"), [measurement(20000)]);
    provider.recordMeasurement(doc.uri, hashSource("contract A { uint x; }"), [measurement(30000)]);

    const hints = provider.provideInlayHints(doc, fullRange, {} as any);
    expect(hints[0].label).toContain("\u{1F7E0}");
  });

  it("shows the decrease glyph when a later measurement on a new hash costs less", () => {
    const doc = makeDoc("file:///Sample.sol", "contract A { uint x; }");
    provider.recordMeasurement(doc.uri, hashSource("contract A {}"), [measurement(30000)]);
    provider.recordMeasurement(doc.uri, hashSource("contract A { uint x; }"), [measurement(20000)]);

    const hints = provider.provideInlayHints(doc, fullRange, {} as any);
    expect(hints[0].label).toContain("\u{1F7E2}");
  });

  it("returns a single hint with no crash on recordError", () => {
    const doc = makeDoc("file:///Sample.sol", "contract A {");
    provider.recordError(doc.uri, "unexpected token");

    const hints = provider.provideInlayHints(doc, fullRange, {} as any);
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toContain("unexpected token");
  });

  it("fires onDidChangeInlayHints on both recordMeasurement and recordError", () => {
    const doc = makeDoc("file:///Sample.sol", "contract A {}");
    const listener = vi.fn();
    provider.onDidChangeInlayHints(listener);

    provider.recordMeasurement(doc.uri, "hashA", [measurement(20000)]);
    provider.recordError(doc.uri, "boom");

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
