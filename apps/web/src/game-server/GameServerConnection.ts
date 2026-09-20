export interface GameServerEvents {
  joined: (payload: { playerId: string; roomId: string }) => void;
  "lobby-state": (payload: { players: { id: string; name: string }[]; roundActive: boolean }) => void;
  "round-started": () => void;
  "player-eliminated": (payload: { playerId: string; serverTimestamp: number; place: number }) => void;
  "round-over": (payload: { winnerId: string | null }) => void;
  error: (payload: { message: string }) => void;
}

type EventName = keyof GameServerEvents;

/** ws:// equivalent of the game-server's http(s):// URL. */
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/**
 * Thin wrapper around the game-server's WebSocket protocol (room join,
 * round lifecycle, elimination events). Every mini-game that needs shared
 * game state should go through this rather than opening its own socket.
 */
export class GameServerConnection {
  private socket: WebSocket;
  private listeners = new Map<EventName, Set<(...args: never[]) => void>>();

  constructor(gameServerUrl: string, roomId: string, name: string) {
    this.socket = new WebSocket(toWsUrl(gameServerUrl));
    this.socket.addEventListener("open", () => {
      this.socket.send(JSON.stringify({ type: "join-room", roomId, name }));
    });
    this.socket.addEventListener("message", (event) => {
      let message: { type: EventName; [key: string]: unknown };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const { type, ...payload } = message;
      for (const handler of this.listeners.get(type) ?? []) {
        (handler as (p: unknown) => void)(payload);
      }
    });
  }

  on<E extends EventName>(event: E, handler: GameServerEvents[E]): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as (...args: never[]) => void);
    return () => this.listeners.get(event)?.delete(handler as (...args: never[]) => void);
  }

  startRound(): void {
    this.socket.send(JSON.stringify({ type: "start-round" }));
  }

  sendBlunk(): void {
    this.socket.send(JSON.stringify({ type: "blunk" }));
  }

  close(): void {
    this.listeners.clear();
    this.socket.close();
  }
}
