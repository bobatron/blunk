import type { WebSocket } from "ws";
import type { Room } from "./rooms.js";
import { broadcast, broadcastLobby, roomIsIdle, LIVES_OPTIONS, TIME_OPTIONS } from "./rooms.js";
import { registerModeStarter, notifyModeEnded } from "./hooks.js";

export const BLINK_BREAK_MS = 5000;
export const MAX_POWERUPS = 3;

export function endRound(room: Room, winnerId: string | null): void {
  room.roundActive = false;
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = null;
  broadcast(room, { type: "round-over", winnerId });
  broadcastLobby(room);
  notifyModeEnded(room);
}

export function cancelRoundTimer(room: Room): void {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = null;
}

export function aliveIds(room: Room): string[] {
  return [...room.lives].filter(([, lives]) => lives > 0).map(([id]) => id);
}

export function checkRoundEnd(room: Room): void {
  if (!room.roundActive) return;
  const alive = aliveIds(room);
  if (alive.length <= 1) endRound(room, alive[0] ?? null);
}

export function eliminate(room: Room, playerId: string): void {
  room.eliminationOrder.push(playerId);
  broadcast(room, {
    type: "player-eliminated",
    playerId,
    serverTimestamp: Date.now(),
    place: room.eliminationOrder.length,
  });
}

// Every life lost — blink or eyes-not-visible — goes through here, so the
// server is the only thing deciding who's still in. Blink-break ignores it.
export function loseLife(room: Room, playerId: string, reason: "eye-closed" | "eyes-missing" | "photo"): void {
  if (!room.roundActive) return;
  const current = room.lives.get(playerId);
  if (!current || current <= 0) return;
  if ((room.blinkBreakUntil.get(playerId) ?? 0) > Date.now()) return;

  const livesLeft = current - 1;
  room.lives.set(playerId, livesLeft);
  broadcast(room, { type: "life-lost", playerId, livesLeft, reason });
  if (livesLeft === 0) eliminate(room, playerId);
  checkRoundEnd(room);
  broadcastLobby(room);
}

export function endByTime(room: Room): void {
  if (!room.roundActive) return;
  const alive = [...room.lives].filter(([, lives]) => lives > 0);
  const best = Math.max(0, ...alive.map(([, lives]) => lives));
  const top = alive.filter(([, lives]) => lives === best);
  // A tie on lives at the buzzer is a draw, not a winner.
  endRound(room, top.length === 1 ? top[0][0] : null);
}

export function handleSetConfig(room: Room, message: { lives?: unknown; timeLimitSec?: unknown }): void {
  if (room.roundActive) return;
  // "Random games" lobbies only ever run on defaults — manual config is a
  // "custom rules" lobby thing.
  if (room.roomType === "random") return;
  const lives = Number(message.lives);
  const timeLimitSec = message.timeLimitSec === null ? null : Number(message.timeLimitSec);
  if (!LIVES_OPTIONS.includes(lives)) return;
  if (!TIME_OPTIONS.includes(timeLimitSec)) return;
  room.config = { lives, timeLimitSec };
  broadcastLobby(room);
}

export function handleStartRound(room: Room, socket?: WebSocket): void {
  if (!roomIsIdle(room)) {
    socket?.send(JSON.stringify({ type: "error", message: "Wait for the current game to finish" }));
    return;
  }
  if (room.players.size < 2) {
    socket?.send(JSON.stringify({ type: "error", message: "Need at least 2 players to start" }));
    return;
  }
  room.roundActive = true;
  room.eliminationOrder = [];
  room.powerups = new Map();
  room.blinkBreakUntil = new Map();
  room.lives = new Map([...room.players.keys()].map((id) => [id, room.config.lives]));
  room.snapshotCount = new Map();
  room.lastSnapshotAt = new Map();
  const { timeLimitSec } = room.config;
  const endsAt = timeLimitSec ? Date.now() + timeLimitSec * 1000 : null;
  broadcast(room, { type: "round-started", endsAt, lives: room.config.lives });
  if (timeLimitSec) room.roundTimer = setTimeout(() => endByTime(room), timeLimitSec * 1000);
  broadcastLobby(room);
}

export function handleBlunk(room: Room, playerId: string): void {
  loseLife(room, playerId, "eye-closed");
}

export function handleMaskedBlink(room: Room, playerId: string): void {
  if (!room.roundActive) return;
  if (!(room.lives.get(playerId) ?? 0)) return;
  broadcast(room, { type: "photo-taken", playerId });
  for (const id of aliveIds(room)) {
    if (id !== playerId) loseLife(room, id, "photo");
  }
}

export function handleEyesMissing(room: Room, playerId: string): void {
  loseLife(room, playerId, "eyes-missing");
}

export function handleEarnPowerup(room: Room, playerId: string): void {
  if (!room.roundActive) return;
  if (!(room.lives.get(playerId) ?? 0)) return;
  const count = room.powerups.get(playerId) ?? 0;
  if (count < MAX_POWERUPS) room.powerups.set(playerId, count + 1);
  broadcastLobby(room);
}

export function handleUsePowerup(room: Room, playerId: string): void {
  if (!room.roundActive) return;
  const count = room.powerups.get(playerId) ?? 0;
  if (count <= 0 || !(room.lives.get(playerId) ?? 0)) return;
  room.powerups.set(playerId, count - 1);
  const until = Date.now() + BLINK_BREAK_MS;
  room.blinkBreakUntil.set(playerId, until);
  broadcast(room, { type: "blink-break", playerId, until });
  broadcastLobby(room);
}

registerModeStarter("staring", handleStartRound);
