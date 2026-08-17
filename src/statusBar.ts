import * as vscode from "vscode";

export class GasLensStatusBar {
  private item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

  constructor() {
    this.item.show();
    this.setReady();
  }

  setReady(): void {
    this.item.text = "$(check) gas-lens";
    this.item.tooltip = "gas-lens ready";
  }

  setMeasuring(): void {
    this.item.text = "$(sync~spin) gas-lens";
    this.item.tooltip = "measuring gas...";
  }

  setError(message: string): void {
    this.item.text = "$(error) gas-lens";
    this.item.tooltip = `gas-lens: ${message}`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
