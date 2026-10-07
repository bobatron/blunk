import type { WebSocket } from "ws";
import type { BugHunt } from "./bug-hunt.js";
import type { VoteState } from "./voting.js";
import type { SpotStreamState } from "./spot-stream.js";

export interface Player {
  id: string;
  name: string;
  socket: WebSocket;
}

export interface Config {
  lives: number;
  /** null = no time limit */
  timeLimitSec: number | null;
}

/** "random": the lobby votes on the next mode, defaults only, no manual
 * config. "custom": today's original flow — pick a mode manually, configure
 * it, start it whenever. Decided once by whoever's first into a fresh room;
 * everyone who joins after inherits it. */
export type RoomType = "custom" | "random";

export interface Room {
  id: string;
  roomType: RoomType | null;
  players: Map<string, Player>;
  roundActive: boolean;
  config: Config;
  /** Lives per player for the current round. Only players in this map are in the round. */
  lives: Map<string, number>;
  eliminationOrder: string[];
  powerups: Map<string, number>;
  blinkBreakUntil: Map<string, number>;
  roundTimer: NodeJS.Timeout | null;
  bugHunt: BugHunt | null;
  vote: VoteState | null;
  spotStream: SpotStreamState | null;
  snapshotCount: Map<string, number>;
  lastSnapshotAt: Map<string, number>;
}

export const DEFAULT_CONFIG: Config = { lives: 3, timeLimitSec: 90 };
export const LIVES_OPTIONS = [1, 2, 3, 5];
export const TIME_OPTIONS: (number | null)[] = [30, 60, 90, 120, null];

const rooms = new Map<string, Room>();

export function getOrCreateRoom(roomId: string, roomType?: RoomType): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      roomType: roomType ?? null,
      players: new Map(),
      roundActive: false,
      config: { ...DEFAULT_CONFIG },
      lives: new Map(),
      eliminationOrder: [],
      powerups: new Map(),
      blinkBreakUntil: new Map(),
      roundTimer: null,
      bugHunt: null,
      vote: null,
      spotStream: null,
      snapshotCount: new Map(),
      lastSnapshotAt: new Map(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

export function removeRoom(roomId: string): void {
  rooms.delete(roomId);
}

export function broadcast(room: Room, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.socket.readyState === player.socket.OPEN) {
      player.socket.send(payload);
    }
  }
}

export function lobbyState(room: Room) {
  return {
    type: "lobby-state",
    roomType: room.roomType,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      lives: room.roundActive ? (room.lives.get(p.id) ?? 0) : room.config.lives,
      powerups: room.powerups.get(p.id) ?? 0,
    })),
    roundActive: room.roundActive,
    config: room.config,
  };
}

export function broadcastLobby(room: Room): void {
  broadcast(room, lobbyState(room));
}

/** Is anything actually using the room right now — a round, Bug Hunt, Spot
 * the Real Stream, or a vote in progress? Used to gate starting a new one. */
export function roomIsIdle(room: Room): boolean {
  return !room.roundActive && !room.bugHunt && !room.vote && !room.spotStream;
}
