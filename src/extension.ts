import path from "node:path";
import * as vscode from "vscode";
import { type AnvilHandle, startAnvil } from "./anvilManager.js";
import { compileSource } from "./compiler.js";
import { extractTestInputs } from "./foundryMode.js";
import { GasHintsProvider } from "./hintsProvider.js";
import { deployContract, measureGas } from "./measurer.js";
import { parseFunctions } from "./parser.js";
import { GasLensStatusBar } from "./statusBar.js";
import { hashSource } from "./utils.js";

let anvilHandle: AnvilHandle | undefined;
// ponytail: per-uri lock coalesces overlapping saves; no queue needed for a single-user editor
const inFlight = new Set<string>();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("gasLens");
  const port = config.get<number>("anvilPort", 8545);

  const statusBar = new GasLensStatusBar();
  const provider = new GasHintsProvider();

  try {
    anvilHandle = await startAnvil(port);
  } catch (err) {
    statusBar.setError(`anvil failed to start: ${String(err)}`);
  }

  const selector: vscode.DocumentSelector = { scheme: "file", pattern: "**/*.sol" };

  const maybeRunForActiveEditor = (editor: vscode.TextEditor | undefined) => {
    if (!editor) return;
    const doc = editor.document;
    if (!doc.fileName.endsWith(".sol")) return;
    // A dirty buffer disagrees with what's on disk, and parseFunctions
    // always reads from disk - measuring here would parse stale signatures
    // against the in-memory bytecode. Let the save path handle it instead.
    if (doc.isDirty) return;
    // Only measure the active editor's document if its current content
    // hasn't already been measured this session - avoids re-running the
    // pipeline every time the user switches back to an already-open tab.
    if (provider.hasMeasurementForHash(hashSource(doc.getText()))) return;
    void runPipeline(doc, provider, statusBar);
  };

  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider(selector, provider),
    statusBar,
    vscode.workspace.onDidSaveTextDocument((doc) => runPipeline(doc, provider, statusBar)),
    vscode.window.onDidChangeActiveTextEditor(maybeRunForActiveEditor),
  );

  // The editor active at activation time never fires onDidChangeActiveTextEditor
  // itself (that event only fires on a subsequent change), so check it directly.
  maybeRunForActiveEditor(vscode.window.activeTextEditor);
}

async function runPipeline(
  doc: vscode.TextDocument,
  provider: GasHintsProvider,
  statusBar: GasLensStatusBar,
): Promise<void> {
  if (!doc.fileName.endsWith(".sol")) return;

  const config = vscode.workspace.getConfiguration("gasLens");
  if (!config.get<boolean>("enabled", true)) return;
  if (!anvilHandle) return;

  const uriStr = doc.uri.toString();
  if (inFlight.has(uriStr)) return;
  inFlight.add(uriStr);
  statusBar.setMeasuring();

  try {
    const source = doc.getText();
    const filePath = doc.uri.fsPath;

    // ponytail: solc.compile is sync and can block the extension host briefly on save;
    // move to a worker if that's felt in practice
    const artifact = compileSource(filePath, source);
    if (!artifact) {
      provider.recordError(doc.uri, "see console for solc errors");
      statusBar.setError("compile failed");
      return;
    }

    const functions = parseFunctions(filePath);
    const showOnlyPublic = config.get<boolean>("showOnlyPublic", false);
    const targetFunctions = showOnlyPublic ? functions.filter((f) => f.isPublic) : functions;

    let inputOverrides: Record<string, unknown[]> | undefined;
    if (config.get<boolean>("foundryMode", false)) {
      const baseName = path.basename(filePath, ".sol");
      const [testFile] = await vscode.workspace.findFiles(
        `**/${baseName}.t.sol`,
        "**/node_modules/**",
        1,
      );
      if (testFile) {
        inputOverrides = extractTestInputs(testFile.fsPath, targetFunctions);
      }
    }

    const address = await deployContract(anvilHandle.rpcUrl, artifact);
    const measurements = await measureGas(
      anvilHandle.rpcUrl,
      address,
      artifact,
      targetFunctions,
      inputOverrides,
    );

    const increaseThreshold = config.get<number>("gasIncreaseThreshold", 5);
    const decreaseThreshold = config.get<number>("gasDecreaseThreshold", 5);
    provider.recordMeasurement(doc.uri, hashSource(source), measurements, {
      increase: increaseThreshold,
      decrease: decreaseThreshold,
    });
    statusBar.setReady();
  } catch (err) {
    provider.recordError(doc.uri, String(err));
    statusBar.setError(String(err));
  } finally {
    inFlight.delete(uriStr);
  }
}

export function deactivate(): void {
  anvilHandle?.stop();
}
