import * as vscode from "vscode";
import { diffMeasurement, updateCache, type GasDiff } from "./cache.js";
import { parseFunctions } from "./parser.js";
import type { GasCache, GasMeasurement } from "./types.js";
import { formatGas, hashSource } from "./utils.js";

export class GasHintsProvider implements vscode.InlayHintsProvider {
  private gasCache: GasCache = {};
  private lastHashByUri = new Map<string, string>();
  private diffsByUri = new Map<string, Map<string, GasDiff>>();
  private errorByUri = new Map<string, string>();
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.emitter.event;

  hasMeasurementForHash(hash: string): boolean {
    return Boolean(this.gasCache[hash]);
  }

  recordMeasurement(
    uri: vscode.Uri,
    newHash: string,
    measurements: GasMeasurement[],
    thresholds?: { increase?: number; decrease?: number },
  ): void {
    const uriStr = uri.toString();
    const previousHash = this.lastHashByUri.get(uriStr) ?? newHash;

    const diffs = new Map<string, GasDiff>();
    for (const m of measurements) {
      diffs.set(m.functionName, diffMeasurement(this.gasCache, previousHash, m, thresholds));
    }

    this.gasCache = updateCache(this.gasCache, newHash, measurements);
    this.lastHashByUri.set(uriStr, newHash);
    this.diffsByUri.set(uriStr, diffs);
    this.errorByUri.delete(uriStr);
    this.emitter.fire();
  }

  recordError(uri: vscode.Uri, message: string): void {
    this.errorByUri.set(uri.toString(), message);
    this.emitter.fire();
  }

  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    _token: vscode.CancellationToken,
  ): vscode.InlayHint[] {
    const uriStr = document.uri.toString();

    const error = this.errorByUri.get(uriStr);
    if (error) {
      const hint = new vscode.InlayHint(
        new vscode.Position(0, 0),
        ` gas-lens: compile failed - ${error}`,
        vscode.InlayHintKind.Type,
      );
      hint.paddingLeft = true;
      return [hint];
    }

    const functions = parseFunctions(document.uri.fsPath);
    const hash = hashSource(document.getText());
    const measurementsForHash = this.gasCache[hash] ?? {};
    const diffsForFile = this.diffsByUri.get(uriStr) ?? new Map<string, GasDiff>();

    const hints: vscode.InlayHint[] = [];
    for (const fn of functions) {
      const line = fn.startLine - 1;
      if (line < range.start.line || line > range.end.line) continue;

      const measurement = measurementsForHash[fn.name];
      if (!measurement) continue;

      const diff = diffsForFile.get(fn.name);
      const glyph = diff === "increase" ? "\u{1F7E0} " : diff === "decrease" ? "\u{1F7E2} " : "";
      const position = document.lineAt(line).range.end;

      const hint = new vscode.InlayHint(
        position,
        ` ${glyph}${formatGas(measurement.gas)} gas`,
        vscode.InlayHintKind.Type,
      );
      hint.paddingLeft = true;
      hint.tooltip = new vscode.MarkdownString(
        `**${fn.name}**\n\n` +
          `Total: ${formatGas(measurement.gas)}\n\n` +
          `Base: ${formatGas(measurement.baseGas)}\n\n` +
          `Execution: ${formatGas(measurement.executionGas)}\n\n` +
          `Inputs: ${
            Object.entries(measurement.inputsUsed)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ") || "(none)"
          }`,
      );
      hints.push(hint);
    }

    return hints;
  }
}
