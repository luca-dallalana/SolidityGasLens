import crypto from "node:crypto";
import net from "node:net";

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export function formatGas(gas: number): string {
  return gas.toLocaleString("en-US");
}

export function hashSource(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex");
}
