import net from "node:net";
import { describe, expect, it } from "vitest";
import { startAnvil } from "../src/anvilManager.js";

function listenOnFreePort(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ port, close: () => server.close() });
    });
  });
}

describe("startAnvil", () => {
  it("connects to an already-running instance instead of spawning", async () => {
    const { port, close } = await listenOnFreePort();
    try {
      const handle = await startAnvil(port, 500);
      expect(handle.spawned).toBe(false);
      expect(handle.rpcUrl).toBe(`http://127.0.0.1:${port}`);
    } finally {
      close();
    }
  });

  it("spawns anvil on a free port and reports its RPC ready", async () => {
    const { port, close } = await listenOnFreePort();
    close(); // free the port again before startAnvil claims it

    const handle = await startAnvil(port, 5000);
    try {
      expect(handle.spawned).toBe(true);
      const res = await fetch(handle.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      expect(res.ok).toBe(true);
    } finally {
      handle.stop();
    }
  }, 10_000);

  it("rejects if the RPC never becomes ready within the timeout", async () => {
    const { port, close } = await listenOnFreePort();
    close();

    await expect(startAnvil(port, 1)).rejects.toThrow(/did not become ready/);
  }, 10_000);
});
