import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";

export const PORT = 8777;
export const WS_URL = `ws://localhost:${PORT}`;

let child: ChildProcess | null = null;

/** Starts the game-server as a real child process — a black-box test of
 * whatever src/index.ts currently does, not an import of its internals. */
export async function startServer(): Promise<void> {
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      LIVEKIT_API_KEY: "test-key",
      LIVEKIT_API_SECRET: "test-secret-at-least-this-long",
      WEB_ORIGIN: "*",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForPort(3000);
}

export function stopServer(): void {
  child?.kill();
  child = null;
}

async function waitForPort(timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        ws.once("open", () => {
          ws.close();
          resolve();
        });
        ws.once("error", reject);
      });
      return;
    } catch {
      if (Date.now() - start > timeoutMs) throw new Error("server did not start in time");
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

export function uniqueRoom(name: string): string {
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface Client {
  ws: WebSocket;
  messages: any[];
}

export function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const client: Client = { ws, messages: [] };
    ws.on("message", (raw) => client.messages.push(JSON.parse(raw.toString())));
    ws.once("open", () => resolve(client));
    ws.once("error", reject);
  });
}

export function send(client: Client, message: unknown): void {
  client.ws.send(JSON.stringify(message));
}

/** Waits for a message matching `predicate` to show up in `client.messages`. */
export function waitFor(client: Client, predicate: (m: any) => boolean, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const found = client.messages.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`timeout waiting for message: ${predicate.toString()}`));
      }
      setTimeout(check, 20);
    };
    check();
  });
}

export async function join(client: Client, roomId: string, name: string): Promise<string> {
  send(client, { type: "join-room", roomId, name });
  const joined = await waitFor(client, (m) => m.type === "joined");
  return joined.playerId as string;
}
