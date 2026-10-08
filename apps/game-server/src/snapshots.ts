import type { Room } from "./rooms.js";
import { broadcast } from "./rooms.js";

const SNAPSHOT_MAX_PER_ROUND = 20;
const SNAPSHOT_MIN_GAP_MS = 1000;
const SNAPSHOT_MAX_CHARS = 250000;

// A small face snapshot taken when a player opens their mouth — during a
// Staring Contest round, or during Bug Hunt (no "lives" concept there, just
// needs to actually be playing). Relayed to the room; the server doesn't
// store images.
export function handleSnapshot(room: Room, playerId: string, image: unknown): void {
  const inStaringRound = room.roundActive && (room.lives.get(playerId) ?? 0) > 0;
  const inBugHunt = room.bugHunt !== null && room.players.has(playerId);
  if (!inStaringRound && !inBugHunt) return;
  if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,")) return;
  if (image.length > SNAPSHOT_MAX_CHARS) return;
  const count = room.snapshotCount.get(playerId) ?? 0;
  const last = room.lastSnapshotAt.get(playerId) ?? 0;
  if (count >= SNAPSHOT_MAX_PER_ROUND || Date.now() - last < SNAPSHOT_MIN_GAP_MS) return;
  room.snapshotCount.set(playerId, count + 1);
  room.lastSnapshotAt.set(playerId, Date.now());
  broadcast(room, { type: "round-snapshot", playerId, image });
}
