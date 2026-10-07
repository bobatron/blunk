import type { WebSocket } from "ws";
import type { BugHunt } from "./bug-hunt.js";

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

export interface Room {
  id: string;
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
  snapshotCount: Map<string, number>;
  lastSnapshotAt: Map<string, number>;
}

export const DEFAULT_CONFIG: Config = { lives: 3, timeLimitSec: 90 };
export const LIVES_OPTIONS = [1, 2, 3, 5];
export const TIME_OPTIONS: (number | null)[] = [30, 60, 90, 120, null];

const rooms = new Map<string, Room>();

export function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      players: new Map(),
      roundActive: false,
      config: { ...DEFAULT_CONFIG },
      lives: new Map(),
      eliminationOrder: [],
      powerups: new Map(),
      blinkBreakUntil: new Map(),
      roundTimer: null,
      bugHunt: null,
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
