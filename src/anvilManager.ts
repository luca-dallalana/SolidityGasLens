import { type ChildProcess, spawn } from "node:child_process";
import { isPortInUse } from "./utils.js";

export interface AnvilHandle {
  rpcUrl: string;
  /** True if this call spawned anvil; false if it connected to an already-running instance. */
  spawned: boolean;
  stop: () => void;
}

async function waitUntilReady(rpcUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not up yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`gas-lens: anvil did not become ready within ${timeoutMs}ms`);
}

export async function startAnvil(port: number, timeoutMs = 5000): Promise<AnvilHandle> {
  const rpcUrl = `http://127.0.0.1:${port}`;

  if (await isPortInUse(port)) {
    return { rpcUrl, spawned: false, stop: () => {} };
  }

  const child: ChildProcess = spawn("anvil", ["--port", String(port)], {
    stdio: "ignore",
  });

  let stopped = false;
  const stop = () => {
    if (!stopped) {
      stopped = true;
      child.kill();
    }
  };

  try {
    await waitUntilReady(rpcUrl, timeoutMs);
  } catch (err) {
    stop();
    throw err;
  }

  return { rpcUrl, spawned: true, stop };
}
