export interface RoomConfig {
  lives: number;
  /** null = no time limit */
  timeLimitSec: number | null;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  lives: number;
  powerups: number;
}

export interface PathPoint {
  t: number;
  x: number;
  y: number;
}

/** A Bug Hunt bug as the server sends it: times are on the server's clock. */
export interface ServerBug {
  id: number;
  spawnAt: number;
  expiresAt: number;
  path: PathPoint[];
}

export interface GameServerEvents {
  joined: (payload: { playerId: string; roomId: string }) => void;
  "lobby-state": (payload: { players: LobbyPlayer[]; roundActive: boolean; config: RoomConfig }) => void;
  "round-started": (payload: { endsAt: number | null; lives: number }) => void;
  "life-lost": (payload: {
    playerId: string;
    livesLeft: number;
    reason: "eye-closed" | "eyes-missing" | "photo";
  }) => void;
  "photo-taken": (payload: { playerId: string }) => void;
  "player-eliminated": (payload: { playerId: string; serverTimestamp: number; place: number }) => void;
  "blink-break": (payload: { playerId: string; until: number }) => void;
  "round-over": (payload: { winnerId: string | null }) => void;
  "bug-hunt-started": (payload: { endsAt: number; serverNow: number }) => void;
  "bug-spawn": (payload: { bug: ServerBug; serverNow: number }) => void;
  "bug-claimed": (payload: { bugId: number; playerId: string }) => void;
  "bug-hunt-scores": (payload: { eaten: Record<string, number> }) => void;
  "bug-hunt-over": (payload: { results: { playerId: string; eaten: number }[] }) => void;
  "round-snapshot": (payload: { playerId: string; image: string }) => void;
  error: (payload: { message: string }) => void;
}

type EventName = keyof GameServerEvents;

/** ws:// equivalent of the game-server's http(s):// URL. */
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/**
 * Thin wrapper around the game-server's WebSocket protocol (room join,
 * round lifecycle, lives, power-ups). Every mini-game that needs shared
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

  private send(message: unknown) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  startRound(): void {
    this.send({ type: "start-round" });
  }

  setConfig(config: RoomConfig): void {
    this.send({ type: "set-config", ...config });
  }

  /** Blinked while sunglasses covered the eyes. */
  sendMaskedBlink(): void {
    this.send({ type: "masked-blink" });
  }

  /** Either eye closed during a round. */
  sendEyeClosed(): void {
    this.send({ type: "blunk" });
  }

  /** Face not visible for long enough to count as a life lost. */
  sendEyesMissing(): void {
    this.send({ type: "eyes-missing" });
  }

  earnPowerup(): void {
    this.send({ type: "earn-powerup" });
  }

  usePowerup(): void {
    this.send({ type: "use-powerup" });
  }

  startBugHunt(): void {
    this.send({ type: "start-bug-hunt" });
  }

  claimBug(bugId: number): void {
    this.send({ type: "bug-claim", bugId });
  }

  sendSnapshot(image: string): void {
    this.send({ type: "round-snapshot", image });
  }

  close(): void {
    this.listeners.clear();
    this.socket.close();
  }
}
